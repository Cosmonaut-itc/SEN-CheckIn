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
 * Result of deleting a Rekognition user and associated faces.
 */
export interface RekognitionDeleteResult {
	/** Whether the deletion completed successfully */
	success: boolean;
	/** Message providing additional context or error details */
	message: string;
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
export type AttendanceType = 'CHECK_IN' | 'CHECK_OUT' | 'CHECK_OUT_AUTHORIZED';

/**
 * Attendance record entity.
 */
export interface AttendanceRecord {
	/** Unique identifier (UUID) */
	id: string;
	/** Employee ID reference */
	employeeId: string;
	/** Employee full name */
	employeeName: string;
	/** Device ID reference */
	deviceId: string;
	/** Device location ID (optional for join responses) */
	deviceLocationId?: string | null;
	/** Device location name (optional for join responses) */
	deviceLocationName?: string | null;
	/** Timestamp of the attendance event */
	timestamp: Date;
	/** Type of attendance (check-in, check-out, or authorized exit) */
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
	/** Latitude coordinate (WGS84). */
	latitude: number | null;
	/** Longitude coordinate (WGS84). */
	longitude: number | null;
	/** Owning organization ID reference */
	organizationId: string | null;
	/** Record creation timestamp */
	createdAt: Date;
	/** Record last update timestamp */
	updatedAt: Date;
}

// ============================================================================
// Employee Insights + Audit Types
// ============================================================================

/**
 * Employee vacation balance snapshot for a specific service year.
 */
export interface EmployeeVacationBalance {
	/** Employee identifier */
	employeeId: string;
	/** Employee hire date */
	hireDate: Date;
	/** Date key used as the balance cutoff */
	asOfDateKey: string;
	/** Current service year number */
	serviceYearNumber: number;
	/** Service year start date key */
	serviceYearStartDateKey: string | null;
	/** Service year end date key */
	serviceYearEndDateKey: string | null;
	/** Vacation days entitled for the service year */
	entitledDays: number;
	/** Vacation days already used (approved) */
	usedDays: number;
	/** Vacation days pending approval */
	pendingDays: number;
	/** Available vacation days */
	availableDays: number;
}

/**
 * Summary of a vacation request for employee insights.
 */
export interface EmployeeVacationRequestSummary {
	/** Vacation request identifier */
	id: string;
	/** Request status */
	status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
	/** Range start date key */
	startDateKey: string;
	/** Range end date key */
	endDateKey: string;
	/** Notes provided at request time */
	requestedNotes: string | null;
	/** Notes provided during decision */
	decisionNotes: string | null;
	/** Total days in the request range */
	totalDays: number;
	/** Total vacation days counted */
	vacationDays: number;
	/** Request creation timestamp */
	createdAt: Date;
}

/**
 * Summary of a schedule exception for employee insights.
 */
export interface EmployeeScheduleExceptionSummary {
	/** Exception identifier */
	id: string;
	/** Local date key for the exception */
	dateKey: string;
	/** Exception type */
	exceptionType: 'DAY_OFF' | 'MODIFIED' | 'EXTRA_DAY';
	/** Exception reason */
	reason: string | null;
	/** Start time override */
	startTime: string | null;
	/** End time override */
	endTime: string | null;
}

/**
 * Absence summary for an employee over a date range.
 */
export interface EmployeeAbsenceSummary {
	/** Absent working day date keys */
	absentDateKeys: string[];
	/** Total absence count */
	totalAbsentDays: number;
	/** Range start date key */
	rangeStartDateKey: string;
	/** Range end date key */
	rangeEndDateKey: string;
}

/**
 * Payroll run summary for an employee.
 */
export interface EmployeePayrollRunSummary {
	/** Payroll run identifier */
	payrollRunId: string;
	/** Payroll period start timestamp */
	periodStart: Date;
	/** Payroll period end timestamp */
	periodEnd: Date;
	/** Payment frequency for the run */
	paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
	/** Payroll run status */
	status: 'DRAFT' | 'PROCESSED';
	/** Employee total pay in the run */
	totalPay: number;
	/** Run creation timestamp */
	createdAt: Date;
	/** Run processed timestamp */
	processedAt: Date | null;
}

/**
 * Employee insights payload for the detail dialog.
 */
export interface EmployeeInsights {
	/** Employee identifier */
	employeeId: string;
	/** Organization identifier */
	organizationId: string | null;
	/** Location time zone used for date calculations */
	timeZone: string;
	/** Date key representing the data cutoff */
	asOfDateKey: string;
	/** Vacation details */
	vacation: {
		/** Vacation balance breakdown */
		balance: EmployeeVacationBalance | null;
		/** Latest vacation requests */
		requests: EmployeeVacationRequestSummary[];
	};
	/** Attendance absences summary */
	attendance: EmployeeAbsenceSummary;
	/** License/day-off exceptions (historical window) */
	leaves: {
		/** Exception entries */
		items: EmployeeScheduleExceptionSummary[];
		/** Total exceptions count */
		total: number;
		/** Range start date key */
		rangeStartDateKey: string;
		/** Range end date key */
		rangeEndDateKey: string;
	};
	/** Upcoming schedule exceptions */
	exceptions: {
		/** Exception entries */
		items: EmployeeScheduleExceptionSummary[];
		/** Total exceptions count */
		total: number;
		/** Range start date key */
		rangeStartDateKey: string;
		/** Range end date key */
		rangeEndDateKey: string;
	};
	/** Payroll runs */
	payroll: {
		/** Latest payroll runs */
		runs: EmployeePayrollRunSummary[];
		/** Total runs returned */
		total: number;
	};
}

/**
 * Actor types for employee audit events.
 */
export type EmployeeAuditActorType = 'user' | 'apiKey' | 'system' | 'trigger';

/**
 * Employee audit event record.
 */
export interface EmployeeAuditEvent {
	/** Audit event identifier */
	id: string;
	/** Employee identifier */
	employeeId: string;
	/** Organization identifier */
	organizationId: string | null;
	/** Action identifier */
	action: string;
	/** Actor type */
	actorType: EmployeeAuditActorType;
	/** Actor user identifier */
	actorUserId: string | null;
	/** Actor name (if available) */
	actorName?: string | null;
	/** Actor email (if available) */
	actorEmail?: string | null;
	/** Snapshot before the change */
	before?: Record<string, unknown> | null;
	/** Snapshot after the change */
	after?: Record<string, unknown> | null;
	/** Changed field names */
	changedFields?: string[] | null;
	/** Event creation timestamp */
	createdAt: Date;
}
