import type { JSX, PropsWithChildren } from 'react';
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as React from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getAccessToken, primeAuthStorage, refreshSession, useSession } from '@/lib/auth-client';

/**
 * Session data type from useSession hook.
 */
type SessionData = ReturnType<typeof useSession>['data'];

type AuthState = 'ok' | 'refreshing' | 'grace' | 'locked';

type LockReason = 'device_disabled' | 'refresh_failed' | 'manual' | 'unknown';

type ReauthOptions = {
	forceLock?: boolean;
	reason?: LockReason;
};

const KEEPALIVE_INTERVAL_MS = 20 * 60 * 1000;
const GRACE_WINDOW_MS = 8 * 60 * 60 * 1000;

/**
 * Auth context value shape.
 */
type AuthContextValue = {
	/** Current session data or null if not authenticated */
	session: SessionData;
	/** Whether auth state is still loading */
	isLoading: boolean;
	/** Current auth lifecycle state */
	authState: AuthState;
	/** Optional reason explaining why the app is locked */
	lockReason: LockReason | null;
	/** Force a refresh of the session state */
	refetch: () => Promise<void>;
	/** Directly set the session (useful after device auth flow) */
	setSession: (data: SessionData) => void;
	/** Attempt to revalidate session or force lockout */
	requestReauth: (options?: ReauthOptions) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Auth provider component that wraps the app and provides session state.
 *
 * @param props - Component props with children
 * @returns Provider component
 */
export function AuthProvider({ children }: PropsWithChildren): JSX.Element {
	const [storageReady, setStorageReady] = useState(false);
	// Local session override - used when we have a session from device auth
	// that useSession() hasn't picked up yet
	const [localSession, setLocalSession] = useState<SessionData>(null);
	const [authState, setAuthState] = useState<AuthState>('ok');
	const [lockReason, setLockReason] = useState<LockReason | null>(null);
	const graceStartedAtRef = useRef<number | null>(null);
	const keepaliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const refreshInFlightRef = useRef<Promise<boolean> | null>(null);
	const authStateRef = useRef<AuthState>('ok');
	const hasSessionRef = useRef<boolean>(false);
	const storageReadyRef = useRef<boolean>(false);
	const sessionPendingRef = useRef<boolean>(true);

	useEffect(() => {
		primeAuthStorage().finally(() => setStorageReady(true));
	}, []);

	const session = useSession();

	useEffect(() => {
		authStateRef.current = authState;
	}, [authState]);

	useEffect(() => {
		hasSessionRef.current = Boolean((localSession ?? session.data)?.session);
	}, [localSession, session.data]);

	useEffect(() => {
		storageReadyRef.current = storageReady;
	}, [storageReady]);

	useEffect(() => {
		sessionPendingRef.current = session.isPending;
	}, [session.isPending]);

	/**
	 * Transition to a locked state and stop grace tracking.
	 *
	 * @param reason - Reason the app is locked
	 */
	const lockSession = useCallback((reason: LockReason): void => {
		graceStartedAtRef.current = null;
		setAuthState('locked');
		setLockReason(reason);
		console.warn('[AuthProvider] Locked session', { reason });
	}, []);

	/**
	 * Handle refresh failures and transition to grace or locked states.
	 *
	 * @param reason - Reason for the refresh failure
	 * @param source - Where the refresh attempt originated
	 */
	const handleRefreshFailure = useCallback(
		(reason: LockReason, source: 'keepalive' | 'manual'): void => {
			const now = Date.now();

			if (!graceStartedAtRef.current) {
				graceStartedAtRef.current = now;
				console.warn('[AuthProvider] Entering grace window', { reason, source });
			}

			const elapsed = now - (graceStartedAtRef.current ?? now);
			if (elapsed >= GRACE_WINDOW_MS) {
				console.warn('[AuthProvider] Grace window exceeded, locking', {
					reason,
					source,
					elapsedMs: elapsed,
				});
				lockSession(reason);
				return;
			}

			setAuthState('grace');
			setLockReason(reason);
		},
		[lockSession],
	);

	/**
	 * Attempt to refresh session state with the server.
	 *
	 * @param source - Refresh trigger source
	 * @returns Promise resolving to true on success
	 */
	const attemptRefresh = useCallback(
		async (source: 'keepalive' | 'manual'): Promise<boolean> => {
			if (refreshInFlightRef.current) {
				return refreshInFlightRef.current;
			}

			const refreshTask = (async () => {
				const wasLocked = authStateRef.current === 'locked';
				if (!wasLocked) {
					setAuthState('refreshing');
				}
				try {
					const token = getAccessToken();
					const result = await refreshSession(token ?? undefined);
					const hasSession = Boolean(result.data?.session);

					if (result.error || !hasSession) {
						console.warn('[AuthProvider] Session refresh failed', {
							source,
							hasSession,
							error: result.error,
						});
						if (!wasLocked) {
							handleRefreshFailure('refresh_failed', source);
						}
						return false;
					}

					if (authStateRef.current === 'locked' && source === 'keepalive') {
						console.warn('[AuthProvider] Refresh succeeded but session is locked', {
							source,
						});
						return true;
					}

					graceStartedAtRef.current = null;
					setLockReason(null);
					setAuthState('ok');

					if (!session.data && result.data) {
						setLocalSession(result.data);
					}

					return true;
				} catch (error) {
					console.warn('[AuthProvider] Session refresh threw', { source, error });
					if (!wasLocked) {
						handleRefreshFailure('refresh_failed', source);
					}
					return false;
				} finally {
					refreshInFlightRef.current = null;
				}
			})();

			refreshInFlightRef.current = refreshTask;
			return refreshTask;
		},
		[handleRefreshFailure, session.data],
	);

	/**
	 * Force a refetch of the session state.
	 * Useful after device authorization flow completes.
	 */
	const refetch = useCallback(async (): Promise<void> => {
		console.log('[AuthProvider] Refetching session');
		await session.refetch();
		console.log('[AuthProvider] Refetch complete, session.data:', !!session.data);
	}, [session]);

	/**
	 * Directly set the session data.
	 * Useful after device authorization when we already have the session
	 * and don't need another server round-trip.
	 *
	 * @param data - Session data to set
	 */
	const setSession = useCallback((data: SessionData): void => {
		console.log('[AuthProvider] Setting session directly:', !!data);
		setLocalSession(data);
		graceStartedAtRef.current = null;
		setLockReason(null);
		setAuthState('ok');
	}, []);

	/**
	 * Attempt to revalidate the session or force a lock.
	 *
	 * @param options - Optional lock override options
	 * @returns Promise that resolves when complete
	 */
	const requestReauth = useCallback(
		async (options?: ReauthOptions): Promise<void> => {
			if (options?.forceLock) {
				lockSession(options.reason ?? 'unknown');
				return;
			}

			await attemptRefresh('manual');
		},
		[attemptRefresh, lockSession],
	);

	// Use localSession if available, otherwise fall back to useSession data
	// This ensures device auth flow can immediately update the session
	// without waiting for useSession to sync
	const effectiveSession = localSession ?? session.data;

	// Clear localSession when useSession catches up
	useEffect(() => {
		if (localSession && session.data) {
			console.log('[AuthProvider] useSession caught up, clearing local override');
			setLocalSession(null);
		}
	}, [localSession, session.data]);

	useEffect(() => {
		const shouldKeepalive = () => {
			const state = authStateRef.current;
			const canRefresh =
				hasSessionRef.current || state === 'grace' || state === 'refreshing';
			return (
				storageReadyRef.current &&
				!sessionPendingRef.current &&
				canRefresh &&
				state !== 'locked'
			);
		};

		const tick = () => {
			if (!shouldKeepalive()) return;
			void attemptRefresh('keepalive');
		};

		const startKeepalive = () => {
			if (keepaliveIntervalRef.current) return;
			tick();
			keepaliveIntervalRef.current = setInterval(() => {
				tick();
			}, KEEPALIVE_INTERVAL_MS);
		};

		const stopKeepalive = () => {
			if (keepaliveIntervalRef.current) {
				clearInterval(keepaliveIntervalRef.current);
				keepaliveIntervalRef.current = null;
			}
		};

		const handleAppStateChange = (nextState: AppStateStatus) => {
			if (nextState === 'active') {
				startKeepalive();
			} else {
				stopKeepalive();
			}
		};

		const subscription = AppState.addEventListener('change', handleAppStateChange);

		if (AppState.currentState === 'active') {
			startKeepalive();
		}

		return () => {
			subscription.remove();
			stopKeepalive();
		};
	}, [attemptRefresh]);

	const value = useMemo<AuthContextValue>(
		() => ({
			session: effectiveSession,
			isLoading: !storageReady || session.isPending,
			authState,
			lockReason,
			refetch,
			setSession,
			requestReauth,
		}),
		[
			authState,
			effectiveSession,
			lockReason,
			requestReauth,
			session.isPending,
			storageReady,
			refetch,
			setSession,
		],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context.
 *
 * @returns Auth context value
 * @throws Error if used outside AuthProvider
 */
export function useAuthContext(): AuthContextValue {
	const ctx = React.use(AuthContext);
	if (!ctx) {
		throw new Error('useAuthContext must be used within AuthProvider');
	}
	return ctx;
}
