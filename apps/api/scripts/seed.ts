import 'dotenv/config';
import crypto from 'node:crypto';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { reset, seed } from 'drizzle-seed';
import { Pool } from 'pg';

import { addDaysToDateKey } from '../src/utils/date-key.js';
import '../src/utils/disable-pg-native.js';
import { getUtcDateForZonedMidnight, toDateKeyInTimeZone } from '../src/utils/time-zone.js';
import { SHIFT_LIMITS } from '../src/utils/mexico-labor-constants.js';
import {
	buildMandatoryRestDayKeys,
	buildVacationDayBreakdown,
	type VacationScheduleDay,
	type VacationScheduleException,
} from '../src/services/vacations.js';
import { seedSchema } from '../src/db/seed-schema.js';
import * as schema from '../src/db/schema.js';

const {
	aguinaldoRun,
	aguinaldoRunEmployee,
	attendanceRecord,
	device,
	employee,
	employeeSchedule,
	jobPosition,
	location,
	organization,
	ptuHistory,
	ptuRun,
	ptuRunEmployee,
	payrollRun,
	payrollRunEmployee,
	payrollSetting,
	scheduleException,
	scheduleTemplate,
	scheduleTemplateDay,
	vacationRequest,
	vacationRequestDay,
} = schema;

type CliArgs = {
	reset: boolean;
	seed: number;
};

type SeedOrganization = {
	id: string;
	name: string;
	slug: string;
};

type SeedLocation = typeof location.$inferSelect;
type SeedJobPosition = typeof jobPosition.$inferSelect;
type SeedScheduleTemplate = typeof scheduleTemplate.$inferSelect;
type SeedEmployee = typeof employee.$inferSelect;
type SeedDevice = typeof device.$inferSelect;

type ScheduleTemplateDayRow = typeof scheduleTemplateDay.$inferInsert;
type EmployeeScheduleRow = typeof employeeSchedule.$inferInsert;
type ScheduleExceptionRow = typeof scheduleException.$inferInsert;
type AttendanceRecordRow = typeof attendanceRecord.$inferInsert;
type PayrollRunRow = typeof payrollRun.$inferInsert;
type PayrollRunEmployeeRow = typeof payrollRunEmployee.$inferInsert;
type PtuRunRow = typeof ptuRun.$inferInsert;
type PtuRunEmployeeRow = typeof ptuRunEmployee.$inferInsert;
type PtuHistoryRow = typeof ptuHistory.$inferInsert;
type AguinaldoRunRow = typeof aguinaldoRun.$inferInsert;
type AguinaldoRunEmployeeRow = typeof aguinaldoRunEmployee.$inferInsert;
type PayrollSettingRow = typeof payrollSetting.$inferInsert;
type VacationRequestRow = typeof vacationRequest.$inferInsert;
type VacationRequestDayRow = typeof vacationRequestDay.$inferInsert;
type VacationRequestStatus = NonNullable<VacationRequestRow['status']>;
type PtuRunStatus = NonNullable<PtuRunRow['status']>;
type AguinaldoRunStatus = NonNullable<AguinaldoRunRow['status']>;

type VacationSeedTemplate = {
	status: VacationRequestStatus;
	startOffset: number;
	length: number;
	requestedNotes: string;
	decisionNotes: string | null;
	createScheduleExceptions: boolean;
};

/**
 * Parses CLI arguments for the seed script.
 *
 * Supported flags:
 * - `--reset`: truncates domain tables (without touching BetterAuth tables) and then seeds.
 * - `--seed <n>`: sets the deterministic PRNG seed used by drizzle-seed.
 *
 * @param argv - Raw process arguments (typically `process.argv.slice(2)`)
 * @returns Parsed CLI arguments
 * @throws When an argument is unknown or invalid
 */
function parseCliArgs(argv: string[]): CliArgs {
	let resetFlag = false;
	let seedNumber = 1;

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];

		if (arg === '--reset') {
			resetFlag = true;
			continue;
		}

		if (arg === '--seed') {
			const value = argv[i + 1];
			if (!value) {
				throw new Error('Missing value for --seed. Example: --seed 123');
			}

			const parsed = Number(value);
			if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
				throw new Error(
					`Invalid --seed value "${value}". Expected a non-negative integer.`,
				);
			}

			seedNumber = parsed;
			i += 1;
			continue;
		}

		throw new Error(`Unknown argument "${arg}". Supported: --reset, --seed <n>.`);
	}

	return { reset: resetFlag, seed: seedNumber };
}

/**
 * Creates a deterministic UUID v4 for a given seed and label.
 *
 * This is used to keep IDs stable across runs when we insert records manually.
 *
 * @param seedNumber - Seed number
 * @param label - Stable label for the entity (e.g., "org:sen-checkin")
 * @returns Deterministic UUID v4 string
 */
function deterministicUuid(seedNumber: number, label: string): string {
	const hash = crypto.createHash('sha256').update(`${seedNumber}:${label}`).digest();

	// First 16 bytes become the UUID
	const bytes = Buffer.from(hash.subarray(0, 16));

	// RFC 4122 variant + v4 bits
	const byte6 = bytes[6] ?? 0;
	const byte8 = bytes[8] ?? 0;
	bytes[6] = (byte6 & 0x0f) | 0x40;
	bytes[8] = (byte8 & 0x3f) | 0x80;

	const hex = bytes.toString('hex');
	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		hex.slice(12, 16),
		hex.slice(16, 20),
		hex.slice(20, 32),
	].join('-');
}

/**
 * Creates a seeded PRNG function returning values in [0, 1).
 *
 * @param seedNumber - Seed number
 * @returns PRNG callback
 */
function createRng(seedNumber: number): () => number {
	let state = seedNumber >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 2 ** 32;
	};
}

/**
 * Selects a random element from a non-empty array.
 *
 * @param rng - PRNG callback
 * @param values - Candidate values
 * @returns Selected value
 * @throws When the array is empty
 */
function pickOne<T>(rng: () => number, values: readonly T[]): T {
	if (values.length === 0) {
		throw new Error('Cannot pick from an empty array.');
	}
	const index = Math.floor(rng() * values.length);
	return values[index] as T;
}

/**
 * Parses an HH:mm time string into minutes from midnight.
 *
 * @param timeString - Time string in HH:mm or HH:mm:ss format
 * @returns Total minutes from midnight
 * @throws When the time string is invalid
 */
function parseTimeToMinutes(timeString: string): number {
	const [hoursString, minutesString] = timeString.split(':');
	const hours = Number(hoursString);
	const minutes = Number(minutesString ?? '0');

	if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23) {
		throw new Error(`Invalid time string "${timeString}". Expected HH:mm.`);
	}

	return hours * 60 + minutes;
}

/**
 * Formats a number into a 2-decimal numeric string (Postgres numeric).
 *
 * @param value - Numeric value
 * @returns String formatted with 2 decimals
 */
function money(value: number): string {
	return value.toFixed(2);
}

/**
 * Rounds a number to two decimal places for deterministic monetary math.
 *
 * @param value - Numeric value
 * @returns Rounded value with 2 decimals
 */
