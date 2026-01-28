import { z } from 'zod';

import { isValidIanaTimeZone } from '../utils/time-zone.js';

/**
 * Zod validation schemas for CRUD operations.
 * Used for request/response validation in Elysia routes via Standard Schema support.
 * @module schemas/crud
 */

// ============================================================================
// Common Schemas
// ============================================================================

/**
 * Schema for UUID path parameter validation.
 */
export const idParamSchema = z.object({
	id: z.string().uuid('Invalid ID format'),
});

/**
 * Schema for pagination query parameters.
 */
export const paginationSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Shift type enumeration (LFT)
 */
export const shiftTypeEnum = z.enum(['DIURNA', 'NOCTURNA', 'MIXTA']);

/**
 * Payment frequency enumeration.
 */
export const paymentFrequencyEnum = z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']);

/**
 * Geographic zone enumeration (CONASAMI)
 */
export const geographicZoneEnum = z.enum(['GENERAL', 'ZLFN']);

/**
 * Time string validation pattern (HH:MM or HH:MM:SS).
 */
export const timeStringRegex = /^\d{2}:\d{2}(?::\d{2})?$/;

// ============================================================================
// Location Schemas
// ============================================================================

/**
 * Validates that latitude and longitude are provided together or both omitted.
 *
 * @param value - Location payload with optional coordinates
 * @param ctx - Zod refinement context
 * @returns Nothing
 */
function validateCoordinatePair(
	value: { latitude?: number | null; longitude?: number | null },
	ctx: z.RefinementCtx,
): void {
	const hasLatitude = value.latitude !== null && value.latitude !== undefined;
	const hasLongitude = value.longitude !== null && value.longitude !== undefined;

	if (hasLatitude && !hasLongitude) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['longitude'],
			message: 'Longitude is required when latitude is provided',
		});
	}

	if (hasLongitude && !hasLatitude) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['latitude'],
			message: 'Latitude is required when longitude is provided',
		});
	}
}

/**
 * Schema for creating a new location.
 */
export const createLocationSchema = z
	.object({
		name: z.string().min(1, 'Name is required').max(255),
		code: z.string().min(1, 'Code is required').max(50),
		address: z.string().max(500).optional(),
		latitude: z.number().min(-90).max(90).nullable().optional(),
		longitude: z.number().min(-180).max(180).nullable().optional(),
		timeZone: z
			.string()
			.min(1, 'Time zone is required')
			.max(255)
			.refine(isValidIanaTimeZone, { message: 'Invalid IANA time zone' })
			.optional(),
		// BetterAuth organization IDs are text (not UUID)
		organizationId: z.string().optional(),
		geographicZone: geographicZoneEnum.optional(),
	})
	.superRefine(validateCoordinatePair);

/**
 * Schema for updating a location.
 */
export const updateLocationSchema = z
	.object({
		name: z.string().min(1).max(255).optional(),
		code: z.string().min(1).max(50).optional(),
		address: z.string().max(500).nullable().optional(),
		latitude: z.number().min(-90).max(90).nullable().optional(),
		longitude: z.number().min(-180).max(180).nullable().optional(),
		geographicZone: geographicZoneEnum.optional(),
		timeZone: z
			.string()
			.min(1, 'Time zone is required')
			.max(255)
			.refine(isValidIanaTimeZone, { message: 'Invalid IANA time zone' })
			.optional(),
	})
	.superRefine(validateCoordinatePair);

/**
 * Schema for location query filters.
 */
export const locationQuerySchema = paginationSchema.extend({
	organizationId: z.string().optional(),
	search: z.string().optional(),
});

// ============================================================================
// Job Position Schemas
// ============================================================================

/**
 * Schema for creating a new job position.
 */
export const createJobPositionSchema = z.object({
	name: z.string().min(1, 'Name is required').max(255),
	description: z.string().max(1000).optional(),
	organizationId: z.string().optional(),
});

/**
 * Schema for updating a job position.
 */
export const updateJobPositionSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	description: z.string().max(1000).nullable().optional(),
});

/**
 * Schema for job position query filters.
 */
export const jobPositionQuerySchema = paginationSchema.extend({
	organizationId: z.string().optional(),
	search: z.string().optional(),
});

// ============================================================================
// Employee Schemas
// ============================================================================

/**
 * Valid employee status values.
 */
export const employeeStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE']);

/**
 * Schema for creating a new employee.
 * Note: jobPositionId is required for new employees.
 */
