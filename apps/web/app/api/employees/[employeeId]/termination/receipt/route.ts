import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { getApiResponseData } from '@/lib/api-response';
import type {
	EmployeeLatestPayroll,
	EmployeeTerminationSettlementRecord,
	PayrollRunEmployee,
} from '@/lib/client-functions';
import { getAdminAccessContext } from '@/lib/organization-context';
import { buildTerminationReceiptPdf } from '@/lib/payroll-receipts/build-termination-receipt-pdf';
import { buildTerminationReceiptFileName } from '@/lib/payroll-receipts/receipt-file-names';
import { createServerApiClient, type ServerApiClient } from '@/lib/server-api';
import type { EmployeeTerminationSettlement } from '@sen-checkin/types';

const CACHE_CONTROL_HEADER = 'no-store';

type RouteParams = {
	employeeId: string;
};

type EmployeeSummary = {
	id: string;
	code: string;
	firstName: string;
	lastName: string;
	nss: string | null;
	rfc: string | null;
};

type TerminationSettlementPayload = Omit<
	EmployeeTerminationSettlementRecord,
	'totalsGross' | 'finiquitoTotalGross' | 'liquidacionTotalGross' | 'createdAt'
> & {
	calculation: EmployeeTerminationSettlement;
	totalsGross: number | string;
	finiquitoTotalGross: number | string;
	liquidacionTotalGross: number | string;
	createdAt: string | Date;
};

type EmployeeLatestPayrollPayload = Omit<
	EmployeeLatestPayroll,
	'periodStart' | 'periodEnd' | 'processedAt' | 'totalPay'
> & {
	periodStart: string | Date;
	periodEnd: string | Date;
	processedAt?: string | Date | null;
	totalPay?: number | string | null;
	taxBreakdown?: PayrollRunEmployee['taxBreakdown'];
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
 * Normalizes termination settlement payload values.
 *
 * @param record - Raw settlement payload
 * @returns Normalized settlement record
 */
function normalizeTerminationSettlement(
	record: TerminationSettlementPayload,
): EmployeeTerminationSettlementRecord {
	return {
		...record,
		totalsGross: Number(record.totalsGross ?? 0),
		finiquitoTotalGross: Number(record.finiquitoTotalGross ?? 0),
		liquidacionTotalGross: Number(record.liquidacionTotalGross ?? 0),
		createdAt: new Date(record.createdAt),
	};
}

/**
 * Normalizes latest payroll payload values.
 *
 * @param record - Raw latest payroll payload
 * @returns Normalized latest payroll data
 */
function normalizeEmployeeLatestPayroll(
	record: EmployeeLatestPayrollPayload,
): EmployeeLatestPayroll {
	return {
		payrollRunId: record.payrollRunId,
		periodStart: new Date(record.periodStart),
		periodEnd: new Date(record.periodEnd),
		paymentFrequency: record.paymentFrequency,
		processedAt: record.processedAt ? new Date(record.processedAt) : null,
		taxBreakdown: record.taxBreakdown,
		totalPay: Number(record.totalPay ?? 0),
	};
}

/**
 * Fetches a minimal employee summary for receipt generation.
 *
 * @param api - Server API client
 * @param employeeId - Employee identifier
 * @returns Employee summary or null when missing
 */
async function fetchEmployeeSummary(
	api: ServerApiClient,
	employeeId: string,
): Promise<EmployeeSummary | null> {
	const response = await api.employees[employeeId].get();
	if (response.error) {
		if (response.status === 404) {
			return null;
		}
		throw new Error('Failed to fetch employee');
	}
	const payload = getApiResponseData(response);
	const record = payload?.data as EmployeeSummary | undefined;
	return record ?? null;
}

/**
 * Fetches the latest termination settlement for an employee.
 *
 * @param api - Server API client
 * @param employeeId - Employee identifier
 * @returns Settlement record or null when missing
 */
async function fetchTerminationSettlement(
	api: ServerApiClient,
	employeeId: string,
): Promise<EmployeeTerminationSettlementRecord | null> {
	const response = await api.employees[employeeId].termination.settlement.get();
	if (response.error) {
		if (response.status === 404) {
			return null;
		}
		throw new Error('Failed to fetch termination settlement');
	}
	const payload = getApiResponseData(response);
	const record = payload?.data as TerminationSettlementPayload | undefined;
	return record ? normalizeTerminationSettlement(record) : null;
}

/**
 * Fetches the latest payroll run for an employee.
 *
 * @param api - Server API client
 * @param employeeId - Employee identifier
 * @returns Latest payroll data or null when missing
 */
async function fetchLatestPayroll(
	api: ServerApiClient,
	employeeId: string,
): Promise<EmployeeLatestPayroll | null> {
	const response = await api.employees[employeeId].payroll.latest.get();
	if (response.error) {
		if (response.status === 404) {
			return null;
		}
		throw new Error('Failed to fetch latest payroll');
	}
	const payload = getApiResponseData(response);
	const record = payload?.data as EmployeeLatestPayrollPayload | undefined;
	return record ? normalizeEmployeeLatestPayroll(record) : null;
}

/**
 * Generates a termination receipt PDF for an employee.
 *
 * @param _request - Incoming request
 * @param context - Route params context
 * @returns PDF response for termination receipt
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

	const { employeeId } = resolvedParams;
	const api = createServerApiClient(cookieHeader);

	let employeeSummary: EmployeeSummary | null = null;
	let settlement: EmployeeTerminationSettlementRecord | null = null;
	let latestPayroll: EmployeeLatestPayroll | null = null;

	try {
		[employeeSummary, settlement, latestPayroll] = await Promise.all([
			fetchEmployeeSummary(api, employeeId),
			fetchTerminationSettlement(api, employeeId),
			fetchLatestPayroll(api, employeeId),
		]);
	} catch (error) {
		console.error('[TerminationReceipt] Failed to fetch data', error);
		return NextResponse.json({ error: 'FETCH_FAILED' }, { status: 500 });
	}

	if (!employeeSummary) {
		return NextResponse.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });
	}

	if (!settlement) {
		return NextResponse.json({ error: 'SETTLEMENT_NOT_FOUND' }, { status: 404 });
	}

	const employeeName = `${employeeSummary.firstName} ${employeeSummary.lastName}`.trim();
	const pdfBytes = await buildTerminationReceiptPdf({
		employee: {
			name: employeeName || '—',
			code: employeeSummary.code ?? '',
			nss: employeeSummary.nss ?? null,
			rfc: employeeSummary.rfc ?? null,
		},
		settlement,
		latestPayroll,
		organizationName: adminContext.organization.organizationName ?? undefined,
	});

	const fileName = buildTerminationReceiptFileName({
		employeeCode: employeeSummary.code,
		createdAt: settlement.createdAt,
	});

	return buildPdfResponse(pdfBytes, fileName);
}
