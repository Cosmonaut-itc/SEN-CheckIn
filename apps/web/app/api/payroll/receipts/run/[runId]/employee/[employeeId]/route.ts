import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';

import { getAdminAccessContext } from '@/lib/organization-context';
import { buildPayrollReceiptPdf } from '@/lib/payroll-receipts/build-payroll-receipt-pdf';
import { buildPayrollReceiptFileName } from '@/lib/payroll-receipts/receipt-file-names';
import { fetchPayrollRunDetailServer } from '@/lib/server-client-functions';

const CACHE_CONTROL_HEADER = 'no-store';

type RouteParams = {
	runId: string;
	employeeId: string;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Builds a PDF response with download headers.
 *
 * @param pdfBytes - Serialized PDF content
 * @param fileName - Suggested download filename
 * @returns NextResponse with PDF payload
 */
function buildPdfResponse(pdfBytes: Uint8Array, fileName: string): NextResponse {
	return new NextResponse(Buffer.from(pdfBytes), {
		headers: {
			'Content-Type': 'application/pdf',
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
 * Generates a payroll receipt PDF for a single employee.
 *
 * @param _request - Incoming request
 * @param context - Route params context
 * @returns PDF response for the requested employee
 */
export async function GET(
	_request: Request,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	const [adminContext, cookieHeader, resolvedParams, t] = await Promise.all([
		getAdminAccessContext(),
		resolveCookieHeader(),
		context.params,
		getTranslations('Payroll.receiptPdf'),
	]);

	if (!adminContext.canAccessAdminRoutes) {
		return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
	}

	const { runId, employeeId } = resolvedParams;
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

	const employee = detail.employees.find((entry) => entry.employeeId === employeeId);
	if (!employee) {
		return NextResponse.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });
	}

	const pdfBytes = await buildPayrollReceiptPdf({
		run: detail.run,
		employee,
		organizationName: detail.run.organizationName ?? undefined,
		t,
	});

	const resolvedEmployeeCode =
		employee.employeeCode?.trim() ||
		(employee.employeeId ?? employee.id ? `empleado-${employee.employeeId ?? employee.id}` : '');
	const fileName = buildPayrollReceiptFileName({
		employeeCode: resolvedEmployeeCode,
		employeeId: employee.employeeId ?? employee.id,
		periodStart: detail.run.periodStart,
		periodEnd: detail.run.periodEnd,
	});

	return buildPdfResponse(pdfBytes, fileName);
}
