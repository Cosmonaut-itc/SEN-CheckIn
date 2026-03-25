import {
	AssociateFacesCommand,
	CreateCollectionCommand,
	CreateUserCommand,
	DeleteFacesCommand,
	DeleteUserCommand,
	DisassociateFacesCommand,
	IndexFacesCommand,
	ListFacesCommand,
	RekognitionClient,
	SearchUsersByImageCommand,
	type FaceRecord,
	type SearchedFaceDetails,
	type UserMatch,
} from '@aws-sdk/client-rekognition';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import type { BoundingBox, FaceIndexResult } from '../schemas/recognition.js';

/**
 * Amazon Rekognition service for face recognition operations.
 * Implements User Vectors approach for high-accuracy face matching.
 *
 * @module services/rekognition
 */

const DEFAULT_REKOGNITION_MAX_ATTEMPTS = 2;
const DEFAULT_REKOGNITION_REQUEST_TIMEOUT_MS = 2500;
const DEFAULT_REKOGNITION_CONNECTION_TIMEOUT_MS = 1000;
const REKOGNITION_INVALID_IMAGE_ERROR_NAMES = new Set([
	'ImageTooLargeException',
	'InvalidImageFormatException',
	'InvalidParameterException',
]);

type RekognitionServiceErrorCode =
	| 'REKOGNITION_INVALID_IMAGE'
	| 'REKOGNITION_UPSTREAM_FAILURE'
	| 'REKOGNITION_UPSTREAM_TIMEOUT';

type RekognitionServiceHttpStatus = 400 | 503 | 504;

/**
 * Error thrown when Rekognition cannot complete a request successfully.
 */
export class RekognitionServiceError extends Error {
	/** Stable error code returned to clients. */
	public readonly errorCode: RekognitionServiceErrorCode;

	/** HTTP status to surface at the route boundary. */
	public readonly httpStatus: RekognitionServiceHttpStatus;

	/** Human-readable message that is safe to return to API clients. */
	public readonly clientMessage: string;

