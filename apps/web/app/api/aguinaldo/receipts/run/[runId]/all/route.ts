import JSZip from 'jszip';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';

import { getAdminAccessContext } from '@/lib/organization-context';
import { buildAguinaldoReceiptPdf } from '@/lib/payroll-receipts/build-aguinaldo-receipt-pdf';
import {
	buildAguinaldoReceiptFileName,
	buildAguinaldoReceiptsZipFileName,
} from '@/lib/payroll-receipts/receipt-file-names';
import { fetchAguinaldoRunDetailServer } from '@/lib/server-client-functions';
import type { AguinaldoRun, AguinaldoRunEmployee } from '@/lib/client-functions';

const CACHE_CONTROL_HEADER = 'no-store';

type RouteParams = {
	runId: string;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Builds a ZIP response with download headers.
 *
 * @param zipBytes - Serialized ZIP content
 * @param fileName - Suggested download filename
 * @returns NextResponse with ZIP payload
 */
function buildZipResponse(zipBytes: ArrayBuffer, fileName: string): NextResponse {
	return new NextResponse(zipBytes, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${fileName}"`,
			'Cache-Control': CACHE_CONTROL_HEADER,
		},
	});
}

/**
 * Ensures filenames are unique by appending an index when needed.
 *
 * @param fileName - Base filename to check
 * @param usedNames - Set of filenames already used
 * @returns Unique filename safe to add to the ZIP
 */
function resolveUniqueFileName(fileName: string, usedNames: Set<string>): string {
	if (!usedNames.has(fileName)) {
		usedNames.add(fileName);
		return fileName;
	}

	const extensionIndex = fileName.lastIndexOf('.');
	const baseName = extensionIndex >= 0 ? fileName.slice(0, extensionIndex) : fileName;
	const extension = extensionIndex >= 0 ? fileName.slice(extensionIndex) : '';

	let counter = 2;
	let candidate = `${baseName}_${counter}${extension}`;
	while (usedNames.has(candidate)) {
		counter += 1;
		candidate = `${baseName}_${counter}${extension}`;
	}

	usedNames.add(candidate);
	return candidate;
}

/**
 * Resolves the cookie header from the incoming request.
 *
 * @returns Cookie header string or empty string
 */
async function resolveCookieHeader(): Promise<string> {
	const requestHeaders = await headers();
	return requestHeaders.get('cookie') ?? '';
}

/**
 * Generates ZIP content containing aguinaldo receipt PDFs.
 *
 * @param args - ZIP creation inputs
 * @param args.run - Aguinaldo run metadata
 * @param args.employees - Aguinaldo run employees
 * @param args.organizationName - Optional organization name for PDF headers
 * @param args.t - Translation helper for receipt labels
 * @returns Buffer containing ZIP archive
 */
async function buildAguinaldoReceiptsZip(args: {
	run: AguinaldoRun;
	employees: AguinaldoRunEmployee[];
	organizationName?: string | null;
	t: (key: string, values?: Record<string, string | number>) => string;
}): Promise<ArrayBuffer> {
	const zip = new JSZip();
	const usedFileNames = new Set<string>();

	await Promise.all(
		args.employees.map(async (employee) => {
			const resolvedEmployeeCode =
				employee.employeeCode?.trim() ||
				((employee.employeeId ?? employee.id)
					? `empleado-${employee.employeeId ?? employee.id}`
					: '');
			const baseFileName = buildAguinaldoReceiptFileName({
				employeeCode: resolvedEmployeeCode,
				employeeId: employee.employeeId ?? employee.id,
				calendarYear: args.run.calendarYear,
			});
			const fileName = resolveUniqueFileName(baseFileName, usedFileNames);
			const pdfBytes = await buildAguinaldoReceiptPdf({
				run: args.run,
				employee,
				organizationName: args.organizationName ?? undefined,
				t: args.t,
			});
			zip.file(fileName, pdfBytes);
		}),
	);

	return zip.generateAsync({ type: 'arraybuffer' });
}

/**
 * Generates a ZIP of aguinaldo receipts for a run.
 *
 * @param _request - Incoming request
 * @param context - Route params context
 * @returns ZIP response containing all receipts
 */
export async function GET(
	_request: Request,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	const [adminContext, cookieHeader, resolvedParams, t] = await Promise.all([
		getAdminAccessContext(),
		resolveCookieHeader(),
		context.params,
		getTranslations('Aguinaldo.receiptPdf'),
	]);

	if (!adminContext.canAccessAdminRoutes) {
		return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
	}

	const { runId } = resolvedParams;
	const detail = await fetchAguinaldoRunDetailServer(cookieHeader, runId);

	if (!detail) {
		return NextResponse.json({ error: 'AGUINALDO_RUN_NOT_FOUND' }, { status: 404 });
	}

	if (detail.run.status !== 'PROCESSED') {
		return NextResponse.json({ error: 'AGUINALDO_RUN_NOT_PROCESSED' }, { status: 409 });
	}

	if (detail.employees.length === 0) {
		return NextResponse.json({ error: 'NO_EMPLOYEES' }, { status: 404 });
	}

	const zipBytes = await buildAguinaldoReceiptsZip({
		run: detail.run,
		employees: detail.employees,
		organizationName: adminContext.organization?.organizationName ?? undefined,
		t,
	});

	const fileName = buildAguinaldoReceiptsZipFileName(detail.run.calendarYear);

	return buildZipResponse(zipBytes, fileName);
}
