'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	AlertCircle,
	CheckCircle2,
	Clock3,
	Home,
	Loader2,
	RefreshCw,
	ShieldCheck,
	ShieldX,
	XCircle,
} from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSession } from '@/lib/auth-client';
import {
	type DeviceVerificationResult,
	approveDeviceCode,
	denyDeviceCode,
	verifyDeviceCode,
} from '@/lib/client-functions';
import { formatUserCode, normalizeUserCode } from '@/lib/device-code-utils';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import { useTranslations } from 'next-intl';

interface DeviceClientProps {
	initialCode?: string;
}

/**
 * Safely extract a user-facing error message from BetterAuth responses.
 *
 * @param error - Error object returned by the auth client
 * @param fallback - Fallback message when no details are available
 * @returns A message suitable for rendering in the UI
 */
function getErrorMessage(error: unknown, fallback: string): string {
	if (!error) return fallback;
	const maybe = error as {
		message?: string;
		body?: { error_description?: string; error?: string };
	};
	return maybe.body?.error_description ?? maybe.message ?? fallback;
}

/**
 * Device verification client component. Users enter the 8-character code shown on the kiosk, verify
 * it, and then approve or deny the pending device authorization.
 *
 * @param props - Component props containing the optional pre-filled code
 * @returns Verification UI
 */
