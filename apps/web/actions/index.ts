/**
 * Server actions module exports.
 *
 * This module re-exports all server actions for convenient importing.
 * MutationResult is exported only once from employees to avoid duplicate exports.
 *
 * @module actions
 */

// Export MutationResult type only from employees
export type { MutationResult } from './employees';

// Export employee actions and types (except MutationResult)
export {
	createEmployee,
	deleteEmployee,
	updateEmployee,
	type CreateEmployeeInput,
	type UpdateEmployeeInput,
} from './employees';

// Export device actions and types (except MutationResult)
export {
	createDevice,
	deleteDevice,
	updateDevice,
	type CreateDeviceInput,
	type UpdateDeviceInput,
} from './devices';

// Export location actions and types (except MutationResult)
export {
	createLocation,
	deleteLocation,
	updateLocation,
	type CreateLocationInput,
	type UpdateLocationInput,
} from './locations';

// Export job position actions and types (except MutationResult)
export {
	createJobPosition,
	deleteJobPosition,
	updateJobPosition,
	type CreateJobPositionInput,
	type UpdateJobPositionInput,
} from './job-positions';

// Export scheduling actions and types (except MutationResult)
export {
	createScheduleTemplate,
	updateScheduleTemplate,
	deleteScheduleTemplate,
	createScheduleException,
	updateScheduleException,
	deleteScheduleException,
	assignTemplateToEmployees,
	type CreateScheduleTemplateInput,
	type UpdateScheduleTemplateInput,
	type CreateScheduleExceptionInput,
	type UpdateScheduleExceptionInput,
	type ScheduleTemplateDayInput,
	type ScheduleExceptionType,
	type ShiftType,
} from './schedules';

// Export API key actions and types (except MutationResult)
export {
	createApiKey,
	deleteApiKey,
	type CreateApiKeyInput,
	type CreateApiKeyResult,
} from './api-keys';

// Export organization actions and types (except MutationResult)
export {
	createOrganization,
	deleteOrganization,
	type CreateOrganizationInput,
} from './organizations';

// Export user actions and types (except MutationResult)
export { banUser, setUserRole, unbanUser, type SetUserRoleInput, type UserRole } from './users';

// Export overtime authorization actions and types (except MutationResult)
export {
	cancelOvertimeAuthorizationAction,
	createOvertimeAuthorizationAction,
	updateOvertimeAuthorizationAction,
	type CancelOvertimeAuthorizationInput,
	type CreateOvertimeAuthorizationInput,
	type UpdateOvertimeAuthorizationInput,
} from './overtime-authorizations';

// Export employee deduction actions and types (except MutationResult)
export {
	createEmployeeDeductionAction,
	updateEmployeeDeductionAction,
	type CreateEmployeeDeductionInput,
	type UpdateEmployeeDeductionInput,
} from './employee-deductions';

// Export employee gratification actions and types (except MutationResult)
export {
	cancelEmployeeGratificationAction,
	createEmployeeGratificationAction,
	updateEmployeeGratificationAction,
	type CreateEmployeeGratificationInput,
	type UpdateEmployeeGratificationInput,
} from './employee-gratifications';

// Export employee Rekognition actions and types (except MutationResult)
export {
	createRekognitionUser,
	deleteRekognitionUser,
	enrollEmployeeFace,
	fullEnrollmentFlow,
	type FaceEnrollmentResult,
	type RekognitionDeleteResult,
	type UserCreationResult,
} from './employees-rekognition';
