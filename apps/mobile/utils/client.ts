import { createApiClient, type ApiClient } from '@sen-checkin/api-contract';

import { API_BASE_URL } from '@/lib/api';

export const apiClient: ApiClient = createApiClient(API_BASE_URL);
