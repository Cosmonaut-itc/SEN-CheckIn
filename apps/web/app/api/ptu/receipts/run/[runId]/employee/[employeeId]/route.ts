import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';

import { getActiveOrganizationContext } from '@/lib/organization-context';
import { buildPtuReceiptPdf } from '@/lib/payroll-receipts/build-ptu-receipt-pdf';
import { buildPtuReceiptFileName } from '@/lib/payroll-receipts/receipt-file-names';
import { fetchPtuRunDetailServer } from '@/lib/server-client-functions';

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
 * Generates a PTU receipt PDF for a single employee.
 *
 * @param _request - Incoming request
 * @param context - Route params context
 * @returns PDF response for the requested employee
 */
export async function GET(
	_request: Request,
	context: { params: RouteParams | Promise<RouteParams> },
): Promise<NextResponse> {
	const [organizationContext, cookieHeader, resolvedParams, t] = await Promise.all([
		getActiveOrganizationContext(),
		resolveCookieHeader(),
		context.params,
		getTranslations('Ptu.receiptPdf'),
	]);

	const { runId, employeeId } = resolvedParams;
	const detail = await fetchPtuRunDetailServer(cookieHeader, runId);

	if (!detail) {
		return NextResponse.json({ error: 'PTU_RUN_NOT_FOUND' }, { status: 404 });
	}

	if (detail.run.status !== 'PROCESSED') {
		return NextResponse.json({ error: 'PTU_RUN_NOT_PROCESSED' }, { status: 409 });
	}

	const employee = detail.employees.find((entry) => entry.employeeId === employeeId);
	if (!employee) {
		return NextResponse.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });
	}

	const pdfBytes = await buildPtuReceiptPdf({
		run: detail.run,
		employee,
		organizationName: organizationContext.organizationName ?? undefined,
		t,
	});

	const resolvedEmployeeCode =
		employee.employeeCode?.trim() ||
		((employee.employeeId ?? employee.id)
			? `empleado-${employee.employeeId ?? employee.id}`
			: '');
	const fileName = buildPtuReceiptFileName({
		employeeCode: resolvedEmployeeCode,
		employeeId: employee.employeeId ?? employee.id,
		fiscalYear: detail.run.fiscalYear,
	});

	return buildPdfResponse(pdfBytes, fileName);
}
