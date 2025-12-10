import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, useQueries } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import {
	fetchScheduleTemplatesList,
	fetchScheduleTemplateDetail,
	type Employee,
	type ScheduleTemplate,
} from '@/lib/client-functions';
import {
	assignTemplateToEmployees,
	createScheduleTemplate,
	deleteScheduleTemplate,
	updateScheduleTemplate,
	type ScheduleTemplateDayInput,
} from '@/actions/schedules';
import { TemplateFormDialog } from './template-form-dialog';

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Props for ScheduleTemplatesTab component.
 */
interface ScheduleTemplatesTabProps {
	/** Organization identifier */
	organizationId?: string | null;
	/** Employees available for assignments */
	employees: Employee[];
	/** Week start day for contextual hints */
	weekStartDay: number;
	/** Overtime enforcement mode from payroll settings */
	overtimeEnforcement: 'WARN' | 'BLOCK';
}

/**
 * Summarizes working days for display.
 *
 * @param template - Template to summarize
 * @returns Summary string
 */
function summarizeDays(template: ScheduleTemplate): string {
	if (!template.days || template.days.length === 0) {
		return 'No days configured';
	}
	const workingDays = template.days
		.filter((day) => day.isWorkingDay !== false)
		.map((day) => dayLabels[day.dayOfWeek]);
	return workingDays.length > 0 ? workingDays.join(', ') : 'All days off';
}

/**
 * Schedule templates tab with CRUD and assignment actions.
 *
 * @param props - Component props
 * @returns Rendered templates tab
 */
