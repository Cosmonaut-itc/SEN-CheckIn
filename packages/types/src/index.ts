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

export {
	buildDefaultLegalTemplateHtml,
	type DefaultLegalTemplateKind,
} from './legal-template-defaults';

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
	/** NSS (Número de Seguridad Social) */
	nss: string | null;
	/** RFC (Registro Federal de Contribuyentes) */
	rfc: string | null;
	/** Email address (optional) */
	email: string | null;
	/** Employment type for PTU eligibility */
	employmentType?: 'PERMANENT' | 'EVENTUAL';
	/** Trust employee flag */
	isTrustEmployee?: boolean;
	/** Director/admin/general manager flag */
	isDirectorAdminGeneralManager?: boolean;
	/** Domestic worker flag */
	isDomesticWorker?: boolean;
	/** Platform worker flag */
	isPlatformWorker?: boolean;
	/** Annual platform hours */
	platformHoursYear?: number;
	/** PTU eligibility override */
	ptuEligibilityOverride?: 'DEFAULT' | 'INCLUDE' | 'EXCLUDE';
	/** Aguinaldo days override */
	aguinaldoDaysOverride?: number | null;
	/** Location ID reference (optional) */
	locationId: string | null;
	/** Rekognition user ID for face recognition (optional) */
	rekognitionUserId: string | null;
	/** Total number of disciplinary measures for the employee (optional list payload field). */
	disciplinaryMeasuresCount?: number;
	/** Total number of open (non-closed) disciplinary measures (optional list payload field). */
	disciplinaryOpenMeasuresCount?: number;
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
	/** Vacation days accrued to date for the service year */
	accruedDays: number;
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

// ============================================================================
// Incapacity Types
// ============================================================================

/**
 * IMSS incapacity type values.
 */
export type IncapacityType = 'EG' | 'RT' | 'MAT' | 'LIC140BIS';

/**
 * SAT incapacity codes (CFDI nómina).
 */
export type SatTipoIncapacidad = '01' | '02' | '03' | '04';

/**
 * IMSS incapacity issuance source.
 */
export type IncapacityIssuedBy = 'IMSS' | 'recognized_by_IMSS';

/**
 * Incapacity sequence values.
 */
export type IncapacitySequence = 'inicial' | 'subsecuente' | 'recaida';

/**
 * Incapacity record status.
 */
export type IncapacityStatus = 'ACTIVE' | 'CANCELLED';

/**
 * IMSS incapacity document metadata.
 */
export interface EmployeeIncapacityDocument {
	/** Document identifier */
	id: string;
	/** Parent incapacity identifier */
	incapacityId: string;
	/** Bucket name where the document is stored */
	bucket: string;
	/** Object key in the bucket */
	objectKey: string;
	/** Original file name */
	fileName: string;
	/** MIME content type */
	contentType: string;
	/** File size in bytes */
	sizeBytes: number;
	/** SHA-256 hash (hex) */
	sha256: string;
	/** Upload timestamp */
	uploadedAt: Date;
	/** Record creation timestamp */
	createdAt: Date;
}

/**
 * IMSS incapacity record.
 */
export interface EmployeeIncapacity {
	/** Incapacity identifier */
	id: string;
	/** Organization identifier */
	organizationId: string;
	/** Employee identifier */
	employeeId: string;
	/** IMSS case identifier */
	caseId: string;
	/** IMSS incapacity type */
	type: IncapacityType;
	/** SAT incapacity code */
	satTipoIncapacidad: SatTipoIncapacidad;
	/** Start date key */
	startDateKey: string;
	/** End date key */
	endDateKey: string;
	/** Authorized days */
	daysAuthorized: number;
	/** Certificate folio */
	certificateFolio: string | null;
	/** Issuance origin */
	issuedBy: IncapacityIssuedBy;
	/** Sequence for the case */
	sequence: IncapacitySequence;
	/** Percent override (0-1) */
	percentOverride: number | null;
	/** Record status */
	status: IncapacityStatus;
	/** Record creation timestamp */
	createdAt: Date;
	/** Record update timestamp */
	updatedAt: Date;
}

// ============================================================================
// Employee Document Workflow Types
// ============================================================================

/**
 * Document requirement keys for employee onboarding workflow.
 */