export function DeviceClient({ initialCode }: DeviceClientProps): React.ReactElement {
	const t = useTranslations('Auth');
	const session = useSession();
	const queryClient = useQueryClient();
	const [userCode, setUserCode] = useState<string>(formatUserCode(initialCode ?? ''));
	const [verification, setVerification] = useState<DeviceVerificationResult | null>(null);
	const [action, setAction] = useState<'idle' | 'verifying' | 'approving' | 'denying'>('idle');
	const [error, setError] = useState<string | null>(null);

	const isAuthenticated = Boolean(session.data?.session);
	const normalizedCode = normalizeUserCode(userCode);
	const codeIsValid = /^[A-Z0-9]{8}$/.test(normalizedCode);
	const deviceReturnPath = useMemo(() => {
		if (!normalizedCode) {
			return '/device';
		}

		const search = new URLSearchParams({ user_code: normalizedCode });
		return `/device?${search.toString()}`;
	}, [normalizedCode]);
	const signInHref = useMemo(() => {
		const search = new URLSearchParams({ callbackUrl: deviceReturnPath });
		return `/sign-in?${search.toString()}`;
	}, [deviceReturnPath]);

	const verifyQuery = useQuery({
		queryKey: queryKeys.deviceAuth.verify(normalizedCode),
		queryFn: () => verifyDeviceCode(normalizedCode),
		enabled: false,
		retry: false,
	});

	useEffect(() => {
		// Clear stale verification/error when the code changes
		setVerification(null);
		setError(null);
	}, [normalizedCode]);

	/**
	 * Verify the user code by calling GET /device.
	 */
	const handleVerify = useCallback(async () => {
		const normalized = normalizeUserCode(userCode);
		if (!normalized || normalized.length !== 8 || !/^[A-Z0-9]{8}$/.test(normalized)) {
			setError(t('device.errors.invalidCode'));
			return;
		}

		setError(null);
		setAction('verifying');

		try {
			const result = await verifyQuery.refetch();
			if (result.error) {
				throw result.error;
			}
			if (result.data) {
				setVerification({
					userCode: formatUserCode(result.data.userCode),
					status: result.data.status,
				});
			}
		} catch (err) {
			setVerification(null);
			setError(getErrorMessage(err, t('device.errors.unableToProcess')));
		} finally {
			setAction('idle');
		}
	}, [t, userCode, verifyQuery]);

	/**
	 * Approve the device authorization request.
	 */
	const approveMutation = useMutation({
		mutationKey: mutationKeys.deviceAuth.approve,
		mutationFn: async (code: string) => approveDeviceCode(code),
		onSuccess: () => {
			if (verification) {
				setVerification({
					userCode: verification.userCode,
					status: 'approved',
				});
			}
			setError(null);
			void queryClient.invalidateQueries({
				queryKey: queryKeys.deviceAuth.all,
			});
		},
		onError: (err: unknown) =>
			setError(getErrorMessage(err, t('device.errors.unableToProcess'))),
		onSettled: () => setAction('idle'),
	});

	/**
	 * Deny the device authorization request.
	 */
	const denyMutation = useMutation({
		mutationKey: mutationKeys.deviceAuth.deny,
		mutationFn: async (code: string) => denyDeviceCode(code),
		onSuccess: () => {
			if (verification) {
				setVerification({ userCode: verification.userCode, status: 'denied' });
			}
			setError(null);
			void queryClient.invalidateQueries({
				queryKey: queryKeys.deviceAuth.all,
			});
		},
		onError: (err: unknown) =>
			setError(getErrorMessage(err, t('device.errors.unableToProcess'))),
		onSettled: () => setAction('idle'),
	});

	const handleApprove = useCallback(async () => {
		if (!verification || verification.status === 'approved') return;
		setAction('approving');
		setError(null);
		await approveMutation.mutateAsync(verification.userCode);
	}, [approveMutation, verification]);

	const handleDeny = useCallback(async () => {
		if (!verification || verification.status === 'approved') return;
		setAction('denying');
		setError(null);
		await denyMutation.mutateAsync(verification.userCode);
	}, [denyMutation, verification]);

	const statusBadge = useMemo(() => {
		switch (verification?.status) {
			case 'approved':
				return (
					<Badge
						variant="outline"
						className="gap-1 text-green-700 border-green-200 bg-green-50"
					>
						<CheckCircle2 className="h-4 w-4" /> {t('device.status.approved')}
					</Badge>
				);
			case 'denied':
				return (
					<Badge
						variant="outline"
						className="gap-1 text-red-700 border-red-200 bg-red-50"
					>
						<XCircle className="h-4 w-4" /> {t('device.status.denied')}
					</Badge>
				);
			case 'pending':
				return (
					<Badge
						variant="outline"
						className="gap-1 text-amber-700 border-amber-200 bg-amber-50"
					>
						<Clock3 className="h-4 w-4" /> {t('device.status.pending')}
					</Badge>
				);
			default:
				return null;
		}
	}, [t, verification?.status]);

	return (
		<div className="w-full max-w-xl mx-auto space-y-6">
			<Card>
				<CardHeader className="space-y-1">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<ShieldCheck className="h-4 w-4" />
						<span>{t('device.headerLabel')}</span>
					</div>
					<CardTitle className="text-2xl">{t('device.title')}</CardTitle>
					<p className="text-muted-foreground">{t('device.description')}</p>
				</CardHeader>
				<CardContent className="space-y-4">
					<label className="text-sm font-medium text-foreground">
						{t('device.fields.userCode')}
					</label>
					<div className="flex gap-3">
						<Input
							value={userCode}
							onChange={(e) => setUserCode(formatUserCode(e.target.value))}
							placeholder="ABCD-EFGH"
							className="text-lg font-mono"
						/>
						<Button onClick={handleVerify} disabled={action !== 'idle' || !codeIsValid}>
							{action === 'verifying' ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />{' '}
									{t('device.actions.verifying')}
								</>
							) : (
								<>
									<RefreshCw className="mr-2 h-4 w-4" />{' '}
									{t('device.actions.verify')}
								</>
							)}
						</Button>
					</div>
					{verification ? (
						<div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
							<div>
								<p className="text-sm text-muted-foreground">
									{t('device.fields.code')}
								</p>
								<p className="font-mono text-lg font-semibold">
									{verification.userCode}
								</p>
							</div>
							{statusBadge}
						</div>
					) : null}
					{error ? (
						<div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							<AlertCircle className="h-4 w-4" />
							<span>{error}</span>
						</div>
					) : null}
				</CardContent>
				<CardFooter className="flex flex-col gap-3">
					{verification ? (
						<div className="flex flex-wrap items-center gap-3">
							<Button
								onClick={handleApprove}
								disabled={
									!isAuthenticated ||
									action !== 'idle' ||
									!verification ||
									verification.status === 'approved'
								}
								variant="default"
							>
								{action === 'approving' ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />{' '}
										{t('device.actions.approving')}
									</>
								) : (
									<>
										<ShieldCheck className="mr-2 h-4 w-4" />{' '}
										{t('device.actions.approve')}
									</>
								)}
							</Button>
							<Button
								onClick={handleDeny}
								disabled={
									!isAuthenticated ||
									action !== 'idle' ||
									!verification ||
									verification.status === 'approved'
								}
								variant="secondary"
							>
								{action === 'denying' ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />{' '}
										{t('device.actions.denying')}
									</>
								) : (
									<>
										<ShieldX className="mr-2 h-4 w-4" />{' '}
										{t('device.actions.deny')}
									</>
								)}
							</Button>
							{!isAuthenticated ? (
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<AlertCircle className="h-4 w-4" />
									<span>
										{t('device.signInRequired')}{' '}
										<Link
											href={signInHref}
											className="text-primary underline underline-offset-4"
										>
											{t('device.goToSignIn')}
										</Link>
									</span>
								</div>
							) : null}
						</div>
					) : (
						<div className="text-sm text-muted-foreground flex items-center gap-2">
							<Clock3 className="h-4 w-4" />
							{t('device.awaitingCode')}
						</div>
					)}
					<Button
						asChild
						variant="outline"
						className="self-center mt-2 px-6"
						aria-label={t('device.returnToDashboard.ariaLabel')}
					>
						<Link href="/dashboard" className="flex items-center gap-2">
							<Home className="h-4 w-4" />
							<span>{t('device.returnToDashboard.label')}</span>
						</Link>
					</Button>
				</CardFooter>
			</Card>

			<Card className="border-dashed">
				<CardHeader>
					<CardTitle className="text-base">{t('device.howItWorks.title')}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm text-muted-foreground">
					<p>{t('device.howItWorks.step1')}</p>
					<p>{t('device.howItWorks.step2')}</p>
					<p>{t('device.howItWorks.step3')}</p>
				</CardContent>
			</Card>
		</div>
	);
}
