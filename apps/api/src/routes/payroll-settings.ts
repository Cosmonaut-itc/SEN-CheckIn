import { Elysia } from 'elysia';
import { eq } from 'drizzle-orm';

import db from '../db/index.js';
import { payrollSetting } from '../db/schema.js';
import { combinedAuthPlugin } from '../plugins/auth.js';
import { resolveOrganizationId } from '../utils/organization.js';
import { payrollSettingsSchema } from '../schemas/payroll.js';

/**
 * Payroll settings routes for per-organization configuration.
 */
export const payrollSettingsRoutes = new Elysia({ prefix: '/payroll-settings' })
	.use(combinedAuthPlugin)
	/**
	 * Get payroll settings for the active organization.
	 *
	 * @returns Payroll settings record (creates default if missing)
	 */
	.get(
		'/',
		async ({
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: null,
			});

			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return { error: 'Organization is required or not permitted' };
			}

			const existing = await db
				.select()
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, organizationId))
				.limit(1);

			if (existing[0]) {
				return { data: existing[0] };
			}

			// Create a default configuration if none exists
			const defaultSetting = {
				organizationId,
				weekStartDay: 1,
				timeZone: 'America/Mexico_City',
				additionalMandatoryRestDays: [],
				riskWorkRate: '0',
				statePayrollTaxRate: '0',
				absorbImssEmployeeShare: false,
				absorbIsr: false,
				aguinaldoDays: 15,
				vacationPremiumRate: '0.25',
				enableSeventhDayPay: false,
			};

			const [insertedSetting] = await db
				.insert(payrollSetting)
				.values(defaultSetting)
				.returning();

			return { data: insertedSetting };
		},
	)
	/**
	 * Upsert payroll settings for the active organization.
	 *
	 * @returns Saved payroll settings
	 */
	.put(
		'/',
		async ({
			body,
			authType,
			session,
			sessionOrganizationIds,
			apiKeyOrganizationId,
			apiKeyOrganizationIds,
			set,
		}) => {
			const organizationId = resolveOrganizationId({
				authType,
				session,
				sessionOrganizationIds,
				apiKeyOrganizationId,
				apiKeyOrganizationIds,
				requestedOrganizationId: body.organizationId ?? null,
			});

			if (!organizationId) {
				set.status = authType === 'apiKey' ? 403 : 400;
				return { error: 'Organization is required or not permitted' };
			}

			const existing = await db
				.select()
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, organizationId))
				.limit(1);

			const resolvedOvertimeEnforcement =
				body.overtimeEnforcement ?? existing[0]?.overtimeEnforcement ?? 'WARN';
			const resolvedAdditionalMandatoryRestDays =
				body.additionalMandatoryRestDays ?? existing[0]?.additionalMandatoryRestDays ?? [];
			const resolvedTimeZone =
				body.timeZone ?? existing[0]?.timeZone ?? 'America/Mexico_City';
			const resolvedRiskWorkRate = body.riskWorkRate ?? existing[0]?.riskWorkRate ?? 0;
			const resolvedStatePayrollTaxRate =
				body.statePayrollTaxRate ?? existing[0]?.statePayrollTaxRate ?? 0;
			const resolvedAbsorbImssEmployeeShare =
				body.absorbImssEmployeeShare ?? existing[0]?.absorbImssEmployeeShare ?? false;
			const resolvedAbsorbIsr = body.absorbIsr ?? existing[0]?.absorbIsr ?? false;
			const resolvedAguinaldoDays = body.aguinaldoDays ?? existing[0]?.aguinaldoDays ?? 15;
			const resolvedVacationPremiumRate =
				body.vacationPremiumRate ?? existing[0]?.vacationPremiumRate ?? 0.25;
			const resolvedEnableSeventhDayPay =
				body.enableSeventhDayPay ?? existing[0]?.enableSeventhDayPay ?? false;
			const resolvedRiskWorkRateValue =
				typeof resolvedRiskWorkRate === 'number'
					? resolvedRiskWorkRate.toFixed(4)
					: resolvedRiskWorkRate;
			const resolvedStatePayrollTaxRateValue =
				typeof resolvedStatePayrollTaxRate === 'number'
					? resolvedStatePayrollTaxRate.toFixed(4)
					: resolvedStatePayrollTaxRate;
			const resolvedVacationPremiumRateValue =
				typeof resolvedVacationPremiumRate === 'number'
					? resolvedVacationPremiumRate.toFixed(4)
					: resolvedVacationPremiumRate;

			const updatePayload = {
				weekStartDay: body.weekStartDay,
				timeZone: resolvedTimeZone,
				overtimeEnforcement: resolvedOvertimeEnforcement,
				additionalMandatoryRestDays: resolvedAdditionalMandatoryRestDays,
				riskWorkRate: resolvedRiskWorkRateValue,
				statePayrollTaxRate: resolvedStatePayrollTaxRateValue,
				absorbImssEmployeeShare: resolvedAbsorbImssEmployeeShare,
				absorbIsr: resolvedAbsorbIsr,
				aguinaldoDays: resolvedAguinaldoDays,
				vacationPremiumRate: resolvedVacationPremiumRateValue,
				enableSeventhDayPay: resolvedEnableSeventhDayPay,
				organizationId,
			};

			if (existing[0]) {
				await db
					.update(payrollSetting)
					.set({
						weekStartDay: updatePayload.weekStartDay,
						timeZone: updatePayload.timeZone,
						overtimeEnforcement: updatePayload.overtimeEnforcement,
						additionalMandatoryRestDays: updatePayload.additionalMandatoryRestDays,
						riskWorkRate: updatePayload.riskWorkRate,
						statePayrollTaxRate: updatePayload.statePayrollTaxRate,
						absorbImssEmployeeShare: updatePayload.absorbImssEmployeeShare,
						absorbIsr: updatePayload.absorbIsr,
						aguinaldoDays: updatePayload.aguinaldoDays,
						vacationPremiumRate: updatePayload.vacationPremiumRate,
						enableSeventhDayPay: updatePayload.enableSeventhDayPay,
					})
					.where(eq(payrollSetting.organizationId, organizationId));
			} else {
				await db.insert(payrollSetting).values(updatePayload);
			}

			const saved = await db
				.select()
				.from(payrollSetting)
				.where(eq(payrollSetting.organizationId, organizationId))
				.limit(1);

			return { data: saved[0] };
		},
		{
			body: payrollSettingsSchema,
		},
	);
