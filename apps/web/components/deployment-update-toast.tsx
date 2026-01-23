'use client';

import React, { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

const VERSION_ENDPOINT = '/api/version';
const POLL_INTERVAL_MS = 3 * 60 * 1000;

type VercelEnv = 'production' | 'preview' | 'development';

type DeploymentVersion = {
	deploymentId: string | null;
	gitSha: string | null;
	vercelEnv: VercelEnv | null;
};

type VersionFetchOptions = {
	credentials: RequestCredentials;
	signal?: AbortSignal;
};

/**
 * Checks whether a value is a supported Vercel environment string.
 *
 * @param value - Value to validate.
 * @returns True when the value matches a Vercel environment.
 */
function isVercelEnv(value: unknown): value is VercelEnv {
	return value === 'production' || value === 'preview' || value === 'development';
}

/**
 * Normalizes a raw API response into a deployment version payload.
 *
 * @param payload - Raw JSON payload returned by the API.
 * @returns A normalized deployment version or null when invalid.
 */
function normalizeDeploymentVersion(payload: unknown): DeploymentVersion | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const record = payload as Record<string, unknown>;

	return {
		deploymentId: typeof record.deploymentId === 'string' ? record.deploymentId : null,
		gitSha: typeof record.gitSha === 'string' ? record.gitSha : null,
		vercelEnv: isVercelEnv(record.vercelEnv) ? record.vercelEnv : null,
	};
}

/**
 * Fetches the deployment metadata from the version endpoint.
 *
 * @param options - Fetch options for credential handling and cancellation.
 * @returns The parsed deployment version or null when unavailable.
 */
async function fetchDeploymentVersion(
	options: VersionFetchOptions,
): Promise<DeploymentVersion | null> {
	try {
		const response = await fetch(VERSION_ENDPOINT, {
			cache: 'no-store',
			credentials: options.credentials,
			headers: {
				'cache-control': 'no-store',
			},
			signal: options.signal,
		});

		if (!response.ok) {
			return null;
		}

		const data = (await response.json()) as unknown;
		return normalizeDeploymentVersion(data);
	} catch (error) {
		if (error instanceof DOMException && error.name === 'AbortError') {
			return null;
		}

		return null;
	}
}

/**
 * Determines whether a deployment version is production.
 *
 * @param version - Deployment version to evaluate.
 * @returns True when the version is marked as production.
 */
function isProductionVersion(version: DeploymentVersion | null): boolean {
	return version?.vercelEnv === 'production';
}

/**
 * Determines if a newer deployment is available.
 *
 * @param currentVersion - Deployment metadata for the loaded build.
 * @param latestVersion - Deployment metadata for the latest build.
 * @returns True when the deployment IDs differ.
 */
function shouldNotifyUpdate(
	currentVersion: DeploymentVersion | null,
	latestVersion: DeploymentVersion | null,
): boolean {
	const currentId = currentVersion?.deploymentId;
	const latestId = latestVersion?.deploymentId;

	if (!currentId || !latestId) {
		return false;
	}

	return currentId !== latestId;
}

/**
 * Registers a polling listener that prompts users when a new deployment is live.
 *
 * @returns Null because this component only manages side effects.
 */
export function DeploymentUpdateToast(): React.ReactElement | null {
	const t = useTranslations('UpdateToast');
	const currentVersionRef = useRef<DeploymentVersion | null>(null);
	const toastIdRef = useRef<string | number | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const isCheckingRef = useRef(false);
	const isStoppedRef = useRef(false);

	useEffect(() => {
		if (process.env.NODE_ENV !== 'production') {
			return undefined;
		}

		const abortController = new AbortController();
		isStoppedRef.current = false;

		/**
		 * Clears polling and focus listeners.
		 *
		 * @returns Nothing.
		 */
		function teardown(): void {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}

			window.removeEventListener('focus', handleWindowFocus);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			isStoppedRef.current = true;
		}

		/**
		 * Reloads the page to fetch the latest deployment.
		 *
		 * @returns Nothing.
		 */
		function handleReload(): void {
			window.location.reload();
		}

		/**
		 * Shows the update toast once.
		 *
		 * @returns Nothing.
		 */
		function showUpdateToast(): void {
			if (toastIdRef.current !== null) {
				return;
			}

			toastIdRef.current = toast(t('title'), {
				description: t('description'),
				duration: Number.POSITIVE_INFINITY,
				action: {
					label: t('action'),
					onClick: handleReload,
				},
			});

			teardown();
		}

		/**
		 * Checks for a newer deployment and triggers the toast when needed.
		 *
		 * @returns A promise that resolves when the check completes.
		 */
		async function checkForUpdate(): Promise<void> {
			if (isStoppedRef.current || isCheckingRef.current) {
				return;
			}

			if (document.visibilityState === 'hidden') {
				return;
			}

			isCheckingRef.current = true;

			try {
				const currentPromise = currentVersionRef.current
					? Promise.resolve(currentVersionRef.current)
					: fetchDeploymentVersion({
							credentials: 'same-origin',
							signal: abortController.signal,
						});
				const latestPromise = fetchDeploymentVersion({
					credentials: 'omit',
					signal: abortController.signal,
				});

				const [currentVersion, latestVersion] = await Promise.all([
					currentPromise,
					latestPromise,
				]);

				if (!currentVersionRef.current && currentVersion) {
					currentVersionRef.current = currentVersion;
				}

				if (currentVersion && !isProductionVersion(currentVersion)) {
					teardown();
					return;
				}

				if (latestVersion && !isProductionVersion(latestVersion)) {
					teardown();
					return;
				}

				if (shouldNotifyUpdate(currentVersion, latestVersion)) {
					showUpdateToast();
				}
			} finally {
				isCheckingRef.current = false;
			}
		}

		/**
		 * Handles tab focus to re-check the deployment status.
		 *
		 * @returns Nothing.
		 */
		function handleWindowFocus(): void {
			void checkForUpdate();
		}

		/**
		 * Handles visibility changes to re-check when the tab is visible.
		 *
		 * @returns Nothing.
		 */
		function handleVisibilityChange(): void {
			if (document.visibilityState !== 'visible') {
				return;
			}

			void checkForUpdate();
		}

		/**
		 * Starts the polling interval and visibility listeners.
		 *
		 * @returns Nothing.
		 */
		function startPolling(): void {
			if (intervalRef.current) {
				return;
			}

			intervalRef.current = setInterval(() => {
				void checkForUpdate();
			}, POLL_INTERVAL_MS);

			window.addEventListener('focus', handleWindowFocus);
			document.addEventListener('visibilitychange', handleVisibilityChange);
		}

		/**
		 * Initializes the current deployment snapshot and polling.
		 *
		 * @returns A promise that resolves once initialization finishes.
		 */
		async function initialize(): Promise<void> {
			const currentVersion = await fetchDeploymentVersion({
				credentials: 'same-origin',
				signal: abortController.signal,
			});

			currentVersionRef.current = currentVersion;
			startPolling();
			void checkForUpdate();
		}

		void initialize();

		return () => {
			abortController.abort();
			teardown();
		};
	}, [t]);

	return null;
}
