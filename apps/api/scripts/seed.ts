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
import { seedSchema } from '../src/db/seed-schema.js';
import * as schema from '../src/db/schema.js';

const {
	attendanceRecord,
	device,
	employee,
	employeeSchedule,
	jobPosition,
	location,
	organization,
	payrollRun,
	payrollRunEmployee,
	payrollSetting,
	scheduleException,
	scheduleTemplate,
	scheduleTemplateDay,
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
type PayrollSettingRow = typeof payrollSetting.$inferInsert;

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

	const positionsToInsert: Array<typeof jobPosition.$inferInsert> = [
		{
			id: deterministicUuid(seedNumber, 'job:sen:operador'),
			name: 'Operador',
			description: 'Personal operativo',
			dailyPay: money(400),
			paymentFrequency: 'WEEKLY',
			organizationId: primaryOrg.id,
			clientId: null,
		},
		{
			id: deterministicUuid(seedNumber, 'job:sen:supervisor'),
			name: 'Supervisor',
			description: 'Supervisión de turno',
			dailyPay: money(600),
			paymentFrequency: 'BIWEEKLY',
			organizationId: primaryOrg.id,
			clientId: null,
		},
		{
			id: deterministicUuid(seedNumber, 'job:sen:gerente'),
			name: 'Gerente',
			description: 'Gestión de sucursal',
			dailyPay: money(1000),
			paymentFrequency: 'MONTHLY',
			organizationId: primaryOrg.id,
			clientId: null,
		},
		{
			id: deterministicUuid(seedNumber, 'job:demo:operador'),
			name: 'Operador',
			description: 'Personal operativo',
			dailyPay: money(380),
			paymentFrequency: 'WEEKLY',
			organizationId: secondaryOrg.id,
			clientId: null,
		},
		{
			id: deterministicUuid(seedNumber, 'job:demo:supervisor'),
			name: 'Supervisor',
			description: 'Supervisión de turno',
			dailyPay: money(560),
			paymentFrequency: 'BIWEEKLY',
			organizationId: secondaryOrg.id,
			clientId: null,
		},
		{
			id: deterministicUuid(seedNumber, 'job:demo:gerente'),
			name: 'Gerente',
			description: 'Gestión de sucursal',
			dailyPay: money(900),
			paymentFrequency: 'MONTHLY',
			organizationId: secondaryOrg.id,
			clientId: null,
		},
	];

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
		},
		{
			id: deterministicUuid(seedNumber, 'payroll-setting:demo'),
			organizationId: secondaryOrg.id,
			weekStartDay: 1,
			timeZone: 'America/Tijuana',
			overtimeEnforcement: 'WARN',
			additionalMandatoryRestDays: ['2025-11-02'],
		},
	];
	await db.insert(payrollSetting).values(settingsToInsert);

	return {
		locations: locationsInserted,
		jobPositions: positionsInserted,
		templates: templatesInserted,
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
}): Promise<SeedEmployee[]> {
	const { seedNumber, organizations, locations, jobPositions, templates } = args;

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
		if (!row.scheduleTemplateId) {
			continue;
		}
		const desired = templateShiftMap.get(row.scheduleTemplateId);
		if (!desired || row.shiftType === desired) {
			continue;
		}
		await db.update(employee).set({ shiftType: desired }).where(eq(employee.id, row.id));
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
	jobPositions: SeedJobPosition[];
}): Promise<void> {
	const { seedNumber, organizations, employees, jobPositions } = args;

	const jobById = new Map(jobPositions.map((p) => [p.id, p]));

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
			const pos = emp.jobPositionId ? jobById.get(emp.jobPositionId) : undefined;
			const dailyPay = pos ? Number(pos.dailyPay) : 0;
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
			processedAt: null,
		};

		await db.insert(payrollRun).values(runRow);
		await db.insert(payrollRunEmployee).values(lineItems);
	}
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
	});

	await insertEmployeeSchedules(args.seed, employees);
	await insertScheduleExceptions({
		seedNumber: args.seed,
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

	await insertPayrollRuns({
		seedNumber: args.seed,
		organizations,
		employees,
		jobPositions: baseline.jobPositions,
	});

	console.log('✅ Seed completed.');
	console.log('Organizations:', organizations.map((o) => o.slug).join(', '));
	console.log('Employees:', employees.length);
}

try {
	await main();
} finally {
	await pool.end();
}
