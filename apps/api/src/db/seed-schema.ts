import {
	aguinaldoRun,
	aguinaldoRunEmployee,
	attendanceRecord,
	device,
	employee,
	employeeSchedule,
	jobPosition,
	location,
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
} from './schema.js';

/**
 * Domain-only schema for database seeding/reset.
 *
 * Note: BetterAuth-managed tables are intentionally excluded (including `organization`),
 * because `drizzle-seed` uses `TRUNCATE ... CASCADE` for PostgreSQL resets and would
 * also truncate BetterAuth organization plugin tables (e.g. `member`, `invitation`).
 */
export const seedSchema = {
	location,
	jobPosition,
	scheduleTemplate,
	scheduleTemplateDay,
	employee,
	employeeSchedule,
	scheduleException,
	vacationRequest,
	vacationRequestDay,
	device,
	attendanceRecord,
	payrollSetting,
	payrollRun,
	payrollRunEmployee,
	ptuHistory,
	ptuRun,
	ptuRunEmployee,
	aguinaldoRun,
	aguinaldoRunEmployee,
};
