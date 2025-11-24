/**
 * Shared domain types for SEN Check-in application.
 * This package serves as the single source of truth for types used across backend and mobile.
 *
 * @packageDocumentation
 */

// ============================================================================
// Face Recognition Types
// ============================================================================

/**
 * Bounding box coordinates for a detected face.
 * Values are normalized ratios (0.0 to 1.0) relative to image dimensions.
 */
export interface BoundingBox {
	/** Width of the bounding box as a ratio of overall image width */
	width: number;
	/** Height of the bounding box as a ratio of overall image height */
	height: number;
	/** Left coordinate of the bounding box as a ratio of overall image width */
	left: number;
	/** Top coordinate of the bounding box as a ratio of overall image height */
	top: number;
}

/**
 * Result of indexing a single face into the Rekognition collection.
 */
export interface FaceIndexResult {
	/** Unique identifier assigned by Rekognition for the indexed face */
	faceId: string;
	/** Bounding box coordinates of the detected face in the image */
	boundingBox: BoundingBox;
	/** Confidence score (0-100) of face detection quality */
	confidence: number;
}

/**
 * Result of enrolling a face for an employee.
 * Returned after indexing and associating a face with a user vector.
 */
export interface FaceEnrollmentResult {
	/** Whether the enrollment operation completed successfully */
	success: boolean;
	/** The face ID assigned by Rekognition, or null if enrollment failed */
	faceId: string | null;
	/** The employee ID the face was enrolled for */
	employeeId: string;
	/** Whether the face was successfully associated with the user vector */
	associated: boolean;
	/** Optional message providing additional context or error details */
	message?: string;
}

/**
 * Result of creating a Rekognition user for an employee.
 */
export interface UserCreationResult {
	/** Whether the user creation completed successfully */
	success: boolean;
	/** The user ID in Rekognition (matches employee ID) */
	userId: string | null;
	/** The employee ID the user was created for */
	employeeId: string;
	/** Optional message providing additional context or error details */
	message?: string;
}

/**
 * Matched user information from a face search operation.
 */
export interface UserMatch {
	/** The matched user's ID in Rekognition (corresponds to employee ID) */
	userId: string;
	/** Similarity score (0-100) indicating match confidence */
	similarity: number;
}

/**
 * Basic employee information returned in recognition results.
 * Contains only essential fields for identification purposes.
 */
export interface MatchedEmployee {
	/** Employee's unique identifier */
	id: string;
	/** Employee's first name */
	firstName: string;
	/** Employee's last name */
	lastName: string;
	/** Employee's unique code/badge number */
	code: string;
}

/**
 * Result of a face recognition/identification operation.
 * Returned when searching for a matching user in the collection.
 */
export interface RecognitionResult {
	/** Whether a matching user was found above the similarity threshold */
	matched: boolean;
	/** Match details including userId and similarity, or null if no match */
	match: UserMatch | null;
	/** Matched employee's information, or null if no match found */
	employee: MatchedEmployee | null;
	/** Confidence score of the searched face detection, or null if detection failed */
	searchedFaceConfidence: number | null;
}

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Request body for face enrollment and identification endpoints.
 */
export interface ImageRequestBody {
	/** Base64-encoded image data (without data URL prefix) */
	image: string;
}

// ============================================================================
// Employee Types
// ============================================================================

/**
 * Employee entity with all fields from the database.
 */
export interface Employee {
	/** Unique identifier (UUID) */
	id: string;
	/** Employee code/badge number */
	code: string;
	/** First name */
	firstName: string;
	/** Last name */
	lastName: string;
	/** Email address (optional) */
	email: string | null;
	/** Location ID reference (optional) */
	locationId: string | null;
	/** Rekognition user ID for face recognition (optional) */
	rekognitionUserId: string | null;
	/** Record creation timestamp */
	createdAt: Date;
	/** Record last update timestamp */
	updatedAt: Date;
}

// ============================================================================
// Attendance Types
// ============================================================================

/**
 * Type of attendance record.
 */
export type AttendanceType = 'CHECK_IN' | 'CHECK_OUT';

/**
 * Attendance record entity.
 */
export interface AttendanceRecord {
	/** Unique identifier (UUID) */
	id: string;
	/** Employee ID reference */
	employeeId: string;
	/** Device ID reference */
	deviceId: string;
	/** Timestamp of the attendance event */
	timestamp: Date;
	/** Type of attendance (check-in or check-out) */
	type: AttendanceType;
	/** Additional metadata (e.g., recognition match score, raw payload) */
	metadata: Record<string, unknown> | null;
	/** Record creation timestamp */
	createdAt: Date;
	/** Record last update timestamp */
	updatedAt: Date;
}

// ============================================================================
// Device Types
// ============================================================================

/**
 * Device/kiosk entity.
 */
export interface Device {
	/** Unique identifier (UUID) */
	id: string;
	/** Device code */
	code: string;
	/** Device name (optional) */
	name: string | null;
	/** Location ID reference (optional) */
	locationId: string | null;
	/** Record creation timestamp */
	createdAt: Date;
	/** Record last update timestamp */
	updatedAt: Date;
}

// ============================================================================
// Location Types
// ============================================================================

/**
 * Location/branch entity.
 */
export interface Location {
	/** Unique identifier (UUID) */
	id: string;
	/** Location name */
	name: string;
	/** Location code (unique) */
	code: string;
	/** Physical address (optional) */
	address: string | null;
	/** Client ID reference */
	clientId: string;
	/** Record creation timestamp */
	createdAt: Date;
	/** Record last update timestamp */
	updatedAt: Date;
}

// ============================================================================
// Client Types
// ============================================================================

/**
 * Client entity.
 */
export interface Client {
	/** Unique identifier (UUID) */
	id: string;
	/** Client name */
	name: string;
	/** API key ID reference (optional) */
	apiKeyId: string | null;
	/** Record creation timestamp */
	createdAt: Date;
	/** Record last update timestamp */
	updatedAt: Date;
}
