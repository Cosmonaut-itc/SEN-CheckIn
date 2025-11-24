import type { NextConfig } from "next";

/**
 * Next.js configuration for the Sen Checkin web admin portal.
 * Uses transpile packages to support monorepo workspace dependencies.
 */
const nextConfig: NextConfig = {
	/** Transpile workspace packages for proper TypeScript resolution */
	transpilePackages: ["@sen-checkin/api-contract", "@sen-checkin/types"],
	/** Enable React strict mode for better development experience */
	reactStrictMode: true,
};

export default nextConfig;
