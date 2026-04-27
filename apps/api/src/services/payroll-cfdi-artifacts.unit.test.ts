import { describe, expect, it } from 'bun:test';

import {
	buildPayrollCfdiArtifactSummary,
	buildPayrollCfdiXmlDownloadResponse,
	buildPayrollCfdiXmlPersistencePayload,
	mapFiscalVoucherToPayrollCfdiBuildInput,
	type PayrollCfdiXmlArtifactRow,
	type PayrollFiscalVoucherArtifactSourceRow,
} from './payroll-cfdi-artifacts.js';

/**
 * Builds a persisted fiscal voucher row for CFDI XML artifact tests.
 *
 * @param overrides - Partial row values to override
 * @returns Persisted fiscal voucher row
 */
function buildVoucherRow(
	overrides: Partial<PayrollFiscalVoucherArtifactSourceRow> = {},
): PayrollFiscalVoucherArtifactSourceRow {
	return {
		id: 'voucher-1',
		payrollRunId: 'run-1',
		organizationId: 'org-1',
		employeeId: 'emp-1',
		status: 'READY_TO_STAMP',
		uuid: null,
		stampedAt: null,
		voucher: {
			issuer: {
				rfc: 'AAA010101AAA',
				name: 'ACME SA DE CV',
				fiscalRegime: '601',
				expeditionPostalCode: '64000',
			},
			receiver: {
				name: 'Ada Lovelace',
				rfc: 'LOAA800101ABC',
				curp: 'LOAA800101MDFABC09',
				nss: '12345678901',
				fiscalRegime: '605',
				fiscalPostalCode: '64000',
				contractType: '01',
				workdayType: '01',
			},
			paymentFrequency: 'WEEKLY',
			periodStartDateKey: '2026-04-06',
			periodEndDateKey: '2026-04-12',
			paymentDateKey: '2026-04-12',
			perceptions: [
				{
					internalType: 'SALARY',
					satTypeCode: '001',
					internalCode: 'SALARY',
					description: 'Sueldo',
					taxedAmount: 1000,
					exemptAmount: 0,
				},
			],
			deductions: [
				{
					internalType: 'ISR',
					satTypeCode: '002',
					internalCode: 'ISR',
					description: 'ISR',
					amount: 100,
				},
			],
			otherPayments: [],
			realPayrollComplementPay: null,
		},
		...overrides,
	};
}

/**
 * Builds a persisted XML artifact row for tests.
 *
 * @param overrides - Partial artifact values to override
 * @returns Persisted XML artifact row
 */
function buildArtifactRow(
	overrides: Partial<PayrollCfdiXmlArtifactRow> = {},
): PayrollCfdiXmlArtifactRow {
	return {
		id: 'artifact-1',
		payrollFiscalVoucherId: 'voucher-1',
		organizationId: 'org-1',
		employeeId: 'emp-1',
		artifactKind: 'XML_WITHOUT_SEAL',
		fiscalSnapshotHash: 'snapshot-hash',
		xmlHash: 'xml-hash',
		xml: '<cfdi:Comprobante/>',
		fiscalArtifactManifest: {
			exerciseYear: 2026,
			cfdiVersion: '4.0',
			payrollComplementVersion: '1.2',
			source: 'SAT',
			sourceName: 'SAT CFDI/Nomina XSD',
			sourcePublishedAt: null,
			cfdXsdUrl: 'https://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd',
			payrollXsdUrl: 'https://www.sat.gob.mx/sitio_internet/cfd/nomina/nomina12.xsd',
			tfdXsdUrl:
				'https://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd',
			catalogVersion: '2026',
			validationMatrixVersion: 'phase-3-v1',
			generatedAt: '2026-04-12T12:00:00.000Z',
		},
		validationErrors: [],
		generatedAt: new Date('2026-04-12T12:00:00.000Z'),
		createdAt: new Date('2026-04-12T12:00:00.000Z'),
		...overrides,
	};
}

describe('payroll CFDI XML artifacts', () => {
	it('maps persisted vouchers to Phase 3 builder input without guessing missing receiver fields', () => {
		const issuedAt = new Date('2026-04-12T12:00:00.000Z');
		const row = buildVoucherRow();

		const input = mapFiscalVoucherToPayrollCfdiBuildInput({ voucherRow: row, issuedAt });

		expect(input.voucherId).toBe('voucher-1');
		expect(input.receiver.employmentStartDateKey).toBeNull();
		expect(input.issuer.employerRegistration).toBeNull();
		expect(input.receiver.regimeType).toBeNull();
		expect(input.receiver.employeeNumber).toBeNull();
		expect(input.receiver.federalEntity).toBeNull();
		expect(input.perceptions[0]).toMatchObject({
			satTypeCode: '001',
			employerCode: 'SALARY',
			conceptLabel: 'Sueldo',
		});
		expect(input.fiscalArtifactManifest).toMatchObject({
			exerciseYear: 2026,
			sourceName: 'SAT CFDI/Nomina XSD',
			sourcePublishedAt: null,
			catalogVersion: '2026',
			validationMatrixVersion: 'phase-3-v1',
			generatedAt: '2026-04-12T12:00:00.000Z',
		});
	});

	it('returns a blocked persistence payload with validation errors and no artifact XML when Phase 3 fields are missing', () => {
		const issuedAt = new Date('2026-04-12T12:00:00.000Z');
		const voucherRow = buildVoucherRow();

		const payload = buildPayrollCfdiXmlPersistencePayload({ voucherRow, issuedAt });

		expect(payload.status).toBe('BLOCKED');
		expect(payload.artifact).toBeNull();
		expect(payload.summary).not.toHaveProperty('xml');
		expect(payload.summary).toMatchObject({
			voucherId: 'voucher-1',
			artifactId: null,
			artifactKind: 'XML_WITHOUT_SEAL',
			status: 'BLOCKED',
		});
		expect(payload.summary.errors.map((error) => error.code)).toContain(
			'XML_EMPLOYMENT_START_DATE_REQUIRED',
		);
	});

	it('builds idempotent artifact summaries without exposing XML', () => {
		const artifact = buildArtifactRow({
			id: 'artifact-existing',
			xml: '<cfdi:Comprobante Fecha="2026-04-12T06:00:00"/>',
			xmlHash: 'existing-hash',
			validationErrors: [{ code: 'XML_RECEIVER_CURP_REQUIRED', field: 'receiver.curp' }],
		});

		const summary = buildPayrollCfdiArtifactSummary({
			voucherId: 'voucher-1',
			artifact,
			status: 'BLOCKED',
			warnings: [],
		});

		expect(summary).toEqual({
			voucherId: 'voucher-1',
			artifactId: 'artifact-existing',
			artifactKind: 'XML_WITHOUT_SEAL',
			xmlHash: 'existing-hash',
			status: 'BLOCKED',
			errors: [{ code: 'XML_RECEIVER_CURP_REQUIRED', field: 'receiver.curp' }],
			warnings: [],
		});
		expect(summary).not.toHaveProperty('xml');
	});

	it('builds XML download responses with attachment headers and no-store caching', async () => {
		const response = buildPayrollCfdiXmlDownloadResponse({
			voucherId: 'voucher-1',
			artifact: buildArtifactRow({
				xml: '<cfdi:Comprobante Version="4.0"/>',
			}),
		});

		expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('content-disposition')).toContain(
			'attachment; filename="voucher-1-XML_WITHOUT_SEAL.xml"',
		);
		expect(await response.text()).toBe('<cfdi:Comprobante Version="4.0"/>');
	});
});
