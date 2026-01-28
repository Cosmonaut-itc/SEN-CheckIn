type S3ClientConfig = {
	region: string;
	endpoint?: string;
	forcePathStyle?: boolean;
	credentials?: {
		accessKeyId: string;
		secretAccessKey: string;
	};
};

type HeadObjectCommandOutput = {
	ContentLength?: number;
	ContentType?: string;
};

type PresignedPostCondition = ['content-length-range', number, number] | ['eq', string, string];

type PresignedPostOptions = {
	Bucket: string;
	Key: string;
	Conditions: PresignedPostCondition[];
	Fields: Record<string, string>;
	Expires: number;
};

type PresignedPostResult = {
	url: string;
	fields: Record<string, string>;
};

type S3ClientLike = {
	send: (command: unknown) => Promise<HeadObjectCommandOutput>;
};

type S3Module = {
	S3Client: new (config: S3ClientConfig) => S3ClientLike;
	HeadObjectCommand: new (input: { Bucket: string; Key: string }) => unknown;
	GetObjectCommand: new (input: { Bucket: string; Key: string }) => unknown;
};

type PresignedPostModule = {
	createPresignedPost: (
		client: S3ClientLike,
		options: PresignedPostOptions,
	) => Promise<PresignedPostResult>;
};

type RequestPresignerModule = {
	getSignedUrl: (
		client: S3ClientLike,
		command: unknown,
		options: { expiresIn: number },
	) => Promise<string>;
};

/**
 * Loads the AWS S3 client module on demand.
 *
 * @returns AWS S3 module exports
 * @throws Error when the AWS SDK is not installed
 */
async function loadS3Module(): Promise<S3Module> {
	try {
		const moduleName = '@aws-sdk/client-s3' as string;
		return (await import(moduleName)) as S3Module;
	} catch {
		throw new Error(
			'@aws-sdk/client-s3 is required to use Railway Buckets. Install dependencies and try again.',
		);
	}
}

/**
 * Loads the AWS presigned POST helper module on demand.
 *
 * @returns AWS presigned POST module exports
 * @throws Error when the AWS SDK is not installed
 */
async function loadPresignedPostModule(): Promise<PresignedPostModule> {
	try {
		const moduleName = '@aws-sdk/s3-presigned-post' as string;
		return (await import(moduleName)) as PresignedPostModule;
	} catch {
		throw new Error(
			'@aws-sdk/s3-presigned-post is required to use Railway Buckets. Install dependencies and try again.',
		);
	}
}

/**
 * Loads the AWS request presigner module on demand.
 *
 * @returns AWS request presigner module exports
 * @throws Error when the AWS SDK is not installed
 */
async function loadRequestPresignerModule(): Promise<RequestPresignerModule> {
	try {
		const moduleName = '@aws-sdk/s3-request-presigner' as string;
		return (await import(moduleName)) as RequestPresignerModule;
	} catch {
		throw new Error(
			'@aws-sdk/s3-request-presigner is required to use Railway Buckets. Install dependencies and try again.',
		);
	}
}

/**
 * Configuration required to connect to Railway Buckets.
 */
export interface RailwayBucketConfig {
	bucket: string;
	region: string;
	endpoint: string;
	forcePathStyle: boolean;
}

/**
 * Resolves the Railway bucket configuration from environment variables.
 *
 * @returns Railway bucket configuration
 * @throws Error when required environment variables are missing
 */
