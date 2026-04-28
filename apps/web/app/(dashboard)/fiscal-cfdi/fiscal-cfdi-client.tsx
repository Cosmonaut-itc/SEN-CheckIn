'use client';

import React, { useMemo, useState } from 'react';
import { FileCheck2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	fetchEmployeeFiscalProfile,
	fetchOrganizationFiscalProfile,
	fetchPayrollFiscalPreflight,
	preparePayrollFiscalVouchers,
	saveEmployeeFiscalProfile,
	saveOrganizationFiscalProfile,
	type PayrollFiscalPreflightResult,
} from '@/lib/fiscal-profiles';
import { useOrgContext } from '@/lib/org-client-context';

export type FiscalPreflightViewModel = PayrollFiscalPreflightResult;

type OrganizationFiscalForm = {
	legalName: string;
	rfc: string;
	fiscalRegimeCode: string;
	expeditionPostalCode: string;
	employerRegistrationNumber: string;
	payrollCfdiSeries: string;
	csdCertificateSerial: string;
	pacProvider: string;
};

type EmployeeFiscalForm = {
	satName: string;
	rfc: string;
	curp: string;
	socialSecurityNumber: string;
	fiscalPostalCode: string;
	contractTypeCode: string;
	workdayTypeCode: string;
	payrollRegimeTypeCode: string;
	employmentStartDateKey: string;
	paymentFrequencyCode: string;
	riskPositionCode: string;
	salaryBaseContribution: string;
	integratedDailySalary: string;
	federalEntityCode: string;
};

const emptyOrganizationForm: OrganizationFiscalForm = {
	legalName: '',
	rfc: '',
	fiscalRegimeCode: '',
	expeditionPostalCode: '',
	employerRegistrationNumber: '',
	payrollCfdiSeries: '',
	csdCertificateSerial: '',
	pacProvider: '',
};

const emptyEmployeeForm: EmployeeFiscalForm = {
	satName: '',
	rfc: '',
	curp: '',
	socialSecurityNumber: '',
	fiscalPostalCode: '',
	contractTypeCode: '',
	workdayTypeCode: '',
	payrollRegimeTypeCode: '',
	employmentStartDateKey: '',
	paymentFrequencyCode: '',
	riskPositionCode: '',
	salaryBaseContribution: '',
	integratedDailySalary: '',
	federalEntityCode: '',
};

/**
 * Converts nullish API values into input-safe strings.
 *
 * @param value - Unknown source value
 * @returns String value or empty string
 */
