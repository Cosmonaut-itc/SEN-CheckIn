import { describe, expect, it } from 'bun:test';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { readFileSync } from 'node:fs';

import {
	attendanceRecord,
	employeeFiscalProfile,
	organizationFiscalProfile,
	payrollConceptSatMapping,
	satFiscalCatalogEntry,
	tourProgress,
} from './schema.js';

describe('attendance schema lunch break checkout reason', () => {
	it('exports the supported check-out reason enum values', async () => {
		const schemaModule = await import('./schema.js');

		expect('checkOutReason' in schemaModule).toBe(true);
		if (!('checkOutReason' in schemaModule)) {
			throw new Error('Expected checkOutReason enum export.');
		}

		expect(schemaModule.checkOutReason.enumValues).toEqual([
			'REGULAR',
			'LUNCH_BREAK',
			'PERSONAL',
		]);
	});

	it('adds a nullable checkOutReason column to attendance_record', () => {
		const columns = getTableColumns(attendanceRecord) as Record<string, { notNull: boolean }>;

		expect(columns).toHaveProperty('checkOutReason');
		const checkOutReasonColumn = columns.checkOutReason;
		if (!checkOutReasonColumn) {
			throw new Error('Expected checkOutReason column.');
		}

		expect(checkOutReasonColumn.notNull).toBe(false);
	});
});

describe('tour progress schema', () => {
	it('exports the supported tour progress status enum values', async () => {
		const schemaModule = await import('./schema.js');

		expect('tourProgressStatus' in schemaModule).toBe(true);
		if (!('tourProgressStatus' in schemaModule)) {
			throw new Error('Expected tourProgressStatus enum export.');
		}

		expect(schemaModule.tourProgressStatus.enumValues).toEqual(['completed', 'skipped']);
	});

	it('exports the expected tour_progress columns', () => {
		const columns = getTableColumns(tourProgress) as Record<string, { notNull: boolean }>;

		expect(columns).toHaveProperty('id');
		expect(columns).toHaveProperty('userId');
		expect(columns).toHaveProperty('organizationId');
		expect(columns).toHaveProperty('tourId');
		expect(columns).toHaveProperty('status');
		expect(columns).toHaveProperty('completedAt');
		expect(columns.userId?.notNull).toBe(true);
		expect(columns.organizationId?.notNull).toBe(true);
		expect(columns.tourId?.notNull).toBe(true);
		expect(columns.status?.notNull).toBe(true);
		expect(columns.completedAt?.notNull).toBe(true);
	});
});