export type EmployeeDocumentRequirementKey =
	| 'IDENTIFICATION'
	| 'TAX_CONSTANCY'
	| 'PROOF_OF_ADDRESS'
	| 'SOCIAL_SECURITY_EVIDENCE'
	| 'EMPLOYMENT_PROFILE'
	| 'SIGNED_CONTRACT'
	| 'SIGNED_NDA';

/**
 * Review status for uploaded employee documents.
 */
export type EmployeeDocumentReviewStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

/**
 * Source that produced an employee document version.
 */
export type EmployeeDocumentSource = 'UPLOAD' | 'PHYSICAL_SIGNED_UPLOAD' | 'DIGITAL_SIGNATURE';

/**
 * Supported identification document subtypes.
 */
export type IdentificationSubtype = 'INE' | 'PASSPORT' | 'OTHER';

/**
 * Supported employment profile document subtypes.
 */
export type EmploymentProfileSubtype = 'CURRICULUM' | 'JOB_APPLICATION';

/**
 * Legal document kind for organization templates and employee generations.
 */
export type LegalDocumentKind =
	| 'CONTRACT'
	| 'NDA'
	| 'ACTA_ADMINISTRATIVA'
	| 'CONSTANCIA_NEGATIVA_FIRMA';

/**
 * Status of legal template versions.
 */
export type LegalTemplateStatus = 'DRAFT' | 'PUBLISHED';

/**
 * Activation stage for organization document requirements.
 */
export type EmployeeDocumentActivationStage = 'BASE' | 'LEGAL_AFTER_GATE';

/**
 * Lifecycle status for a disciplinary measure.
 */
export type DisciplinaryMeasureStatus = 'DRAFT' | 'GENERATED' | 'CLOSED';

/**
 * Final outcome selected for a disciplinary measure.
 */
export type DisciplinaryOutcome =
	| 'no_action'
	| 'warning'
	| 'suspension'
	| 'termination_process';

/**
 * Signature status for disciplinary measures.
 */
export type DisciplinarySignatureStatus = 'signed_physical' | 'refused_to_sign';

/**
 * Kind of disciplinary legal document.
 */
export type DisciplinaryDocumentKind =
	| 'ACTA_ADMINISTRATIVA'
	| 'CONSTANCIA_NEGATIVA_FIRMA';

/**
 * Status for employee termination draft records generated from disciplinary workflows.
 */
export type TerminationDraftStatus = 'ACTIVE' | 'CANCELLED' | 'CONSUMED';

/**
 * Versioned disciplinary document artifact (generated or uploaded).
 */
export interface DisciplinaryMeasureDocument {
	/** Document version identifier */
	id: string;
	/** Parent disciplinary measure identifier */
	measureId: string;
	/** Document kind */
	kind: DisciplinaryDocumentKind;
	/** Version number per measure+kind */
	versionNumber: number;
	/** Marks the latest version for the same kind */
	isCurrent: boolean;
	/** Optional legal generation identifier */
	generationId: string | null;
	/** Storage bucket */
	bucket: string;
	/** Storage object key */
	objectKey: string;
	/** Original file name */
	fileName: string;
	/** MIME content type */
	contentType: string;
	/** File size in bytes */
	sizeBytes: number;
	/** SHA-256 checksum */
	sha256: string;
	/** Optional signed date key (YYYY-MM-DD) */
	signedAtDateKey: string | null;
	/** Uploader user identifier */
	uploadedByUserId: string | null;
	/** Upload timestamp */
	uploadedAt: Date;
	/** Optional metadata */
	metadata: Record<string, unknown> | null;
	/** Record creation timestamp */
	createdAt: Date;
	/** Record update timestamp */
	updatedAt: Date;
}

/**
 * Evidence attachment for a disciplinary measure.
 */
export interface DisciplinaryMeasureAttachment {
	/** Attachment identifier */
	id: string;
	/** Parent disciplinary measure identifier */
	measureId: string;
	/** Storage bucket */
	bucket: string;
	/** Storage object key */
	objectKey: string;
	/** Original file name */
	fileName: string;
	/** MIME content type */
	contentType: string;
	/** File size in bytes */
	sizeBytes: number;
	/** SHA-256 checksum */
	sha256: string;
	/** Uploader user identifier */
	uploadedByUserId: string | null;
	/** Upload timestamp */
	uploadedAt: Date;
	/** Optional metadata */
	metadata: Record<string, unknown> | null;
	/** Record creation timestamp */
	createdAt: Date;
	/** Record update timestamp */
	updatedAt: Date;
}

