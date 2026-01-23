import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type VercelEnv = 'production' | 'preview' | 'development';

type DeploymentVersion = {
	deploymentId: string | null;
	gitSha: string | null;
	vercelEnv: VercelEnv | null;
};

const CACHE_CONTROL_HEADER = 'no-store, max-age=0';

/**
 * Normalizes the Vercel environment value into a supported enum.
 *
 * @param value - Raw Vercel environment value.
 * @returns The normalized Vercel environment value or null when unavailable.
 */
function resolveVercelEnv(value: string | undefined): VercelEnv | null {
	if (value === 'production' || value === 'preview' || value === 'development') {
		return value;
	}

	return null;
}

/**
 * Resolves the Git SHA associated with the current deployment.
 *
 * @returns The Git SHA if present; otherwise null.
 */
function resolveGitSha(): string | null {
	return (
		process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
		process.env.VERCEL_GIT_COMMIT_SHA ??
		null
	);
}

/**
 * Builds the deployment version payload for the response.
 *
 * @returns Deployment version metadata for the running build.
 */
function buildVersionPayload(): DeploymentVersion {
	return {
		deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
		gitSha: resolveGitSha(),
		vercelEnv: resolveVercelEnv(process.env.VERCEL_ENV),
	};
}

/**
 * Returns deployment metadata for the current build.
 *
 * @returns JSON response with deployment identifiers.
 */
export async function GET(): Promise<NextResponse> {
	const payload = buildVersionPayload();

	return NextResponse.json(payload, {
		headers: {
			'Cache-Control': CACHE_CONTROL_HEADER,
		},
	});
}