export const createEmployeeSchema = z.object({
	code: z.string().min(1, 'Code is required').max(50),
	firstName: z.string().min(1, 'First name is required').max(100),
	lastName: z.string().min(1, 'Last name is required').max(100),
	nss: z.string().max(20).optional(),
	rfc: z.string().max(20).optional(),
	email: z.string().email().max(255).optional(),
	phone: z.string().max(50).optional(),
	jobPositionId: z.string().uuid('Invalid job position ID'),
	department: z.string().max(100).optional(),
	status: employeeStatusEnum.default('ACTIVE'),
	hireDate: z.coerce.date().optional(),
	dailyPay: z.coerce.number().positive('Daily pay must be greater than 0'),
	paymentFrequency: paymentFrequencyEnum,
	sbcDailyOverride: z.coerce.number().positive('SBC must be greater than 0').optional(),
	locationId: z.string().uuid(),
	organizationId: z.string().optional(),
	userId: z.string().optional(),
	shiftType: shiftTypeEnum.default('DIURNA').optional(),
	scheduleTemplateId: z.string().uuid().optional(),
	schedule: z
		.array(
			z.object({
				dayOfWeek: z.number().int().min(0).max(6),
				startTime: z
					.string()
					.regex(timeStringRegex, 'Start time must be HH:MM or HH:MM:SS'),
				endTime: z.string().regex(timeStringRegex, 'End time must be HH:MM or HH:MM:SS'),
				isWorkingDay: z.boolean().optional(),
			}),
		)
		.optional(),
});

/**
 * Schema for updating an employee.
 */
export const updateEmployeeSchema = z.object({
	code: z.never().optional(),
	firstName: z.string().min(1).max(100).optional(),
	lastName: z.string().min(1).max(100).optional(),
	nss: z.string().max(20).nullable().optional(),
	rfc: z.string().max(20).nullable().optional(),
	email: z.string().email().max(255).nullable().optional(),
	phone: z.string().max(50).nullable().optional(),
	jobPositionId: z.string().uuid().nullable().optional(),
	department: z.string().max(100).nullable().optional(),
	status: employeeStatusEnum.optional(),
	hireDate: z.coerce.date().nullable().optional(),
	dailyPay: z.coerce.number().positive().optional(),
	paymentFrequency: paymentFrequencyEnum.optional(),
	sbcDailyOverride: z.coerce.number().positive().nullable().optional(),
	locationId: z.string().uuid().optional(),
	shiftType: shiftTypeEnum.optional(),
	userId: z.string().nullable().optional(),
	scheduleTemplateId: z.string().uuid().nullable().optional(),
	schedule: z
		.array(
			z.object({
				dayOfWeek: z.number().int().min(0).max(6),
				startTime: z
					.string()
					.regex(timeStringRegex, 'Start time must be HH:MM or HH:MM:SS'),
				endTime: z.string().regex(timeStringRegex, 'End time must be HH:MM or HH:MM:SS'),
				isWorkingDay: z.boolean().optional(),
			}),
		)
		.optional(),
});

/**
 * Schema for employee query filters.
 */
export const employeeQuerySchema = paginationSchema.extend({
	locationId: z.string().uuid().optional(),
	jobPositionId: z.string().uuid().optional(),
	status: employeeStatusEnum.optional(),
	search: z.string().optional(),
	// BetterAuth organization IDs are text (not UUID)
	organizationId: z.string().optional(),
});

// ============================================================================
// Device Schemas
// ============================================================================

/**
 * Valid device status values.
 */
export const deviceStatusEnum = z.enum(['ONLINE', 'OFFLINE', 'MAINTENANCE']);

/**
 * Schema for creating a new device.
 */
export const createDeviceSchema = z.object({
	code: z.string().min(1, 'Code is required').max(50),
	name: z.string().max(255).optional(),
	deviceType: z.string().max(50).optional(),
	status: deviceStatusEnum.default('OFFLINE'),
	locationId: z.string().uuid().optional(),
	organizationId: z.string().optional(),
});

/**
 * Schema for updating a device.
 */
export const updateDeviceSchema = z.object({
	code: z.string().min(1).max(50).optional(),
	name: z.string().max(255).nullable().optional(),
	deviceType: z.string().max(50).nullable().optional(),
	status: deviceStatusEnum.optional(),
	locationId: z.string().uuid().nullable().optional(),
});

/**
 * Schema for device query filters.
 */
export const deviceQuerySchema = paginationSchema.extend({
	locationId: z.string().uuid().optional(),
	status: deviceStatusEnum.optional(),
	search: z.string().optional(),
	organizationId: z.string().optional(),
});

