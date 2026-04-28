export type StaffingRequirementUpdateBody = {
	locationId?: string;
	jobPositionId?: string;
	minimumRequired?: number;
};

/**
 * Determines whether an update changes scope fields that need ownership validation.
 *
 * @param body - Parsed staffing requirement update body
 * @returns True when location or job position ownership must be re-validated
 */
export function shouldValidateStaffingRequirementScopeUpdate(
	body: StaffingRequirementUpdateBody,
): boolean {
	return body.locationId !== undefined || body.jobPositionId !== undefined;
}
