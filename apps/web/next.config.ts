import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
	experimental: {
		serverActions: {
			bodySizeLimit: '10mb',
		},
	},
	turbopack: {
		root: '../../',
	},
	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'api.qrserver.com',
				pathname: '/v1/create-qr-code/**',
			},
		],
	},
};

export default withNextIntl(nextConfig);