export function ScheduleTemplatesTab({
	organizationId,
	employees,
	weekStartDay,
	overtimeEnforcement,
}: ScheduleTemplatesTabProps): React.ReactElement {
	const queryClient = useQueryClient();
	const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
	const [editingTemplate, setEditingTemplate] = useState<ScheduleTemplate | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [assigningTemplate, setAssigningTemplate] = useState<ScheduleTemplate | null>(null);
	const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);

	const listParams = useMemo(
		() => ({
			limit: 100,
			offset: 0,
			organizationId: organizationId ?? undefined,
		}),
		[organizationId],
	);

	const { data: templatesResponse, isFetching } = useQuery({
		queryKey: queryKeys.scheduleTemplates.list(listParams),
		queryFn: () => fetchScheduleTemplatesList(listParams),
		enabled: Boolean(organizationId),
	});

	const createMutation = useMutation({
		mutationKey: mutationKeys.scheduleTemplates.create,
		mutationFn: createScheduleTemplate,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Template created successfully');
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduleTemplates.all });
			} else {
				toast.error(result.error ?? 'Failed to create template');
			}
		},
		onError: () => toast.error('Failed to create template'),
	});

	const updateMutation = useMutation({
		mutationKey: mutationKeys.scheduleTemplates.update,
		mutationFn: updateScheduleTemplate,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Template updated successfully');
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduleTemplates.all });
			} else {
				toast.error(result.error ?? 'Failed to update template');
			}
		},
		onError: () => toast.error('Failed to update template'),
	});

	const deleteMutation = useMutation({
		mutationKey: mutationKeys.scheduleTemplates.delete,
		mutationFn: deleteScheduleTemplate,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Template deleted successfully');
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduleTemplates.all });
			} else {
				toast.error(result.error ?? 'Failed to delete template');
			}
		},
		onError: () => toast.error('Failed to delete template'),
	});

	const assignMutation = useMutation({
		mutationKey: mutationKeys.scheduling.assignTemplate,
		mutationFn: (input: { templateId: string; employeeIds: string[] }) =>
			assignTemplateToEmployees(input.templateId, input.employeeIds),
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Template assigned to employees');
				setAssigningTemplate(null);
				setSelectedEmployeeIds([]);
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduling.all });
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduleTemplates.all });
			} else {
				toast.error(result.error ?? 'Failed to assign template');
			}
		},
		onError: () => toast.error('Failed to assign template'),
	});

	const templates = templatesResponse?.data ?? [];

	// Fetch detail (with days) for templates that don't include day data
	const templateDetailQueries = useQueries({
		queries: templates.map((template) => ({
			queryKey: queryKeys.scheduleTemplates.detail(template.id),
			queryFn: () => fetchScheduleTemplateDetail(template.id),
			enabled: Boolean(organizationId) && (!template.days || template.days.length === 0),
		})),
	});

	const templatesWithDays: ScheduleTemplate[] = templates.map((template, index) => {
		const detail = templateDetailQueries[index]?.data;
		return detail && detail.days && detail.days.length > 0 ? detail : template;
	});

	const handleOpenCreate = (): void => {
		setEditingTemplate(null);
		setIsFormOpen(true);
	};

	const handleEdit = (template: ScheduleTemplate): void => {
		setEditingTemplate(template);
		setIsFormOpen(true);
	};

	const handleSave = async (input: {
		name: string;
		description?: string | null;
		shiftType: ScheduleTemplate['shiftType'];
		days: ScheduleTemplateDayInput[];
	}): Promise<void> => {
		if (!organizationId) {
			toast.error('No active organization selected.');
			return;
		}

		if (editingTemplate) {
			await updateMutation.mutateAsync({
				id: editingTemplate.id,
				name: input.name,
				description: input.description ?? undefined,
				shiftType: input.shiftType,
				organizationId,
				days: input.days,
			});
		} else {
			await createMutation.mutateAsync({
				name: input.name,
				description: input.description ?? undefined,
				shiftType: input.shiftType,
				organizationId,
				days: input.days,
			});
		}

		setIsFormOpen(false);
		setEditingTemplate(null);
	};

	const handleAssignSubmit = async (): Promise<void> => {
		if (!assigningTemplate) {
			return;
		}
		await assignMutation.mutateAsync({
			templateId: assigningTemplate.id,
			employeeIds: selectedEmployeeIds,
		});
	};

	if (!organizationId) {
		return (
			<div className="space-y-2 rounded-md border p-4">
				<h2 className="text-lg font-semibold">Templates</h2>
				<p className="text-muted-foreground">
					Select an active organization to manage schedule templates.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold">Schedule Templates</h2>
					<p className="text-sm text-muted-foreground">
						Create reusable schedules and assign them to employees.
					</p>
				</div>
				<Button onClick={handleOpenCreate}>
					<Plus className="mr-2 h-4 w-4" />
					New Template
				</Button>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Shift</TableHead>
							<TableHead>Working Days</TableHead>
							<TableHead>Updated</TableHead>
							<TableHead className="w-[140px]">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isFetching ? (
							<TableRow>
								<TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
									Loading templates...
								</TableCell>
							</TableRow>
						) : templatesWithDays.length === 0 ? (
							<TableRow>
								<TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
									No templates found.
								</TableCell>
							</TableRow>
						) : (
							templatesWithDays.map((template) => (
								<TableRow key={template.id}>
									<TableCell className="font-medium">{template.name}</TableCell>
									<TableCell className="uppercase">{template.shiftType}</TableCell>
									<TableCell>{summarizeDays(template)}</TableCell>
									<TableCell>
										{new Date(template.updatedAt).toLocaleDateString(undefined, {
											month: 'short',
											day: 'numeric',
										})}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button
												variant="ghost"
												size="icon"
												onClick={() => handleEdit(template)}
												title="Edit template"
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => {
													setDeleteId(template.id);
												}}
												title="Delete template"
											>
												<Trash2 className="h-4 w-4 text-destructive" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => {
													setAssigningTemplate(template);
													setSelectedEmployeeIds([]);
												}}
												title="Assign to employees"
											>
												<Users className="h-4 w-4" />
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<TemplateFormDialog
				open={isFormOpen}
				onOpenChange={(open) => {
					setIsFormOpen(open);
					if (!open) {
						setEditingTemplate(null);
					}
				}}
				onSubmit={handleSave}
				initialTemplate={
					editingTemplate
						? templatesWithDays.find((t) => t.id === editingTemplate.id) ?? editingTemplate
						: null
				}
				isSubmitting={createMutation.isPending || updateMutation.isPending}
				weekStartDay={weekStartDay}
				overtimeEnforcement={overtimeEnforcement}
			/>

			<Dialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete template</DialogTitle>
						<DialogDescription>
							This action will remove the template and its day configuration. Are you sure?
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteId(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => deleteId && deleteMutation.mutate(deleteId)}
						>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={Boolean(assigningTemplate)}
				onOpenChange={(open) => {
					if (!open) {
						setAssigningTemplate(null);
						setSelectedEmployeeIds([]);
					}
				}}
			>
				<DialogContent className="max-w-xl">
					<DialogHeader>
						<DialogTitle>Assign template to employees</DialogTitle>
						<DialogDescription>
							Select employees that should receive{' '}
							{assigningTemplate?.name ?? 'this template'}.
						</DialogDescription>
					</DialogHeader>
					<div className="max-h-80 space-y-2 overflow-auto pr-2">
						{employees.map((employee) => (
							<label
								key={employee.id}
								className="flex items-center gap-2 rounded-md border p-2"
							>
								<input
									type="checkbox"
									className="h-4 w-4 accent-primary"
									checked={selectedEmployeeIds.includes(employee.id)}
									onChange={(event) => {
										setSelectedEmployeeIds((current) =>
											event.target.checked
												? [...current, employee.id]
												: current.filter((id) => id !== employee.id),
										);
									}}
								/>
								<span className="text-sm">
									{employee.firstName} {employee.lastName}
								</span>
							</label>
						))}
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setAssigningTemplate(null)}>
							Cancel
						</Button>
						<Button
							onClick={handleAssignSubmit}
							disabled={assignMutation.isPending || selectedEmployeeIds.length === 0}
						>
							Assign
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