/**
 * Schema for registering a device via the mobile client.
 * Uses a stable device code and optional metadata to upsert devices.
 */
export const registerDeviceSchema = z.object({
	code: z.string().min(1, 'Code is required').max(50),
	name: z.string().max(255).optional(),
	deviceType: z.string().max(50).optional(),
	platform: z.string().max(50).optional(),
	organizationId: z.string().optional(),
});

// ============================================================================
// Organization Member Schemas
// ============================================================================

/**
 * Schema for organization member query filters.
 */
export const organizationMembersQuerySchema = paginationSchema.extend({
	limit: z.coerce.number().int().min(1).max(500).default(50),
	organizationId: z.string().optional(),
	search: z.string().optional(),
});

/**
 * Schema for superuser organization list queries.
 */
export const organizationAllQuerySchema = paginationSchema.extend({
	search: z.string().optional(),
	sortBy: z.enum(['name', 'slug', 'createdAt']).optional(),
	sortDir: z.enum(['asc', 'desc']).optional(),
});

// ============================================================================
// Attendance Schemas
// ============================================================================

/**
 * Valid attendance type values.
 */
export const attendanceTypeEnum = z.enum(['CHECK_IN', 'CHECK_OUT', 'CHECK_OUT_AUTHORIZED']);

/**
 * Schema for creating an attendance record.
 */
export const createAttendanceSchema = z.object({
	employeeId: z.string().uuid('Invalid employee ID'),
	deviceId: z.string().uuid('Invalid device ID'),
	timestamp: z.coerce.date().default(() => new Date()),
	type: attendanceTypeEnum,
	metadata: z.record(z.unknown()).optional(),
});

/**
 * Schema for attendance query filters.
 */
export const attendanceQuerySchema = paginationSchema.extend({
	employeeId: z.string().uuid().optional(),
	deviceId: z.string().uuid().optional(),
	type: attendanceTypeEnum.optional(),
	fromDate: z.coerce.date().optional(),
	toDate: z.coerce.date().optional(),
	search: z.string().optional(),
	deviceLocationId: z.string().uuid().optional(),
	// BetterAuth organization IDs are text (not UUID)
	organizationId: z.string().optional(),
});

/**
 * Schema for attendance presence queries (latest event per employee).
 */
export const attendancePresentQuerySchema = z.object({
	fromDate: z.coerce.date(),
	toDate: z.coerce.date(),
	// BetterAuth organization IDs are text (not UUID)
	organizationId: z.string().optional(),
});

/**
 * Schema for employee ID path parameter.
 */
export const employeeIdParamSchema = z.object({
	employeeId: z.string().uuid('Invalid employee ID'),
});

// ============================================================================
// Type Exports (inferred from Zod schemas)
// ============================================================================

// Common
export type IdParam = z.infer<typeof idParamSchema>;
export type PaginationQuery = z.infer<typeof paginationSchema>;

// Location
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type LocationQuery = z.infer<typeof locationQuerySchema>;
export type GeographicZone = z.infer<typeof geographicZoneEnum>;

// Job Position
export type CreateJobPositionInput = z.infer<typeof createJobPositionSchema>;
export type UpdateJobPositionInput = z.infer<typeof updateJobPositionSchema>;
export type JobPositionQuery = z.infer<typeof jobPositionQuerySchema>;
export type PaymentFrequency = z.infer<typeof paymentFrequencyEnum>;

// Employee
export type EmployeeStatus = z.infer<typeof employeeStatusEnum>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type EmployeeQuery = z.infer<typeof employeeQuerySchema>;
export type EmployeeScheduleInput = NonNullable<CreateEmployeeInput['schedule']>[number];
export type ShiftType = z.infer<typeof shiftTypeEnum>;

// Device
export type DeviceStatus = z.infer<typeof deviceStatusEnum>;
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type DeviceQuery = z.infer<typeof deviceQuerySchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

// Organization Members
export type OrganizationMembersQuery = z.infer<typeof organizationMembersQuerySchema>;
export type OrganizationAllQuery = z.infer<typeof organizationAllQuerySchema>;

// Attendance
export type AttendanceType = z.infer<typeof attendanceTypeEnum>;
export type CreateAttendanceInput = z.infer<typeof createAttendanceSchema>;
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;
export type AttendancePresentQuery = z.infer<typeof attendancePresentQuerySchema>;
export type EmployeeIdParam = z.infer<typeof employeeIdParamSchema>;
