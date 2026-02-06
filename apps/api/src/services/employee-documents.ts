import { and, asc, eq, inArray } from 'drizzle-orm';

import db from '../db/index.js';
import {
	documentRequirementActivationStage,
	employeeDocumentReviewStatus,
	employeeDocumentRequirementKey,
	employeeDocumentVersion,
	organizationDocumentRequirement,
	organizationDocumentWorkflowConfig,
} from '../db/schema.js';

export type EmployeeDocumentRequirementKeyValue =
	(typeof employeeDocumentRequirementKey.enumValues)[number];
export type DocumentRequirementActivationStageValue =
	(typeof documentRequirementActivationStage.enumValues)[number];
export type EmployeeDocumentReviewStatusValue =
	(typeof employeeDocumentReviewStatus.enumValues)[number];
export type EmployeeDocumentWorkflowStatus = 'INCOMPLETE' | 'IN_REVIEW' | 'COMPLETE';

const DEFAULT_BASE_APPROVED_THRESHOLD_FOR_LEGAL = 1;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbClient = typeof db | DbTransaction;

type OrganizationDocumentRequirementRow = typeof organizationDocumentRequirement.$inferSelect;
type OrganizationDocumentWorkflowConfigRow = typeof organizationDocumentWorkflowConfig.$inferSelect;
type EmployeeDocumentCurrentVersionRow = Pick<
	typeof employeeDocumentVersion.$inferSelect,
	'employeeId' | 'requirementKey' | 'reviewStatus' | 'id'
>;

/**
 * Default requirement catalog used when an organization has no workflow setup.
 */
const DEFAULT_REQUIREMENTS: ReadonlyArray<{
	requirementKey: EmployeeDocumentRequirementKeyValue;
	isRequired: boolean;
	displayOrder: number;
	activationStage: DocumentRequirementActivationStageValue;
}> = [
	{
		requirementKey: 'IDENTIFICATION',
		isRequired: true,
		displayOrder: 1,
		activationStage: 'BASE',
	},
	{
		requirementKey: 'TAX_CONSTANCY',
		isRequired: true,
		displayOrder: 2,
		activationStage: 'BASE',
	},
	{
		requirementKey: 'PROOF_OF_ADDRESS',
		isRequired: true,
		displayOrder: 3,
		activationStage: 'BASE',
	},
	{
		requirementKey: 'SOCIAL_SECURITY_EVIDENCE',
		isRequired: true,
		displayOrder: 4,
		activationStage: 'BASE',
	},
	{
		requirementKey: 'EMPLOYMENT_PROFILE',
		isRequired: true,
		displayOrder: 5,
		activationStage: 'BASE',
	},
	{
		requirementKey: 'SIGNED_CONTRACT',
		isRequired: true,
		displayOrder: 6,
		activationStage: 'LEGAL_AFTER_GATE',
	},
	{
		requirementKey: 'SIGNED_NDA',
		isRequired: true,
		displayOrder: 7,
		activationStage: 'LEGAL_AFTER_GATE',
	},
];

/**
 * Employee-level workflow progress summary.
 */
export interface EmployeeDocumentProgressSummary {
	documentProgressPercent: number;
	documentMissingCount: number;
	documentWorkflowStatus: EmployeeDocumentWorkflowStatus;
	gateUnlocked: boolean;
	baseApprovedCount: number;
	approvedRequiredActive: number;
	totalRequiredActive: number;
	activeRequiredKeys: EmployeeDocumentRequirementKeyValue[];
}

/**
 * Returns true when the requirement belongs to the base checklist.
 *
 * @param activationStage - Requirement activation stage
 * @returns True when the requirement is part of the base stage
 */
function isBaseStageRequirement(
	activationStage: DocumentRequirementActivationStageValue,
): boolean {
	return activationStage === 'BASE';
}

/**
 * Returns true when the requirement belongs to the legal post-gate stage.
 *
 * @param activationStage - Requirement activation stage
 * @returns True when the requirement is part of the legal stage
 */
function isLegalStageRequirement(
	activationStage: DocumentRequirementActivationStageValue,
): boolean {
	return activationStage === 'LEGAL_AFTER_GATE';
}

/**
 * Creates default requirement rows for an organization.
 *
 * @param organizationId - Organization identifier
 * @returns Insert payload for requirement seeding
 */
