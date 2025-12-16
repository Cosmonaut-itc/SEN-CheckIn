import { z } from 'zod';

/**
 * Zod validation schemas for Amazon Rekognition endpoints.
 * Used for request/response validation in Elysia routes via Standard Schema support.
 * @module schemas/recognition
 */

// ============================================================================
// Request Schemas
// ============================================================================

/**
 * Schema for validating base64-encoded image payload in request body.
 * The image should be raw base64 without data URL prefix (no "data:image/...;base64,").
 */
export const imageBodySchema = z.object({
	/** Base64-encoded image data (without data URL prefix) */
	image: z.string().min(1, 'Image is required'),
});

/**
 * Schema for validating employee ID path parameter.
 * Expects a valid UUID format for employee identification.
 */
export const employeeIdParamsSchema = z.object({
	/** Employee unique identifier (UUID format) */
	id: z.string().uuid('Invalid employee ID format'),
});

// ============================================================================
// Response Schemas
// ============================================================================

/**
 * Schema for bounding box coordinates returned by Rekognition.
 * Values are normalized ratios (0.0 to 1.0) relative to image dimensions.
 */
export const boundingBoxSchema = z.object({
	/** Width of the bounding box as a ratio of overall image width */
	width: z.number(),
	/** Height of the bounding box as a ratio of overall image height */
	height: z.number(),
	/** Left coordinate of the bounding box as a ratio of overall image width */
	left: z.number(),
	/** Top coordinate of the bounding box as a ratio of overall image height */
	top: z.number(),
});

/**
 * Schema for individual face indexing result from Rekognition.
 * Returned when a face is successfully indexed into a collection.
 */
export const faceIndexResultSchema = z.object({
	/** Unique identifier assigned by Rekognition for the indexed face */
	faceId: z.string(),
	/** Bounding box coordinates of the detected face in the image */
	boundingBox: boundingBoxSchema,
	/** Confidence score (0-100) of face detection quality */
	confidence: z.number(),
});

/**
 * Schema for face enrollment response.
 * Returned after enrolling (indexing + associating) a face for an employee.
 */
export const faceEnrollmentResultSchema = z.object({
	/** Whether the enrollment operation completed successfully */
	success: z.boolean(),
	/** The face ID assigned by Rekognition, or null if enrollment failed */
	faceId: z.string().nullable(),
	/** The employee ID the face was enrolled for */
	employeeId: z.string(),
	/** Whether the face was successfully associated with the user vector */
	associated: z.boolean(),
	/** Optional message providing additional context or error details */
	message: z.string().optional(),
});

/**
 * Schema for Rekognition user creation response.
 * Returned when creating a new user in the Rekognition collection.
 */
export const userCreationResultSchema = z.object({
	/** Whether the user creation completed successfully */
	success: z.boolean(),
	/** The user ID in Rekognition (matches employee ID) */
	userId: z.string().nullable(),
	/** The employee ID the user was created for */
	employeeId: z.string(),
	/** Optional message providing additional context or error details */
	message: z.string().optional(),
});

/**
 * Schema for matched user information from face search.
 * Contains the matched user's identifier and similarity score.
 */
export const userMatchSchema = z.object({
	/** The matched user's ID in Rekognition (corresponds to employee ID) */
	userId: z.string(),
	/** Similarity score (0-100) indicating match confidence */
	similarity: z.number(),
});

/**
 * Schema for basic employee information returned in recognition results.
 * Contains only essential fields for identification purposes.
 */
export const matchedEmployeeSchema = z.object({
	/** Employee's unique identifier */
	id: z.string(),
	/** Employee's first name */
	firstName: z.string(),
	/** Employee's last name */
	lastName: z.string(),
	/** Employee's unique code/badge number */
	code: z.string(),
});

/**
 * Schema for face recognition/identification result.
 * Returned when searching for a face match in the collection.
 */
export const recognitionResultSchema = z.object({
	/** Whether a matching user was found above the similarity threshold */
	matched: z.boolean(),
	/** Match details including userId and similarity, or null if no match */
	match: userMatchSchema.nullable(),
	/** Matched employee's information, or null if no match found */
	employee: matchedEmployeeSchema.nullable(),
	/** Confidence score of the searched face detection, or null if detection failed */
	searchedFaceConfidence: z.number().nullable(),
});

// ============================================================================
// Type Exports (inferred from Zod schemas)
// ============================================================================

/** Type for base64 image request body */
export type ImageBody = z.infer<typeof imageBodySchema>;

/** Type for employee ID path parameters */
export type EmployeeIdParams = z.infer<typeof employeeIdParamsSchema>;

/** Type for bounding box coordinates */
export type BoundingBox = z.infer<typeof boundingBoxSchema>;

/** Type for face index result */
export type FaceIndexResult = z.infer<typeof faceIndexResultSchema>;

/** Type for face enrollment result */
export type FaceEnrollmentResult = z.infer<typeof faceEnrollmentResultSchema>;

/** Type for user creation result */
export type UserCreationResult = z.infer<typeof userCreationResultSchema>;

/** Type for user match information */
export type UserMatch = z.infer<typeof userMatchSchema>;

/** Type for matched employee information */
export type MatchedEmployee = z.infer<typeof matchedEmployeeSchema>;

/** Type for recognition/identification result */
export type RecognitionResult = z.infer<typeof recognitionResultSchema>;
