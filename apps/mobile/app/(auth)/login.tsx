import type { BetterFetchError } from '@better-fetch/fetch';
import { useRouter } from 'expo-router';
import { Button, Card, Spinner } from 'heroui-native';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { authClient } from '@/lib/auth-client';
import { API_BASE_URL, API_ENV_VALID } from '@/lib/api';
import { useDeviceContext } from '@/lib/device-context';
import { useAuthContext } from '@/providers/auth-provider';
import { envErrors, ENV } from '@/constants/env';

const DEVICE_CLIENT_ID = 'sen-checkin-mobile';
const DEVICE_SCOPE = 'openid profile';
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

interface DeviceCodeApiResponse {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete: string;
	expires_in: number;
	interval: number;
}

interface DeviceCodeState {
	deviceCode: string;
	userCode: string;
	formattedUserCode: string;
	verificationUri: string;
	verificationUriComplete: string;
	intervalMs: number;
	expiresAt: number;
}

type AuthorizationPhase = 'requesting' | 'waiting' | 'approved' | 'denied' | 'expired' | 'error';

interface AuthorizationStatus {
	state: AuthorizationPhase;
	message: string;
}

/**
 * Normalize a user code by stripping non-alphanumeric characters and uppercasing.
 *
 * @param value - Raw user code value from the API or user input
 * @returns Normalized user code without separators
 */