/**
 * Draft termination payload created from a disciplinary escalation.
 */
export interface TerminationDraft {
	/** Draft identifier */
	id: string;
	/** Organization identifier */
	organizationId: string;
	/** Employee identifier */
	employeeId: string;
	/** Source disciplinary measure identifier */
	measureId: string;
	/** Draft lifecycle status */
	status: TerminationDraftStatus;
	/** Draft payload snapshot */
	payload: Record<string, unknown>;
	/** User that created the draft */
	createdByUserId: string | null;
	/** User that last updated the draft */
	updatedByUserId: string | null;
	/** Timestamp when draft was consumed */
	consumedAt: Date | null;
	/** Timestamp when draft was cancelled */
	cancelledAt: Date | null;
	/** Record creation timestamp */
	createdAt: Date;
	/** Record update timestamp */
	updatedAt: Date;
}

/**
 * Disciplinary measure aggregate entity with latest documents and evidence.
 */
export interface DisciplinaryMeasure {
	/** Measure identifier */
	id: string;
	/** Organization identifier */
	organizationId: string;
	/** Employee identifier */
	employeeId: string;
	/** Organization-level sequential folio */
	folio: number;
	/** Incident date key (YYYY-MM-DD) */
	incidentDateKey: string;
	/** Narrative of the incident */
	reason: string;
	/** Optional policy/article reference */
	policyReference: string | null;
	/** Optional internal notes */
	notes: string | null;
	/** Current status */
	status: DisciplinaryMeasureStatus;
	/** Selected outcome */
	outcome: DisciplinaryOutcome;
	/** Suspension start date key (YYYY-MM-DD) */
	suspensionStartDateKey: string | null;
	/** Suspension end date key (YYYY-MM-DD) */
	suspensionEndDateKey: string | null;
	/** Signature status */
	signatureStatus: DisciplinarySignatureStatus | null;
	/** Creator user identifier */
	createdByUserId: string | null;
	/** Last updater user identifier */
	updatedByUserId: string | null;
	/** Closer user identifier */
	closedByUserId: string | null;
	/** Close timestamp */
	closedAt: Date | null;
	/** Record creation timestamp */
	createdAt: Date;
	/** Record update timestamp */
	updatedAt: Date;
	/** Employee display name (joined payload) */
	employeeName?: string;
	/** Employee code (joined payload) */
	employeeCode?: string;
	/** Document history for the measure */
	documents: DisciplinaryMeasureDocument[];
	/** Evidence attachments */
	attachments: DisciplinaryMeasureAttachment[];
	/** Optional active or historical termination draft */
	terminationDraft: TerminationDraft | null;
}

/**
 * KPI summary for disciplinary operations dashboard.
 */