function roundCurrency(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Reads the Postgres connection string from environment variables.
 *
 * @returns Postgres connection URL sourced from SEN_DB_URL.
 * @throws If SEN_DB_URL is missing.
 */
function getDatabaseUrl(): string {
	const databaseUrl = process.env.SEN_DB_URL;
	if (!databaseUrl) {
		throw new Error(
			'SEN_DB_URL environment variable is required but not set. Please set it in your .env file or environment.',
		);
	}
	return databaseUrl;
}

const pool = new Pool({ connectionString: getDatabaseUrl() });
const db = drizzle(pool, { schema });

/**
 * Checks whether the domain tables already contain data.
 *
 * @returns True if any employees exist
 */
async function isDomainSeeded(): Promise<boolean> {
	const existing = await db.select({ id: employee.id }).from(employee).limit(1);
	return Boolean(existing[0]);
}

/**
 * Ensures the seed organizations exist and returns their current rows.
 *
 * Organizations are managed by BetterAuth, so we do not include them in the
 * domain reset schema. We insert/update them separately.
 *
 * @param seedNumber - Seed number for deterministic IDs
 * @returns Seed organizations (resolved from DB)
 * @throws When organizations cannot be resolved after insert
 */
async function ensureSeedOrganizations(seedNumber: number): Promise<SeedOrganization[]> {
	const desired: SeedOrganization[] = [
		{
			id: deterministicUuid(seedNumber, 'org:sen-checkin'),
			name: 'SEN Check-In',
			slug: 'sen-checkin',
		},
		{
			id: deterministicUuid(seedNumber, 'org:demo-secundaria'),
			name: 'Organización Demo',
			slug: 'org-demo',
		},
	];

	await db
		.insert(organization)
		.values(desired.map((org) => ({ ...org, logo: null, metadata: null })))
		.onConflictDoNothing({ target: organization.slug });

	const slugs = desired.map((o) => o.slug);
	const rows = await db
		.select({ id: organization.id, name: organization.name, slug: organization.slug })
		.from(organization)
		.where(inArray(organization.slug, slugs));

	if (rows.length !== desired.length) {
		throw new Error('Failed to resolve seed organizations after insert.');
	}

	const indexBySlug = new Map(slugs.map((slug, index) => [slug, index]));
	return rows.sort((a, b) => {
		const aIndex = indexBySlug.get(a.slug) ?? 0;
		const bIndex = indexBySlug.get(b.slug) ?? 0;
		return aIndex - bIndex;
	});
}

/**
 * Inserts deterministic domain baseline entities (locations, job positions, templates, settings).
 *
 * @param args - Seed inputs
 * @returns Inserted baseline rows
 */
async function insertDomainBaseline(args: {
	seedNumber: number;
	organizations: SeedOrganization[];
}): Promise<{
	locations: SeedLocation[];
	jobPositions: SeedJobPosition[];
	templates: SeedScheduleTemplate[];
	positionPayDefaults: Map<
		string,
		{ dailyPay: string; paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' }
	>;
}> {
	const { seedNumber, organizations } = args;

	const orgBySlug = new Map(organizations.map((org) => [org.slug, org]));
	const primaryOrg = orgBySlug.get('sen-checkin');
	const secondaryOrg = orgBySlug.get('org-demo');
	if (!primaryOrg || !secondaryOrg) {
		throw new Error('Missing required seed organizations.');
	}

	const locationsToInsert: Array<typeof location.$inferInsert> = [
		{
			id: deterministicUuid(seedNumber, 'location:sen:centro'),
			name: 'Sucursal Centro',
			code: 'SEN-CEN',
			address: 'Av. Reforma 100, Ciudad de México',
			organizationId: primaryOrg.id,
			geographicZone: 'GENERAL',
			timeZone: 'America/Mexico_City',
			clientId: null,
		},
		{
			id: deterministicUuid(seedNumber, 'location:sen:zf-norte'),
			name: 'Sucursal Zona Fronteriza',
			code: 'SEN-ZLFN',
			address: 'Av. Revolución 200, Tijuana',
			organizationId: primaryOrg.id,
			geographicZone: 'ZLFN',
			timeZone: 'America/Tijuana',
			clientId: null,
		},
		{
			id: deterministicUuid(seedNumber, 'location:demo:centro'),
			name: 'Sucursal Centro (Demo)',
			code: 'DEM-CEN',
			address: 'Calle Principal 123, Guadalajara',
			organizationId: secondaryOrg.id,
			geographicZone: 'GENERAL',
			timeZone: 'America/Mexico_City',
			clientId: null,
		},
		{
			id: deterministicUuid(seedNumber, 'location:demo:zf-norte'),
			name: 'Sucursal Zona Fronteriza (Demo)',
			code: 'DEM-ZLFN',
			address: 'Blvd. Independencia 321, Mexicali',
			organizationId: secondaryOrg.id,
			geographicZone: 'ZLFN',
			timeZone: 'America/Tijuana',
			clientId: null,
		},
	];

	await db.insert(location).values(locationsToInsert);
	const locationsInserted = await db.select().from(location);

	const positionSeedConfig = [
		{
			id: deterministicUuid(seedNumber, 'job:sen:operador'),
			name: 'Operador',
			description: 'Personal operativo',
			dailyPay: money(400),
			paymentFrequency: 'WEEKLY' as const,
			organizationId: primaryOrg.id,
		},
		{
			id: deterministicUuid(seedNumber, 'job:sen:supervisor'),
			name: 'Supervisor',
			description: 'Supervisión de turno',
			dailyPay: money(600),
			paymentFrequency: 'BIWEEKLY' as const,
			organizationId: primaryOrg.id,
		},
		{
			id: deterministicUuid(seedNumber, 'job:sen:gerente'),
			name: 'Gerente',
			description: 'Gestión de sucursal',
			dailyPay: money(1000),
			paymentFrequency: 'MONTHLY' as const,
			organizationId: primaryOrg.id,
		},
		{
			id: deterministicUuid(seedNumber, 'job:demo:operador'),
			name: 'Operador',
			description: 'Personal operativo',
			dailyPay: money(380),
			paymentFrequency: 'WEEKLY' as const,
			organizationId: secondaryOrg.id,
		},
		{
			id: deterministicUuid(seedNumber, 'job:demo:supervisor'),
			name: 'Supervisor',
			description: 'Supervisión de turno',
			dailyPay: money(560),
			paymentFrequency: 'BIWEEKLY' as const,
			organizationId: secondaryOrg.id,
		},
		{
			id: deterministicUuid(seedNumber, 'job:demo:gerente'),
			name: 'Gerente',
			description: 'Gestión de sucursal',
			dailyPay: money(900),
			paymentFrequency: 'MONTHLY' as const,
			organizationId: secondaryOrg.id,
		},
	];

	const positionsToInsert: Array<typeof jobPosition.$inferInsert> = positionSeedConfig.map(
		(position) => ({
			id: position.id,
			name: position.name,
			description: position.description,
			organizationId: position.organizationId,
			clientId: null,
		}),
	);

	const positionPayDefaults = new Map(
		positionSeedConfig.map((position) => [
			position.id,
			{
				dailyPay: position.dailyPay,
				paymentFrequency: position.paymentFrequency,
			},
		]),
	);

	await db.insert(jobPosition).values(positionsToInsert);
	const positionsInserted = await db.select().from(jobPosition);

	const templatesToInsert: Array<typeof scheduleTemplate.$inferInsert> = [
		{
			id: deterministicUuid(seedNumber, 'template:sen:diurna'),
			name: 'Turno Diurno',
			description: 'Horario diurno estándar',
			shiftType: 'DIURNA',
			organizationId: primaryOrg.id,
		},
		{
			id: deterministicUuid(seedNumber, 'template:sen:nocturna'),
			name: 'Turno Nocturno',
			description: 'Horario nocturno estándar',
			shiftType: 'NOCTURNA',
			organizationId: primaryOrg.id,
		},
		{
			id: deterministicUuid(seedNumber, 'template:sen:mixta'),
			name: 'Turno Mixto',
			description: 'Horario mixto estándar',
			shiftType: 'MIXTA',
			organizationId: primaryOrg.id,
		},
		{
			id: deterministicUuid(seedNumber, 'template:demo:diurna'),
			name: 'Turno Diurno',
			description: 'Horario diurno estándar',
			shiftType: 'DIURNA',
			organizationId: secondaryOrg.id,
		},
		{
			id: deterministicUuid(seedNumber, 'template:demo:nocturna'),
			name: 'Turno Nocturno',
			description: 'Horario nocturno estándar',
			shiftType: 'NOCTURNA',
			organizationId: secondaryOrg.id,
		},
		{
			id: deterministicUuid(seedNumber, 'template:demo:mixta'),
			name: 'Turno Mixto',
			description: 'Horario mixto estándar',
			shiftType: 'MIXTA',
			organizationId: secondaryOrg.id,
		},
	];

	await db.insert(scheduleTemplate).values(templatesToInsert);
	const templatesInserted = await db.select().from(scheduleTemplate);

	const settingsToInsert: PayrollSettingRow[] = [
		{
			id: deterministicUuid(seedNumber, 'payroll-setting:sen'),
			organizationId: primaryOrg.id,
			weekStartDay: 1,
			timeZone: 'America/Mexico_City',
			overtimeEnforcement: 'WARN',
			additionalMandatoryRestDays: ['2025-10-31'],
			riskWorkRate: '0.06',
			statePayrollTaxRate: '0.02',
			absorbImssEmployeeShare: true,
			absorbIsr: true,
			aguinaldoDays: 15,
			vacationPremiumRate: '0.25',
			enableSeventhDayPay: true,
			ptuEnabled: true,
			aguinaldoEnabled: true,
		},
		{
			id: deterministicUuid(seedNumber, 'payroll-setting:demo'),
			organizationId: secondaryOrg.id,
			weekStartDay: 1,
			timeZone: 'America/Tijuana',
			overtimeEnforcement: 'WARN',
			additionalMandatoryRestDays: ['2025-11-02'],
			riskWorkRate: '0.045',
			statePayrollTaxRate: '0.03',
			absorbImssEmployeeShare: false,
			absorbIsr: false,
			aguinaldoDays: 15,
			vacationPremiumRate: '0.25',
			enableSeventhDayPay: false,
			ptuEnabled: true,
			aguinaldoEnabled: true,
		},
	];
	await db.insert(payrollSetting).values(settingsToInsert);

	return {
		locations: locationsInserted,
		jobPositions: positionsInserted,
		templates: templatesInserted,
		positionPayDefaults,
	};
}

/**
 * Inserts schedule template day rows for each schedule template.
 *
 * @param seedNumber - Seed number for deterministic IDs
 * @param templates - Schedule templates to expand
 */
async function insertScheduleTemplateDays(
	seedNumber: number,
	templates: SeedScheduleTemplate[],
): Promise<void> {
	const dayRows: ScheduleTemplateDayRow[] = [];

	for (const template of templates) {
		const { shiftType } = template;
		const base =
			shiftType === 'NOCTURNA'
				? { start: '22:00', end: '05:00' }
				: shiftType === 'MIXTA'
					? { start: '15:00', end: '22:30' }
					: { start: '09:00', end: '17:00' };

		for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
			const isSunday = dayOfWeek === 0;
			dayRows.push({
				id: deterministicUuid(seedNumber, `template-day:${template.id}:${dayOfWeek}`),
				templateId: template.id,
				dayOfWeek,
				startTime: base.start,
				endTime: base.end,
				isWorkingDay: !isSunday,
			});
		}
	}

	await db.insert(scheduleTemplateDay).values(dayRows);
}

/**
 * Creates unique employee codes with a stable prefix.
 *
 * @param prefix - Code prefix (e.g., "EMP")
 * @param start - Starting index (1-based)
 * @param count - Number of codes to generate
 * @returns Codes list
 */
function buildEmployeeCodes(prefix: string, start: number, count: number): string[] {
	return Array.from({ length: count }, (_, index) => {
		const n = start + index;
		return `${prefix}-${String(n).padStart(4, '0')}`;
	});
}

/**
 * Seeds employees using drizzle-seed, keeping organization/location/jobPosition/template consistent.
 *
 * @param args - Seed inputs
 * @returns Inserted employees (reloaded from DB)
 */
async function seedEmployees(args: {
	seedNumber: number;
	organizations: SeedOrganization[];
	locations: SeedLocation[];
	jobPositions: SeedJobPosition[];
	templates: SeedScheduleTemplate[];
	positionPayDefaults: Map<
		string,
		{ dailyPay: string; paymentFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' }
	>;
}): Promise<SeedEmployee[]> {
	const { seedNumber, organizations, locations, jobPositions, templates, positionPayDefaults } =
		args;

	const orgLocations = new Map<string, string[]>();
	for (const loc of locations) {
		if (!loc.organizationId) {
			continue;
		}
		const current = orgLocations.get(loc.organizationId) ?? [];
		current.push(loc.id);
		orgLocations.set(loc.organizationId, current);
	}

	const orgPositions = new Map<string, string[]>();
	for (const position of jobPositions) {
		if (!position.organizationId) {
			continue;
		}
		const current = orgPositions.get(position.organizationId) ?? [];
		current.push(position.id);
		orgPositions.set(position.organizationId, current);
	}

	const orgTemplates = new Map<string, string[]>();
	for (const template of templates) {
		const current = orgTemplates.get(template.organizationId) ?? [];
		current.push(template.id);
		orgTemplates.set(template.organizationId, current);
	}

	const codesByOrgSlug = new Map<string, string[]>([
		['sen-checkin', buildEmployeeCodes('EMP', 1, 25)],
		['org-demo', buildEmployeeCodes('EMP', 26, 25)],
	]);

	for (const [orgIndex, org] of organizations.entries()) {
		const locationIds = orgLocations.get(org.id) ?? [];
		const positionIds = orgPositions.get(org.id) ?? [];
		const templateIds = orgTemplates.get(org.id) ?? [];
		const codes = codesByOrgSlug.get(org.slug) ?? [];

		if (locationIds.length === 0 || positionIds.length === 0 || templateIds.length === 0) {
			throw new Error(`Missing baseline data for organization "${org.slug}".`);
		}

		if (codes.length === 0) {
			throw new Error(`Missing employee codes for organization "${org.slug}".`);
		}

		await seed(db, { employee }, { seed: seedNumber + orgIndex }).refine((funcs) => ({
			employee: {
				count: codes.length,
				columns: {
					id: funcs.uuid(),
					code: funcs.valuesFromArray({ values: codes, isUnique: true }),
					firstName: funcs.firstName(),
					lastName: funcs.lastName(),
					email: funcs.email(),
					phone: funcs.phoneNumber({ template: '+52 55 #### ####' }),
					department: funcs.valuesFromArray({
						values: ['Operaciones', 'Administración', 'Seguridad'],
					}),
					status: funcs.valuesFromArray({
						values: ['ACTIVE', 'ACTIVE', 'ACTIVE', 'INACTIVE', 'ON_LEAVE'],
					}),
					organizationId: funcs.default({ defaultValue: org.id }),
					locationId: funcs.valuesFromArray({ values: locationIds }),
					jobPositionId: funcs.valuesFromArray({ values: positionIds }),
					scheduleTemplateId: funcs.valuesFromArray({ values: templateIds }),
					shiftType: funcs.valuesFromArray({ values: ['DIURNA', 'NOCTURNA', 'MIXTA'] }),
					hireDate: funcs.date({ minDate: '2023-01-01', maxDate: '2025-12-31' }),
					contractType: funcs.default({ defaultValue: 'indefinite' }),
					terminationDateKey: funcs.default({ defaultValue: null }),
					lastDayWorkedDateKey: funcs.default({ defaultValue: null }),
					terminationReason: funcs.default({ defaultValue: null }),
					terminationNotes: funcs.default({ defaultValue: null }),
					userId: funcs.default({ defaultValue: null }),
					sbcDailyOverride: funcs.default({ defaultValue: null }),
					lastPayrollDate: funcs.default({ defaultValue: null }),
					rekognitionUserId: funcs.default({ defaultValue: null }),
				},
			},
		}));
	}

	// Align employee.shiftType with its assigned template.shiftType for consistent limits.
	const templateShiftMap = new Map(templates.map((t) => [t.id, t.shiftType]));
	const employees = await db.select().from(employee);

	for (const row of employees) {
		const updatePayload: Partial<typeof employee.$inferInsert> = {};
		if (row.scheduleTemplateId) {
			const desired = templateShiftMap.get(row.scheduleTemplateId);
			if (desired && row.shiftType !== desired) {
				updatePayload.shiftType = desired;
			}
		}

		if (row.jobPositionId) {
			const payDefaults = positionPayDefaults.get(row.jobPositionId);
			if (payDefaults) {
				if (row.dailyPay !== payDefaults.dailyPay) {
					updatePayload.dailyPay = payDefaults.dailyPay;
				}
				if (row.paymentFrequency !== payDefaults.paymentFrequency) {
					updatePayload.paymentFrequency = payDefaults.paymentFrequency;
				}
			}
		}

		if (Object.keys(updatePayload).length > 0) {
			await db.update(employee).set(updatePayload).where(eq(employee.id, row.id));
		}
	}

	return db.select().from(employee);
}

/**
 * Inserts employee schedules (7 days per employee) based on assigned schedule templates.
 *
 * @param seedNumber - Seed number
 * @param employees - Seeded employees
 */
async function insertEmployeeSchedules(
	seedNumber: number,
	employees: SeedEmployee[],
): Promise<void> {
	const templateDays = await db.select().from(scheduleTemplateDay);
	const daysByTemplate = new Map<string, Array<typeof scheduleTemplateDay.$inferSelect>>();
	for (const row of templateDays) {
		const current = daysByTemplate.get(row.templateId) ?? [];
		current.push(row);
		daysByTemplate.set(row.templateId, current);
	}

	const scheduleRows: EmployeeScheduleRow[] = [];

	for (const emp of employees) {
		if (!emp.scheduleTemplateId) {
			continue;
		}
		const baseDays = daysByTemplate.get(emp.scheduleTemplateId) ?? [];
		for (const day of baseDays) {
			scheduleRows.push({
				id: deterministicUuid(seedNumber, `employee-schedule:${emp.id}:${day.dayOfWeek}`),
				employeeId: emp.id,
				dayOfWeek: day.dayOfWeek,
				startTime: day.startTime,
				endTime: day.endTime,
				isWorkingDay: day.isWorkingDay,
			});
		}
	}

	await db.insert(employeeSchedule).values(scheduleRows);
}

/**
 * Inserts scheduling exceptions for a subset of employees in the last 14 local days.
 *
 * @param args - Inputs
 * @returns Inserted exception rows
 */
async function insertScheduleExceptions(args: {
	seedNumber: number;
	employees: SeedEmployee[];
	locations: SeedLocation[];
}): Promise<void> {
	const { seedNumber, employees, locations } = args;
	const rng = createRng(seedNumber + 42);

	const locationById = new Map(locations.map((l) => [l.id, l]));

	const selectedEmployees = employees.slice(0, 24);
	const exceptionRows: ScheduleExceptionRow[] = [];

	for (const emp of selectedEmployees) {
		const loc = emp.locationId ? locationById.get(emp.locationId) : undefined;
		const timeZone = loc?.timeZone ?? 'America/Mexico_City';
		const todayKey = toDateKeyInTimeZone(new Date(), timeZone);
		const offsetDays = -Math.floor(rng() * 10) - 1;
		const dateKey = addDaysToDateKey(todayKey, offsetDays);
		const exceptionDate = getUtcDateForZonedMidnight(dateKey, timeZone);

		const exceptionType = pickOne(rng, ['DAY_OFF', 'MODIFIED', 'EXTRA_DAY'] as const);

		const baseStart =
			emp.shiftType === 'NOCTURNA' ? '22:00' : emp.shiftType === 'MIXTA' ? '15:00' : '09:00';
		const baseEnd =
			emp.shiftType === 'NOCTURNA' ? '05:00' : emp.shiftType === 'MIXTA' ? '22:30' : '17:00';

		const isDayOff = exceptionType === 'DAY_OFF';
		const isModified = exceptionType === 'MODIFIED';

		exceptionRows.push({
			id: deterministicUuid(seedNumber, `schedule-exception:${emp.id}:${dateKey}`),
			employeeId: emp.id,
			exceptionDate,
			exceptionType,
			startTime: isDayOff ? null : isModified ? '10:00' : baseStart,
			endTime: isDayOff ? null : isModified ? '18:00' : baseEnd,
			reason: isDayOff ? 'Descanso' : isModified ? 'Cambio de turno' : 'Día extra',
		});
	}

	await db.insert(scheduleException).values(exceptionRows);
}

/**
 * Inserts vacation requests with per-day breakdowns and approved schedule exceptions.
 *
 * @param args - Seed inputs
 * @returns Inserted vacation requests and request day rows
 */
async function insertVacationRequests(args: {
	seedNumber: number;
	organizations: SeedOrganization[];
	employees: SeedEmployee[];
	locations: SeedLocation[];
}): Promise<{ requests: VacationRequestRow[]; requestDays: VacationRequestDayRow[] }> {
	const { seedNumber, organizations, employees, locations } = args;

	if (organizations.length === 0 || employees.length === 0) {
		return { requests: [], requestDays: [] };
	}

	const locationById = new Map<string, SeedLocation>(locations.map((loc) => [loc.id, loc]));

	const scheduleRows = await db
		.select({
			employeeId: employeeSchedule.employeeId,
			dayOfWeek: employeeSchedule.dayOfWeek,
			isWorkingDay: employeeSchedule.isWorkingDay,
		})
		.from(employeeSchedule);

	const scheduleByEmployee = new Map<string, VacationScheduleDay[]>();
	for (const row of scheduleRows) {
		const current = scheduleByEmployee.get(row.employeeId) ?? [];
		current.push({
			dayOfWeek: row.dayOfWeek,
			isWorkingDay: row.isWorkingDay ?? true,
		});
		scheduleByEmployee.set(row.employeeId, current);
	}

	const exceptionRows = await db
		.select({
			employeeId: scheduleException.employeeId,
			exceptionDate: scheduleException.exceptionDate,
			exceptionType: scheduleException.exceptionType,
		})
		.from(scheduleException);

	const exceptionsByEmployee = new Map<string, VacationScheduleException[]>();
	const existingExceptionKeys = new Set<string>();
	for (const row of exceptionRows) {
		const current = exceptionsByEmployee.get(row.employeeId) ?? [];
		current.push({
			exceptionDate: row.exceptionDate,
			exceptionType: row.exceptionType,
		});
		exceptionsByEmployee.set(row.employeeId, current);
		existingExceptionKeys.add(`${row.employeeId}:${row.exceptionDate.toISOString()}`);
	}

	const payrollSettings = await db
		.select({
			organizationId: payrollSetting.organizationId,
			additionalMandatoryRestDays: payrollSetting.additionalMandatoryRestDays,
		})
		.from(payrollSetting);

	const additionalRestDaysByOrg = new Map<string, string[]>();
	for (const row of payrollSettings) {
		additionalRestDaysByOrg.set(row.organizationId, row.additionalMandatoryRestDays ?? []);
	}

	const requestTemplates: VacationSeedTemplate[] = [
		{
			status: 'APPROVED',
			startOffset: -28,
			length: 4,
			requestedNotes: 'Vacaciones aprobadas de prueba',
			decisionNotes: 'Aprobado para pruebas',
			createScheduleExceptions: true,
		},
		{
			status: 'SUBMITTED',
			startOffset: 7,
			length: 5,
			requestedNotes: 'Solicitud de vacaciones de prueba',
			decisionNotes: null,
			createScheduleExceptions: false,
		},
	];

	const requests: VacationRequestRow[] = [];
	const requestDays: VacationRequestDayRow[] = [];
	const vacationExceptions: ScheduleExceptionRow[] = [];

	for (const [orgIndex, org] of organizations.entries()) {
		const orgEmployees = employees.filter((emp) => emp.organizationId === org.id);
		if (orgEmployees.length === 0) {
			continue;
		}

		const selectedEmployees = orgEmployees.slice(0, requestTemplates.length);

		for (const [templateIndex, template] of requestTemplates.entries()) {
			const employeeRecord = selectedEmployees[templateIndex];
			if (!employeeRecord) {
				continue;
			}

			const location = employeeRecord.locationId
				? locationById.get(employeeRecord.locationId)
				: undefined;
			const timeZone = location?.timeZone ?? 'America/Mexico_City';
			const todayKey = toDateKeyInTimeZone(new Date(), timeZone);
			const startOffset = template.startOffset + orgIndex * 2 + templateIndex * 2;
			const startDateKey = addDaysToDateKey(todayKey, startOffset);
			const endDateKey = addDaysToDateKey(startDateKey, template.length - 1);

			const scheduleDays = scheduleByEmployee.get(employeeRecord.id) ?? [];
			if (scheduleDays.length === 0) {
				continue;
			}

			const exceptions = exceptionsByEmployee.get(employeeRecord.id) ?? [];
			const additionalMandatoryRestDays = additionalRestDaysByOrg.get(org.id) ?? [];
			const mandatoryRestDayKeys = buildMandatoryRestDayKeys(
				startDateKey,
				endDateKey,
				additionalMandatoryRestDays,
			);

			const breakdown = buildVacationDayBreakdown({
				startDateKey,
				endDateKey,
				scheduleDays,
				exceptions,
				mandatoryRestDayKeys,
				hireDate: employeeRecord.hireDate ?? null,
			});

			const requestId = deterministicUuid(
				seedNumber,
				`vacation-request:${employeeRecord.id}:${startDateKey}`,
			);

			requests.push({
				id: requestId,
				organizationId: org.id,
				employeeId: employeeRecord.id,
				status: template.status,
				startDateKey,
				endDateKey,
				requestedByUserId: null,
				requestedNotes: template.requestedNotes,
				decisionNotes: template.decisionNotes,
				approvedByUserId: null,
				approvedAt: template.status === 'APPROVED' ? new Date() : null,
				rejectedByUserId: null,
				rejectedAt: null,
				cancelledByUserId: null,
				cancelledAt: null,
			});

			for (const day of breakdown.days) {
				requestDays.push({
					id: deterministicUuid(
						seedNumber,
						`vacation-request-day:${requestId}:${day.dateKey}`,
					),
					requestId,
					employeeId: employeeRecord.id,
					dateKey: day.dateKey,
					countsAsVacationDay: day.countsAsVacationDay,
					dayType: day.dayType,
					serviceYearNumber: day.serviceYearNumber,
				});

				if (!template.createScheduleExceptions || !day.countsAsVacationDay) {
					continue;
				}

				const exceptionDate = getUtcDateForZonedMidnight(day.dateKey, timeZone);
				const exceptionKey = `${employeeRecord.id}:${exceptionDate.toISOString()}`;
				if (existingExceptionKeys.has(exceptionKey)) {
					continue;
				}

				existingExceptionKeys.add(exceptionKey);
				vacationExceptions.push({
					id: deterministicUuid(
						seedNumber,
						`schedule-exception:vacation:${requestId}:${day.dateKey}`,
					),
					employeeId: employeeRecord.id,
					exceptionDate,
					exceptionType: 'DAY_OFF',
					startTime: null,
					endTime: null,
					reason: 'Vacaciones',
					vacationRequestId: requestId,
				});
			}
		}
	}

	if (requests.length > 0) {
		await db.insert(vacationRequest).values(requests);
	}

	if (requestDays.length > 0) {
		await db.insert(vacationRequestDay).values(requestDays);
	}

	if (vacationExceptions.length > 0) {
		await db.insert(scheduleException).values(vacationExceptions);
	}

	return { requests, requestDays };
}

/**
 * Inserts devices (2 per location) for attendance seeding.
 *
 * @param seedNumber - Seed number
 * @param locations - Locations list
 * @returns Inserted devices
 */
async function insertDevices(seedNumber: number, locations: SeedLocation[]): Promise<SeedDevice[]> {
	const devicesToInsert: Array<typeof device.$inferInsert> = [];

	for (const loc of locations) {
		devicesToInsert.push(
			{
				id: deterministicUuid(seedNumber, `device:${loc.code}:1`),
				code: `${loc.code}-KIOSK-01`,
				name: `Kiosco ${loc.name} 1`,
				deviceType: 'KIOSK',
				status: 'ONLINE',
				lastHeartbeat: new Date(),
				locationId: loc.id,
				organizationId: loc.organizationId ?? null,
			},
			{
				id: deterministicUuid(seedNumber, `device:${loc.code}:2`),
				code: `${loc.code}-KIOSK-02`,
				name: `Kiosco ${loc.name} 2`,
				deviceType: 'KIOSK',
				status: 'ONLINE',
				lastHeartbeat: new Date(),
				locationId: loc.id,
				organizationId: loc.organizationId ?? null,
			},
		);
	}

	await db.insert(device).values(devicesToInsert);
	return db.select().from(device);
}

/**
 * Inserts attendance records aligned to employee schedules (2 workdays per employee).
 *
 * @param args - Inputs
 * @returns Inserted attendance records
 */
async function insertAttendance(args: {
	seedNumber: number;
	employees: SeedEmployee[];
	locations: SeedLocation[];
	devices: SeedDevice[];
}): Promise<void> {
	const { seedNumber, employees, locations, devices } = args;
	const rng = createRng(seedNumber + 99);

	const locationById = new Map(locations.map((l) => [l.id, l]));
	const deviceIdsByLocation = new Map<string, string[]>();
	for (const dev of devices) {
		if (!dev.locationId) {
			continue;
		}
		const current = deviceIdsByLocation.get(dev.locationId) ?? [];
		current.push(dev.id);
		deviceIdsByLocation.set(dev.locationId, current);
	}

	const scheduleRows = await db.select().from(employeeSchedule);
	const scheduleByEmployee = new Map<string, Array<typeof employeeSchedule.$inferSelect>>();
	for (const row of scheduleRows) {
		const current = scheduleByEmployee.get(row.employeeId) ?? [];
		current.push(row);
		scheduleByEmployee.set(row.employeeId, current);
	}

	const attendanceRows: AttendanceRecordRow[] = [];

	for (const emp of employees) {
		if (!emp.locationId) {
			continue;
		}

		const loc = locationById.get(emp.locationId);
		const timeZone = loc?.timeZone ?? 'America/Mexico_City';
		const todayKey = toDateKeyInTimeZone(new Date(), timeZone);
		const candidateDateKeysByDayOfWeek = new Map<number, string[]>();
		for (let offset = -1; offset >= -14; offset -= 1) {
			const dateKey = addDaysToDateKey(todayKey, offset);
			const utcDayOfWeek = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
			const current = candidateDateKeysByDayOfWeek.get(utcDayOfWeek) ?? [];
			current.push(dateKey);
			candidateDateKeysByDayOfWeek.set(utcDayOfWeek, current);
		}
		const possibleDays = scheduleByEmployee.get(emp.id) ?? [];
		const workingDays = possibleDays.filter((d) => d.isWorkingDay);

		if (workingDays.length === 0) {
			continue;
		}

		const locationDeviceIds = deviceIdsByLocation.get(emp.locationId) ?? [];
		if (locationDeviceIds.length === 0) {
			continue;
		}

		for (let pairIndex = 0; pairIndex < 2; pairIndex += 1) {
			const scheduleDay = pickOne(rng, workingDays);
			const candidates = candidateDateKeysByDayOfWeek.get(scheduleDay.dayOfWeek) ?? [];
			const dateKey = candidates.length > 0 ? pickOne(rng, candidates) : todayKey;
			const baseMidnightUtc = getUtcDateForZonedMidnight(dateKey, timeZone);

			const startMinutes = parseTimeToMinutes(scheduleDay.startTime);
			const endMinutes = parseTimeToMinutes(scheduleDay.endTime);

			const checkIn = new Date(baseMidnightUtc.getTime() + startMinutes * 60_000);

			const endMinutesAdjusted =
				endMinutes >= startMinutes ? endMinutes : endMinutes + 24 * 60;
			const checkOut = new Date(baseMidnightUtc.getTime() + endMinutesAdjusted * 60_000);

			const deviceId = pickOne(rng, locationDeviceIds);

			attendanceRows.push(
				{
					id: deterministicUuid(
						seedNumber,
						`attendance:${emp.id}:${dateKey}:${pairIndex}:in`,
					),
					employeeId: emp.id,
					deviceId,
					timestamp: checkIn,
					type: 'CHECK_IN',
					metadata: null,
				},
				{
					id: deterministicUuid(
						seedNumber,
						`attendance:${emp.id}:${dateKey}:${pairIndex}:out`,
					),
					employeeId: emp.id,
					deviceId,
					timestamp: checkOut,
					type: 'CHECK_OUT',
					metadata: null,
				},
			);
		}
	}

	await db.insert(attendanceRecord).values(attendanceRows);
}

/**
 * Inserts CHECK_IN records for the current local day per location.
 *
 * These records are used to validate the "present" dashboard UI.
 *
 * @param args - Inputs
 * @returns Promise<void>
 */
async function insertTodayPresenceAttendance(args: {
	seedNumber: number;
	employees: SeedEmployee[];
	locations: SeedLocation[];
	devices: SeedDevice[];
}): Promise<void> {
	const { seedNumber, employees, locations, devices } = args;
	const rng = createRng(seedNumber + 202);

	const deviceIdsByLocation = new Map<string, string[]>();
	for (const dev of devices) {
		if (!dev.locationId) {
			continue;
		}
		const current = deviceIdsByLocation.get(dev.locationId) ?? [];
		current.push(dev.id);
		deviceIdsByLocation.set(dev.locationId, current);
	}

	const employeesByLocation = new Map<string, SeedEmployee[]>();
	for (const emp of employees) {
		if (!emp.locationId) {
			continue;
		}
		const current = employeesByLocation.get(emp.locationId) ?? [];
		current.push(emp);
		employeesByLocation.set(emp.locationId, current);
	}

	const attendanceRows: AttendanceRecordRow[] = [];
	const today = new Date();
	const baseTimes = ['08:30', '10:15', '12:00', '13:45'];

	for (const loc of locations) {
		const locationEmployees = employeesByLocation.get(loc.id) ?? [];
		const locationDeviceIds = deviceIdsByLocation.get(loc.id) ?? [];

		if (locationEmployees.length === 0 || locationDeviceIds.length === 0) {
			continue;
		}

		const timeZone = loc.timeZone ?? 'America/Mexico_City';
		const todayKey = toDateKeyInTimeZone(today, timeZone);
		const baseMidnightUtc = getUtcDateForZonedMidnight(todayKey, timeZone);

		const candidates = [...locationEmployees];
		const takeCount = Math.min(2, candidates.length);

		for (let index = 0; index < takeCount; index += 1) {
			const selectedIndex = Math.floor(rng() * candidates.length);
			const selected = candidates.splice(selectedIndex, 1)[0];
			if (!selected) {
				continue;
			}

			const baseTime = baseTimes[index % baseTimes.length] ?? '09:00';
			const jitterMinutes = Math.floor(rng() * 20);
			const checkInMinutes = parseTimeToMinutes(baseTime) + jitterMinutes;
			const checkIn = new Date(baseMidnightUtc.getTime() + checkInMinutes * 60_000);
			const deviceId = pickOne(rng, locationDeviceIds);

			attendanceRows.push({
				id: deterministicUuid(
					seedNumber,
					`attendance:today:${selected.id}:${todayKey}:${deviceId}`,
				),
				employeeId: selected.id,
				deviceId,
				timestamp: checkIn,
				type: 'CHECK_IN',
				metadata: null,
			});
		}
	}

	if (attendanceRows.length > 0) {
		await db.insert(attendanceRecord).values(attendanceRows);
	}
}

/**
 * Inserts payroll runs (1 per organization) and payroll run employee line items for each employee.
 *
 * This seed data is intended for development and smoke-testing endpoints, not for accounting use.
 *
 * @param args - Inputs
 */
async function insertPayrollRuns(args: {
	seedNumber: number;
	organizations: SeedOrganization[];
	employees: SeedEmployee[];
}): Promise<void> {
	const { seedNumber, organizations, employees } = args;

	const nowUtcKey = new Date().toISOString().slice(0, 10);
	const periodStartKey = addDaysToDateKey(nowUtcKey, -13);
	const periodStart = new Date(`${periodStartKey}T00:00:00Z`);
	const periodEnd = new Date(`${nowUtcKey}T23:59:59Z`);

	const attendance = await db
		.select()
		.from(attendanceRecord)
		.where(
			and(
				gte(attendanceRecord.timestamp, periodStart),
				lte(attendanceRecord.timestamp, periodEnd),
			)!,
		);

	const attendanceByEmployee = new Map<string, Array<typeof attendanceRecord.$inferSelect>>();
	for (const row of attendance) {
		const current = attendanceByEmployee.get(row.employeeId) ?? [];
		current.push(row);
		attendanceByEmployee.set(row.employeeId, current);
	}

	for (const org of organizations) {
		const orgEmployees = employees.filter((e) => e.organizationId === org.id);
		const runId = deterministicUuid(seedNumber, `payroll-run:${org.slug}:${periodStartKey}`);

		const lineItems: PayrollRunEmployeeRow[] = [];
		let totalAmount = 0;

		for (const emp of orgEmployees) {
			const dailyPay = Number(emp.dailyPay ?? 0);
			const shiftKey = (emp.shiftType ?? 'DIURNA') as keyof typeof SHIFT_LIMITS;
			const divisor = SHIFT_LIMITS[shiftKey]?.divisor ?? 8;
			const hourlyPay = divisor > 0 ? dailyPay / divisor : 0;

			const records = (attendanceByEmployee.get(emp.id) ?? [])
				.slice()
				.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

			let openCheckIn: Date | null = null;
			let minutesWorked = 0;

			for (const record of records) {
				if (record.type === 'CHECK_IN') {
					openCheckIn = record.timestamp;
				} else if (record.type === 'CHECK_OUT' && openCheckIn) {
					const diffMs = record.timestamp.getTime() - openCheckIn.getTime();
					if (diffMs > 0) {
						minutesWorked += diffMs / 60_000;
					}
					openCheckIn = null;
				}
			}

			const hoursWorked = minutesWorked / 60;
			const totalPay = hoursWorked * hourlyPay;
			totalAmount += totalPay;

			lineItems.push({
				id: deterministicUuid(seedNumber, `payroll-run-employee:${runId}:${emp.id}`),
				payrollRunId: runId,
				employeeId: emp.id,
				hoursWorked: money(hoursWorked),
				hourlyPay: money(hourlyPay),
				totalPay: money(totalPay),
				normalHours: money(hoursWorked),
				normalPay: money(totalPay),
				overtimeDoubleHours: money(0),
				overtimeDoublePay: money(0),
				overtimeTripleHours: money(0),
				overtimeTriplePay: money(0),
				sundayPremiumAmount: money(0),
				mandatoryRestDayPremiumAmount: money(0),
				taxBreakdown: null,
				periodStart,
				periodEnd,
			});
		}

		const runRow: PayrollRunRow = {
			id: runId,
			organizationId: org.id,
			periodStart,
			periodEnd,
			paymentFrequency: 'BIWEEKLY',
			status: 'DRAFT',
			totalAmount: money(totalAmount),
			employeeCount: orgEmployees.length,
			taxSummary: null,
			processedAt: null,
		};

		await db.insert(payrollRun).values(runRow);
		await db.insert(payrollRunEmployee).values(lineItems);
	}
}

/**
 * Resolves organization employees eligible for PTU/Aguinaldo seed runs.
 *
 * @param employees - Seeded employees
 * @param organizationId - Organization identifier
 * @returns Eligible employees for extra payments
 */
function resolveExtraPaymentEligibleEmployees(
	employees: SeedEmployee[],
	organizationId: string,
): SeedEmployee[] {
	return employees.filter((employeeRow) => {
		const status = employeeRow.status ?? 'ACTIVE';
		return employeeRow.organizationId === organizationId && status !== 'INACTIVE';
	});
}

/**
 * Inserts deterministic PTU history entries for cap calculations.
 *
 * @param args - Seed inputs
 * @returns Number of inserted PTU history rows
 */
async function insertPtuHistoryEntries(args: {
	seedNumber: number;
	organizations: SeedOrganization[];
	employees: SeedEmployee[];
	fiscalYear: number;
}): Promise<number> {
	const { seedNumber, organizations, employees, fiscalYear } = args;
	const historyRows: PtuHistoryRow[] = [];

	for (const org of organizations) {
		const eligibleEmployees = resolveExtraPaymentEligibleEmployees(employees, org.id).slice(0, 15);
		for (const employeeRow of eligibleEmployees) {
			const dailyPay = Number(employeeRow.dailyPay ?? 0);

			for (const yearsAgo of [3, 2, 1]) {
				const year = fiscalYear - yearsAgo;
				const baseAmount = roundCurrency(dailyPay * (5 + yearsAgo));
				historyRows.push({
					id: deterministicUuid(
						seedNumber,
						`ptu-history:${employeeRow.id}:${year}`,
					),
					organizationId: org.id,
					employeeId: employeeRow.id,
					fiscalYear: year,
					amount: money(baseAmount),
				});
			}
		}
	}

	if (historyRows.length > 0) {
		await db.insert(ptuHistory).values(historyRows);
	}

	return historyRows.length;
}

/**
 * Inserts PTU runs and employee line items for each seed organization.
 *
 * @param args - Seed inputs
 * @returns Totals for inserted run headers and line items
 */
async function insertPtuRuns(args: {
	seedNumber: number;
	organizations: SeedOrganization[];
	employees: SeedEmployee[];
	fiscalYear: number;
}): Promise<{ runs: number; lineItems: number }> {
	const { seedNumber, organizations, employees, fiscalYear } = args;
	let runsInserted = 0;
	let lineItemsInserted = 0;

	for (const [orgIndex, org] of organizations.entries()) {
		const eligibleEmployees = resolveExtraPaymentEligibleEmployees(employees, org.id);
		if (eligibleEmployees.length === 0) {
			continue;
		}

		const runId = deterministicUuid(seedNumber, `ptu-run:${org.slug}:${fiscalYear}`);
		const paymentDate = new Date(Date.UTC(fiscalYear + 1, 4, 31, 12, 0, 0));
		const status: PtuRunStatus = orgIndex === 0 ? 'PROCESSED' : 'DRAFT';
		const ptuPercentage = 0.1;
		const totalAnnualBase = eligibleEmployees.reduce(
			(total, employeeRow) => total + Number(employeeRow.dailyPay ?? 0) * 365,
			0,
		);
		const taxableIncome = roundCurrency(totalAnnualBase * 0.3);
		const ptuPoolTotal = roundCurrency(taxableIncome * ptuPercentage);
		const sharePerEmployee =
			eligibleEmployees.length > 0 ? ptuPoolTotal / eligibleEmployees.length : 0;

		const lineItems: PtuRunEmployeeRow[] = [];
		let grossTotal = 0;
		let exemptTotal = 0;
		let taxableTotal = 0;
		let withheldTotal = 0;
		let netTotal = 0;

		for (const employeeRow of eligibleEmployees) {
			const dailyPay = Number(employeeRow.dailyPay ?? 0);
			const annualSalaryBase = roundCurrency(dailyPay * 365);
			const ptuByDays = roundCurrency(sharePerEmployee * 0.5);
			const ptuBySalary = roundCurrency(sharePerEmployee * 0.5);
			const ptuPreCap = roundCurrency(ptuByDays + ptuBySalary);
			const capThreeMonths = roundCurrency(dailyPay * 90);
			const capAvgThreeYears = roundCurrency(ptuPreCap * 1.1);
			const capFinal = roundCurrency(Math.min(capThreeMonths, capAvgThreeYears));
			const ptuFinal = roundCurrency(Math.min(ptuPreCap, capFinal));
			const exemptAmount = roundCurrency(Math.min(ptuFinal, 500));
			const taxableAmount = roundCurrency(Math.max(ptuFinal - exemptAmount, 0));
			const withheldIsr = roundCurrency(taxableAmount * 0.1);
			const netAmount = roundCurrency(ptuFinal - withheldIsr);

			grossTotal += ptuFinal;
			exemptTotal += exemptAmount;
			taxableTotal += taxableAmount;
			withheldTotal += withheldIsr;
			netTotal += netAmount;

			lineItems.push({
				id: deterministicUuid(seedNumber, `ptu-run-employee:${runId}:${employeeRow.id}`),
				ptuRunId: runId,
				employeeId: employeeRow.id,
				isEligible: true,
				eligibilityReasons: [],
				daysCounted: 365,
				dailyQuota: money(dailyPay),
				annualSalaryBase: money(annualSalaryBase),
				ptuByDays: money(ptuByDays),
				ptuBySalary: money(ptuBySalary),
				ptuPreCap: money(ptuPreCap),
				capThreeMonths: money(capThreeMonths),
				capAvgThreeYears: money(capAvgThreeYears),
				capFinal: money(capFinal),
				ptuFinal: money(ptuFinal),
				exemptAmount: money(exemptAmount),
				taxableAmount: money(taxableAmount),
				withheldIsr: money(withheldIsr),
				netAmount: money(netAmount),
				warnings: [],
			});
		}

		const runRow: PtuRunRow = {
			id: runId,
			organizationId: org.id,
			fiscalYear,
			paymentDate,
			taxableIncome: money(taxableIncome),
			ptuPercentage: ptuPercentage.toFixed(4),
			includeInactive: false,
			status,
			totalAmount: money(roundCurrency(netTotal)),
			employeeCount: eligibleEmployees.length,
			taxSummary: {
				grossTotal: roundCurrency(grossTotal),
				exemptTotal: roundCurrency(exemptTotal),
				taxableTotal: roundCurrency(taxableTotal),
				withheldTotal: roundCurrency(withheldTotal),
				netTotal: roundCurrency(netTotal),
				employeeCount: eligibleEmployees.length,
			},
			settingsSnapshot: {
				ptuEnabled: true,
				ptuMode: 'DEFAULT_RULES',
			},
			processedAt: status === 'PROCESSED' ? new Date() : null,
			cancelledAt: null,
			cancelReason: null,
		};

		await db.insert(ptuRun).values(runRow);
		await db.insert(ptuRunEmployee).values(lineItems);
		runsInserted += 1;
		lineItemsInserted += lineItems.length;
	}

	return { runs: runsInserted, lineItems: lineItemsInserted };
}

/**
 * Inserts Aguinaldo runs and employee line items for each seed organization.
 *
 * @param args - Seed inputs
 * @returns Totals for inserted run headers and line items
 */
async function insertAguinaldoRuns(args: {
	seedNumber: number;
	organizations: SeedOrganization[];
	employees: SeedEmployee[];
	calendarYear: number;
}): Promise<{ runs: number; lineItems: number }> {
	const { seedNumber, organizations, employees, calendarYear } = args;
	let runsInserted = 0;
	let lineItemsInserted = 0;

	for (const [orgIndex, org] of organizations.entries()) {
		const eligibleEmployees = resolveExtraPaymentEligibleEmployees(employees, org.id);
		if (eligibleEmployees.length === 0) {
			continue;
		}

		const runId = deterministicUuid(seedNumber, `aguinaldo-run:${org.slug}:${calendarYear}`);
		const paymentDate = new Date(Date.UTC(calendarYear, 11, 20, 12, 0, 0));
		const status: AguinaldoRunStatus = orgIndex === 0 ? 'PROCESSED' : 'DRAFT';
		const lineItems: AguinaldoRunEmployeeRow[] = [];
		let grossTotal = 0;
		let exemptTotal = 0;
		let taxableTotal = 0;
		let withheldTotal = 0;
		let netTotal = 0;

		for (const employeeRow of eligibleEmployees) {
			const dailyPay = Number(employeeRow.dailyPay ?? 0);
			const grossAmount = roundCurrency(dailyPay * 15);
			const exemptAmount = roundCurrency(Math.min(grossAmount, 3000));
			const taxableAmount = roundCurrency(Math.max(grossAmount - exemptAmount, 0));
			const withheldIsr = roundCurrency(taxableAmount * 0.1);
			const netAmount = roundCurrency(grossAmount - withheldIsr);

			grossTotal += grossAmount;
			exemptTotal += exemptAmount;
			taxableTotal += taxableAmount;
			withheldTotal += withheldIsr;
			netTotal += netAmount;

			lineItems.push({
				id: deterministicUuid(
					seedNumber,
					`aguinaldo-run-employee:${runId}:${employeeRow.id}`,
				),
				aguinaldoRunId: runId,
				employeeId: employeeRow.id,
				isEligible: true,
				eligibilityReasons: [],
				daysCounted: 365,
				dailySalaryBase: money(dailyPay),
				aguinaldoDaysPolicy: 15,
				yearDays: 365,
				grossAmount: money(grossAmount),
				exemptAmount: money(exemptAmount),
				taxableAmount: money(taxableAmount),
				withheldIsr: money(withheldIsr),
				netAmount: money(netAmount),
				warnings: [],
			});
		}

		const runRow: AguinaldoRunRow = {
			id: runId,
			organizationId: org.id,
			calendarYear,
			paymentDate,
			includeInactive: false,
			status,
			totalAmount: money(roundCurrency(netTotal)),
			employeeCount: eligibleEmployees.length,
			taxSummary: {
				grossTotal: roundCurrency(grossTotal),
				exemptTotal: roundCurrency(exemptTotal),
				taxableTotal: roundCurrency(taxableTotal),
				withheldTotal: roundCurrency(withheldTotal),
				netTotal: roundCurrency(netTotal),
				employeeCount: eligibleEmployees.length,
			},
			settingsSnapshot: {
				aguinaldoEnabled: true,
				aguinaldoDays: 15,
			},
			processedAt: status === 'PROCESSED' ? new Date() : null,
			cancelledAt: null,
			cancelReason: null,
		};

		await db.insert(aguinaldoRun).values(runRow);
		await db.insert(aguinaldoRunEmployee).values(lineItems);
		runsInserted += 1;
		lineItemsInserted += lineItems.length;
	}

	return { runs: runsInserted, lineItems: lineItemsInserted };
}

/**
 * Main entry point.
 *
 * @returns Promise<void>
 */
async function main(): Promise<void> {
	const args = parseCliArgs(process.argv.slice(2));

	if (!args.reset && (await isDomainSeeded())) {
		throw new Error(
			'Domain tables already contain data. Run with --reset to clear and reseed (domain-only).',
		);
	}

	const organizations = await ensureSeedOrganizations(args.seed);

	if (args.reset) {
		await reset(db, seedSchema);
	}

	const baseline = await insertDomainBaseline({
		seedNumber: args.seed,
		organizations,
	});

	await insertScheduleTemplateDays(args.seed, baseline.templates);

	const employees = await seedEmployees({
		seedNumber: args.seed,
		organizations,
		locations: baseline.locations,
		jobPositions: baseline.jobPositions,
		templates: baseline.templates,
		positionPayDefaults: baseline.positionPayDefaults,
	});

	await insertEmployeeSchedules(args.seed, employees);
	await insertScheduleExceptions({
		seedNumber: args.seed,
		employees,
		locations: baseline.locations,
	});

	const vacationSeeds = await insertVacationRequests({
		seedNumber: args.seed,
		organizations,
		employees,
		locations: baseline.locations,
	});

	const devices = await insertDevices(args.seed, baseline.locations);

	await insertAttendance({
		seedNumber: args.seed,
		employees,
		locations: baseline.locations,
		devices,
	});

	await insertTodayPresenceAttendance({
		seedNumber: args.seed,
		employees,
		locations: baseline.locations,
		devices,
	});

	await insertPayrollRuns({
		seedNumber: args.seed,
		organizations,
		employees,
	});

	const currentYear = new Date().getUTCFullYear();
	const ptuHistoryCount = await insertPtuHistoryEntries({
		seedNumber: args.seed,
		organizations,
		employees,
		fiscalYear: currentYear - 1,
	});

	const ptuSeedTotals = await insertPtuRuns({
		seedNumber: args.seed,
		organizations,
		employees,
		fiscalYear: currentYear - 1,
	});

	const aguinaldoSeedTotals = await insertAguinaldoRuns({
		seedNumber: args.seed,
		organizations,
		employees,
		calendarYear: currentYear,
	});

	console.log('✅ Seed completed.');
	console.log('Organizations:', organizations.map((o) => o.slug).join(', '));
	console.log('Employees:', employees.length);
	console.log('Vacation requests:', vacationSeeds.requests.length);
	console.log('Vacation request days:', vacationSeeds.requestDays.length);
	console.log('PTU history rows:', ptuHistoryCount);
	console.log('PTU runs:', ptuSeedTotals.runs, 'line items:', ptuSeedTotals.lineItems);
	console.log(
		'Aguinaldo runs:',
		aguinaldoSeedTotals.runs,
		'line items:',
		aguinaldoSeedTotals.lineItems,
	);
}

try {
	await main();
} finally {
	await pool.end();
}
