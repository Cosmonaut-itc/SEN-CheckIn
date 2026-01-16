'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Camera, Loader2, Upload, X, RefreshCw, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { fullEnrollmentFlow } from '@/actions/employees-rekognition';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import type { Employee } from '@/lib/client-functions';

/**
 * Props for the FaceEnrollmentDialog component.
 */
interface FaceEnrollmentDialogProps {
	/** Whether the dialog is open */
	open: boolean;
	/** Callback when the dialog open state changes */
	onOpenChange: (open: boolean) => void;
	/** The employee to enroll a face for */
	employee: Employee | null;
}

/**
 * Maximum file size for uploaded images (5MB).
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Accepted image MIME types.
 */
const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

/**
 * Dialog component for enrolling an employee's face using Rekognition.
 * Supports both file upload and webcam capture methods.
 *
 * @param props - Component props
 * @returns The face enrollment dialog JSX element
 */
export function FaceEnrollmentDialog({
	open,
	onOpenChange,
	employee,
}: FaceEnrollmentDialogProps): React.ReactElement {
	/**
	 * Media track capabilities extended with optional zoom metadata.
	 */
	type ZoomCapableMediaTrackCapabilities = MediaTrackCapabilities & {
		zoom?: number | { min?: number; max?: number; step?: number };
	};

	/**
	 * Media track settings extended with optional zoom metadata.
	 */
	type ZoomCapableMediaTrackSettings = MediaTrackSettings & { zoom?: number };

	/**
	 * Minimal metadata for video frame callbacks.
	 */
	type VideoFrameCallbackMetadata = {
		presentationTime?: number;
		expectedDisplayTime?: number;
		width?: number;
		height?: number;
	};

	/**
	 * Signature for video frame callbacks.
	 */
	type VideoFrameRequestCallback = (now: number, metadata: VideoFrameCallbackMetadata) => void;

	const t = useTranslations('FaceEnrollment');
	const tCommon = useTranslations('Common');
	const queryClient = useQueryClient();

	// State for image capture
	const [activeTab, setActiveTab] = useState<'upload' | 'webcam'>('upload');
	const [capturedImage, setCapturedImage] = useState<string | null>(null);
	const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
	const [webcamError, setWebcamError] = useState<string | null>(null);
	const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
	const [isDevicesLoading, setIsDevicesLoading] = useState<boolean>(false);
	const [devicesError, setDevicesError] = useState<string | null>(null);
	const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(
		null,
	);
	const [zoomValue, setZoomValue] = useState<number>(1);
	const [digitalZoom, setDigitalZoom] = useState<number>(1);
	const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
	const [webcamErrorDetail, setWebcamErrorDetail] = useState<string | null>(null);

	const DIGITAL_ZOOM_RANGE = { min: 1, max: 2.5, step: 0.1 };

	/**
	 * Handles dialog open state changes and resets state when opening.
	 *
	 * @param newOpen - The new open state
	 * @returns void
	 */
	const handleOpenChange = (newOpen: boolean): void => {
		if (newOpen) {
			// Reset state when opening
			setCapturedImage(null);
			setActiveTab('upload');
			setWebcamError(null);
			setIsWebcamActive(false);
			setDevicesError(null);
			setVideoDevices([]);
			setZoomRange(null);
			setZoomValue(1);
			setDigitalZoom(1);
			setSelectedDeviceId(null);
			setWebcamErrorDetail(null);
		}
		onOpenChange(newOpen);
	};

	// Refs for webcam
	const videoRef = useRef<HTMLVideoElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const isStartingRef = useRef<boolean>(false);

	// File input ref
	const fileInputRef = useRef<HTMLInputElement>(null);

	/**
	 * Builds a localized message for webcam access errors.
	 *
	 * @param error - Error thrown by the media device APIs
	 * @returns Localized error message for the user
	 */
	const getWebcamErrorMessage = useCallback(
		(error: unknown): string => {
			let errorName = '';
			let errorMessage = '';

			if (error && typeof error === 'object' && 'name' in error) {
				const name = (error as { name?: unknown }).name;
				if (typeof name === 'string') {
					errorName = name;
				}
			}

			if (error && typeof error === 'object' && 'message' in error) {
				const message = (error as { message?: unknown }).message;
				if (typeof message === 'string') {
					errorMessage = message;
				}
			}

			if (errorMessage.startsWith('VideoFrame') || errorMessage.startsWith('VideoMetadata')) {
				return t('webcam.errors.noFeed');
			}

			switch (errorName) {
				case 'NotFoundError':
				case 'DevicesNotFoundError':
					return t('webcam.errors.notFound');
				case 'NotAllowedError':
				case 'PermissionDeniedError':
				case 'SecurityError':
					return t('webcam.errors.permissionDenied');
				case 'NotSupportedError':
					return t('webcam.errors.notSupported');
				case 'OverconstrainedError':
					return t('webcam.errors.constraints');
				case 'NotReadableError':
					return t('webcam.errors.inUse');
				default:
					return t('webcam.errors.unavailable');
			}
		},
		[t],
	);

	/**
	 * Extracts a developer-friendly error detail for display.
	 *
	 * @param error - Error thrown by the media device APIs
	 * @returns Combined error detail string or null
	 */
	const getWebcamErrorDetail = useCallback((error: unknown): string | null => {
		if (!error || typeof error !== 'object') {
			return null;
		}

		const name = 'name' in error && typeof error.name === 'string' ? error.name : '';
		const message =
			'message' in error && typeof error.message === 'string' ? error.message : '';
		const constraint =
			'constraint' in error && typeof error.constraint === 'string'
				? error.constraint
				: '';

		const parts = [name, message, constraint].filter((value) => value.length > 0);

		return parts.length > 0 ? parts.join(' · ') : null;
	}, []);

	/**
	 * Loads available video input devices from the browser.
	 *
	 * @returns Promise resolved when the device list is refreshed
	 */
	const loadVideoDevices = useCallback(async (): Promise<void> => {
		setDevicesError(null);

		if (!navigator.mediaDevices?.enumerateDevices) {
			setDevicesError(t('webcam.errors.notSupported'));
			setVideoDevices([]);
			return;
		}

		setIsDevicesLoading(true);

		try {
			const devices = await navigator.mediaDevices.enumerateDevices();
			const videoInputs = devices.filter(
				(device) => device.kind === 'videoinput' && device.deviceId,
			);
			setVideoDevices(videoInputs);
			setSelectedDeviceId((current) => {
				if (videoInputs.length === 0) {
					return null;
				}

				if (current && videoInputs.some((device) => device.deviceId === current)) {
					return current;
				}

				return videoInputs[0].deviceId;
			});
		} catch (error) {
			console.error('Failed to enumerate cameras:', error);
			setDevicesError(getWebcamErrorMessage(error));
			setVideoDevices([]);
		} finally {
			setIsDevicesLoading(false);
		}
	}, [getWebcamErrorMessage, t]);


	/**
	 * Formats a display label for a camera device.
	 *
	 * @param device - Media device info entry
	 * @param index - Index used for fallback labeling
	 * @returns Localized label for the device
	 */
	const formatDeviceLabel = useCallback(
		(device: MediaDeviceInfo, index: number): string => {
			const trimmedLabel = device.label.trim();

			if (trimmedLabel.length > 0) {
				return trimmedLabel;
			}

			return t('webcam.devices.unnamed', { index: index + 1 });
		},
		[t],
	);

	/**
	 * Extracts a usable zoom range from the track capabilities.
	 *
	 * @param capabilities - Media track capabilities object
	 * @returns Zoom range or null if not supported
	 */
	const getZoomRange = useCallback(
		(
			capabilities: ZoomCapableMediaTrackCapabilities,
		): { min: number; max: number; step: number } | null => {
			const zoomCapability = capabilities.zoom;

			if (!zoomCapability) {
				return null;
			}

			if (typeof zoomCapability === 'number') {
				return {
					min: zoomCapability,
					max: zoomCapability,
					step: 0.1,
				};
			}

			const min = typeof zoomCapability.min === 'number' ? zoomCapability.min : 1;
			const max = typeof zoomCapability.max === 'number' ? zoomCapability.max : min;
			const step = typeof zoomCapability.step === 'number' ? zoomCapability.step : 0.1;

			return {
				min,
				max,
				step,
			};
		},
		[],
	);

	/**
	 * Syncs zoom capabilities and value with the active video track.
	 *
	 * @param stream - Active media stream
	 * @returns void
	 */
	const updateZoomFromStream = useCallback(
		(stream: MediaStream): void => {
			const [track] = stream.getVideoTracks();

			if (!track) {
				setZoomRange(null);
				setZoomValue(1);
				return;
			}

			// Check if getCapabilities is supported (not available in older browsers like Safari)
			if (typeof track.getCapabilities !== 'function') {
				setZoomRange(null);
				setZoomValue(1);
				return;
			}

			const range = getZoomRange(track.getCapabilities() as ZoomCapableMediaTrackCapabilities);

			if (!range) {
				setZoomRange(null);
				setZoomValue(1);
				return;
			}

			const settings = track.getSettings() as ZoomCapableMediaTrackSettings;
			const initialZoom =
				typeof settings.zoom === 'number' ? settings.zoom : range.min ?? 1;

			setZoomRange(range);
			setZoomValue(initialZoom);
		},
		[getZoomRange],
	);

	/**
	 * Applies a zoom level to the active video track when supported.
	 *
	 * @param value - Desired zoom level
	 * @returns Promise resolved after applying constraints
	 */
	const applyZoom = useCallback(async (value: number): Promise<void> => {
		if (!streamRef.current || !zoomRange) {
			return;
		}

		const [track] = streamRef.current.getVideoTracks();

		if (!track) {
			return;
		}

		const clampedValue = Math.min(Math.max(value, zoomRange.min), zoomRange.max);

		try {
			const constraints = {
				advanced: [{ zoom: clampedValue }],
			} as unknown as MediaTrackConstraints;

			await track.applyConstraints(constraints);
			setZoomValue(clampedValue);
		} catch (error) {
			console.error('Failed to apply zoom:', error);
		}
	}, [zoomRange]);

	/**
	 * Waits for the video element metadata to load.
	 *
	 * @param video - Video element receiving the stream
	 * @returns Promise resolved when metadata is available
	 */
	const waitForVideoMetadata = useCallback(
		(video: HTMLVideoElement): Promise<void> => {
			if (video.readyState >= 2 && video.videoWidth > 0) {
				return Promise.resolve();
			}

			return new Promise((resolve, reject) => {
				const timeoutId = window.setTimeout(() => {
					cleanup();
					reject(new Error('VideoMetadataTimeout'));
				}, 8000);

				const handleLoaded = (): void => {
					cleanup();
					resolve();
				};

				const handleError = (): void => {
					cleanup();
					reject(new Error('VideoMetadataError'));
				};

				const cleanup = (): void => {
					window.clearTimeout(timeoutId);
					video.removeEventListener('loadedmetadata', handleLoaded);
					video.removeEventListener('error', handleError);
				};

				video.addEventListener('loadedmetadata', handleLoaded);
				video.addEventListener('error', handleError);
			});
		},
		[],
	);

	/**
	 * Waits until the video element has produced a usable frame.
	 *
	 * @param video - Video element receiving the stream
	 * @returns Promise resolved when a frame is available
	 */
	const waitForVideoFrame = useCallback(
		(video: HTMLVideoElement): Promise<void> => {
			if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
				return Promise.resolve();
			}

			return new Promise((resolve, reject) => {
				let rafId: number | null = null;
				let frameHandle: number | null = null;

				const timeoutId = window.setTimeout(() => {
					cleanup();
					reject(new Error('VideoFrameTimeout'));
				}, 12000);

				const handleLoaded = (): void => {
					if (video.videoWidth > 0 && video.videoHeight > 0) {
						cleanup();
						resolve();
					}
				};

				const handleError = (): void => {
					cleanup();
					reject(new Error('VideoFrameError'));
				};

				const cleanup = (): void => {
					window.clearTimeout(timeoutId);
					if (rafId !== null) {
						window.cancelAnimationFrame(rafId);
					}
					if (frameHandle !== null) {
						const withCallback = video as HTMLVideoElement & {
							cancelVideoFrameCallback?: (handle: number) => void;
						};
						withCallback.cancelVideoFrameCallback?.(frameHandle);
					}
					video.removeEventListener('loadeddata', handleLoaded);
					video.removeEventListener('error', handleError);
				};

				video.addEventListener('loadeddata', handleLoaded);
				video.addEventListener('error', handleError);

				const withCallback = video as HTMLVideoElement & {
					requestVideoFrameCallback?: (callback: VideoFrameRequestCallback) => number;
				};

				if (withCallback.requestVideoFrameCallback) {
					frameHandle = withCallback.requestVideoFrameCallback(() => {
						cleanup();
						resolve();
					});
					return;
				}

				const poll = (): void => {
					if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
						cleanup();
						resolve();
						return;
					}

					rafId = window.requestAnimationFrame(poll);
				};

				rafId = window.requestAnimationFrame(poll);
			});
		},
		[],
	);

	/**
	 * Attempts to acquire a media stream with the provided constraints.
	 *
	 * @param constraints - Media constraints to request
	 * @returns MediaStream and optional error if the attempt fails
	 */
	const tryGetStream = useCallback(
		async (
			constraints: MediaStreamConstraints,
		): Promise<{ stream: MediaStream | null; error: unknown | null }> => {
			try {
				const stream = await navigator.mediaDevices.getUserMedia(constraints);
				return { stream, error: null };
			} catch (error) {
				return { stream: null, error };
			}
		},
		[],
	);

	/**
	 * Attempts to acquire a stream by trying each enumerated device.
	 *
	 * @returns MediaStream and optional error if all devices fail
	 */
	const tryDevicesFallback = useCallback(async (): Promise<{
		stream: MediaStream | null;
		error: unknown | null;
	}> => {
		const devices =
			videoDevices.length > 0
				? videoDevices
				: await navigator.mediaDevices.enumerateDevices();
		const videoInputs = devices.filter(
			(device) => device.kind === 'videoinput' && device.deviceId,
		);
		let lastError: unknown | null = null;

		for (const device of videoInputs) {
			const attempt = await tryGetStream({
				video: { deviceId: { exact: device.deviceId } },
			});

			if (attempt.stream) {
				setSelectedDeviceId(device.deviceId);
				return attempt;
			}

			lastError = attempt.error;
		}

		return { stream: null, error: lastError };
	}, [tryGetStream, videoDevices]);

	// Enrollment mutation
	const enrollmentMutation = useMutation({
		mutationKey: mutationKeys.employees.fullEnrollment,
		mutationFn: async ({
			employeeId,
			imageBase64,
			hasExistingRekognitionUser,
		}: {
			employeeId: string;
			imageBase64: string;
			hasExistingRekognitionUser: boolean;
		}) => {
			return fullEnrollmentFlow(employeeId, imageBase64, hasExistingRekognitionUser);
		},
		onSuccess: (result) => {
			if (result.success && result.data?.success) {
				toast.success(t('toast.success'));
				onOpenChange(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? result.data?.message ?? t('toast.error'));
			}
		},
		onError: () => {
			toast.error(t('toast.error'));
		},
	});

	/**
	 * Stops the webcam stream and cleans up resources.
	 *
	 * @returns void
	 */
	const stopWebcam = useCallback((): void => {
		if (streamRef.current) {
			streamRef.current.getTracks().forEach((track) => track.stop());
			streamRef.current = null;
		}
		setIsWebcamActive(false);
		setZoomRange(null);
		setZoomValue(1);
		setDigitalZoom(1);
		setWebcamErrorDetail(null);
	}, []);

	/**
	 * Starts the webcam stream.
	 *
	 * @param deviceId - Optional device ID to use. If provided, this takes precedence over selectedDeviceId state.
	 * @returns Promise resolved when the webcam stream is ready or fails gracefully
	 */
	const startWebcam = useCallback(async (deviceId?: string | null): Promise<void> => {
		if (isStartingRef.current) {
			return;
		}

		isStartingRef.current = true;

		try {
			setWebcamError(null);
			setWebcamErrorDetail(null);
			if (!navigator.mediaDevices?.getUserMedia) {
				setWebcamError(t('webcam.errors.notSupported'));
				setIsWebcamActive(false);
				return;
			}

			const targetDeviceId = deviceId ?? selectedDeviceId;

			const preferredConstraints: MediaStreamConstraints = targetDeviceId
				? {
						video: {
							deviceId: { exact: targetDeviceId },
							width: { ideal: 640 },
							height: { ideal: 480 },
						},
					}
				: {
						video: {
							width: { ideal: 640 },
							height: { ideal: 480 },
							facingMode: 'user',
						},
					};

			let stream: MediaStream | null = null;
			let lastError: unknown | null = null;

			const preferredAttempt = await tryGetStream(preferredConstraints);

			if (preferredAttempt.stream) {
				stream = preferredAttempt.stream;
			} else {
				lastError = preferredAttempt.error;
				const fallbackAttempt = await tryGetStream({ video: true });

				if (fallbackAttempt.stream) {
					stream = fallbackAttempt.stream;
				} else {
					lastError = fallbackAttempt.error ?? lastError;
					const deviceAttempt = await tryDevicesFallback();

					if (deviceAttempt.stream) {
						stream = deviceAttempt.stream;
					} else {
						lastError = deviceAttempt.error ?? lastError;
					}
				}
			}

			if (!stream) {
				const fallbackError = lastError ?? new Error('CameraUnavailable');
				console.error('Failed to access webcam:', fallbackError);
				setWebcamError(getWebcamErrorMessage(fallbackError));
				setWebcamErrorDetail(getWebcamErrorDetail(fallbackError));
				setIsWebcamActive(false);
				return;
			}

			streamRef.current = stream;
			setIsWebcamActive(true);

			await new Promise<void>((resolve) => {
				window.requestAnimationFrame(() => resolve());
			});

			if (!videoRef.current) {
				stream.getTracks().forEach((track) => track.stop());
				streamRef.current = null;
				setWebcamError(t('webcam.errors.unavailable'));
				setIsWebcamActive(false);
				return;
			}

			videoRef.current.srcObject = stream;

			try {
				const playPromise = videoRef.current.play();

				if (playPromise) {
					playPromise.catch((playError) => {
						console.warn('Webcam playback deferred:', playError);
						setWebcamErrorDetail(getWebcamErrorDetail(playError));
					});
				}
			} catch (playError) {
				console.warn('Webcam playback deferred:', playError);
				setWebcamErrorDetail(getWebcamErrorDetail(playError));
			}

			try {
				await waitForVideoMetadata(videoRef.current);
				await waitForVideoFrame(videoRef.current);
			} catch (frameError) {
				console.error('Failed to receive webcam frames:', frameError);
				stream.getTracks().forEach((track) => track.stop());
				streamRef.current = null;
				setWebcamError(getWebcamErrorMessage(frameError));
				setWebcamErrorDetail(getWebcamErrorDetail(frameError));
				setIsWebcamActive(false);
				return;
			}

			if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) {
				stream.getTracks().forEach((track) => track.stop());
				streamRef.current = null;
				setWebcamError(t('webcam.errors.noFeed'));
				setWebcamErrorDetail(getWebcamErrorDetail(new Error('VideoFrameEmpty')));
				setIsWebcamActive(false);
				return;
			}

			updateZoomFromStream(stream);
			void loadVideoDevices();
		} catch (error) {
			console.error('Failed to access webcam:', error);
			setWebcamError(getWebcamErrorMessage(error));
			setWebcamErrorDetail(getWebcamErrorDetail(error));
			setIsWebcamActive(false);
		} finally {
			isStartingRef.current = false;
		}
	}, [
		getWebcamErrorDetail,
		getWebcamErrorMessage,
		loadVideoDevices,
		selectedDeviceId,
		t,
		tryDevicesFallback,
		tryGetStream,
		updateZoomFromStream,
		waitForVideoFrame,
		waitForVideoMetadata,
	]);

	/**
	 * Handles tab changes and auto-starts the webcam when needed.
	 *
	 * @param value - Selected tab value
	 * @returns void
	 */
	const handleTabChange = (value: string): void => {
		const nextTab = value as 'upload' | 'webcam';
		setActiveTab(nextTab);

		if (nextTab === 'webcam' && open && !capturedImage && !isWebcamActive) {
			void loadVideoDevices();
			void startWebcam();
		}
	};

	/**
	 * Updates the zoom slider value and applies it to the camera.
	 *
	 * @param event - Range input change event
	 * @returns void
	 */
	const handleZoomChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
		const nextValue = Number(event.target.value);

		if (zoomRange) {
			void applyZoom(nextValue);
			return;
		}

		setDigitalZoom(nextValue);
	};

	/**
	 * Updates the selected camera device and restarts the webcam if needed.
	 *
	 * @param deviceId - Selected camera device id
	 * @returns void
	 */
	const handleDeviceSelect = (deviceId: string): void => {
		setSelectedDeviceId(deviceId);

		if (isWebcamActive) {
			stopWebcam();
			// Pass deviceId directly to startWebcam to avoid closure issue with async state updates
			void startWebcam(deviceId);
		}
	};


	/**
	 * Captures a frame from the webcam video stream.
	 *
	 * @returns void
	 */
	const captureFromWebcam = useCallback((): void => {
		if (!videoRef.current || !canvasRef.current) return;

		const video = videoRef.current;
		const canvas = canvasRef.current;
		const context = canvas.getContext('2d');

		if (!context) return;

		// Set canvas dimensions to match video
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;

		const zoomFactor = zoomRange ? 1 : digitalZoom;

		if (zoomFactor > 1) {
			const sourceWidth = video.videoWidth / zoomFactor;
			const sourceHeight = video.videoHeight / zoomFactor;
			const sourceX = (video.videoWidth - sourceWidth) / 2;
			const sourceY = (video.videoHeight - sourceHeight) / 2;

			context.drawImage(
				video,
				sourceX,
				sourceY,
				sourceWidth,
				sourceHeight,
				0,
				0,
				canvas.width,
				canvas.height,
			);
		} else {
			// Draw the video frame to canvas
			context.drawImage(video, 0, 0, canvas.width, canvas.height);
		}

		// Convert to base64
		const imageData = canvas.toDataURL('image/jpeg', 0.9);
		setCapturedImage(imageData);

		// Stop the webcam after capture
		stopWebcam();
	}, [digitalZoom, stopWebcam, zoomRange]);

	/**
	 * Handles file selection from the file input.
	 *
	 * @param event - The file input change event
	 * @returns void
	 */
	const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>): void => {
		const file = event.target.files?.[0];
		if (!file) return;

		// Validate file type
		if (!ACCEPTED_TYPES.includes(file.type)) {
			toast.error(t('upload.errors.invalidType'));
			return;
		}

		// Validate file size
		if (file.size > MAX_FILE_SIZE) {
			toast.error(t('upload.errors.tooLarge'));
			return;
		}

		// Read file as base64
		const reader = new FileReader();
		reader.onload = (e) => {
			const result = e.target?.result;
			if (typeof result === 'string') {
				setCapturedImage(result);
			}
		};
		reader.onerror = () => {
			toast.error(t('upload.errors.readFailed'));
		};
		reader.readAsDataURL(file);

		// Reset the file input
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	/**
	 * Clears the captured image and resets state.
	 *
	 * @returns void
	 */
	const clearImage = (): void => {
		setCapturedImage(null);
	};

	/**
	 * Handles the enrollment submission.
	 *
	 * @returns void
	 */
	const handleEnroll = (): void => {
		if (!employee || !capturedImage) return;

		enrollmentMutation.mutate({
			employeeId: employee.id,
			imageBase64: capturedImage,
			hasExistingRekognitionUser: !!employee.rekognitionUserId,
		});
	};

	// Clean up webcam when dialog closes or tab changes - using ref to track previous state
	const prevOpenRef = useRef<boolean>(open);
	const prevTabRef = useRef<string>(activeTab);
	const prevEmployeeIdRef = useRef<string | undefined>(employee?.id);

	useEffect(() => {
		// Stop webcam when dialog closes or tab changes away from webcam
		if (prevOpenRef.current && !open) {
			// Dialog is closing
			if (streamRef.current) {
				streamRef.current.getTracks().forEach((track) => track.stop());
				streamRef.current = null;
			}
		} else if (prevTabRef.current === 'webcam' && activeTab !== 'webcam') {
			// Tab changed away from webcam
			if (streamRef.current) {
				streamRef.current.getTracks().forEach((track) => track.stop());
				streamRef.current = null;
			}
		}

		prevOpenRef.current = open;
		prevTabRef.current = activeTab;
	}, [open, activeTab]);

	// Clean up on unmount
	useEffect(() => {
		return () => {
			if (streamRef.current) {
				streamRef.current.getTracks().forEach((track) => track.stop());
				streamRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (open) {
			setDevicesError(null);
			void loadVideoDevices();
		}
	}, [loadVideoDevices, open]);

	// Track employee ID changes
	useEffect(() => {
		prevEmployeeIdRef.current = employee?.id;
	}, [employee?.id]);

	const isSubmitting = enrollmentMutation.isPending;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<UserCheck className="h-5 w-5" />
						{t('title')}
					</DialogTitle>
					<DialogDescription>
						{employee
							? t('description.withEmployee', {
									firstName: employee.firstName,
									lastName: employee.lastName,
									code: employee.code,
								})
							: t('description.noEmployee')}
					</DialogDescription>
				</DialogHeader>

				{employee && (
					<div className="space-y-4">
						{/* Image preview or capture area */}
						{capturedImage ? (
							<div className="relative">
								{/* eslint-disable-next-line @next/next/no-img-element */}
								<img
									src={capturedImage}
									alt={t('image.alt')}
									className="w-full rounded-lg border object-cover aspect-[4/3]"
								/>
								<Button
									variant="destructive"
									size="icon"
									className="absolute top-2 right-2"
									onClick={clearImage}
									disabled={isSubmitting}
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						) : (
							<Tabs
								value={activeTab}
								onValueChange={handleTabChange}
							>
								<TabsList className="grid w-full grid-cols-2">
									<TabsTrigger value="upload" className="flex items-center gap-2">
										<Upload className="h-4 w-4" />
										{t('tabs.upload')}
									</TabsTrigger>
									<TabsTrigger value="webcam" className="flex items-center gap-2">
										<Camera className="h-4 w-4" />
										{t('tabs.webcam')}
									</TabsTrigger>
								</TabsList>

								<TabsContent value="upload" className="mt-4">
									<div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 text-center">
										<Upload className="h-12 w-12 text-muted-foreground mb-4" />
										<p className="text-sm text-muted-foreground mb-4">
											{t('upload.instructions')}
										</p>
										<input
											ref={fileInputRef}
											type="file"
											accept="image/jpeg,image/jpg,image/png"
											onChange={handleFileSelect}
											className="hidden"
										/>
										<Button
											variant="outline"
											onClick={() => fileInputRef.current?.click()}
										>
											{t('upload.selectImage')}
										</Button>
										<p className="text-xs text-muted-foreground mt-2">
											{t('upload.hint')}
										</p>
									</div>
								</TabsContent>

								<TabsContent value="webcam" className="mt-4">
									<div className="flex flex-col items-center">
										{webcamError ? (
											<div className="flex flex-col items-center justify-center border rounded-lg p-8 text-center bg-muted/50">
												<p className="text-sm text-destructive mb-4">
													{webcamError}
												</p>
												{webcamErrorDetail && (
													<p className="text-xs text-muted-foreground mb-4">
														{t('webcam.errors.detail', {
															detail: webcamErrorDetail,
														})}
													</p>
												)}
												<Button
													variant="outline"
													onClick={() => void startWebcam()}
												>
													<RefreshCw className="h-4 w-4 mr-2" />
													{t('webcam.tryAgain')}
												</Button>
											</div>
										) : isWebcamActive ? (
									<div className="space-y-4 w-full">
										<div className="relative rounded-lg overflow-hidden border bg-black">
											<video
												ref={videoRef}
												autoPlay
												playsInline
												muted
												className="w-full aspect-[4/3] object-cover"
												style={
													zoomRange
														? undefined
														: {
																transform: `scale(${digitalZoom})`,
																transformOrigin: 'center center',
															}
												}
											/>
										</div>
										<div className="flex gap-2 justify-center">
											<Button onClick={captureFromWebcam}>
												<Camera className="h-4 w-4 mr-2" />
												{t('webcam.capturePhoto')}
											</Button>
											<Button variant="outline" onClick={stopWebcam}>
												{tCommon('cancel')}
											</Button>
										</div>
										<div className="space-y-2">
											<div className="flex items-center justify-between text-xs text-muted-foreground">
												<span className="font-medium">
													{t('webcam.zoom.label')}
												</span>
												<span>
													{t('webcam.zoom.level', {
														value: (
															zoomRange ? zoomValue : digitalZoom
														).toFixed(1),
													})}
												</span>
											</div>
											<input
												type="range"
												min={zoomRange?.min ?? DIGITAL_ZOOM_RANGE.min}
												max={zoomRange?.max ?? DIGITAL_ZOOM_RANGE.max}
												step={zoomRange?.step ?? DIGITAL_ZOOM_RANGE.step}
												value={zoomRange ? zoomValue : digitalZoom}
												onChange={handleZoomChange}
												className="w-full accent-primary"
											/>
										</div>
									</div>
								) : (
											<div className="flex flex-col items-center justify-center border rounded-lg p-8 text-center">
												<Camera className="h-12 w-12 text-muted-foreground mb-4" />
												<p className="text-sm text-muted-foreground mb-4">
													{t('webcam.instructions')}
												</p>
												<Button onClick={() => void startWebcam()}>
													<Camera className="h-4 w-4 mr-2" />
													{t('webcam.startCamera')}
												</Button>
											</div>
										)}
										<div className="mt-4 w-full text-xs text-muted-foreground">
											<div className="flex items-center justify-between">
												<span className="font-medium">
													{t('webcam.devices.title')}
												</span>
												<Button
													variant="ghost"
													size="sm"
													onClick={loadVideoDevices}
													disabled={isDevicesLoading}
												>
													<RefreshCw className="h-3 w-3 mr-2" />
													{t('webcam.devices.refresh')}
												</Button>
											</div>
											{devicesError && (
												<p className="text-destructive mt-2">
													{devicesError}
												</p>
											)}
											{videoDevices.length > 0 && (
												<div className="mt-3">
													<p className="mb-2 font-medium">
														{t('webcam.devices.selectLabel')}
													</p>
													<Select
														value={selectedDeviceId ?? undefined}
														onValueChange={handleDeviceSelect}
													>
														<SelectTrigger>
															<SelectValue
																placeholder={t(
																	'webcam.devices.selectPlaceholder',
																)}
															/>
														</SelectTrigger>
													<SelectContent>
														{videoDevices
															.filter((device) => device.deviceId)
															.map((device, index) => (
																<SelectItem
																	key={device.deviceId}
																	value={device.deviceId}
																>
																	{formatDeviceLabel(device, index)}
																</SelectItem>
															))}
													</SelectContent>
													</Select>
												</div>
											)}
											{isDevicesLoading ? (
												<p className="mt-2">{t('webcam.devices.loading')}</p>
											) : videoDevices.length > 0 ? (
												<ul className="mt-2 space-y-1">
													{videoDevices.map((device, index) => (
														<li key={device.deviceId}>
															{formatDeviceLabel(device, index)}
														</li>
													))}
												</ul>
											) : (
												<p className="mt-2">{t('webcam.devices.empty')}</p>
											)}
										</div>
									</div>
								</TabsContent>
							</Tabs>
						)}

						{/* Guidelines */}
						<div className="text-xs text-muted-foreground space-y-1 bg-muted/50 p-3 rounded-lg">
							<p className="font-medium">{t('guidelines.title')}</p>
							<ul className="list-disc list-inside space-y-0.5">
								<li>{t('guidelines.items.lighting')}</li>
								<li>{t('guidelines.items.centered')}</li>
								<li>{t('guidelines.items.avoidCoverings')}</li>
								<li>{t('guidelines.items.neutralExpression')}</li>
							</ul>
						</div>

						{/* Hidden canvas for webcam capture */}
						<canvas ref={canvasRef} className="hidden" />
					</div>
				)}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSubmitting}
					>
						{tCommon('cancel')}
					</Button>
					<Button
						onClick={handleEnroll}
						disabled={!capturedImage || isSubmitting || !employee}
					>
						{isSubmitting ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								{t('actions.enrolling')}
							</>
						) : (
							<>
								<UserCheck className="mr-2 h-4 w-4" />
								{t('actions.enroll')}
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