function buildDefaultRequirementRows(
	organizationId: string,
): (typeof organizationDocumentRequirement.$inferInsert)[] {
	return DEFAULT_REQUIREMENTS.map((requirement) => ({
		organizationId,
		requirementKey: requirement.requirementKey,
		isRequired: requirement.isRequired,
		displayOrder: requirement.displayOrder,
		activationStage: requirement.activationStage,
	}));
}

/**
 * Ensures an organization has workflow config and default requirements.
 *
 * @param tx - Database client/transaction
 * @param organizationId - Organization identifier
 * @returns Existing or newly seeded workflow config and requirements
 */
export async function ensureDocumentWorkflowSetup(
	tx: DbClient,
	organizationId: string,
): Promise<{
	config: OrganizationDocumentWorkflowConfigRow;
	requirements: OrganizationDocumentRequirementRow[];
}> {
	let config = (
		await tx
			.select()
			.from(organizationDocumentWorkflowConfig)
			.where(eq(organizationDocumentWorkflowConfig.organizationId, organizationId))
			.limit(1)
	)[0];

	if (!config) {
		await tx
			.insert(organizationDocumentWorkflowConfig)
			.values({
				organizationId,
				baseApprovedThresholdForLegal: DEFAULT_BASE_APPROVED_THRESHOLD_FOR_LEGAL,
			})
			.onConflictDoNothing({
				target: organizationDocumentWorkflowConfig.organizationId,
			});

		config = (
			await tx
				.select()
				.from(organizationDocumentWorkflowConfig)
				.where(eq(organizationDocumentWorkflowConfig.organizationId, organizationId))
				.limit(1)
		)[0];
	}

	let requirements = await tx
		.select()
		.from(organizationDocumentRequirement)
		.where(eq(organizationDocumentRequirement.organizationId, organizationId))
		.orderBy(asc(organizationDocumentRequirement.displayOrder));

	if (requirements.length === 0) {
		await tx
			.insert(organizationDocumentRequirement)
			.values(buildDefaultRequirementRows(organizationId))
			.onConflictDoNothing({
				target: [
					organizationDocumentRequirement.organizationId,
					organizationDocumentRequirement.requirementKey,
				],
			});
		requirements = await tx
			.select()
			.from(organizationDocumentRequirement)
			.where(eq(organizationDocumentRequirement.organizationId, organizationId))
			.orderBy(asc(organizationDocumentRequirement.displayOrder));
	} else {
		const existingKeys = new Set(requirements.map((row) => row.requirementKey));
		const missingRows = buildDefaultRequirementRows(organizationId).filter(
			(row) => !existingKeys.has(row.requirementKey),
		);
		if (missingRows.length > 0) {
			await tx
				.insert(organizationDocumentRequirement)
				.values(missingRows)
				.onConflictDoNothing({
					target: [
						organizationDocumentRequirement.organizationId,
						organizationDocumentRequirement.requirementKey,
					],
				});
			requirements = await tx
				.select()
				.from(organizationDocumentRequirement)
				.where(eq(organizationDocumentRequirement.organizationId, organizationId))
				.orderBy(asc(organizationDocumentRequirement.displayOrder));
		}
	}

	if (!config) {
		throw new Error('Failed to initialize organization document workflow configuration');
	}

	return { config, requirements };
}

/**
 * Builds a lookup map of current document versions by requirement key.
 *
 * @param rows - Current document version rows for a single employee
 * @returns Requirement key to current document version map
 */
function buildCurrentDocumentVersionMap(
	rows: EmployeeDocumentCurrentVersionRow[],
): Map<EmployeeDocumentRequirementKeyValue, EmployeeDocumentCurrentVersionRow> {
	const map = new Map<EmployeeDocumentRequirementKeyValue, EmployeeDocumentCurrentVersionRow>();
	for (const row of rows) {
		map.set(row.requirementKey, row);
	}
	return map;
}

/**
 * Computes workflow progress metrics for one employee.
 *
 * @param requirements - Organization requirement configuration
 * @param threshold - Base approved threshold to unlock legal requirements
 * @param currentRows - Current document versions for the employee
 * @returns Progress metrics for employee document workflow
 */
