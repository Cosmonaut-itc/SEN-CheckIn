import { mock } from 'bun:test';

import type {
	AssociateFacesResult,
	CreateUserResult,
	DeleteFacesResult,
	DeleteUserResult,
	DisassociateFacesResult,
	IndexFaceResult,
	ListFacesByExternalIdResult,
	SearchUsersByImageResult,
} from '../services/rekognition.js';

type RekognitionMockState = {
	searchResult: SearchUsersByImageResult;
};

const defaultSearchResult: SearchUsersByImageResult = {
	matched: false,
	userId: null,
	similarity: null,
	searchedFaceConfidence: 99,
	message: 'No matching user found above similarity threshold',
};

const mockState: RekognitionMockState = {
	searchResult: defaultSearchResult,
};

let mocksInitialized = false;

/**
 * Overrides the next Rekognition search result returned by searchUsersByImage.
 *
 * @param result - Search result to return from the mock implementation
 * @returns Nothing
 */
export function setSearchUsersByImageResult(result: SearchUsersByImageResult): void {
	mockState.searchResult = result;
}

/**
 * Installs Rekognition service mocks for contract tests.
 *
 * @returns Nothing
 */
export function setupRekognitionMocks(): void {
	if (mocksInitialized) {
		return;
	}

	mocksInitialized = true;

	mock.module('../services/rekognition.js', () => {
		return {
			createUser: async (employeeId: string): Promise<CreateUserResult> => ({
				success: true,
				userId: employeeId,
				message: 'Mock create user',
			}),
			indexFace: async (): Promise<IndexFaceResult> => ({
				success: true,
				faces: [
					{
						faceId: 'mock-face-id',
						boundingBox: {
							width: 0.5,
							height: 0.5,
							left: 0.25,
							top: 0.25,
						},
						confidence: 99,
					},
				],
				message: 'Mock index face',
			}),
			associateFaces: async (
				_userId: string,
				faceIds: string[],
			): Promise<AssociateFacesResult> => ({
				success: faceIds.length > 0,
				associatedCount: faceIds.length,
				message: faceIds.length > 0 ? undefined : 'No faces to associate',
			}),
			disassociateFaces: async (
				_userId: string,
				faceIds: string[],
			): Promise<DisassociateFacesResult> => ({
				success: faceIds.length > 0,
				disassociatedCount: faceIds.length,
				message: faceIds.length > 0 ? undefined : 'No faces to disassociate',
			}),
			deleteFaces: async (faceIds: string[]): Promise<DeleteFacesResult> => ({
				success: true,
				deletedFaceIds: faceIds,
				message: undefined,
			}),
			deleteUser: async (userId: string): Promise<DeleteUserResult> => ({
				success: true,
				userId,
				message: undefined,
			}),
			listFacesByExternalId: async (): Promise<ListFacesByExternalIdResult> => ({
				success: true,
				faceIds: [],
				message: undefined,
			}),
			searchUsersByImage: async (): Promise<SearchUsersByImageResult> => {
				return mockState.searchResult;
			},
		};
	});
}
