import type { BetterFetchError } from 'better-auth/client';
import * as ExpoDevice from 'expo-device';
import { useRouter, type Href } from 'expo-router';
import { Button, Card, Spinner } from 'heroui-native';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Linking, ScrollView, Text, View } from 'react-native';
import QRCode from 'react-qr-code';

import { ENV, envErrors } from '@/constants/env';
import { Colors } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { API_BASE_URL, API_ENV_VALID } from '@/lib/api';
import { authClient, refreshSession, saveAccessToken } from '@/lib/auth-client';
import { registerDevice, type RegisterDeviceResponse } from '@/lib/client-functions';
import { getStableDeviceCode, useDeviceContext } from '@/lib/device-context';
import { i18n } from '@/lib/i18n';
import { useAuthContext } from '@/providers/auth-provider';

const DEVICE_CLIENT_ID = 'sen-checkin-mobile';
const DEVICE_SCOPE = 'openid profile';
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
const PLATFORM = process.env.EXPO_OS ?? 'unknown';

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

interface DeviceTokenResponse {
	access_token: string;
	expires_in?: number;
	refresh_token?: string;
	token_type?: string;
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
	const fallback = i18n.t('Errors.unexpected');
	if (!error) return fallback;
	const fetchError = error as BetterFetchError & {
		body?: { error_description?: string };
	};
	return fetchError.body?.error_description ?? fetchError.message ?? fallback;
}

/**
 * Animated dots component for loading states.
 *
 * @returns {JSX.Element} Animated dots text element
 */
function AnimatedDots(): JSX.Element {
	const [dots, setDots] = useState('');

	useEffect(() => {
		const interval = setInterval(() => {
			setDots((prev) => (prev.length >= 3 ? '' : `${prev}.`));
		}, 400);
		return () => clearInterval(interval);
	}, []);

	return <Text className="text-primary font-bold">{dots || '   '}</Text>;
}

/**
 * Pulsing animation wrapper for approved state.
 *
 * @param props - Wrapper children to animate
 * @returns {JSX.Element} Animated container for approved state UI
 */
function PulseAnimation({ children }: { children: React.ReactNode }): JSX.Element {
	const pulseAnim = useRef(new Animated.Value(1)).current;

	useEffect(() => {
		const pulse = Animated.loop(
			Animated.sequence([
				Animated.timing(pulseAnim, {
					toValue: 1.05,
					duration: 800,
					easing: Easing.inOut(Easing.ease),
					useNativeDriver: true,
				}),
				Animated.timing(pulseAnim, {
					toValue: 1,
					duration: 800,
					easing: Easing.inOut(Easing.ease),
					useNativeDriver: true,
				}),
			]),
		);
		pulse.start();
		return () => pulse.stop();
	}, [pulseAnim]);

	return <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>{children}</Animated.View>;
}

/**
 * Login screen for device authorization.
 *
 * @returns {JSX.Element} Device authorization UI
 */
