import { API_BASE_URL, createApiClient, type ApiClient } from '@sen-checkin/api-contract';

export const apiClient: ApiClient = createApiClient(API_BASE_URL);
