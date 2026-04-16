import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';

import type { PayrollRun, PayrollRunEmployee } from '@/lib/client-functions';

import { buildPayrollReceiptPdf } from './build-payroll-receipt-pdf';

type TranslateFn = (key: string, values?: Record<string, string | number>) => string;

/**
 * Builds a payroll run fixture for receipt tests.
 *
 * @param overrides - Per-test value overrides
 * @returns Payroll run payload
 */
function buildRun(overrides: Partial<PayrollRun> = {}): PayrollRun {
	return {
		id: 'run-1',
		organizationId: 'org-1',
		organizationName: 'SEN CheckIn',
		periodStart: new Date('2026-03-09T00:00:00Z'),
		periodEnd: new Date('2026-03-15T00:00:00Z'),
		paymentFrequency: 'WEEKLY',
		status: 'PROCESSED',
		totalAmount: 1740,
		employeeCount: 1,
		holidayNotices: null,
		processedAt: new Date('2026-03-16T12:00:00Z'),
		createdAt: new Date('2026-03-16T12:00:00Z'),
		updatedAt: new Date('2026-03-16T12:00:00Z'),
		...overrides,
	};
}

/**
 * Builds a payroll receipt employee fixture for PDF tests.
 *
 * @param overrides - Per-test value overrides
 * @returns Payroll run employee payload
 */
function buildEmployee(
	overrides: Partial<PayrollRunEmployee> = {},
): PayrollRunEmployee {
	return {
		id: 'run-employee-1',
		payrollRunId: 'run-1',
		employeeId: 'emp-1',
		employeeName: 'María López',
		employeeCode: 'E-001',
		employeeNss: '12345678901',
		employeeRfc: 'LOPM800101ABC',
		fiscalDailyPay: null,
		hoursWorked: 48,
		hourlyPay: 37.5,
		totalPay: 1740,
		normalHours: 48,
		normalPay: 1740,
		overtimeDoubleHours: 0,
		overtimeDoublePay: 0,
		overtimeTripleHours: 0,
		overtimeTriplePay: 0,
		authorizedOvertimeHours: 0,
		unauthorizedOvertimeHours: 0,
		sundayPremiumAmount: 0,
		mandatoryRestDayPremiumAmount: 0,
		vacationDaysPaid: 0,
		vacationPayAmount: 0,
		vacationPremiumAmount: 0,
		realVacationPayAmount: null,
		realVacationPremiumAmount: null,
		gratificationsBreakdown: [],
		totalGratifications: 0,
		fiscalGrossPay: null,
		complementPay: null,
		totalRealPay: null,
		lunchBreakAutoDeductedDays: 0,
		lunchBreakAutoDeductedMinutes: 0,
		deductionsBreakdown: [],
		totalDeductions: 0,
		periodStart: new Date('2026-03-09T00:00:00Z'),
		periodEnd: new Date('2026-03-15T00:00:00Z'),
		createdAt: new Date('2026-03-16T12:00:00Z'),
		updatedAt: new Date('2026-03-16T12:00:00Z'),
		...overrides,
	};
}

/**
 * Converts PDF header bytes to string.
 *
 * @param bytes - PDF byte array
 * @returns Header string
 */
function readPdfHeader(bytes: Uint8Array): string {
	return String.fromCharCode(...bytes.slice(0, 5));
}

/**
 * Finds the first index of a token inside a byte array.
 *
 * @param bytes - Source byte array
 * @param token - Byte token to search
 * @returns Index or -1 when not found
 */
function findTokenIndex(bytes: Uint8Array, token: Uint8Array): number {
	for (let index = 0; index <= bytes.length - token.length; index += 1) {
		let matched = true;
		for (let tokenIndex = 0; tokenIndex < token.length; tokenIndex += 1) {
			if (bytes[index + tokenIndex] !== token[tokenIndex]) {
				matched = false;
				break;
			}
		}
		if (matched) {
			return index;
		}
	}
	return -1;
}

/**
 * Extracts and inflates the first Flate-compressed PDF stream.
 *
 * @param bytes - PDF byte array
 * @returns Decoded stream text
 */
function decodeFirstFlateStream(bytes: Uint8Array): string {
	const streamToken = new TextEncoder().encode('stream\n');
	const endStreamToken = new TextEncoder().encode('\nendstream');
	const streamIndex = findTokenIndex(bytes, streamToken);
	if (streamIndex === -1) {
		throw new Error('PDF stream token was not found.');
	}
	const streamStart = streamIndex + streamToken.length;
	const streamEnd = findTokenIndex(bytes.slice(streamStart), endStreamToken);
	if (streamEnd === -1) {
		throw new Error('PDF endstream token was not found.');
	}
	const compressed = bytes.slice(streamStart, streamStart + streamEnd);
	const inflated = inflateSync(compressed);
	return new TextDecoder('latin1').decode(inflated);
}

/**
 * Encodes plain text into uppercase hexadecimal representation.
 *
 * @param value - Plain text
 * @returns Hexadecimal text
 */