function toInputValue(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/**
 * Builds an organization fiscal form from an API profile.
 *
 * @param value - API profile payload
 * @returns Form state
 */
function buildOrganizationForm(value: unknown): OrganizationFiscalForm {
	const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	return {
		legalName: toInputValue(record.legalName),
		rfc: toInputValue(record.rfc),
		fiscalRegimeCode: toInputValue(record.fiscalRegimeCode),
		expeditionPostalCode: toInputValue(record.expeditionPostalCode),
		employerRegistrationNumber: toInputValue(record.employerRegistrationNumber),
		payrollCfdiSeries: toInputValue(record.payrollCfdiSeries),
		csdCertificateSerial: toInputValue(record.csdCertificateSerial),
		pacProvider: toInputValue(record.pacProvider),
	};
}

/**
 * Builds an employee fiscal form from an API profile.
 *
 * @param value - API profile payload
 * @returns Form state
 */
function buildEmployeeForm(value: unknown): EmployeeFiscalForm {
	const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	return {
		satName: toInputValue(record.satName),
		rfc: toInputValue(record.rfc),
		curp: toInputValue(record.curp),
		socialSecurityNumber: toInputValue(record.socialSecurityNumber),
		fiscalPostalCode: toInputValue(record.fiscalPostalCode),
		contractTypeCode: toInputValue(record.contractTypeCode),
		workdayTypeCode: toInputValue(record.workdayTypeCode),
		payrollRegimeTypeCode: toInputValue(record.payrollRegimeTypeCode),
		employmentStartDateKey: toInputValue(record.employmentStartDateKey),
		paymentFrequencyCode: toInputValue(record.paymentFrequencyCode),
		riskPositionCode: toInputValue(record.riskPositionCode),
		salaryBaseContribution: toInputValue(record.salaryBaseContribution),
		integratedDailySalary: toInputValue(record.integratedDailySalary),
		federalEntityCode: toInputValue(record.federalEntityCode),
	};
}

/**
 * Fiscal CFDI master-data client page.
 *
 * @param props - Optional initial preflight for tests/server composition
 * @returns Fiscal CFDI admin UI
 */
export function FiscalCfdiClient(props: {
	initialPreflight?: FiscalPreflightViewModel | null;
}): React.ReactElement {
	const t = useTranslations('FiscalCfdi');
	const { organizationId } = useOrgContext();
	const [organizationForm, setOrganizationForm] =
		useState<OrganizationFiscalForm>(emptyOrganizationForm);
	const [employeeForm, setEmployeeForm] = useState<EmployeeFiscalForm>(emptyEmployeeForm);
	const [employeeId, setEmployeeId] = useState('');
	const [payrollRunId, setPayrollRunId] = useState('');
	const [preflight, setPreflight] = useState<FiscalPreflightViewModel | null>(
		props.initialPreflight ?? null,
	);
	const [isBusy, setIsBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const preflightStatus = preflight?.canPrepareFiscalVouchers ? 'READY' : 'BLOCKED';
	const preflightIssues = useMemo(
		() => [
			...(preflight?.organizationIssues ?? []),
			...(preflight?.employeeResults.flatMap((employee) => employee.issues) ?? []),
		],
		[preflight],
	);

	/**
	 * Updates organization fiscal form state.
	 *
	 * @param field - Field name
	 * @param value - New value
	 * @returns void
	 */
	function updateOrganizationField(field: keyof OrganizationFiscalForm, value: string): void {
		setOrganizationForm((current) => ({ ...current, [field]: value }));
	}

	/**
	 * Updates employee fiscal form state.
	 *
	 * @param field - Field name
	 * @param value - New value
	 * @returns void
	 */
	function updateEmployeeField(field: keyof EmployeeFiscalForm, value: string): void {
		setEmployeeForm((current) => ({ ...current, [field]: value }));
	}

	/**
	 * Loads organization fiscal profile.
	 *
	 * @returns Promise that resolves when loading completes
	 */
	async function loadOrganizationProfile(): Promise<void> {
		if (!organizationId) {
			return;
		}
		setIsBusy(true);
		try {
			const data = await fetchOrganizationFiscalProfile(organizationId);
			setOrganizationForm(buildOrganizationForm(data));
			setMessage(t('messages.loaded'));
		} catch {
			setMessage(t('messages.loadError'));
		} finally {
			setIsBusy(false);
		}
	}

	/**
	 * Saves organization fiscal profile.
	 *
	 * @returns Promise that resolves when saving completes
	 */
	async function saveOrganizationProfile(): Promise<void> {
		if (!organizationId) {
			return;
		}
		setIsBusy(true);
		try {
			await saveOrganizationFiscalProfile({
				organizationId,
				...organizationForm,
			});
			setMessage(t('messages.saved'));
		} catch {
			setMessage(t('messages.saveError'));
		} finally {
			setIsBusy(false);
		}
	}

	/**
	 * Loads employee fiscal profile.
	 *
	 * @returns Promise that resolves when loading completes
	 */
	async function loadEmployeeProfile(): Promise<void> {
		if (!employeeId.trim()) {
			return;
		}
		setIsBusy(true);
		try {
			const data = await fetchEmployeeFiscalProfile(employeeId.trim());
			setEmployeeForm(buildEmployeeForm(data));
			setMessage(t('messages.loaded'));
		} catch {
			setMessage(t('messages.loadError'));
		} finally {
			setIsBusy(false);
		}
	}

	/**
	 * Saves employee fiscal profile.
	 *
	 * @returns Promise that resolves when saving completes
	 */
	async function saveEmployeeProfile(): Promise<void> {
		if (!employeeId.trim()) {
			return;
		}
		setIsBusy(true);
		try {
			await saveEmployeeFiscalProfile({
				employeeId: employeeId.trim(),
				...employeeForm,
			});
			setMessage(t('messages.saved'));
		} catch {
			setMessage(t('messages.saveError'));
		} finally {
			setIsBusy(false);
		}
	}

	/**
	 * Loads fiscal preflight for a payroll run.
	 *
	 * @returns Promise that resolves when loading completes
	 */
	async function loadPreflight(): Promise<void> {
		if (!payrollRunId.trim()) {
			return;
		}
		setIsBusy(true);
		try {
			const data = await fetchPayrollFiscalPreflight(payrollRunId.trim());
			setPreflight(data);
			setMessage(t('messages.loaded'));
		} catch {
			setMessage(t('messages.loadError'));
		} finally {
			setIsBusy(false);
		}
	}

	/**
	 * Prepares fiscal vouchers for a payroll run.
	 *
	 * @returns Promise that resolves when preparation completes
	 */
	async function prepareFiscalVouchers(): Promise<void> {
		if (!payrollRunId.trim() || !preflight?.canPrepareFiscalVouchers) {
			return;
		}
		setIsBusy(true);
		try {
			await preparePayrollFiscalVouchers(payrollRunId.trim());
			setMessage(t('messages.prepared'));
		} catch {
			setMessage(t('messages.prepareError'));
		} finally {
			setIsBusy(false);
		}
	}

	return (
		<div className="min-w-0 space-y-6 overflow-x-hidden" data-testid="fiscal-cfdi-page-root">
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<FileCheck2 className="h-5 w-5 text-primary" aria-hidden="true" />
					<h1 className="text-2xl font-semibold tracking-normal">{t('title')}</h1>
				</div>
				<p className="max-w-3xl text-sm text-muted-foreground">{t('subtitle')}</p>
				{message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{t('organization.title')}</CardTitle>
					<CardDescription>{t('organization.description')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						{(
							[
								'legalName',
								'rfc',
								'fiscalRegimeCode',
								'expeditionPostalCode',
								'employerRegistrationNumber',
								'payrollCfdiSeries',
								'csdCertificateSerial',
								'pacProvider',
							] as const
						).map((field) => (
							<div key={field} className="space-y-2">
								<Label htmlFor={`organization-${field}`}>
									{t(`organization.fields.${field}`)}
								</Label>
								<Input
									id={`organization-${field}`}
									value={organizationForm[field]}
									onChange={(event) =>
										updateOrganizationField(field, event.target.value)
									}
								/>
							</div>
						))}
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={loadOrganizationProfile}
							disabled={isBusy}
						>
							{t('actions.load')}
						</Button>
						<Button type="button" onClick={saveOrganizationProfile} disabled={isBusy}>
							{t('actions.save')}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('employee.title')}</CardTitle>
					<CardDescription>{t('employee.description')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="max-w-md space-y-2">
						<Label htmlFor="employee-id">{t('employee.employeeId')}</Label>
						<Input
							id="employee-id"
							value={employeeId}
							onChange={(event) => setEmployeeId(event.target.value)}
						/>
					</div>
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						{(
							[
								'satName',
								'rfc',
								'curp',
								'socialSecurityNumber',
								'fiscalPostalCode',
								'contractTypeCode',
								'workdayTypeCode',
								'payrollRegimeTypeCode',
								'employmentStartDateKey',
								'paymentFrequencyCode',
								'riskPositionCode',
								'salaryBaseContribution',
								'integratedDailySalary',
								'federalEntityCode',
							] as const
						).map((field) => (
							<div key={field} className="space-y-2">
								<Label htmlFor={`employee-${field}`}>
									{t(`employee.fields.${field}`)}
								</Label>
								<Input
									id={`employee-${field}`}
									value={employeeForm[field]}
									onChange={(event) =>
										updateEmployeeField(field, event.target.value)
									}
								/>
							</div>
						))}
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={loadEmployeeProfile}
							disabled={isBusy}
						>
							{t('actions.load')}
						</Button>
						<Button type="button" onClick={saveEmployeeProfile} disabled={isBusy}>
							{t('actions.save')}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('preflight.title')}</CardTitle>
					<CardDescription>{t('preflight.description')}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="max-w-md space-y-2">
						<Label htmlFor="payroll-run-id">{t('preflight.payrollRunId')}</Label>
						<Input
							id="payroll-run-id"
							value={payrollRunId}
							onChange={(event) => setPayrollRunId(event.target.value)}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<Badge
							variant={
								preflight?.canPrepareFiscalVouchers ? 'success' : 'destructive'
							}
						>
							{preflightStatus}
						</Badge>
						<span className="text-sm text-muted-foreground">
							{t('preflight.summary', {
								ready: preflight?.summary.employeesReady ?? 0,
								blocked: preflight?.summary.employeesBlocked ?? 0,
							})}
						</span>
					</div>
					{preflightIssues.length > 0 ? (
						<div className="space-y-2 rounded-md border p-3">
							{preflightIssues.map((issue) => (
								<div key={`${issue.code}-${issue.field}`} className="text-sm">
									<span className="font-medium">{issue.field}</span>
									<span className="text-muted-foreground"> · {issue.code}</span>
								</div>
							))}
						</div>
					) : null}
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={loadPreflight}
							disabled={isBusy}
						>
							{t('actions.load')}
						</Button>
						<Button
							type="button"
							onClick={prepareFiscalVouchers}
							disabled={isBusy || !preflight?.canPrepareFiscalVouchers}
						>
							{t('actions.prepare')}
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