function normalizeUserCode(value: string): string {
	return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Format a user code into XXXX-XXXX blocks for readability.
 *
 * @param value - Raw or normalized code value
 * @returns Formatted code grouped in blocks of four characters
 */
function formatUserCode(value: string): string {
	const normalized = normalizeUserCode(value);
	return normalized.match(/.{1,4}/g)?.join('-') ?? normalized;
}

/**
 * Map the BetterAuth device code response into a locally convenient shape.
 *
 * @param data - Device code payload returned by the API
 * @returns Parsed device code state with interval/expires timestamps
 */
function mapDeviceCodeResponse(data: DeviceCodeApiResponse): DeviceCodeState {
	const expiresAt = Date.now() + data.expires_in * 1000;
	const intervalMs = data.interval * 1000;

	return {
		deviceCode: data.device_code,
		userCode: normalizeUserCode(data.user_code),
		formattedUserCode: formatUserCode(data.user_code),
		verificationUri: data.verification_uri,
		verificationUriComplete: data.verification_uri_complete,
		intervalMs,
		expiresAt,
	};
}

/**
 * Extract a human-readable error message from BetterFetch errors or unknown values.
 *
 * @param error - Error-like object from BetterAuth client
 * @returns Message suitable for UI display
 */
function deriveErrorMessage(error: unknown): string {
	if (!error) return 'Unexpected error';
	const fetchError = error as BetterFetchError & {
		body?: { error_description?: string };
	};
	return fetchError.body?.error_description ?? fetchError.message ?? 'Unexpected error';
}

export default function LoginScreen(): JSX.Element {
	const router = useRouter();
	const { session, isLoading } = useAuthContext();
	const { updateLocalSettings } = useDeviceContext();

	const [codeState, setCodeState] = useState<DeviceCodeState | null>(null);
	const [status, setStatus] = useState<AuthorizationStatus>({
		state: 'requesting',
		message: 'Requesting device code…',
	});
	const [isRequestingCode, setIsRequestingCode] = useState(false);
	const [hasRequestedOnce, setHasRequestedOnce] = useState(false);
	const [pollDelayMs, setPollDelayMs] = useState<number>(5000);
	const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [lastError, setLastError] = useState<string | null>(null);

	const isTerminal = useMemo(
		() => ['approved', 'denied', 'expired', 'error'].includes(status.state),
		[status.state],
	);

	/**
	 * Cancel any outstanding polling timers.
	 */
	const clearPollTimer = useCallback(() => {
		if (pollTimeoutRef.current) {
			clearTimeout(pollTimeoutRef.current);
			pollTimeoutRef.current = null;
		}
	}, []);

	/**
	 * Request a new device code from BetterAuth.
	 * Resets polling state and schedules the next poll when successful.
	 */
	const requestDeviceCode = useCallback(async () => {
		if (!API_ENV_VALID) {
			setStatus({
				state: 'error',
				message:
					'Set EXPO_PUBLIC_API_URL to a reachable API host (e.g., http://10.0.2.2:3000 on Android emulator).',
			});
			setLastError('EXPO_PUBLIC_API_URL missing or invalid.');
			setHasRequestedOnce(true);
			return;
		}

		setIsRequestingCode(true);
		setLastError(null);
		setStatus({ state: 'requesting', message: 'Requesting device code…' });
		clearPollTimer();
		setHasRequestedOnce(true);

		try {
			const response = await authClient.device.code({
				client_id: DEVICE_CLIENT_ID,
				scope: DEVICE_SCOPE,
			});

			if (response.error || !response.data) {
				throw response.error ?? new Error('Unable to request device code');
			}

			const mapped = mapDeviceCodeResponse(response.data as DeviceCodeApiResponse);
			setCodeState(mapped);
			setPollDelayMs(mapped.intervalMs);
			setStatus({ state: 'waiting', message: 'Waiting for approval…' });
		} catch (error) {
			const message = deriveErrorMessage(error);
			setLastError(message);
			setStatus({ state: 'error', message });
			setCodeState(null);
		} finally {
			setIsRequestingCode(false);
		}
	}, [clearPollTimer]);

	/**
	 * Poll the /device/token endpoint to see if the code has been approved.
	 * Handles RFC 8628 error codes: authorization_pending, slow_down, access_denied, expired_token.
	 */
	const pollForToken = useCallback(async () => {
		if (!codeState) return;

		if (Date.now() >= codeState.expiresAt) {
			setStatus({
				state: 'expired',
				message: 'Device code expired. Refresh to try again.',
			});
			return;
		}

		try {
			const result = await authClient.device.token({
				grant_type: GRANT_TYPE,
				device_code: codeState.deviceCode,
				client_id: DEVICE_CLIENT_ID,
			});

			if (result.data) {
				setStatus({
					state: 'approved',
					message: 'Device approved. Finalizing sign-in…',
				});
				await authClient.getSession();
				router.replace('/(main)/scanner');
				return;
			}

			const errorDetails =
				(result.error as unknown as BetterFetchError & {
					body?: { error?: string; error_description?: string };
				}) ?? null;
			const errorBody = errorDetails?.body ?? {};
			const errorCode = errorBody.error;

			switch (errorCode) {
				case 'authorization_pending': {
					setStatus({ state: 'waiting', message: 'Waiting for approval…' });
					setPollDelayMs(codeState.intervalMs);
					return;
				}
				case 'slow_down': {
					const nextDelay = codeState.intervalMs + 5000;
					setPollDelayMs(nextDelay);
					setStatus({
						state: 'waiting',
						message: 'Server asked to slow down. Retrying…',
					});
					return;
				}
				case 'access_denied': {
					setStatus({
						state: 'denied',
						message: 'Request denied. Generate a new code to try again.',
					});
					return;
				}
				case 'expired_token': {
					setStatus({
						state: 'expired',
						message: 'Code expired. Refresh to request a new one.',
					});
					return;
				}
				default: {
					const fallback =
						errorBody.error_description ?? errorDetails?.message ?? 'Polling failed';
					setLastError(fallback);
					// Keep polling on transient/unknown errors until the code actually expires to allow the full window (e.g., 10 minutes).
					setStatus({
						state: 'waiting',
						message: 'Polling failed. Retrying…',
					});
					setPollDelayMs((prev) => Math.min((prev || codeState.intervalMs) + 5000, 30000));
				}
			}
		} catch (error) {
			const message = deriveErrorMessage(error);
			setLastError(message);
			setStatus({
				state: 'waiting',
				message: 'Polling failed. Retrying…',
			});
			setPollDelayMs((prev) => {
				const base = codeState?.intervalMs ?? prev ?? 5000;
				return Math.min(base + 5000, 30000);
			});
		}
	}, [codeState, router]);

	// Start polling whenever we have a code and the state is still waiting/requesting.
	useEffect(() => {
		if (!codeState) return undefined;
		if (!['waiting', 'requesting'].includes(status.state)) return undefined;

		clearPollTimer();
		pollTimeoutRef.current = setTimeout(() => {
			void pollForToken();
		}, pollDelayMs);

		return () => {
			clearPollTimer();
		};
	}, [clearPollTimer, codeState, pollDelayMs, pollForToken, status.state]);

	// Kick off the first device code request once auth state is known and no session exists.
	useEffect(() => {
		if (isLoading || session || codeState || isRequestingCode || hasRequestedOnce) return;
		void requestDeviceCode();
	}, [codeState, hasRequestedOnce, isLoading, isRequestingCode, requestDeviceCode, session]);

	// Redirect to the scanner when a session already exists.
	useEffect(() => {
		if (!isLoading && session) {
			router.replace('/(main)/scanner');
		}
	}, [isLoading, router, session]);

	/**
	 * Developer bypass for local testing without the device approval flow.
	 */
	const handleDevBypass = useCallback(async () => {
		await updateLocalSettings({ deviceId: 'dev-device-id' });
		router.replace('/(main)/scanner');
	}, [router, updateLocalSettings]);

	const verificationLinkLabel = useMemo(
		() => {
			const fallback = 'https://sen-checkin.app/device';
			const apiLink =
				codeState?.verificationUriComplete ?? codeState?.verificationUri ?? fallback;

			if (ENV.webVerifyUrl && codeState?.userCode) {
				const base = ENV.webVerifyUrl.replace(/\/$/, '');
				const url = `${base}?user_code=${codeState.userCode}`;
				return url;
			}

			// If BetterAuth returned localhost:3000/device, prefer replacing origin with webVerifyUrl host when provided.
			return apiLink;
		},
		[
			codeState?.userCode,
			codeState?.verificationUri,
			codeState?.verificationUriComplete,
		],
	);

	return (
		<View className="flex-1 bg-background px-5 pt-16">
			<Text className="text-3xl font-bold text-foreground mb-3">Device Login</Text>
			<Text className="text-base text-foreground-500 mb-6">
				Show this code to an administrator. They will open the verification link and approve
				the device. This screen will refresh automatically once the request is approved.
			</Text>

			{envErrors ? (
				<View className="bg-warning-100 border border-warning-300 rounded-xl p-3 mb-4">
					<Text className="text-warning-800 font-semibold mb-1">Environment warning</Text>
					<Text className="text-warning-800 text-sm">
						EXPO_PUBLIC_API_URL is not set or invalid. Using {API_BASE_URL}. Ensure the device can
						reach this URL (use LAN IP or a tunnel when not on the same host).
					</Text>
				</View>
			) : null}

			<Card className="p-6 gap-4">
				<Text className="text-sm font-medium text-foreground-500 uppercase tracking-wide">
					User Code
				</Text>
				<Text className="text-5xl font-extrabold tracking-widest text-center">
					{codeState?.formattedUserCode ?? '— — — —'}
				</Text>

				<View className="border border-dashed border-default-200 rounded-2xl p-6 gap-2 items-center justify-center">
					<Text className="text-sm text-foreground-500 mb-1">Verification URL</Text>
					<Text className="text-xs text-foreground-400 text-center" numberOfLines={2}>
						{verificationLinkLabel}
					</Text>
					<Button
						size="sm"
						variant="flat"
						className="mt-2"
						onPress={() => {
							if (codeState?.verificationUriComplete) {
								void Linking.openURL(codeState.verificationUriComplete);
							}
						}}
						isDisabled={!codeState?.verificationUriComplete}
					>
						<Button.Label>Open in browser</Button.Label>
					</Button>
					{!ENV.webVerifyUrl ? (
						<Text className="text-xs text-warning-600 mt-2 text-center">
							Set EXPO_PUBLIC_WEB_VERIFY_URL (or VERIFY_URL) to your web app host
							(e.g., http://localhost:3001/device) so admins open the right page.
						</Text>
					) : null}
				</View>

				<View className="flex-row items-center gap-2">
					{status.state === 'waiting' || status.state === 'requesting' ? (
						<Spinner size="sm" />
					) : null}
					<Text className="text-foreground">{status.message}</Text>
				</View>

				<View className="flex-row gap-3">
					<Button
						onPress={requestDeviceCode}
						isDisabled={isRequestingCode}
						className="flex-1"
						variant="flat"
					>
						<Button.Label>
							{isRequestingCode ? 'Refreshing…' : 'Refresh code'}
						</Button.Label>
					</Button>
					<Button variant="secondary" className="flex-1" onPress={handleDevBypass}>
						<Button.Label>Skip (dev)</Button.Label>
					</Button>
				</View>

				{lastError ? (
					<View className="bg-warning-50 border border-warning-200 rounded-xl p-3">
						<Text className="text-warning-700 font-semibold mb-1">Troubleshooting</Text>
						<Text className="text-warning-700">{lastError}</Text>
						<Text className="text-warning-600 mt-1 text-sm">
							Check that the device can reach {API_BASE_URL}. On Android emulators use http://10.0.2.2:3000,
							on iOS simulators use http://127.0.0.1:3000 or your LAN IP.
						</Text>
					</View>
				) : null}

				{isTerminal ? (
					<View className="bg-default-100 border border-default-200 rounded-xl p-3">
						<Text className="text-foreground font-semibold mb-1">Next steps</Text>
						<Text className="text-foreground-500">
							{status.state === 'approved'
								? 'Redirecting to the scanner…'
								: 'Tap “Refresh code” to restart the device login flow.'}
						</Text>
					</View>
				) : null}
			</Card>
		</View>
	);
}