export default function LoginScreen(): JSX.Element {
	const router = useRouter();
	const { session, isLoading, setSession, authState } = useAuthContext();
	const { updateLocalSettings } = useDeviceContext();
	const accentColor = useThemeColor({}, 'primary');
	const qrForeground = Colors.light.text;
	const continuousCurve = useMemo(() => ({ borderCurve: 'continuous' as const }), []);

	const [codeState, setCodeState] = useState<DeviceCodeState | null>(null);
	const [status, setStatus] = useState<AuthorizationStatus>({
		state: 'requesting',
		message: i18n.t('Login.status.requestingCode'),
	});
	const [isRequestingCode, setIsRequestingCode] = useState(false);
	const [hasRequestedOnce, setHasRequestedOnce] = useState(false);
	const [pollDelayMs, setPollDelayMs] = useState<number>(5000);
	const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [lastError, setLastError] = useState<string | null>(null);
	const [pendingSetup, setPendingSetup] = useState<{
		deviceId: string;
		organizationId: string | null;
	} | null>(null);
	const [isRoutingToSetup, setIsRoutingToSetup] = useState(false);

	const isTerminal = useMemo(
		() => ['approved', 'denied', 'expired', 'error'].includes(status.state),
		[status.state],
	);

	const isApproved = status.state === 'approved';

	useEffect(() => {
		return () => {
			if (navigationTimeoutRef.current) {
				clearTimeout(navigationTimeoutRef.current);
				navigationTimeoutRef.current = null;
			}
		};
	}, []);

	/**
	 * Safely replace the current route once Expo Router is ready.
	 *
	 * Expo Router throws when calling `router.replace` before the root layout mounts.
	 * This helper retries briefly to avoid crashing during early app startup transitions.
	 *
	 * @param href - Destination href for Expo Router navigation
	 * @param remainingAttempts - Remaining retries before giving up
	 * @returns void
	 */
	const replaceWhenReady = useCallback(
		function replaceWhenReady(href: Href, remainingAttempts = 40): void {
			try {
				router.replace(href as never);
				return;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const isMountError =
					message.includes(
						'Attempted to navigate before mounting the Root Layout component',
					) || message.includes("Couldn't find a navigation object");

				if (!isMountError) {
					console.warn('[login] Navigation failed', { href, message });
					return;
				}
			}

			if (remainingAttempts <= 0) {
				console.warn('[login] Navigation skipped; router not ready', { href });
				return;
			}

			if (navigationTimeoutRef.current) {
				clearTimeout(navigationTimeoutRef.current);
			}

			navigationTimeoutRef.current = setTimeout(() => {
				replaceWhenReady(href, remainingAttempts - 1);
			}, 50);
		},
		[router],
	);

	const replaceToDeviceSetup = useCallback(
		(params: { deviceId: string; organizationId: string }) => {
			// Route exists but is missing from the generated typed router manifest; cast until manifest is refreshed
			replaceWhenReady({ pathname: '/(auth)/device-setup', params } as never);
		},
		[replaceWhenReady],
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
	 * Register the current device after approval and persist the returned ID locally.
	 *
	 * @param organizationId - Active organization ID from the session, if available
	 * @returns Registered device response including creation flag
	 */
	const registerApprovedDevice = useCallback(
		async (organizationId: string | null): Promise<RegisterDeviceResponse> => {
			const stableCode = await getStableDeviceCode();
			console.log('[login] registerApprovedDevice payload', {
				stableCode,
				organizationId,
				deviceName:
					ExpoDevice.deviceName ??
					ExpoDevice.modelName ??
					i18n.t('Login.defaults.deviceName'),
				deviceType: ExpoDevice.modelName ?? 'MOBILE',
				platform: PLATFORM,
			});
			const registered = await registerDevice({
				code: stableCode,
				name:
					ExpoDevice.deviceName ??
					ExpoDevice.modelName ??
					i18n.t('Login.defaults.deviceName'),
				deviceType: ExpoDevice.modelName ?? 'MOBILE',
				platform: PLATFORM,
				organizationId,
			});

			await updateLocalSettings({
				deviceId: registered.device.id,
				name: registered.device.name ?? registered.device.code,
				locationId: registered.device.locationId ?? null,
				organizationId: registered.device.organizationId ?? organizationId,
			});

			console.log('[login] registerApprovedDevice response', {
				isNew: registered.isNew,
				deviceId: registered.device.id,
				locationId: registered.device.locationId,
				deviceOrg: registered.device.organizationId,
			});

			return registered;
		},
		[updateLocalSettings],
	);

	/**
	 * Request a new device code from BetterAuth.
	 * Resets polling state and schedules the next poll when successful.
	 */
	const requestDeviceCode = useCallback(async () => {
		if (!API_ENV_VALID) {
			setStatus({
				state: 'error',
				message: i18n.t('Login.status.apiUrlNotConfigured'),
			});
			setLastError(i18n.t('Login.errors.setExpoPublicApiUrl'));
			setHasRequestedOnce(true);
			return;
		}

		setIsRequestingCode(true);
		setLastError(null);
		setStatus({ state: 'requesting', message: i18n.t('Login.status.requestingCode') });
		clearPollTimer();
		setHasRequestedOnce(true);

		try {
			const response = await authClient.device.code({
				client_id: DEVICE_CLIENT_ID,
				scope: DEVICE_SCOPE,
			});

			if (response.error || !response.data) {
				throw response.error ?? new Error(i18n.t('Login.errors.unableToRequestCode'));
			}

			const mapped = mapDeviceCodeResponse(response.data as DeviceCodeApiResponse);
			setCodeState(mapped);
			setPollDelayMs(mapped.intervalMs);
			setStatus({ state: 'waiting', message: i18n.t('Login.status.waitingApproval') });
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
				message: i18n.t('Login.status.deviceCodeExpired'),
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
				const tokenResponse = result.data as DeviceTokenResponse;
				const accessToken = tokenResponse?.access_token;

				if (!accessToken) {
					setLastError(i18n.t('Login.errors.deviceApprovedButTokenMissing'));
					setStatus({
						state: 'error',
						message: i18n.t('Login.status.accessTokenMissing'),
					});
					return;
				}

				setStatus({
					state: 'approved',
					message: i18n.t('Login.status.approved'),
				});
				setLastError(null);

				// Store the access token for future API requests
				await saveAccessToken(accessToken, {
					expiresIn: tokenResponse?.expires_in,
					refreshToken: tokenResponse?.refresh_token,
				});

				try {
					console.log('[login] Device approved, establishing session with token');
					const sessionResult = await refreshSession(accessToken);

					console.log('[login] Session result:', {
						hasData: !!sessionResult.data,
						hasSession: !!sessionResult.data?.session,
						hasUser: !!sessionResult.data?.user,
						error: sessionResult.error,
					});

					if (sessionResult.error || !sessionResult.data?.session) {
						console.warn('[login] Session establishment failed');
						setLastError(i18n.t('Login.errors.couldNotEstablishSession'));
						setStatus({
							state: 'error',
							message: i18n.t('Login.status.sessionFailed'),
						});
						return;
					}

					console.log(
						'[login] Session established for user:',
						sessionResult.data.user?.name,
					);

					// Register device BEFORE setting session to avoid race condition
					// with auto-navigation effect that triggers on session change
					console.log('[login] Registering device with stable code');
					const registration = await registerApprovedDevice(
						sessionResult.data.session?.activeOrganizationId ?? null,
					);
					console.log('[login] Registration complete', {
						isNew: registration.isNew,
						hasLocation: Boolean(registration.device.locationId),
						locationId: registration.device.locationId,
					});

					if (!registration.device.locationId) {
						console.log('[login] Device requires setup, redirecting to setup screen', {
							deviceId: registration.device.id,
							organizationId:
								registration.device.organizationId ??
								sessionResult.data.session?.activeOrganizationId ??
								null,
						});
						// Set routing flags BEFORE session to prevent auto-navigation race
						setPendingSetup({
							deviceId: registration.device.id,
							organizationId:
								registration.device.organizationId ??
								sessionResult.data.session?.activeOrganizationId ??
								null,
						});
						setIsRoutingToSetup(true);
						// Now safe to set session - routing flags are already set
						replaceToDeviceSetup({
							deviceId: registration.device.id,
							organizationId:
								registration.device.organizationId ??
								sessionResult.data.session?.activeOrganizationId ??
								'',
						});
						// Auth layout allows device-setup even with session, but keep session set
						setSession(sessionResult.data);
						return;
					}

					console.log('[login] Device configured, navigating to scanner');
					// Set session in context before navigation
					setSession(sessionResult.data);

					// Navigate after state is synced
					if (navigationTimeoutRef.current) {
						clearTimeout(navigationTimeoutRef.current);
					}

					navigationTimeoutRef.current = setTimeout(() => {
						replaceWhenReady('/(main)/scanner');
					}, 300);
				} catch (error) {
					const message = deriveErrorMessage(error);
					console.error('[login] Failed to establish session or register device:', error);
					setLastError(message);
					setStatus({
						state: 'error',
						message: i18n.t('Login.status.sessionOrRegistrationFailed'),
					});
				}
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
					setStatus({
						state: 'waiting',
						message: i18n.t('Login.status.waitingApproval'),
					});
					setPollDelayMs(codeState.intervalMs);
					return;
				}
				case 'slow_down': {
					const nextDelay = codeState.intervalMs + 5000;
					setPollDelayMs(nextDelay);
					setStatus({
						state: 'waiting',
						message: i18n.t('Login.status.slowingDown'),
					});
					return;
				}
				case 'access_denied': {
					setStatus({
						state: 'denied',
						message: i18n.t('Login.status.requestDenied'),
					});
					return;
				}
				case 'expired_token': {
					setStatus({
						state: 'expired',
						message: i18n.t('Login.status.codeExpired'),
					});
					return;
				}
				default: {
					// Keep polling on transient errors - don't show error banner
					setStatus({
						state: 'waiting',
						message: i18n.t('Login.status.connecting'),
					});
					setPollDelayMs((prev) =>
						Math.min((prev || codeState.intervalMs) + 5000, 30000),
					);
				}
			}
		} catch {
			// Network errors - keep polling silently
			setStatus({
				state: 'waiting',
				message: i18n.t('Login.status.reconnecting'),
			});
			setPollDelayMs((prev) => {
				const base = codeState?.intervalMs ?? prev ?? 5000;
				return Math.min(base + 5000, 30000);
			});
		}
	}, [codeState, registerApprovedDevice, replaceToDeviceSetup, replaceWhenReady, setSession]);

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
		if (
			isLoading ||
			session ||
			codeState ||
			isRequestingCode ||
			hasRequestedOnce ||
			authState === 'locked'
		) {
			return;
		}
		void requestDeviceCode();
	}, [
		authState,
		codeState,
		hasRequestedOnce,
		isLoading,
		isRequestingCode,
		requestDeviceCode,
		session,
	]);

	// Redirect to the scanner when a session already exists.
	useEffect(() => {
		if (!isLoading && session && !pendingSetup && !isRoutingToSetup && authState !== 'locked') {
			console.log('[login] Auto-navigation to scanner (session present, no pending setup)');
			replaceWhenReady('/(main)/scanner');
		}
	}, [authState, isLoading, isRoutingToSetup, pendingSetup, replaceWhenReady, session]);

	useEffect(() => {
		if (pendingSetup && !isRoutingToSetup) {
			console.log(
				'[login] Pending setup detected, ensuring navigation to device-setup',
				pendingSetup,
			);
			setIsRoutingToSetup(true);
			replaceToDeviceSetup({
				deviceId: pendingSetup.deviceId,
				organizationId: pendingSetup.organizationId ?? '',
			});
		}
	}, [isRoutingToSetup, pendingSetup, replaceToDeviceSetup]);

	const verificationUrl = useMemo(() => {
		if (ENV.webVerifyUrl && codeState?.userCode) {
			const base = ENV.webVerifyUrl.replace(/\/$/, '');
			return `${base}?user_code=${codeState.userCode}`;
		}
		return codeState?.verificationUriComplete ?? codeState?.verificationUri ?? '';
	}, [codeState?.userCode, codeState?.verificationUri, codeState?.verificationUriComplete]);

	// Status indicator component
	const StatusIndicator = useMemo(() => {
		if (isApproved) {
			return (
				<PulseAnimation>
					<Card variant="default" style={continuousCurve}>
						<Card.Body className="gap-2 items-center py-4">
							<Text className="text-4xl">✓</Text>
							<Card.Title className="text-success-700 text-2xl">
								{i18n.t('Login.approved.title')}
								<AnimatedDots />
							</Card.Title>
							<Card.Description className="text-success-600">
								{i18n.t('Login.approved.subtitle')}
							</Card.Description>
						</Card.Body>
					</Card>
				</PulseAnimation>
			);
		}

		if (status.state === 'waiting' || status.state === 'requesting') {
			return (
				<Card variant="default" style={continuousCurve}>
					<Card.Body className="flex-row items-center justify-center gap-3 py-2">
						<Spinner size="sm" color={accentColor} />
						<Card.Description className="text-base">{status.message}</Card.Description>
					</Card.Body>
				</Card>
			);
		}

		if (status.state === 'denied') {
			return (
				<Card variant="default" style={continuousCurve}>
					<Card.Body className="items-center gap-2 py-3">
						<Text className="text-xl">✕</Text>
						<Card.Title className="text-danger-700 text-base">
							{status.message}
						</Card.Title>
					</Card.Body>
				</Card>
			);
		}

		if (status.state === 'expired') {
			return (
				<Card variant="default" style={continuousCurve}>
					<Card.Body className="items-center gap-2 py-3">
						<Text className="text-xl">⏱</Text>
						<Card.Title className="text-warning-700 text-base">
							{status.message}
						</Card.Title>
					</Card.Body>
				</Card>
			);
		}

		if (status.state === 'error') {
			return (
				<Card variant="default" style={continuousCurve}>
					<Card.Body className="items-center gap-2 py-3">
						<Text className="text-xl">⚠</Text>
						<Card.Title className="text-danger-700 text-base">
							{status.message}
						</Card.Title>
					</Card.Body>
				</Card>
			);
		}

		return null;
	}, [accentColor, continuousCurve, isApproved, status.message, status.state]);

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentInsetAdjustmentBehavior="automatic"
			contentContainerClassName="px-5 pt-4 pb-6 gap-4"
			showsVerticalScrollIndicator={false}
		>
			{/* Header */}
			<View className="gap-2">
				<Text className="text-base text-foreground-500 leading-relaxed">
					{i18n.t('Login.header.subtitle')}
				</Text>
			</View>

			{/* Environment Warning - only show for actual config errors */}
			{envErrors && status.state === 'error' ? (
				<Card variant="default" style={continuousCurve}>
					<Card.Body className="gap-2 p-4">
						<Card.Title className="text-warning-800 text-base">
							{i18n.t('Login.envWarning.title')}
						</Card.Title>
						<Card.Description className="text-warning-700 text-sm">
							{i18n.t('Login.envWarning.description', { current: API_BASE_URL })}
						</Card.Description>
					</Card.Body>
				</Card>
			) : null}

			{/* Main Card */}
			<Card variant="tertiary" className="p-5 gap-3" style={continuousCurve}>
				{/* User Code Display */}
				<View className="items-center gap-2">
					<Text className="text-xs font-semibold text-foreground-400 uppercase tracking-widest">
						{i18n.t('Login.code.label')}
					</Text>
					<View className="bg-default-100 rounded-2xl px-6 py-3" style={continuousCurve}>
						<Text
							className="text-5xl font-black tracking-[0.3em] text-foreground"
							selectable
						>
							{codeState?.formattedUserCode ?? '————'}
						</Text>
					</View>
				</View>

				{/* QR Code Section */}
				{verificationUrl && !isApproved ? (
					<View className="items-center py-2 gap-2">
						<View
							className="bg-white p-3 rounded-2xl"
							style={{
								boxShadow: '0 4px 14px rgba(15, 23, 42, 0.16)',
								borderCurve: 'continuous',
							}}
						>
							<QRCode
								value={verificationUrl}
								size={140}
								bgColor="white"
								fgColor={qrForeground}
								level="M"
							/>
						</View>
						<Text className="text-xs text-foreground-400 text-center">
							{i18n.t('Login.qr.caption')}
						</Text>
					</View>
				) : null}

				{/* Status Indicator */}
				{StatusIndicator}

				{/* Action Buttons - hide when approved */}
				{!isApproved ? (
					<View className="gap-2">
						<Button
							onPress={requestDeviceCode}
							isDisabled={isRequestingCode}
							className="w-full"
							variant="primary"
							size="md"
						>
							<Button.Label>
								{isRequestingCode
									? i18n.t('Login.actions.refreshing')
									: i18n.t('Login.actions.newCode')}
							</Button.Label>
						</Button>
						{verificationUrl ? (
							<Button
								variant="primary"
								className="w-full"
								size="md"
								onPress={() => {
									void Linking.openURL(verificationUrl);
								}}
							>
								<Button.Label>{i18n.t('Login.actions.openLink')}</Button.Label>
							</Button>
						) : null}
					</View>
				) : null}
			</Card>

			{/* Error Details - only show for actual errors, not during normal polling */}
			{lastError && status.state === 'error' ? (
				<Card variant="default" style={continuousCurve}>
					<Card.Body className="gap-1 p-3">
						<Card.Title className="text-danger-700 text-base">
							{i18n.t('Login.errorDetails.title')}
						</Card.Title>
						<Card.Description className="text-danger-600 text-sm">
							{lastError}
						</Card.Description>
						{!API_ENV_VALID ? (
							<Card.Description className="text-danger-500 text-xs">
								{i18n.t('Login.errorDetails.tip')}
							</Card.Description>
						) : null}
					</Card.Body>
				</Card>
			) : null}

			{/* Terminal State Actions */}
			{isTerminal && !isApproved ? (
				<View>
					<Button
						onPress={requestDeviceCode}
						isDisabled={isRequestingCode}
						variant="primary"
						size="md"
						className="w-full"
					>
						<Button.Label>{i18n.t('Login.actions.tryAgain')}</Button.Label>
					</Button>
				</View>
			) : null}
		</ScrollView>
	);
}
