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