function encodeTextToHex(value: string): string {
	return Array.from(value)
		.map((character) => character.charCodeAt(0).toString(16).padStart(2, '0'))
		.join('')
		.toUpperCase();
}

/**
 * Builds a minimal translator for receipt copy.
 *
 * @returns Translation function for PDF content
 */
function createTranslator(): TranslateFn {
	const translations: Record<string, string> = {
		title: 'Recibo de nómina',
		placeholder: '—',
		dateFormat: 'dd/MM/yyyy',
		total: 'Total',
		lineItems: 'lineItems',
		netReceived: 'Neto recibido',
		organizationFallback: 'tu organización',
		receiptMessage: 'Recibo emitido para {organization} del periodo {period}.',
		signature: 'Firma',
		'paymentMethods.cash': 'Efectivo (100%)',
		'summary.title': 'Resumen fiscal',
		'summary.rows.companyCost': 'Tu trabajo vale para la empresa',
		'summary.rows.grossPay': 'La empresa te paga',
		'summary.rows.fiscalGrossPay': 'Percepciones gravadas fiscales',
		'summary.rows.complementPay': 'Complemento',
		'summary.rows.totalRealPay': 'Total percepciones',
		'summary.rows.employerCosts': 'La empresa le paga al gobierno por tu cuenta',
		'summary.rows.employeeWithholdings': 'Después, el gobierno te quita',
		'summary.rows.netPay': 'Te quedan',
		'details.employee': 'Empleado: {value}',
		'details.code': 'Clave: {value}',
		'details.nss': 'NSS: {value}',
		'details.rfc': 'RFC: {value}',
		'details.period': 'Periodo: {value}',
		'details.paymentDate': 'Fecha de pago: {value}',
		'details.paymentMethod': 'Forma de pago: {value}',
		'details.cardPayment': 'Pago tarjeta: {value}',
		'income.title': 'Ingresos',
		'income.lines.normalSalary': 'Sueldo normal',
		'income.lines.overtimeDouble': 'Horas extra dobles',
		'income.lines.overtimeTriple': 'Horas extra triples',
		'income.lines.sundayPremium': 'Prima dominical',
		'income.lines.mandatoryRestDay': 'Descanso obligatorio',
		'income.lines.vacations': 'Vacaciones',
		'income.lines.vacationPremium': 'Prima vacacional',
		'income.lines.seventhDay': 'Séptimo día',
		'income.lines.fallbackSalary': 'Sueldo base',
		'deductions.title': 'Descuentos',
		'deductions.lines.isr': 'ISR',
		'deductions.lines.imss': 'IMSS',
		'deductions.lines.infonavit': 'INFONAVIT',
		'lineItems.empty': 'Sin conceptos',
	};

	return (key, values) => {
		const template = translations[key] ?? key;
		if (!values) {
			return template;
		}
		return Object.entries(values).reduce(
			(result, [placeholder, value]) => result.replaceAll(`{${placeholder}}`, String(value)),
			template,
		);
	};
}

describe('buildPayrollReceiptPdf', () => {
	it('renders dual payroll summary rows when fiscal gross pay is present', async () => {
		const pdfBytes = await buildPayrollReceiptPdf({
			run: buildRun(),
			employee: buildEmployee({
				fiscalGrossPay: 1320,
				complementPay: 420,
				totalRealPay: 1740,
			}),
			organizationName: 'SEN CheckIn',
			t: createTranslator(),
		});

		const inflatedStream = decodeFirstFlateStream(pdfBytes);
		expect(readPdfHeader(pdfBytes)).toBe('%PDF-');
		expect(pdfBytes.length).toBeGreaterThan(500);
		expect(inflatedStream).toContain(
			`<${encodeTextToHex('Percepciones gravadas fiscales')}>`,
		);
		expect(inflatedStream).toContain(`<${encodeTextToHex('Complemento')}>`);
		expect(inflatedStream).toContain(`<${encodeTextToHex('Total percepciones')}>`);
		expect(inflatedStream).not.toContain(`<${encodeTextToHex('La empresa te paga')}>`);
	});

	it('keeps the single gross pay row when fiscal gross pay is absent', async () => {
		const pdfBytes = await buildPayrollReceiptPdf({
			run: buildRun(),
			employee: buildEmployee({
				fiscalGrossPay: null,
				complementPay: null,
				totalRealPay: null,
			}),
			organizationName: 'SEN CheckIn',
			t: createTranslator(),
		});

		const inflatedStream = decodeFirstFlateStream(pdfBytes);
		expect(inflatedStream).toContain(`<${encodeTextToHex('La empresa te paga')}>`);
		expect(inflatedStream).not.toContain(
			`<${encodeTextToHex('Percepciones gravadas fiscales')}>`,
		);
		expect(inflatedStream).not.toContain(`<${encodeTextToHex('Complemento')}>`);
		expect(inflatedStream).not.toContain(`<${encodeTextToHex('Total percepciones')}>`);
	});
});