describe('fiscal master data schema', () => {
	it('exports the organization fiscal profile table with required columns', () => {
		const columns = getTableColumns(organizationFiscalProfile) as Record<
			string,
			{ notNull: boolean }
		>;

		expect(getTableName(organizationFiscalProfile)).toBe('organization_fiscal_profile');
		expect(columns).toHaveProperty('id');
		expect(columns).toHaveProperty('organizationId');
		expect(columns).toHaveProperty('legalName');
		expect(columns).toHaveProperty('rfc');
		expect(columns).toHaveProperty('fiscalRegimeCode');
		expect(columns).toHaveProperty('expeditionPostalCode');
		expect(columns).toHaveProperty('payrollStampingMode');
		expect(columns).toHaveProperty('createdAt');
		expect(columns).toHaveProperty('updatedAt');
		expect(columns.organizationId?.notNull).toBe(true);
		expect(columns.legalName?.notNull).toBe(true);
		expect(columns.rfc?.notNull).toBe(true);
		expect(columns.payrollStampingMode?.notNull).toBe(true);
	});

	it('exports the employee fiscal profile table with required columns', () => {
		const columns = getTableColumns(employeeFiscalProfile) as Record<
			string,
			{ notNull: boolean }
		>;

		expect(getTableName(employeeFiscalProfile)).toBe('employee_fiscal_profile');
		expect(columns).toHaveProperty('id');
		expect(columns).toHaveProperty('employeeId');
		expect(columns).toHaveProperty('organizationId');
		expect(columns).toHaveProperty('satName');
		expect(columns).toHaveProperty('rfc');
		expect(columns).toHaveProperty('curp');
		expect(columns).toHaveProperty('fiscalPostalCode');
		expect(columns).toHaveProperty('fiscalRegimeCode');
		expect(columns).toHaveProperty('cfdiUseCode');
		expect(columns).toHaveProperty('unionized');
		expect(columns).toHaveProperty('employeeNumber');
		expect(columns).toHaveProperty('salaryBaseContribution');
		expect(columns).toHaveProperty('integratedDailySalary');
		expect(columns.employeeId?.notNull).toBe(true);
		expect(columns.organizationId?.notNull).toBe(true);
		expect(columns.satName?.notNull).toBe(true);
		expect(columns.employeeNumber?.notNull).toBe(true);
	});

	it('exports SAT fiscal catalog and payroll concept mapping constrained enums', async () => {
		const schemaModule = await import('./schema.js');

		expect(getTableName(satFiscalCatalogEntry)).toBe('sat_fiscal_catalog_entry');
		expect(getTableName(payrollConceptSatMapping)).toBe('payroll_concept_sat_mapping');
		expect(schemaModule.fiscalCatalogName.enumValues).toEqual([
			'c_RegimenFiscal',
			'c_UsoCFDI',
			'c_CodigoPostal',
			'nomina_c_TipoContrato',
			'nomina_c_TipoJornada',
			'nomina_c_TipoRegimen',
			'nomina_c_RiesgoPuesto',
			'nomina_c_PeriodicidadPago',
			'nomina_c_TipoPercepcion',
			'nomina_c_TipoDeduccion',
			'nomina_c_TipoOtroPago',
			'nomina_c_ClaveEntFed',
			'nomina_c_Banco',
		]);
		expect(schemaModule.payrollStampingMode.enumValues).toEqual([
			'PER_RUN',
			'MONTHLY_CONSOLIDATED_DISABLED',
		]);
		expect(schemaModule.payrollCfdiNode.enumValues).toEqual([
			'PERCEPTION',
			'DEDUCTION',
			'OTHER_PAYMENT',
		]);
		expect(schemaModule.payrollTaxableStrategy.enumValues).toEqual([
			'FULLY_TAXED',
			'FULLY_EXEMPT',
			'SPLIT_BY_CALCULATION',
			'NOT_APPLICABLE',
		]);
		expect(schemaModule.employeeUnionizedValue.enumValues).toEqual(['Sí', 'No']);
	});

	it('enforces payroll concept mapping uniqueness separately for global and scoped rows', () => {
		const migrationSql = readFileSync(
			new URL('../../drizzle/0053_fiscal_master_data.sql', import.meta.url),
			'utf8',
		);

		expect(migrationSql).toContain(
			'CREATE UNIQUE INDEX "payroll_concept_sat_mapping_global_type_node_uniq" ON "payroll_concept_sat_mapping" USING btree ("internal_concept_type","cfdi_node") WHERE "organization_id" is null;',
		);
		expect(migrationSql).toContain(
			'CREATE UNIQUE INDEX "payroll_concept_sat_mapping_org_type_node_uniq" ON "payroll_concept_sat_mapping" USING btree ("organization_id","internal_concept_type","cfdi_node") WHERE "organization_id" is not null;',
		);
		expect(migrationSql).not.toContain(
			'CREATE UNIQUE INDEX "payroll_concept_sat_mapping_scope_type_node_uniq"',
		);
	});

	it('allows multiple incomplete employee fiscal profiles without employee numbers', () => {
		const migrationSql = readFileSync(
			new URL('../../drizzle/0053_fiscal_master_data.sql', import.meta.url),
			'utf8',
		);

		expect(migrationSql).toContain(
			'CREATE UNIQUE INDEX "employee_fiscal_profile_org_employee_number_uniq" ON "employee_fiscal_profile" USING btree ("organization_id","employee_number") WHERE "employee_number" <> \'\';',
		);
	});
});