export interface DisciplinaryKpis {
	/** Distinct employees that have at least one measure */
	employeesWithMeasures: number;
	/** Measures created in the selected period */
	measuresInPeriod: number;
	/** Currently active suspensions */
	activeSuspensions: number;
	/** Measures escalated to termination process */
	terminationEscalations: number;
	/** Open measures (non-closed) */
	openMeasures: number;
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

// ============================================================================
// PTU / Aguinaldo Types
// ============================================================================

/**
 * Shared warning structure for extra payment calculations.
 */
export interface ExtraPaymentWarning {
	/** Warning type identifier */
	type: string;
	/** Human-readable warning message */
	message: string;
	/** Severity level */
	severity: 'warning' | 'error';
}

/**
 * Tax breakdown for PTU/Aguinaldo calculations.
 */
export interface ExtraPaymentTaxBreakdown {
	/** Exempt portion of the payment */
	exemptAmount: number;
	/** Taxable portion of the payment */
	taxableAmount: number;
	/** ISR withheld for the payment */
	withheldIsr: number;
	/** Net amount after withholding */
	netAmount: number;
	/** Method used for withholding */
	withholdingMethod: 'RLISR_174' | 'STANDARD';
}

/**
 * PTU run status values.
 */
export type PtuRunStatus = 'DRAFT' | 'PROCESSED' | 'CANCELLED';

/**
 * Aguinaldo run status values.
 */
export type AguinaldoRunStatus = 'DRAFT' | 'PROCESSED' | 'CANCELLED';

/**
 * PTU run entity.
 */
export interface PtuRun {
	/** Run identifier */
	id: string;
	/** Organization identifier */
	organizationId: string;
	/** Fiscal year */
	fiscalYear: number;
	/** Payment date */
	paymentDate: Date;
	/** Taxable income (renta gravable) */
	taxableIncome: number;
	/** PTU percentage */
	ptuPercentage: number;
	/** Include inactive employees */
	includeInactive: boolean;
	/** Run status */
	status: PtuRunStatus;
	/** Total net amount */
	totalAmount: number;
	/** Employee count */
	employeeCount: number;
	/** Optional tax summary */
	taxSummary?: Record<string, unknown> | null;
	/** Optional settings snapshot */
	settingsSnapshot?: Record<string, unknown> | null;
	/** Processed timestamp */
	processedAt: Date | null;
	/** Cancelled timestamp */
	cancelledAt: Date | null;
	/** Cancel reason */
	cancelReason: string | null;
	/** Run creation timestamp */
	createdAt: Date;
	/** Run update timestamp */
	updatedAt: Date;
}

/**
 * PTU run employee line item.
 */
export interface PtuRunEmployee {
	/** Line identifier */
	id: string;
	/** PTU run identifier */
	ptuRunId: string;
	/** Employee identifier */
	employeeId: string;
	/** Eligibility flag */
	isEligible: boolean;
	/** Eligibility reasons */
	eligibilityReasons: string[];
	/** Days counted for PTU */
	daysCounted: number;
	/** Daily quota for PTU */
	dailyQuota: number;
	/** Annual salary base */
	annualSalaryBase: number;
	/** PTU by days half */
	ptuByDays: number;
	/** PTU by salary half */
	ptuBySalary: number;
	/** PTU before caps */
	ptuPreCap: number;
	/** Cap based on 3 months */
	capThreeMonths: number;
	/** Cap based on 3-year average */
	capAvgThreeYears: number;
	/** Final cap applied */
	capFinal: number;
	/** Final PTU amount */
	ptuFinal: number;
	/** Exempt amount */
	exemptAmount: number;
	/** Taxable amount */
	taxableAmount: number;
	/** ISR withheld */
	withheldIsr: number;
	/** Net amount */
	netAmount: number;
	/** Warnings */
	warnings: ExtraPaymentWarning[];
	/** Line creation timestamp */
	createdAt: Date;
	/** Line update timestamp */
	updatedAt: Date;
}

/**
 * Aguinaldo run entity.
 */
export interface AguinaldoRun {
	/** Run identifier */
	id: string;
	/** Organization identifier */
	organizationId: string;
	/** Calendar year */
	calendarYear: number;
	/** Payment date */
	paymentDate: Date;
	/** Include inactive employees */
	includeInactive: boolean;
	/** Run status */
	status: AguinaldoRunStatus;
	/** Total net amount */
	totalAmount: number;
	/** Employee count */
	employeeCount: number;
	/** Optional tax summary */
	taxSummary?: Record<string, unknown> | null;
	/** Optional settings snapshot */
	settingsSnapshot?: Record<string, unknown> | null;
	/** Processed timestamp */
	processedAt: Date | null;
	/** Cancelled timestamp */
	cancelledAt: Date | null;
	/** Cancel reason */
	cancelReason: string | null;
	/** Run creation timestamp */
	createdAt: Date;
	/** Run update timestamp */
	updatedAt: Date;
}

/**
 * Aguinaldo run employee line item.
 */
export interface AguinaldoRunEmployee {
	/** Line identifier */
	id: string;
	/** Aguinaldo run identifier */
	aguinaldoRunId: string;
	/** Employee identifier */
	employeeId: string;
	/** Eligibility flag */
	isEligible: boolean;
	/** Eligibility reasons */
	eligibilityReasons: string[];
	/** Days counted */
	daysCounted: number;
	/** Daily salary base */
	dailySalaryBase: number;
	/** Aguinaldo policy days */
	aguinaldoDaysPolicy: number;
	/** Days in year */
	yearDays: number;
	/** Gross amount */
	grossAmount: number;
	/** Exempt amount */
	exemptAmount: number;
	/** Taxable amount */
	taxableAmount: number;
	/** ISR withheld */
	withheldIsr: number;
	/** Net amount */
	netAmount: number;
	/** Warnings */
	warnings: ExtraPaymentWarning[];
	/** Line creation timestamp */
	createdAt: Date;
	/** Line update timestamp */
	updatedAt: Date;
}

/**
 * PTU calculation preview payload.
 */
export interface PtuCalculationResult {
	/** Run summary */
	run: PtuRun;
	/** Employee lines */
	employees: PtuRunEmployee[];
	/** Calculation warnings */
	warnings: ExtraPaymentWarning[];
}

/**
 * Aguinaldo calculation preview payload.
 */
export interface AguinaldoCalculationResult {
	/** Run summary */
	run: AguinaldoRun;
	/** Employee lines */
	employees: AguinaldoRunEmployee[];
	/** Calculation warnings */
	warnings: ExtraPaymentWarning[];
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

// ============================================================================
// Employee Termination (Finiquito) Types
// ============================================================================

/**
 * Termination reason codes aligned with LFT guidance.
 */
export type TerminationReason =
	| 'voluntary_resignation'
	| 'justified_rescission'
	| 'unjustified_dismissal'
	| 'end_of_contract'
	| 'mutual_agreement'
	| 'death';

/**
 * Employment contract types for indemnization rules.
 */
export type EmploymentContractType = 'indefinite' | 'fixed_term' | 'specific_work';

/**
 * Input payload for termination preview and confirmation.
 */
export interface EmployeeTerminationPreviewInput {
	/** Termination date key (YYYY-MM-DD). */
	terminationDateKey: string;
	/** Last day worked date key (YYYY-MM-DD). Defaults to terminationDateKey. */
	lastDayWorkedDateKey?: string;
	/** Termination reason. */
	terminationReason: TerminationReason;
	/** Employment contract type. */
	contractType: EmploymentContractType;
	/** Unpaid days to include in salary due. */
	unpaidDays: number;
	/** Additional pending amounts to include in finiquito. */
	otherDue: number;
	/** Optional vacation balance override (days, supports decimals). */
	vacationBalanceDays?: number | null;
	/** Optional daily salary override for indemnizations (LFT Art. 89). */
	dailySalaryIndemnizacion?: number | null;
	/** Optional termination notes for audit/logging. */
	terminationNotes?: string | null;
}

/**
 * Core finiquito breakdown.
 */
export interface EmployeeFiniquitoBreakdown {
	/** Salary due for unpaid days. */
	salaryDue: number;
	/** Proportional aguinaldo. */
	aguinaldoProp: number;
	/** Vacation pay for unused days. */
	vacationPay: number;
	/** Vacation premium amount. */
	vacationPremium: number;
	/** Other pending dues. */
	otherDue: number;
	/** Finiquito total gross amount. */
	totalGross: number;
}

/**
 * Liquidation/indemnization breakdown (when applicable).
 */
export interface EmployeeLiquidacionBreakdown {
	/** 3-month indemnization (Art. 48). */
	indemnizacion3Meses: number;
	/** 20 days per year indemnization (Art. 50). */
	indemnizacion20Dias: number;
	/** Prima de antigüedad (Art. 162). */
	primaAntiguedad: number;
	/** Liquidation total gross amount. */
	totalGross: number;
}

/**
 * Auditable termination settlement calculation payload.
 */
export interface EmployeeTerminationSettlement {
	/** Employee identifier. */
	employeeId: string;
	/** Termination metadata. */
	termination: {
		terminationDateKey: string;
		lastDayWorkedDateKey: string;
		terminationReason: TerminationReason;
		contractType: EmploymentContractType;
	};
	/** Inputs used for the calculation (audit trail). */
	inputsUsed: {
		dailySalaryBase: number;
		dailySalaryIndemnizacion: number;
		minimumWageDaily: number;
		aguinaldoDaysPolicy: number;
		vacationPremiumRatePolicy: number;
		vacationBalanceDays: number;
		unpaidDays: number;
		otherDue: number;
		aguinaldoDaysWorkedInYear: number;
		aguinaldoYearDays: number;
		serviceDays: number;
		serviceYears: number;
		serviceYearsForAntiguedad: number;
		serviceYearsForIndemnizacion: number;
	};
	/** Finiquito and liquidación breakdowns. */
	breakdown: {
		finiquito: EmployeeFiniquitoBreakdown;
		liquidacion: EmployeeLiquidacionBreakdown;
	};
	/** Totalized gross amounts. */
	totals: {
		finiquitoTotalGross: number;
		liquidacionTotalGross: number;
		grossTotal: number;
	};
}
