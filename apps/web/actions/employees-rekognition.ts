'use server';

/**
 * Server actions for employee Rekognition face enrollment operations.
 *
 * These actions handle the face enrollment workflow using Amazon Rekognition
 * User Vectors. They are called from client components via useMutation
 * and execute on the server with full access to the API.
 *
 * All actions forward the caller's session cookies to the API
 * for proper authentication.
 *
 * @module actions/employees-rekognition
 */

import { headers } from 'next/headers';
import { createServerApiClient } from '@/lib/server-api';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a Rekognition user creation operation.
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
 * Result of a face enrollment operation.
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
 * Result of a Rekognition user deletion operation.
 */
export interface RekognitionDeleteResult {
	/** Whether the deletion completed successfully */
	success: boolean;
	/** Message providing additional context or error details */
	message: string;
}

/**
 * Generic mutation result for actions.
 */
export interface MutationResult<T = unknown> {
	/** Whether the operation was successful */
	success: boolean;
	/** The data returned from the operation */
	data?: T;
	/** Error message if the operation failed */
	error?: string;
}

// ============================================================================
// Server Actions
// ============================================================================

/**
 * Creates a Rekognition user for an employee.
 * This must be called before enrolling faces for the employee.
 *
 * @param employeeId - The employee UUID to create a Rekognition user for
 * @returns A promise resolving to the user creation result
 *
 * @example
 * ```ts
 * const result = await createRekognitionUser('employee-uuid');
 * if (result.success && result.data?.success) {
 *   console.log('Rekognition user created:', result.data.userId);
 * }
 * ```
 */
export async function createRekognitionUser(
	employeeId: string,
): Promise<MutationResult<UserCreationResult>> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.employees[employeeId]['create-rekognition-user'].post({});

		if (response.error) {
			const errorData = response.error as { value?: { message?: string } };
			return {
				success: false,
				error: errorData?.value?.message ?? 'Failed to create Rekognition user',
			};
		}

		const data = response.data as UserCreationResult;
		return {
			success: data.success,
			data,
			error: data.success ? undefined : data.message,
		};
	} catch (error) {
		console.error('Failed to create Rekognition user:', error);
		return {
			success: false,
			error: 'Failed to create Rekognition user',
		};
	}
}

/**
 * Enrolls a face for an employee by indexing and associating it with their Rekognition user.
 * The employee must have a Rekognition user created first (via createRekognitionUser).
 *
 * @param employeeId - The employee UUID to enroll the face for
 * @param imageBase64 - Base64-encoded image data (with or without data URL prefix)
 * @returns A promise resolving to the face enrollment result
 *
 * @example
 * ```ts
 * const result = await enrollEmployeeFace('employee-uuid', imageBase64String);
 * if (result.success && result.data?.success) {
 *   console.log('Face enrolled:', result.data.faceId);
 * }
 * ```
 */
export async function enrollEmployeeFace(
	employeeId: string,
	imageBase64: string,
): Promise<MutationResult<FaceEnrollmentResult>> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		// Remove data URL prefix if present (the API expects raw base64)
		const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

		const response = await api.employees[employeeId]['enroll-face'].post({
			image: cleanBase64,
		});

		if (response.error) {
			const errorData = response.error as { value?: { message?: string } };
			return {
				success: false,
				error: errorData?.value?.message ?? 'Failed to enroll face',
			};
		}

		const data = response.data as FaceEnrollmentResult;
		return {
			success: data.success,
			data,
			error: data.success ? undefined : data.message,
		};
	} catch (error) {
		console.error('Failed to enroll face:', error);
		return {
			success: false,
			error: 'Failed to enroll face',
		};
	}
}

/**
 * Deletes a Rekognition user and all associated faces for an employee.
 * This cleans up all face recognition data for the employee.
 *
 * @param employeeId - The employee UUID to delete Rekognition data for
 * @returns A promise resolving to the deletion result
 *
 * @example
 * ```ts
 * const result = await deleteRekognitionUser('employee-uuid');
 * if (result.success && result.data?.success) {
 *   console.log('Rekognition data deleted');
 * }
 * ```
 */
export async function deleteRekognitionUser(
	employeeId: string,
): Promise<MutationResult<RekognitionDeleteResult>> {
	try {
		const requestHeaders = await headers();
		const cookieHeader = requestHeaders.get('cookie') ?? '';
		const api = createServerApiClient(cookieHeader);

		const response = await api.employees[employeeId]['rekognition-user'].delete();

		if (response.error) {
			const errorData = response.error as { value?: { message?: string } };
			return {
				success: false,
				error: errorData?.value?.message ?? 'Failed to delete Rekognition user',
			};
		}

		const data = response.data as RekognitionDeleteResult;
		return {
			success: data.success,
			data,
			error: data.success ? undefined : data.message,
		};
	} catch (error) {
		console.error('Failed to delete Rekognition user:', error);
		return {
			success: false,
			error: 'Failed to delete Rekognition user',
		};
	}
}

/**
 * Full enrollment flow: creates a Rekognition user if needed, then enrolls a face.
 * This is a convenience function that handles the two-step enrollment process.
 *
 * @param employeeId - The employee UUID to enroll
 * @param imageBase64 - Base64-encoded image data (with or without data URL prefix)
 * @param hasExistingRekognitionUser - Whether the employee already has a Rekognition user
 * @returns A promise resolving to the face enrollment result
 *
 * @example
 * ```ts
 * const result = await fullEnrollmentFlow('employee-uuid', imageBase64, false);
 * if (result.success) {
 *   console.log('Employee face enrolled successfully');
 * }
 * ```
 */
export async function fullEnrollmentFlow(
	employeeId: string,
	imageBase64: string,
	hasExistingRekognitionUser: boolean,
): Promise<MutationResult<FaceEnrollmentResult>> {
	try {
		// Step 1: Create Rekognition user if not exists
		if (!hasExistingRekognitionUser) {
			const createResult = await createRekognitionUser(employeeId);
			if (!createResult.success || !createResult.data?.success) {
				return {
					success: false,
					error:
						createResult.error ??
						createResult.data?.message ??
						'Failed to create Rekognition user',
				};
			}
		}

		// Step 2: Enroll the face
		const enrollResult = await enrollEmployeeFace(employeeId, imageBase64);
		return enrollResult;
	} catch (error) {
		console.error('Failed in full enrollment flow:', error);
		return {
			success: false,
			error: 'Failed to complete face enrollment',
		};
	}
}
