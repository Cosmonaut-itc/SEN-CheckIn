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

interface DeviceClientProps {
	initialCode?: string;
}

/**
 * Safely extract a user-facing error message from BetterAuth responses.
 *
 * @param error - Error object returned by the auth client
 * @returns A message suitable for rendering in the UI
 */
function getErrorMessage(error: unknown): string {
	if (!error) return 'Unable to process request';
	const maybe = error as {
		message?: string;
		body?: { error_description?: string; error?: string };
	};
	return maybe.body?.error_description ?? maybe.message ?? 'Unable to process request';
}

/**
 * Device verification client component. Users enter the 8-character code shown on the kiosk, verify
 * it, and then approve or deny the pending device authorization.
 *
 * @param props - Component props containing the optional pre-filled code
 * @returns Verification UI
 */
export function DeviceClient({ initialCode }: DeviceClientProps): React.ReactElement {
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
			setError('Enter the full 8-character code (letters/numbers only, no dash)');
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
			setError(getErrorMessage(err));
		} finally {
			setAction('idle');
		}
	}, [userCode, verifyQuery]);

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
		onError: (err: unknown) => setError(getErrorMessage(err)),
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
		onError: (err: unknown) => setError(getErrorMessage(err)),
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
						<CheckCircle2 className="h-4 w-4" /> Approved
					</Badge>
				);
			case 'denied':
				return (
					<Badge
						variant="outline"
						className="gap-1 text-red-700 border-red-200 bg-red-50"
					>
						<XCircle className="h-4 w-4" /> Denied
					</Badge>
				);
			case 'pending':
				return (
					<Badge
						variant="outline"
						className="gap-1 text-amber-700 border-amber-200 bg-amber-50"
					>
						<Clock3 className="h-4 w-4" /> Pending approval
					</Badge>
				);
			default:
				return null;
		}
	}, [verification?.status]);

	return (
		<div className="w-full max-w-xl mx-auto space-y-6">
			<Card>
				<CardHeader className="space-y-1">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<ShieldCheck className="h-4 w-4" />
						<span>Device authorization (OAuth 2.0 device code)</span>
					</div>
					<CardTitle className="text-2xl">Enter the device code</CardTitle>
					<p className="text-muted-foreground">
						Type the 8-character code displayed on the kiosk. If you opened this page
						from the device link, the code is pre-filled.
					</p>
				</CardHeader>
				<CardContent className="space-y-4">
					<label className="text-sm font-medium text-foreground">User code</label>
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
									<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying
								</>
							) : (
								<>
									<RefreshCw className="mr-2 h-4 w-4" /> Verify code
								</>
							)}
						</Button>
					</div>
					{verification ? (
						<div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
							<div>
								<p className="text-sm text-muted-foreground">Code</p>
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
										<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Approving…
									</>
								) : (
									<>
										<ShieldCheck className="mr-2 h-4 w-4" /> Approve
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
										<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Denying…
									</>
								) : (
									<>
										<ShieldX className="mr-2 h-4 w-4" /> Deny
									</>
								)}
							</Button>
							{!isAuthenticated ? (
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<AlertCircle className="h-4 w-4" />
									<span>
										Sign in to approve devices.{' '}
										<Link
											href={signInHref}
											className="text-primary underline underline-offset-4"
										>
											Go to sign-in
										</Link>
									</span>
								</div>
							) : null}
						</div>
					) : (
						<div className="text-sm text-muted-foreground flex items-center gap-2">
							<Clock3 className="h-4 w-4" />
							Awaiting a valid code to approve or deny.
						</div>
					)}
					<Button
						asChild
						variant="outline"
						className="self-center mt-2 px-6"
						aria-label="Return to dashboard"
					>
						<Link href="/dashboard" className="flex items-center gap-2">
							<Home className="h-4 w-4" />
							<span>Return to dashboard</span>
						</Link>
					</Button>
				</CardFooter>
			</Card>

			<Card className="border-dashed">
				<CardHeader>
					<CardTitle className="text-base">How this works</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm text-muted-foreground">
					<p>1. The kiosk/mobile app requests a device code and shows it on screen.</p>
					<p>
						2. You enter the code here to verify it, then approve or deny the request.
					</p>
					<p>3. Once approved, the device polls /device/token and receives a session.</p>
				</CardContent>
			</Card>
		</div>
	);
}
