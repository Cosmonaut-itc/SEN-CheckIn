import { format } from 'date-fns';

const FILE_PART_FALLBACK = 'sin-dato';
const FILE_SAFE_PATTERN = /[^a-zA-Z0-9_-]+/g;

/**
 * Formats a Date instance into a YYYY-MM-DD date key.
 *
 * @param value - Date to format
 * @returns Date key string
 */
export function formatDateKey(value: Date): string {
	return format(value, 'yyyy-MM-dd');
}

/**
 * Sanitizes a string for safe filename usage.
 *
 * @param value - Raw value to sanitize
 * @param fallback - Fallback value when input is empty
 * @returns Sanitized filename-safe token
 */
export function sanitizeFileNamePart(value: string, fallback = FILE_PART_FALLBACK): string {
	const trimmed = value.trim();
	if (!trimmed) {
		return fallback;
	}
	const sanitized = trimmed.replace(FILE_SAFE_PATTERN, '-');
	const collapsed = sanitized.replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '');
	return collapsed || fallback;
}

/**
 * Builds a filename for a single payroll receipt PDF.
 *
 * @param args - File name inputs
 * @param args.employeeCode - Employee code used in the filename
 * @param args.employeeId - Employee identifier used as a fallback for uniqueness
 * @param args.periodStart - Payroll period start date
 * @param args.periodEnd - Payroll period end date
 * @returns Payroll receipt filename
 */
export function buildPayrollReceiptFileName(args: {
	employeeCode?: string | null;
	employeeId?: string | null;
	periodStart: Date;
	periodEnd: Date;
}): string {
	const codePart = sanitizeFileNamePart(args.employeeCode ?? '', '');
	const idPart = sanitizeFileNamePart(args.employeeId ?? '', '');
	const identifier = codePart || (idPart ? `empleado-${idPart.slice(0, 8)}` : 'empleado');
	const startKey = formatDateKey(args.periodStart);
	const endKey = formatDateKey(args.periodEnd);
	return `recibo_nomina_${identifier}_${startKey}_${endKey}.pdf`;
}

/**
 * Builds a filename for the payroll receipts ZIP archive.
 *
 * @param periodStart - Payroll period start date
 * @param periodEnd - Payroll period end date
 * @returns ZIP filename for payroll receipts
 */
export function buildPayrollReceiptsZipFileName(periodStart: Date, periodEnd: Date): string {
	const startKey = formatDateKey(periodStart);
	const endKey = formatDateKey(periodEnd);
	return `recibos_nomina_${startKey}_${endKey}.zip`;
}

/**
 * Builds a filename for a termination receipt PDF.
 *
 * @param args - File name inputs
 * @param args.employeeCode - Employee code used in the filename
 * @param args.createdAt - Settlement creation date
 * @returns Termination receipt filename
 */
export function buildTerminationReceiptFileName(args: {
	employeeCode?: string | null;
	createdAt: Date;
}): string {
	const codePart = sanitizeFileNamePart(args.employeeCode ?? '', 'empleado');
	const dateKey = formatDateKey(args.createdAt);
	return `recibo_baja_${codePart}_${dateKey}.pdf`;
}
