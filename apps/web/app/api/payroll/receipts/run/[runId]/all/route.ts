import JSZip from 'jszip';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { getAdminAccessContext } from '@/lib/organization-context';
import { buildPayrollReceiptPdf } from '@/lib/payroll-receipts/build-payroll-receipt-pdf';
import {
	buildPayrollReceiptFileName,
	buildPayrollReceiptsZipFileName,
} from '@/lib/payroll-receipts/receipt-file-names';
import { fetchPayrollRunDetailServer } from '@/lib/server-client-functions';
import type { PayrollRun, PayrollRunEmployee } from '@/lib/client-functions';

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
 * Resolves the cookie header from the incoming request.
 *
 * @returns Cookie header string or empty string
 */
async function resolveCookieHeader(): Promise<string> {
	const requestHeaders = await headers();
	return requestHeaders.get('cookie') ?? '';
}

/**
 * Generates ZIP content containing payroll receipt PDFs.
 *
 * @param args - ZIP creation inputs
 * @param args.run - Payroll run metadata
 * @param args.employees - Payroll run employees
 * @param args.organizationName - Optional organization name for PDF headers
 * @returns Buffer containing ZIP archive
 */
async function buildPayrollReceiptsZip(args: {
	run: PayrollRun;
	employees: PayrollRunEmployee[];
	organizationName?: string | null;
}): Promise<ArrayBuffer> {
	const zip = new JSZip();

	await Promise.all(
		args.employees.map(async (employee) => {
			const pdfBytes = await buildPayrollReceiptPdf({
				run: args.run,
				employee,
				organizationName: args.organizationName ?? undefined,
			});
			const fileName = buildPayrollReceiptFileName({
				employeeCode: employee.employeeCode,
				periodStart: args.run.periodStart,
				periodEnd: args.run.periodEnd,
			});
			zip.file(fileName, pdfBytes);
		}),
	);

	return zip.generateAsync({ type: 'arraybuffer' });
}

/**
 * Generates a ZIP of payroll receipts for a run.
 *
 * @param _request - Incoming request
 * @param context - Route params context
 * @returns ZIP response containing all receipts
 */
export async function GET(
	_request: Request,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	const [adminContext, cookieHeader, resolvedParams] = await Promise.all([
		getAdminAccessContext(),
		resolveCookieHeader(),
		context.params,
	]);

	if (!adminContext.canAccessAdminRoutes) {
		return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
	}

	const { runId } = resolvedParams;
	const detail = await fetchPayrollRunDetailServer(cookieHeader, runId);

	if (!detail) {
		return NextResponse.json({ error: 'PAYROLL_RUN_NOT_FOUND' }, { status: 404 });
	}

	if (detail.run.status !== 'PROCESSED') {
		return NextResponse.json(
			{ error: 'PAYROLL_RUN_NOT_PROCESSED' },
			{ status: 409 },
		);
	}

	if (detail.employees.length === 0) {
		return NextResponse.json({ error: 'NO_EMPLOYEES' }, { status: 404 });
	}

	const zipBytes = await buildPayrollReceiptsZip({
		run: detail.run,
		employees: detail.employees,
		organizationName: adminContext.organization.organizationName ?? undefined,
	});

	const fileName = buildPayrollReceiptsZipFileName(
		detail.run.periodStart,
		detail.run.periodEnd,
	);

	return buildZipResponse(zipBytes, fileName);
}
