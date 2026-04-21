export type AttendanceType = 'CHECK_IN' | 'CHECK_OUT' | 'CHECK_OUT_AUTHORIZED' | 'WORK_OFFSITE';

export interface ListQueryParams {
	limit?: number;
	offset?: number;
	search?: string;
	[key: string]: unknown;
}

export interface AttendanceQueryParams extends ListQueryParams {
	type?: AttendanceType;
	deviceId?: string;
	employeeId?: string;
	fromDate?: Date;
	toDate?: Date;
}

export interface FaceEnrollmentEmployeeListQueryParams {
	organizationId?: string | null;
	locationId?: string | null;
	limit?: number;
	[key: string]: unknown;
}

export function queryKeyConstructor<
	TKey extends string | readonly string[],
	TParams extends Record<string, unknown> | undefined = undefined,
>(qk: TKey, params?: TParams): readonly unknown[] {
	const baseKey = typeof qk === 'string' ? [qk] : [...qk];

	if (params === undefined) {
		return baseKey as readonly unknown[];
	}

	return [...baseKey, params] as const;
}

export const queryKeys = {
	locations: {
		all: ['locations'] as const,
		list: (params?: ListQueryParams) =>
			queryKeyConstructor(['locations', 'list'] as const, params),
		detail: (id: string) => ['locations', 'detail', id] as const,
	},
	devices: {
		all: ['devices'] as const,
		list: (params?: ListQueryParams) =>
			queryKeyConstructor(['devices', 'list'] as const, params),
		detail: (id: string) => ['devices', 'detail', id] as const,
	},
	attendance: {
		all: ['attendance'] as const,
		list: (params?: AttendanceQueryParams) =>
			queryKeyConstructor(['attendance', 'list'] as const, params),
		forDevice: (deviceId: string) => ['attendance', 'device', deviceId] as const,
	},
	deviceSettings: {
		all: ['deviceSettings'] as const,
		current: ['deviceSettings', 'current'] as const,
		detail: (deviceId: string) => ['deviceSettings', 'detail', deviceId] as const,
	},
	faceEnrollment: {
		all: ['faceEnrollment'] as const,
		employees: (params?: FaceEnrollmentEmployeeListQueryParams) =>
			queryKeyConstructor(['faceEnrollment', 'employees'] as const, params),
		flow: () => ['faceEnrollment', 'flow'] as const,
	},
};
