import crypto from 'node:crypto';

/**
 * Minimal employee identity payload required by legal document variables.
 */
export interface LegalDocumentEmployeeSnapshotInput {
	firstName: string;
	lastName: string;
	code: string;
	rfc: string | null;
	nss: string | null;
	jobPositionName: string | null;
	locationName: string | null;
	hireDate: Date | null;
}

/**
 * Converts nullable date values to date keys.
 *
 * @param value - Date value
 * @returns Date key in YYYY-MM-DD format or null
 */
function toDateKey(value: Date | null): string | null {
	if (!value) {
		return null;
	}
	return value.toISOString().slice(0, 10);
}

/**
 * Resolves today's date key in UTC.
 *
 * @returns Current date in YYYY-MM-DD format
 */
function getTodayDateKey(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Resolves a long date label in Spanish for legal documents.
 *
 * @returns Date label (e.g. "9 de febrero de 2026")
 */
function getTodayDateLongLabel(): string {
	return new Intl.DateTimeFormat('es-MX', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'America/Mexico_City',
	}).format(new Date());
}

/**
 * Resolves a short time label in Spanish for legal documents.
 *
 * @returns Time label in 12h format (e.g. "11:00 am")
 */
function getCurrentTimeLabel(): string {
	const value = new Intl.DateTimeFormat('es-MX', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: true,
		timeZone: 'America/Mexico_City',
	})
		.format(new Date())
		.toLowerCase();

	return value
		.replace('a. m.', 'am')
		.replace('p. m.', 'pm')
		.replace('a.m.', 'am')
		.replace('p.m.', 'pm');
}

/**
 * Builds the default employee/document variable snapshot used by legal templates.
 *
 * @param employeeRecord - Employee data source
 * @returns Variable snapshot for template rendering
 */
export function buildDefaultLegalVariablesSnapshot(
	employeeRecord: LegalDocumentEmployeeSnapshotInput,
): Record<string, unknown> {
	return {
		employee: {
			fullName: `${employeeRecord.firstName} ${employeeRecord.lastName}`.trim(),
			code: employeeRecord.code,
			rfc: employeeRecord.rfc,
			nss: employeeRecord.nss,
			jobPositionName: employeeRecord.jobPositionName,
			locationName: employeeRecord.locationName,
			hireDate: toDateKey(employeeRecord.hireDate),
		},
		document: {
			generatedDate: getTodayDateKey(),
			generatedDateLong: getTodayDateLongLabel(),
			generatedTimeLabel: getCurrentTimeLabel(),
		},
	};
}

/**
 * Escapes HTML-sensitive characters.
 *
 * @param value - Raw text value
 * @returns HTML-safe text
 */
function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/**
 * Flattens a nested variables snapshot into token/value pairs.
 *
 * @param snapshot - Variables snapshot
 * @returns Flat map where keys are token placeholders
 */
export function flattenTemplateVariables(snapshot: Record<string, unknown>): Record<string, string> {
	const values: Record<string, string> = {};

	/**
	 * Recursive walker for nested records.
	 *
	 * @param prefix - Nested key prefix
	 * @param value - Current nested value
	 * @returns Nothing
	 */
	const walk = (prefix: string, value: unknown): void => {
		if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			for (const [nestedKey, nestedValue] of Object.entries(
				value as Record<string, unknown>,
			)) {
				const nextPrefix = prefix ? `${prefix}.${nestedKey}` : nestedKey;
				walk(nextPrefix, nestedValue);
			}
			return;
		}
		if (!prefix) {
			return;
		}

		values[`{{${prefix}}}`] =
			value === null || value === undefined ? '' : escapeHtml(String(value));
	};

	walk('', snapshot);
	return values;
}

/**
 * Renders legal HTML by replacing known template tokens.
 *
 * @param htmlContent - Raw template HTML
 * @param variables - Variables snapshot
 * @returns Rendered HTML with escaped token values
 */
export function renderLegalHtml(
	htmlContent: string,
	variables: Record<string, unknown>,
): string {
	const flattened = flattenTemplateVariables(variables);
	let rendered = htmlContent;

	for (const [token, value] of Object.entries(flattened)) {
		rendered = rendered.split(token).join(value);
	}

	return rendered;
}

/**
 * Computes a SHA-256 hash in hexadecimal format.
 *
 * @param value - Input text
 * @returns SHA-256 digest
 */
export function sha256Hex(value: string): string {
	return crypto.createHash('sha256').update(value).digest('hex');
}
