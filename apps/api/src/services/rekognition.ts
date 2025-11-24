import {
	RekognitionClient,
	CreateCollectionCommand,
	CreateUserCommand,
	DeleteUserCommand,
	IndexFacesCommand,
	AssociateFacesCommand,
	DisassociateFacesCommand,
	SearchUsersByImageCommand,
	DeleteFacesCommand,
	ListFacesCommand,
	type FaceRecord,
	type UserMatch,
	type SearchedFaceDetails,
} from '@aws-sdk/client-rekognition';

import type { BoundingBox, FaceIndexResult } from '../schemas/recognition.js';

/**
 * Amazon Rekognition service for face recognition operations.
 * Implements User Vectors approach for high-accuracy face matching.
 *
 * @module services/rekognition
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Gets the AWS region from environment variables.
 * @returns The AWS region string
 * @throws Error if AWS_REGION is not set
 */
function getAwsRegion(): string {
	const region = process.env.AWS_REGION;
	if (!region) {
		throw new Error('AWS_REGION environment variable is required but not set.');
	}
	return region;
}

/**
 * Gets the Rekognition collection ID from environment variables.
 * @returns The collection ID string
 * @throws Error if AWS_REKOGNITION_COLLECTION_ID is not set
 */
function getCollectionId(): string {
	const collectionId = process.env.AWS_REKOGNITION_COLLECTION_ID;
	if (!collectionId) {
		throw new Error('AWS_REKOGNITION_COLLECTION_ID environment variable is required but not set.');
	}
	return collectionId;
}

/**
 * Lazy-initialized Rekognition client instance.
 * Uses AWS credentials from the environment (CLI, IAM role, etc.).
 */
let rekognitionClient: RekognitionClient | null = null;

/**
 * Gets or creates the Rekognition client singleton.
 * @returns The RekognitionClient instance
 */
function getClient(): RekognitionClient {
	if (!rekognitionClient) {
		rekognitionClient = new RekognitionClient({
			region: getAwsRegion(),
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
		const errorMessage = error instanceof Error ? error.message : 'Unknown error creating collection';
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
export async function indexFace(imageBytes: Uint8Array, employeeId: string): Promise<IndexFaceResult> {
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
export async function associateFaces(userId: string, faceIds: string[]): Promise<AssociateFacesResult> {
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
		const errorMessage = error instanceof Error ? error.message : 'Unknown error associating faces';
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
export async function disassociateFaces(userId: string, faceIds: string[]): Promise<DisassociateFacesResult> {
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

		return {
			success: true,
			disassociatedCount,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error disassociating faces';
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
			};
		}

		return {
			matched: false,
			userId: null,
			similarity: null,
			searchedFaceConfidence: searchedFace?.FaceDetail?.Confidence ?? null,
			message: 'No matching user found above similarity threshold',
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error searching faces';
		return {
			matched: false,
			userId: null,
			similarity: null,
			searchedFaceConfidence: null,
			message: errorMessage,
		};
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
		const errorMessage = error instanceof Error ? error.message : 'Unknown error deleting faces';
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
 *
 * @param externalImageId - The external image ID (employee ID) to search for
 * @returns Promise resolving to the list of face IDs
 */
export async function listFacesByExternalId(externalImageId: string): Promise<ListFacesByExternalIdResult> {
	try {
		const client = getClient();
		const collectionId = getCollectionId();

		const command = new ListFacesCommand({
			CollectionId: collectionId,
		});

		const response = await client.send(command);

		// Filter faces by external image ID
		const faceIds =
			response.Faces?.filter((face) => face.ExternalImageId === externalImageId).map((face) => face.FaceId ?? '') ?? [];

		return {
			success: true,
			faceIds: faceIds.filter((id) => id !== ''),
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

