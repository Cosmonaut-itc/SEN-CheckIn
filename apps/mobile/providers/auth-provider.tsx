import type { JSX, PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { primeAuthStorage, useSession } from '@/lib/auth-client';

/**
 * Session data type from useSession hook.
 */
type SessionData = ReturnType<typeof useSession>['data'];

/**
 * Auth context value shape.
 */
type AuthContextValue = {
	/** Current session data or null if not authenticated */
	session: SessionData;
	/** Whether auth state is still loading */
	isLoading: boolean;
	/** Force a refresh of the session state */
	refetch: () => Promise<void>;
	/** Directly set the session (useful after device auth flow) */
	setSession: (data: SessionData) => void;
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

	useEffect(() => {
		primeAuthStorage().finally(() => setStorageReady(true));
	}, []);

	const session = useSession();

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
	}, []);

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

	const value = useMemo<AuthContextValue>(
		() => ({
			session: effectiveSession,
			isLoading: !storageReady || session.isPending,
			refetch,
			setSession,
		}),
		[effectiveSession, session.isPending, storageReady, refetch, setSession],
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
	const ctx = useContext(AuthContext);
	if (!ctx) {
		throw new Error('useAuthContext must be used within AuthProvider');
	}
	return ctx;
}