export function calculateEmployeeDocumentProgress(
	requirements: OrganizationDocumentRequirementRow[],
	threshold: number,
	currentRows: EmployeeDocumentCurrentVersionRow[],
): EmployeeDocumentProgressSummary {
	const requiredRequirements = requirements.filter((requirement) => requirement.isRequired);
	const currentMap = buildCurrentDocumentVersionMap(currentRows);

	const baseRequired = requiredRequirements.filter((requirement) =>
		isBaseStageRequirement(requirement.activationStage),
	);

	const baseApprovedCount = baseRequired.reduce((count, requirement) => {
		const current = currentMap.get(requirement.requirementKey);
		if (current?.reviewStatus === 'APPROVED') {
			return count + 1;
		}
		return count;
	}, 0);

	const gateUnlocked = baseApprovedCount >= Math.max(1, threshold);

	const activeRequired = requiredRequirements.filter((requirement) => {
		if (isBaseStageRequirement(requirement.activationStage)) {
			return true;
		}
		if (isLegalStageRequirement(requirement.activationStage)) {
			return gateUnlocked;
		}
		return false;
	});

	const totalRequiredActive = activeRequired.length;
	const approvedRequiredActive = activeRequired.reduce((count, requirement) => {
		const current = currentMap.get(requirement.requirementKey);
		if (current?.reviewStatus === 'APPROVED') {
			return count + 1;
		}
		return count;
	}, 0);

	const hasPendingReview = activeRequired.some((requirement) => {
		const current = currentMap.get(requirement.requirementKey);
		return current?.reviewStatus === 'PENDING_REVIEW';
	});

	const documentMissingCount = activeRequired.reduce((count, requirement) => {
		const current = currentMap.get(requirement.requirementKey);
		if (!current || current.reviewStatus !== 'APPROVED') {
			return count + 1;
		}
		return count;
	}, 0);

	const documentProgressPercent =
		totalRequiredActive === 0
			? 0
			: Math.round((approvedRequiredActive / totalRequiredActive) * 100);

	let documentWorkflowStatus: EmployeeDocumentWorkflowStatus = 'INCOMPLETE';
	if (totalRequiredActive > 0 && approvedRequiredActive === totalRequiredActive) {
		documentWorkflowStatus = 'COMPLETE';
	} else if (hasPendingReview) {
		documentWorkflowStatus = 'IN_REVIEW';
	}

	return {
		documentProgressPercent,
		documentMissingCount,
		documentWorkflowStatus,
		gateUnlocked,
		baseApprovedCount,
		approvedRequiredActive,
		totalRequiredActive,
		activeRequiredKeys: activeRequired.map((requirement) => requirement.requirementKey),
	};
}

/**
 * Computes workflow progress for multiple employees in a single query set.
 *
 * @param tx - Database client/transaction
 * @param organizationId - Organization identifier
 * @param employeeIds - Employee identifiers
 * @returns Map of employee id to progress summary
 */
export async function buildEmployeeDocumentProgressMap(
	tx: DbClient,
	organizationId: string,
	employeeIds: string[],
): Promise<Map<string, EmployeeDocumentProgressSummary>> {
	const result = new Map<string, EmployeeDocumentProgressSummary>();
	if (employeeIds.length === 0) {
		return result;
	}

	const { config, requirements } = await ensureDocumentWorkflowSetup(tx, organizationId);

	const currentRows = await tx
		.select({
			id: employeeDocumentVersion.id,
			employeeId: employeeDocumentVersion.employeeId,
			requirementKey: employeeDocumentVersion.requirementKey,
			reviewStatus: employeeDocumentVersion.reviewStatus,
		})
		.from(employeeDocumentVersion)
		.where(
			and(
				eq(employeeDocumentVersion.organizationId, organizationId),
				inArray(employeeDocumentVersion.employeeId, employeeIds),
				eq(employeeDocumentVersion.isCurrent, true),
			),
		);

	const currentByEmployee = new Map<string, EmployeeDocumentCurrentVersionRow[]>();
	for (const row of currentRows) {
		const list = currentByEmployee.get(row.employeeId) ?? [];
		list.push(row);
		currentByEmployee.set(row.employeeId, list);
	}

	for (const employeeId of employeeIds) {
		const rows = currentByEmployee.get(employeeId) ?? [];
		result.set(
			employeeId,
			calculateEmployeeDocumentProgress(
				requirements,
				config.baseApprovedThresholdForLegal,
				rows,
			),
		);
	}

	return result;
}