	/**
	 * Creates a new RekognitionServiceError instance.
	 *
	 * @param message - Internal error message for logs
	 * @param errorCode - Stable client-facing error code
	 * @param httpStatus - HTTP status to return
	 * @param clientMessage - Safe client-facing error message
	 */
	constructor(
		message: string,
		errorCode: RekognitionServiceErrorCode,
		httpStatus: RekognitionServiceHttpStatus,
		clientMessage: string = httpStatus === 400
			? 'Invalid recognition image'
			: 'Face recognition service unavailable',
	) {
		super(message);
		this.name = 'RekognitionServiceError';
		this.errorCode = errorCode;
		this.httpStatus = httpStatus;
		this.clientMessage = clientMessage;
	}
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Gets the AWS region from environment variables.
 * @returns The AWS region string
 * @throws Error if AWS_REGION_RKG is not set
 */
function getAwsRegion(): string {
	const region = process.env.AWS_REGION_RKG ?? process.env.AWS_REGION;
	if (!region) {
		throw new Error(
			'AWS_REGION or AWS_REGION_RKG environment variable is required but not set.',
		);
	}
	return region;
}

/**
 * Gets the Rekognition collection ID from environment variables.
 * @returns The collection ID string
 * @throws Error if AWS_REKOGNITION_COLLECTION_ID_RKG is not set
 */
function getCollectionId(): string {
	const collectionId =
		process.env.AWS_REKOGNITION_COLLECTION_ID_RKG ??
		process.env.AWS_REKOGNITION_COLLECTION_ID;
	if (!collectionId) {
		throw new Error(
			'AWS_REKOGNITION_COLLECTION_ID or AWS_REKOGNITION_COLLECTION_ID_RKG environment variable is required but not set.',
		);
	}
	return collectionId;
}

/**
 * Gets explicit Rekognition credentials from environment variables when provided.
 *
 * @returns Credential object or undefined to use default AWS provider chain
 */
function getRekognitionCredentials():
	| {
			accessKeyId: string;
			secretAccessKey: string;
	  }
	| undefined {
	const accessKeyId = process.env.AWS_ACCESS_KEY_ID_RKG ?? process.env.AWS_ACCESS_KEY_ID;
	const secretAccessKey =
		process.env.AWS_SECRET_ACCESS_KEY_RKG ?? process.env.AWS_SECRET_ACCESS_KEY;

	if (!accessKeyId || !secretAccessKey) {
		return undefined;
	}

	return { accessKeyId, secretAccessKey };
}

/**
 * Lazy-initialized Rekognition client instance.
 * Uses AWS credentials from the environment (CLI, IAM role, etc.).
 */
let rekognitionClient: RekognitionClient | null = null;

/**
 * Resets the memoized Rekognition client singleton.
 * Intended only for deterministic unit tests.
 *
 * @returns Nothing
 */
export function resetRekognitionClientForTests(): void {
	rekognitionClient = null;
}

/**
 * Reads a positive integer from the environment or falls back to a default.
 *
 * @param value - Raw environment variable value
 * @param fallback - Default value to use when parsing fails
 * @returns Parsed positive integer
 */
function parsePositiveInteger(value: string | undefined, fallback: number): number {
	if (!value) {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Reads the upstream HTTP status code from an AWS SDK error when available.
 *
 * @param error - Unknown AWS SDK error value
 * @returns Numeric HTTP status code or null when unavailable
 */
function getRekognitionErrorHttpStatus(error: unknown): number | null {
	if (!error || typeof error !== 'object') {
		return null;
	}

	const metadataValue = (error as { $metadata?: unknown }).$metadata;
	if (!metadataValue || typeof metadataValue !== 'object') {
		return null;
	}

	const httpStatusCode = (metadataValue as { httpStatusCode?: unknown }).httpStatusCode;
	return typeof httpStatusCode === 'number' ? httpStatusCode : null;
}

/**
 * Maps AWS Rekognition search failures to the API's stable error contract.
 *
 * @param error - Unknown upstream error thrown by the SDK
 * @returns Stable error classification for route handling
 */
function classifySearchUsersByImageError(error: unknown): {
	errorCode: RekognitionServiceErrorCode;
	httpStatus: RekognitionServiceHttpStatus;
	clientMessage: string;
} {
	const errorName = error instanceof Error ? error.name : 'Error';
	const errorMessage =
		error instanceof Error ? error.message : 'Unknown error searching faces';
	const upstreamHttpStatus = getRekognitionErrorHttpStatus(error);
	const isTimeout =
		errorName === 'TimeoutError' ||
		errorName === 'AbortError' ||
		errorMessage.toLowerCase().includes('timeout');

	if (isTimeout) {
		return {
			errorCode: 'REKOGNITION_UPSTREAM_TIMEOUT',
			httpStatus: 504,
			clientMessage: 'Face recognition service unavailable',
		};
	}

	if (
		upstreamHttpStatus === 400 &&
		REKOGNITION_INVALID_IMAGE_ERROR_NAMES.has(errorName)
	) {
		return {
			errorCode: 'REKOGNITION_INVALID_IMAGE',
			httpStatus: 400,
			clientMessage: 'Invalid recognition image',
		};
	}

	return {
		errorCode: 'REKOGNITION_UPSTREAM_FAILURE',
		httpStatus: 503,
		clientMessage: 'Face recognition service unavailable',
	};
}

/**
 * Builds the Rekognition service endpoint for a given region.
 *
 * @param region - AWS region
 * @returns Rekognition endpoint URL
 */
function getRekognitionEndpoint(region: string): string {
	return `https://rekognition.${region}.amazonaws.com`;
}

/**
 * Gets or creates the Rekognition client singleton.
 * @returns The RekognitionClient instance
 */
function getClient(): RekognitionClient {
	if (!rekognitionClient) {
		const region = getAwsRegion();
		const credentials = getRekognitionCredentials();
		const endpoint = getRekognitionEndpoint(region);
		const maxAttempts = parsePositiveInteger(
			process.env.AWS_REKOGNITION_MAX_ATTEMPTS,
			DEFAULT_REKOGNITION_MAX_ATTEMPTS,
		);
		const requestTimeout = parsePositiveInteger(
			process.env.AWS_REKOGNITION_REQUEST_TIMEOUT_MS,
			DEFAULT_REKOGNITION_REQUEST_TIMEOUT_MS,
		);
		const connectionTimeout = parsePositiveInteger(
			process.env.AWS_REKOGNITION_CONNECTION_TIMEOUT_MS,
			DEFAULT_REKOGNITION_CONNECTION_TIMEOUT_MS,
		);
		rekognitionClient = new RekognitionClient({
			region,
			credentials,
			endpoint,
			retryMode: 'standard',
			maxAttempts,
			requestHandler: new NodeHttpHandler({
				requestTimeout,
				connectionTimeout,
			}),
		});
	}
	return rekognitionClient;
}

// ============================================================================
// Collection Management
// ============================================================================

/**
 * Result of a collection creation operation.
 */
export interface CreateCollectionResult {
	/** Whether the collection was created successfully */
	success: boolean;
	/** The ARN of the created collection */
	collectionArn: string | null;
	/** The face model version used by the collection */
	faceModelVersion: string | null;
	/** Optional error message if creation failed */
	message?: string;
}

/**
 * Creates a new face collection in Amazon Rekognition.
 * This is typically a one-time setup operation.
 *
 * @returns Promise resolving to the creation result
 *
 * @example
 * ```typescript
 * const result = await createCollection();
 * if (result.success) {
 *   console.log(`Collection created: ${result.collectionArn}`);
 * }
 * ```
 */
export async function createCollection(): Promise<CreateCollectionResult> {
	try {
		const client = getClient();
		const collectionId = getCollectionId();

		const command = new CreateCollectionCommand({
			CollectionId: collectionId,
		});

		const response = await client.send(command);

		return {
			success: response.StatusCode === 200,
			collectionArn: response.CollectionArn ?? null,
			faceModelVersion: response.FaceModelVersion ?? null,
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error creating collection';
		return {
			success: false,
			collectionArn: null,
			faceModelVersion: null,
			message: errorMessage,
		};
	}
}

// ============================================================================
// User Management
// ============================================================================

/**
 * Result of a user creation operation in Rekognition.
 */
export interface CreateUserResult {
	/** Whether the user was created successfully */
	success: boolean;
	/** The user ID that was created (same as employeeId) */
	userId: string | null;
	/** Optional error message if creation failed */
	message?: string;
}

/**
 * Creates a new user in the Rekognition collection.
 * The user ID corresponds to the employee ID for easy mapping.
 *
 * @param employeeId - The employee ID to use as the Rekognition user ID
 * @returns Promise resolving to the creation result
 *
 * @example
 * ```typescript
 * const result = await createUser('emp-123-uuid');
 * if (result.success) {
 *   console.log(`User created with ID: ${result.userId}`);
 * }
 * ```
 */
export async function createUser(employeeId: string): Promise<CreateUserResult> {
	try {
		const client = getClient();
		const collectionId = getCollectionId();

		const command = new CreateUserCommand({
			CollectionId: collectionId,
			UserId: employeeId,
		});

		await client.send(command);

		return {
			success: true,
			userId: employeeId,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error creating user';
		return {
			success: false,
			userId: null,
			message: errorMessage,
		};
	}
}

/**
 * Result of a user deletion operation.
 */
export interface DeleteUserResult {
	/** Whether the user was deleted successfully */
	success: boolean;
	/** Optional error message if deletion failed */
	message?: string;
}

/**
 * Deletes a user from the Rekognition collection.
 * This also removes all face associations but does not delete the indexed faces.
 *
 * @param userId - The user ID to delete (typically the employee ID)
 * @returns Promise resolving to the deletion result
 *
 * @example
 * ```typescript
 * const result = await deleteUser('emp-123-uuid');
 * if (result.success) {
 *   console.log('User deleted successfully');
 * }
 * ```
 */
export async function deleteUser(userId: string): Promise<DeleteUserResult> {
	try {
		const client = getClient();
		const collectionId = getCollectionId();

		const command = new DeleteUserCommand({
			CollectionId: collectionId,
			UserId: userId,
		});

		await client.send(command);

		return {
			success: true,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error deleting user';
		return {
			success: false,
			message: errorMessage,
		};
	}
}

// ============================================================================
// Face Indexing
// ============================================================================

/**
 * Result of a face indexing operation.
 */
export interface IndexFaceResult {
	/** Whether the face was indexed successfully */
	success: boolean;
	/** Array of indexed face results (usually one per image) */
	faces: FaceIndexResult[];
	/** Optional error message if indexing failed */
	message?: string;
}

/**
 * Converts AWS SDK BoundingBox to our schema type.
 *
 * @param awsBoundingBox - The AWS SDK bounding box object
 * @returns Normalized bounding box object
 */
function convertBoundingBox(awsBoundingBox: FaceRecord['Face']): BoundingBox {
	return {
		width: awsBoundingBox?.BoundingBox?.Width ?? 0,
		height: awsBoundingBox?.BoundingBox?.Height ?? 0,
		left: awsBoundingBox?.BoundingBox?.Left ?? 0,
		top: awsBoundingBox?.BoundingBox?.Top ?? 0,
	};
}

/**
 * Indexes a face image into the Rekognition collection.
 * The face is stored with the employee ID as the external image ID for later reference.
 *
 * @param imageBytes - The image as a Uint8Array (decoded from base64)
 * @param employeeId - The employee ID to associate with the indexed face
 * @returns Promise resolving to the indexing result with face IDs
 *
 * @example
 * ```typescript
 * const imageBuffer = Buffer.from(base64Image, 'base64');
 * const result = await indexFace(imageBuffer, 'emp-123-uuid');
 * if (result.success && result.faces.length > 0) {
 *   console.log(`Face indexed with ID: ${result.faces[0].faceId}`);
 * }
 * ```
 */
export async function indexFace(
	imageBytes: Uint8Array,
	employeeId: string,
): Promise<IndexFaceResult> {
	try {
		const client = getClient();
		const collectionId = getCollectionId();

		const command = new IndexFacesCommand({
			CollectionId: collectionId,
			Image: {
				Bytes: imageBytes,
			},
			ExternalImageId: employeeId,
			DetectionAttributes: ['DEFAULT'],
			MaxFaces: 1, // Only index the most prominent face
			QualityFilter: 'AUTO', // Filter low-quality faces automatically
		});

		const response = await client.send(command);

		const faces: FaceIndexResult[] =
			response.FaceRecords?.map((record) => ({
				faceId: record.Face?.FaceId ?? '',
				boundingBox: convertBoundingBox(record.Face),
				confidence: record.Face?.Confidence ?? 0,
			})) ?? [];

		return {
			success: faces.length > 0,
			faces,
			message: faces.length === 0 ? 'No faces detected in the image' : undefined,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error indexing face';
		return {
			success: false,
			faces: [],
			message: errorMessage,
		};
	}
}

// ============================================================================
// Face Association
// ============================================================================

/**
 * Result of a face association operation.
 */
export interface AssociateFacesResult {
	/** Whether the faces were associated successfully */
	success: boolean;
	/** Number of faces successfully associated */
	associatedCount: number;
	/** Optional error message if association failed */
	message?: string;
}

/**
 * Associates indexed faces with a user in the Rekognition collection.
 * This links face vectors to a user vector for improved matching accuracy.
 *
 * @param userId - The user ID to associate faces with (typically employee ID)
 * @param faceIds - Array of face IDs to associate with the user
 * @returns Promise resolving to the association result
 *
 * @example
 * ```typescript
 * const result = await associateFaces('emp-123-uuid', ['face-id-1', 'face-id-2']);
 * if (result.success) {
 *   console.log(`${result.associatedCount} faces associated`);
 * }
 * ```
 */
export async function associateFaces(
	userId: string,
	faceIds: string[],
): Promise<AssociateFacesResult> {
	try {
		const client = getClient();
		const collectionId = getCollectionId();

		const command = new AssociateFacesCommand({
			CollectionId: collectionId,
			UserId: userId,
			FaceIds: faceIds,
		});

		const response = await client.send(command);

		const associatedCount = response.AssociatedFaces?.length ?? 0;

		return {
			success: associatedCount > 0,
			associatedCount,
			message: associatedCount === 0 ? 'No faces were associated' : undefined,
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error associating faces';
		return {
			success: false,
			associatedCount: 0,
			message: errorMessage,
		};
	}
}

/**
 * Result of a face disassociation operation.
 */
export interface DisassociateFacesResult {
	/** Whether the faces were disassociated successfully */
	success: boolean;
	/** Number of faces successfully disassociated */
	disassociatedCount: number;
	/** Optional error message if disassociation failed */
	message?: string;
}

/**
 * Disassociates faces from a user in the Rekognition collection.
 *
 * @param userId - The user ID to disassociate faces from
 * @param faceIds - Array of face IDs to disassociate
 * @returns Promise resolving to the disassociation result
 */
export async function disassociateFaces(
	userId: string,
	faceIds: string[],
): Promise<DisassociateFacesResult> {
	try {
		const client = getClient();
		const collectionId = getCollectionId();

		const command = new DisassociateFacesCommand({
			CollectionId: collectionId,
			UserId: userId,
			FaceIds: faceIds,
		});

		const response = await client.send(command);

		const disassociatedCount = response.DisassociatedFaces?.length ?? 0;

		// Treat zero disassociations as a partial failure for better diagnostics
		if (disassociatedCount === 0 && faceIds.length > 0) {
			return {
				success: false,
				disassociatedCount: 0,
				message: 'No faces were disassociated from the user',
			};
		}

		return {
			success: true,
			disassociatedCount,
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error disassociating faces';
		return {
			success: false,
			disassociatedCount: 0,
			message: errorMessage,
		};
	}
}

// ============================================================================
// Face Search
// ============================================================================

/**
 * Result of a face search operation using User Vectors.
 */
export interface SearchUsersByImageResult {
	/** Whether a matching user was found */
	matched: boolean;
	/** The matched user's ID (employee ID), or null if no match */
	userId: string | null;
	/** Similarity score (0-100), or null if no match */
	similarity: number | null;
	/** Confidence of the searched face detection */
	searchedFaceConfidence: number | null;
	/** Number of SDK attempts used for the upstream call */
	attempts?: number;
	/** Optional error message if search failed */
	message?: string;
}

/**
 * Default similarity threshold for face matching (80%).
 * Faces with similarity below this threshold are not considered matches.
 */
const DEFAULT_SIMILARITY_THRESHOLD = 80;

/**
 * Searches for a matching user in the collection using an image.
 * Uses User Vectors for higher accuracy compared to individual face matching.
 *
 * @param imageBytes - The image as a Uint8Array (decoded from base64)
 * @param similarityThreshold - Minimum similarity score (0-100) for a match. Default: 80
 * @returns Promise resolving to the search result with matched user info
 *
 * @example
 * ```typescript
 * const imageBuffer = Buffer.from(base64Image, 'base64');
 * const result = await searchUsersByImage(imageBuffer, 85);
 * if (result.matched) {
 *   console.log(`Matched employee: ${result.userId} (${result.similarity}%)`);
 * }
 * ```
 */
export async function searchUsersByImage(
	imageBytes: Uint8Array,
	similarityThreshold: number = DEFAULT_SIMILARITY_THRESHOLD,
): Promise<SearchUsersByImageResult> {
	try {
		const client = getClient();
		const collectionId = getCollectionId();
		const command = new SearchUsersByImageCommand({
			CollectionId: collectionId,
			Image: {
				Bytes: imageBytes,
			},
			MaxUsers: 1,
			UserMatchThreshold: similarityThreshold,
		});

		const response = await client.send(command);

		const userMatches: UserMatch[] = response.UserMatches ?? [];
		const searchedFace: SearchedFaceDetails | undefined = response.SearchedFace;
		const topMatch = userMatches[0];

		if (topMatch?.User?.UserId) {
			return {
				matched: true,
				userId: topMatch.User.UserId,
				similarity: topMatch.Similarity ?? null,
				searchedFaceConfidence: searchedFace?.FaceDetail?.Confidence ?? null,
				attempts: response.$metadata.attempts,
			};
		}

		return {
			matched: false,
			userId: null,
			similarity: null,
			searchedFaceConfidence: searchedFace?.FaceDetail?.Confidence ?? null,
			attempts: response.$metadata.attempts,
			message: 'No matching user found above similarity threshold',
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error searching faces';
		const classification = classifySearchUsersByImageError(error);

		throw new RekognitionServiceError(
			errorMessage,
			classification.errorCode,
			classification.httpStatus,
			classification.clientMessage,
		);
	}
}

// ============================================================================
// Face Deletion
// ============================================================================

/**
 * Result of a face deletion operation.
 */
export interface DeleteFacesResult {
	/** Whether faces were deleted successfully */
	success: boolean;
	/** Array of face IDs that were deleted */
	deletedFaceIds: string[];
	/** Optional error message if deletion failed */
	message?: string;
}

/**
 * Deletes faces from the Rekognition collection.
 *
 * @param faceIds - Array of face IDs to delete
 * @returns Promise resolving to the deletion result
 */
export async function deleteFaces(faceIds: string[]): Promise<DeleteFacesResult> {
	try {
		const client = getClient();
		const collectionId = getCollectionId();

		const command = new DeleteFacesCommand({
			CollectionId: collectionId,
			FaceIds: faceIds,
		});

		const response = await client.send(command);

		return {
			success: true,
			deletedFaceIds: response.DeletedFaces ?? [],
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : 'Unknown error deleting faces';
		return {
			success: false,
			deletedFaceIds: [],
			message: errorMessage,
		};
	}
}

/**
 * Result of listing faces for an external image ID.
 */
export interface ListFacesByExternalIdResult {
	/** Whether the operation was successful */
	success: boolean;
	/** Array of face IDs associated with the external image ID */
	faceIds: string[];
	/** Optional error message if listing failed */
	message?: string;
}

/**
 * Lists all faces in the collection associated with a specific external image ID.
 * Useful for finding all faces indexed for a particular employee.
 * Handles pagination to retrieve all faces across multiple pages (AWS returns max 100 per page).
 *
 * @param externalImageId - The external image ID (employee ID) to search for
 * @returns Promise resolving to the list of face IDs
 */
export async function listFacesByExternalId(
	externalImageId: string,
): Promise<ListFacesByExternalIdResult> {
	try {
		const client = getClient();
		const collectionId = getCollectionId();

		const allFaceIds: string[] = [];
		let nextToken: string | undefined;

		// Paginate through all faces in the collection
		do {
			const command = new ListFacesCommand({
				CollectionId: collectionId,
				NextToken: nextToken,
			});

			const response = await client.send(command);

			// Filter faces by external image ID and collect face IDs
			const pageFaceIds =
				response.Faces?.filter((face) => face.ExternalImageId === externalImageId)
					.map((face) => face.FaceId ?? '')
					.filter((id) => id !== '') ?? [];

			allFaceIds.push(...pageFaceIds);

			// Check if there are more pages
			nextToken = response.NextToken;
		} while (nextToken);

		return {
			success: true,
			faceIds: allFaceIds,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error listing faces';
		return {
			success: false,
			faceIds: [],
			message: errorMessage,
		};
	}
}
