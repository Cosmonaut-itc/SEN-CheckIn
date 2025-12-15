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
	const t = useTranslations('FaceEnrollment');
	const tCommon = useTranslations('Common');
	const queryClient = useQueryClient();

	// State for image capture
	const [activeTab, setActiveTab] = useState<'upload' | 'webcam'>('upload');
	const [capturedImage, setCapturedImage] = useState<string | null>(null);
	const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
	const [webcamError, setWebcamError] = useState<string | null>(null);

	/**
	 * Handles dialog open state changes and resets state when opening.
	 *
	 * @param newOpen - The new open state
	 */
	const handleOpenChange = (newOpen: boolean): void => {
		if (newOpen) {
			// Reset state when opening
			setCapturedImage(null);
			setActiveTab('upload');
			setWebcamError(null);
			setIsWebcamActive(false);
		}
		onOpenChange(newOpen);
	};

	// Refs for webcam
	const videoRef = useRef<HTMLVideoElement>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	// File input ref
	const fileInputRef = useRef<HTMLInputElement>(null);

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
	 */
	const stopWebcam = useCallback((): void => {
		if (streamRef.current) {
			streamRef.current.getTracks().forEach((track) => track.stop());
			streamRef.current = null;
		}
		setIsWebcamActive(false);
	}, []);

	/**
	 * Starts the webcam stream.
	 */
	const startWebcam = useCallback(async (): Promise<void> => {
		try {
			setWebcamError(null);
			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					width: { ideal: 640 },
					height: { ideal: 480 },
					facingMode: 'user',
				},
			});

			streamRef.current = stream;

			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				await videoRef.current.play();
			}

			setIsWebcamActive(true);
		} catch (error) {
			console.error('Failed to access webcam:', error);
			setWebcamError(t('webcam.errors.unavailable'));
			setIsWebcamActive(false);
		}
	}, [t]);

	/**
	 * Captures a frame from the webcam video stream.
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

		// Draw the video frame to canvas
		context.drawImage(video, 0, 0, canvas.width, canvas.height);

		// Convert to base64
		const imageData = canvas.toDataURL('image/jpeg', 0.9);
		setCapturedImage(imageData);

		// Stop the webcam after capture
		stopWebcam();
	}, [stopWebcam]);

	/**
	 * Handles file selection from the file input.
	 *
	 * @param event - The file input change event
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
	 */
	const clearImage = (): void => {
		setCapturedImage(null);
	};

	/**
	 * Handles the enrollment submission.
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
								onValueChange={(value) =>
									setActiveTab(value as 'upload' | 'webcam')
								}
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
												<Button variant="outline" onClick={startWebcam}>
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
											</div>
										) : (
											<div className="flex flex-col items-center justify-center border rounded-lg p-8 text-center">
												<Camera className="h-12 w-12 text-muted-foreground mb-4" />
												<p className="text-sm text-muted-foreground mb-4">
													{t('webcam.instructions')}
												</p>
												<Button onClick={startWebcam}>
													<Camera className="h-4 w-4 mr-2" />
													{t('webcam.startCamera')}
												</Button>
											</div>
										)}
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