export function getRailwayBucketConfig(): RailwayBucketConfig {
	const bucket =
		process.env.AWS_S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? process.env.BUCKET;
	const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? process.env.REGION;
	const endpoint =
		process.env.AWS_ENDPOINT_URL ??
		process.env.S3_ENDPOINT ??
		process.env.ENDPOINT ??
		'https://storage.railway.app';
	const forcePathStyle = (
		process.env.AWS_S3_FORCE_PATH_STYLE ?? process.env.S3_FORCE_PATH_STYLE ?? ''
	).toLowerCase() === 'true';

	if (!bucket) {
		throw new Error(
			'AWS_S3_BUCKET_NAME (or S3_BUCKET/BUCKET) environment variable is required but not set.',
		);
	}
	if (!region) {
		throw new Error(
			'AWS_REGION (or AWS_DEFAULT_REGION/REGION) environment variable is required but not set.',
		);
	}
	if (!endpoint) {
		throw new Error(
			'AWS_ENDPOINT_URL (or S3_ENDPOINT/ENDPOINT) environment variable is required but not set.',
		);
	}

	return { bucket, region, endpoint, forcePathStyle };
}

let cachedClient: S3ClientLike | null = null;

/**
 * Returns a cached S3 client configured for Railway Buckets.
 *
 * @returns S3 client instance
 * @throws Error when bucket configuration or AWS SDK dependencies are missing
 */
export async function getRailwayBucketClient(): Promise<S3ClientLike> {
	if (!cachedClient) {
		const config = getRailwayBucketConfig();
		const accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? process.env.ACCESS_KEY_ID;
		const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? process.env.SECRET_ACCESS_KEY;
		const { S3Client } = await loadS3Module();
		cachedClient = new S3Client({
			region: config.region,
			endpoint: config.endpoint,
			forcePathStyle: config.forcePathStyle,
			credentials:
				accessKeyId && secretAccessKey
					? {
							accessKeyId,
							secretAccessKey,
						}
					: undefined,
		});
	}
	return cachedClient;
}

/**
 * Creates a presigned POST policy for direct browser uploads.
 *
 * @param args - Presign options
 * @returns Presigned POST data
 * @throws Error when bucket configuration or AWS SDK dependencies are missing
 */
export async function createRailwayPresignedPost(args: {
	key: string;
	contentType: string;
	maxSizeBytes: number;
	expiresInSeconds?: number;
}): Promise<{ url: string; fields: Record<string, string> }> {
	const client = await getRailwayBucketClient();
	const config = getRailwayBucketConfig();
	const { createPresignedPost } = await loadPresignedPostModule();

	const { url, fields } = await createPresignedPost(client, {
		Bucket: config.bucket,
		Key: args.key,
		Conditions: [
			['content-length-range', 1, args.maxSizeBytes],
			['eq', '$Content-Type', args.contentType],
		],
		Fields: {
			'Content-Type': args.contentType,
		},
		Expires: args.expiresInSeconds ?? 300,
	});

	return { url, fields };
}

/**
 * Retrieves metadata for an object in the Railway bucket.
 *
 * @param args - Object lookup parameters
 * @returns Object metadata
 * @throws Error when bucket configuration or AWS SDK dependencies are missing
 */
export async function headRailwayObject(args: { key: string }): Promise<HeadObjectCommandOutput> {
	const client = await getRailwayBucketClient();
	const config = getRailwayBucketConfig();
	const { HeadObjectCommand } = await loadS3Module();

	return await client.send(
		new HeadObjectCommand({
			Bucket: config.bucket,
			Key: args.key,
		}),
	);
}

/**
 * Creates a presigned GET URL for downloading an object.
 *
 * @param args - Download parameters
 * @returns Presigned URL
 * @throws Error when bucket configuration or AWS SDK dependencies are missing
 */
export async function createRailwayPresignedGetUrl(args: {
	key: string;
	expiresInSeconds?: number;
}): Promise<string> {
	const client = await getRailwayBucketClient();
	const config = getRailwayBucketConfig();
	const { GetObjectCommand } = await loadS3Module();
	const { getSignedUrl } = await loadRequestPresignerModule();

	const command = new GetObjectCommand({
		Bucket: config.bucket,
		Key: args.key,
	});

	return await getSignedUrl(client, command, { expiresIn: args.expiresInSeconds ?? 900 });
}
