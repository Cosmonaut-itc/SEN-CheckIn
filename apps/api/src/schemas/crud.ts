import { z } from 'zod';

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

// ============================================================================
// Location Schemas
// ============================================================================

/**
 * Schema for creating a new location.
 */
export const createLocationSchema = z.object({
	name: z.string().min(1, 'Name is required').max(255),
	code: z.string().min(1, 'Code is required').max(50),
	address: z.string().max(500).optional(),
	organizationId: z.string().uuid('Invalid organization ID').optional(),
});

/**
 * Schema for updating a location.
 */
export const updateLocationSchema = z.object({
	name: z.string().min(1).max(255).optional(),
	code: z.string().min(1).max(50).optional(),
	address: z.string().max(500).nullable().optional(),
});

/**
 * Schema for location query filters.
 */
export const locationQuerySchema = paginationSchema.extend({
	organizationId: z.string().uuid().optional(),
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
	organizationId: z.string().uuid('Invalid organization ID').optional(),
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
	organizationId: z.string().uuid().optional(),
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
	email: z.string().email().max(255).optional(),
	phone: z.string().max(50).optional(),
	jobPositionId: z.string().uuid('Invalid job position ID'),
	department: z.string().max(100).optional(),
	status: employeeStatusEnum.default('ACTIVE'),
	hireDate: z.coerce.date().optional(),
	locationId: z.string().uuid().optional(),
});

/**
 * Schema for updating an employee.
 */
export const updateEmployeeSchema = z.object({
	code: z.string().min(1).max(50).optional(),
	firstName: z.string().min(1).max(100).optional(),
	lastName: z.string().min(1).max(100).optional(),
	email: z.string().email().max(255).nullable().optional(),
	phone: z.string().max(50).nullable().optional(),
	jobPositionId: z.string().uuid().nullable().optional(),
	department: z.string().max(100).nullable().optional(),
	status: employeeStatusEnum.optional(),
	hireDate: z.coerce.date().nullable().optional(),
	locationId: z.string().uuid().nullable().optional(),
});

/**
 * Schema for employee query filters.
 */
export const employeeQuerySchema = paginationSchema.extend({
	locationId: z.string().uuid().optional(),
	jobPositionId: z.string().uuid().optional(),
	status: employeeStatusEnum.optional(),
	search: z.string().optional(),
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
});

// ============================================================================
// Attendance Schemas
// ============================================================================

/**
 * Valid attendance type values.
 */
export const attendanceTypeEnum = z.enum(['CHECK_IN', 'CHECK_OUT']);

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

// Job Position
export type CreateJobPositionInput = z.infer<typeof createJobPositionSchema>;
export type UpdateJobPositionInput = z.infer<typeof updateJobPositionSchema>;
export type JobPositionQuery = z.infer<typeof jobPositionQuerySchema>;

// Employee
export type EmployeeStatus = z.infer<typeof employeeStatusEnum>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type EmployeeQuery = z.infer<typeof employeeQuerySchema>;

// Device
export type DeviceStatus = z.infer<typeof deviceStatusEnum>;
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type DeviceQuery = z.infer<typeof deviceQuerySchema>;

// Attendance
export type AttendanceType = z.infer<typeof attendanceTypeEnum>;
export type CreateAttendanceInput = z.infer<typeof createAttendanceSchema>;
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;
export type EmployeeIdParam = z.infer<typeof employeeIdParamSchema>;
