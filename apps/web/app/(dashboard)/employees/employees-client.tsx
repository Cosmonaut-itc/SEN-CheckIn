'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppForm, useStore } from '@/lib/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
	Plus,
	Pencil,
	Trash2,
	Search,
	Loader2,
	MoreHorizontal,
	UserCheck,
	UserX,
	ScanFace,
} from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import {
	fetchEmployeesList,
	fetchJobPositionsList,
	fetchLocationsList,
	fetchEmployeeById,
	fetchOrganizationMembers,
	type Employee,
	type EmployeeScheduleEntry,
	type EmployeeStatus,
	type JobPosition,
	type Location,
	type OrganizationMember,
} from '@/lib/client-functions';
import { createEmployee, updateEmployee, deleteEmployee } from '@/actions/employees';
import { deleteRekognitionUser } from '@/actions/employees-rekognition';
import { FaceEnrollmentDialog } from '@/components/face-enrollment-dialog';
import { useOrgContext } from '@/lib/org-client-context';
import { Label } from '@/components/ui/label';

/**
 * Form values interface for creating/editing employees.
 */
interface EmployeeFormValues {
	/** Unique employee code */
	code: string;
	/** Employee's first name */
	firstName: string;
	/** Employee's last name */
	lastName: string;
	/** Employee's email address */
	email: string;
	/** Linked user ID */
	userId: string;
	/** Employee's phone number */
	phone: string;
	/** Job position ID (required for new employees) */
	jobPositionId: string;
	/** Location ID (required for all employees) */
	locationId: string;
	/** Employee's department */
	department: string;
	/** Employee's status */
	status: EmployeeStatus;
	/** Employee hire date (YYYY-MM-DD) */
	hireDate: string;
	/** Optional SBC daily override */
	sbcDailyOverride: string;
	/** Employee shift type */
	shiftType: 'DIURNA' | 'NOCTURNA' | 'MIXTA';
}

/**
 * Initial empty form values.
 */
const initialFormValues: EmployeeFormValues = {
	code: '',
	firstName: '',
	lastName: '',
	email: '',
	userId: 'none',
	phone: '',
	jobPositionId: '',
	locationId: '',
	department: '',
	status: 'ACTIVE',
	hireDate: '',
	sbcDailyOverride: '',
	shiftType: 'DIURNA',
};

const daysOfWeek: { labelKey: string; value: number }[] = [
	{ labelKey: 'days.sunday', value: 0 },
	{ labelKey: 'days.monday', value: 1 },
	{ labelKey: 'days.tuesday', value: 2 },
	{ labelKey: 'days.wednesday', value: 3 },
	{ labelKey: 'days.thursday', value: 4 },
	{ labelKey: 'days.friday', value: 5 },
	{ labelKey: 'days.saturday', value: 6 },
];

const shiftTypeOptions: { value: 'DIURNA' | 'NOCTURNA' | 'MIXTA'; labelKey: string }[] = [
	{ value: 'DIURNA', labelKey: 'shiftTypes.DIURNA' },
	{ value: 'NOCTURNA', labelKey: 'shiftTypes.NOCTURNA' },
	{ value: 'MIXTA', labelKey: 'shiftTypes.MIXTA' },
];

const ALL_FILTER_VALUE = '__all__';

type StatusFilterValue = EmployeeStatus | typeof ALL_FILTER_VALUE;

/**
 * Generates a default Monday-Friday schedule 09:00-17:00.
 *
 * @returns Default schedule entries for the week
 */
function createDefaultSchedule(): EmployeeScheduleEntry[] {
	return daysOfWeek.map((day) => ({
		dayOfWeek: day.value,
		startTime: '09:00',
		endTime: '17:00',
		isWorkingDay: day.value >= 1 && day.value <= 5,
	}));
}

/**
 * Status badge variant mapping.
 */
const statusVariants: Record<EmployeeStatus, 'default' | 'secondary' | 'outline'> = {
	ACTIVE: 'default',
	INACTIVE: 'secondary',
	ON_LEAVE: 'outline',
};

const EMPTY_LOCATIONS: Location[] = [];
const EMPTY_MEMBERS: OrganizationMember[] = [];

/**
 * Employees page client component.
 * Provides CRUD operations for employee management using TanStack Query.
 *
 * @returns The employees page JSX element
 */
export function EmployeesPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const t = useTranslations('Employees');
	const tCommon = useTranslations('Common');
	const [search, setSearch] = useState<string>('');
	const [locationFilter, setLocationFilter] = useState<string>(ALL_FILTER_VALUE);
	const [jobPositionFilter, setJobPositionFilter] = useState<string>(ALL_FILTER_VALUE);
	const [statusFilter, setStatusFilter] = useState<StatusFilterValue>(ALL_FILTER_VALUE);
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [enrollingEmployee, setEnrollingEmployee] = useState<Employee | null>(null);
	const [isEnrollDialogOpen, setIsEnrollDialogOpen] = useState<boolean>(false);
	const [deleteRekognitionConfirmId, setDeleteRekognitionConfirmId] = useState<string | null>(
		null,
	);
	const [hasCustomCode, setHasCustomCode] = useState<boolean>(false);
	const [schedule, setSchedule] = useState<EmployeeScheduleEntry[]>(createDefaultSchedule());
	const [isScheduleLoading, setIsScheduleLoading] = useState<boolean>(false);

	// Build query params - only include search if it has a value
	const baseParams = { limit: 100, offset: 0, organizationId };
	const queryParams = {
		...baseParams,
		...(search ? { search } : {}),
		...(locationFilter !== ALL_FILTER_VALUE ? { locationId: locationFilter } : {}),
		...(jobPositionFilter !== ALL_FILTER_VALUE
			? { jobPositionId: jobPositionFilter }
			: {}),
		...(statusFilter !== ALL_FILTER_VALUE ? { status: statusFilter } : {}),
	};

	const isOrgSelected = Boolean(organizationId);

	// Query for employees list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.employees.list(queryParams),
		queryFn: () => fetchEmployeesList(queryParams),
		enabled: isOrgSelected,
	});

	// Query for job positions list (for the dropdown)
	const { data: jobPositionsData, isLoading: isLoadingJobPositions } = useQuery({
		queryKey: queryKeys.jobPositions.list(
			organizationId ? { limit: 100, offset: 0, organizationId } : { limit: 100, offset: 0 },
		),
		queryFn: () =>
			fetchJobPositionsList(
				organizationId
					? { limit: 100, offset: 0, organizationId }
					: { limit: 100, offset: 0 },
			),
		enabled: Boolean(organizationId),
	});

	// Query for locations list (for the dropdown)
	const { data: locationsData, isLoading: isLoadingLocations } = useQuery({
		queryKey: queryKeys.locations.list(
			organizationId ? { limit: 100, offset: 0, organizationId } : { limit: 100, offset: 0 },
		),
		queryFn: () =>
			fetchLocationsList(
				organizationId
					? { limit: 100, offset: 0, organizationId }
					: { limit: 100, offset: 0 },
			),
		enabled: Boolean(organizationId),
	});

	// Query for organization members list (for linking users)
	const { data: membersData, isLoading: isLoadingMembers } = useQuery({
		queryKey: queryKeys.organizationMembers.list({
			organizationId,
			limit: 200,
			offset: 0,
		}),
		queryFn: () =>
			fetchOrganizationMembers({
				organizationId: organizationId ?? null,
				limit: 200,
				offset: 0,
			}),
		enabled: Boolean(organizationId),
	});

	const employees = data?.data ?? [];
	const jobPositions = useMemo<JobPosition[]>(
		() => jobPositionsData?.data ?? [],
		[jobPositionsData],
	);
	const locations: Location[] = locationsData?.data ?? EMPTY_LOCATIONS;
	const members: OrganizationMember[] = membersData?.members ?? EMPTY_MEMBERS;

	const memberOptions = useMemo(() => {
		const options = members.map((member) => ({
			value: member.userId,
			label: member.user?.name
				? `${member.user.name} (${member.user.email})`
				: member.user?.email ?? member.userId,
		}));
		options.sort((a, b) => a.label.localeCompare(b.label));
		return [
			{ value: 'none', label: t('placeholders.noUser') },
			...options,
		];
	}, [members, t]);

	const locationLookup = useMemo(() => {
		return new Map<string, string>(
			locations.map((loc) => [loc.id, loc.name || loc.code]),
		);
	}, [locations]);

	const locationFilterOptions = useMemo(
		(): { value: string; label: string }[] => [
			{ value: ALL_FILTER_VALUE, label: t('filters.location.all') },
			...locations.map((loc) => ({
				value: loc.id,
				label: loc.name || loc.code,
			})),
		],
		[locations, t],
	);

	const jobPositionFilterOptions = useMemo(
		(): { value: string; label: string }[] => [
			{ value: ALL_FILTER_VALUE, label: t('filters.jobPosition.all') },
			...jobPositions.map((position) => ({
				value: position.id,
				label: position.name,
			})),
		],
		[jobPositions, t],
	);

	const statusFilterOptions = useMemo(
		(): { value: StatusFilterValue; label: string }[] => [
			{ value: ALL_FILTER_VALUE, label: t('filters.status.all') },
			{ value: 'ACTIVE', label: t('status.ACTIVE') },
			{ value: 'INACTIVE', label: t('status.INACTIVE') },
			{ value: 'ON_LEAVE', label: t('status.ON_LEAVE') },
		],
		[t],
	);

	// Create mutation
	const createMutation = useMutation({
		mutationKey: mutationKeys.employees.create,
		mutationFn: createEmployee,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.createSuccess'));
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? t('toast.createError'));
			}
		},
		onError: () => {
			toast.error(t('toast.createError'));
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationKey: mutationKeys.employees.update,
		mutationFn: updateEmployee,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.updateSuccess'));
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? t('toast.updateError'));
			}
		},
		onError: () => {
			toast.error(t('toast.updateError'));
		},
	});

	// Delete mutation
	const deleteMutation = useMutation({
		mutationKey: mutationKeys.employees.delete,
		mutationFn: deleteEmployee,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.deleteSuccess'));
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? t('toast.deleteError'));
			}
		},
		onError: () => {
			toast.error(t('toast.deleteError'));
		},
	});

	// Delete Rekognition user mutation
	const deleteRekognitionMutation = useMutation({
		mutationKey: mutationKeys.employees.deleteRekognitionUser,
		mutationFn: deleteRekognitionUser,
		onSuccess: (result) => {
			if (result.success && result.data?.success) {
				toast.success(t('toast.faceEnrollmentRemoved'));
				setDeleteRekognitionConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(
					result.error ?? result.data?.message ?? t('toast.faceEnrollmentRemoveError'),
				);
			}
		},
		onError: () => {
			toast.error(t('toast.faceEnrollmentRemoveError'));
		},
	});

	// TanStack Form instance for employee create/edit
	const form = useAppForm({
		defaultValues: initialFormValues,
		onSubmit: async ({ value }) => {
			if (!value.locationId) {
				toast.error(t('toast.selectLocation'));
				return;
			}
			const trimmedHireDate = value.hireDate.trim();
			const trimmedSbcOverride = value.sbcDailyOverride.trim();
			const parsedSbcOverride =
				trimmedSbcOverride === '' ? null : Number(trimmedSbcOverride);
			if (parsedSbcOverride !== null) {
				if (!Number.isFinite(parsedSbcOverride) || parsedSbcOverride <= 0) {
					toast.error(t('validation.sbcDailyOverride'));
					return;
				}
			}
			const resolvedUserIdForCreate =
				value.userId && value.userId !== 'none' ? value.userId.trim() : undefined;
			const normalizedUserIdForUpdate =
				value.userId === 'none' ? null : value.userId?.trim() || null;
			const currentUserId = editingEmployee?.userId ?? null;
			const resolvedUserIdForUpdate =
				normalizedUserIdForUpdate === currentUserId ? undefined : normalizedUserIdForUpdate;
			if (editingEmployee) {
				await updateMutation.mutateAsync({
					id: editingEmployee.id,
					code: value.code,
					firstName: value.firstName,
					lastName: value.lastName,
					email: value.email || undefined,
					userId: resolvedUserIdForUpdate,
					phone: value.phone || undefined,
					jobPositionId: value.jobPositionId || undefined,
					locationId: value.locationId,
					department: value.department || undefined,
					status: value.status,
					hireDate: trimmedHireDate === '' ? null : trimmedHireDate,
					sbcDailyOverride: parsedSbcOverride,
					shiftType: value.shiftType,
					schedule,
				});
			} else {
				// Validate that jobPositionId is selected for new employees
				if (!value.jobPositionId) {
					toast.error(t('toast.selectJobPosition'));
					return;
				}
				await createMutation.mutateAsync({
					code: value.code,
					firstName: value.firstName,
					lastName: value.lastName,
					email: value.email || undefined,
					userId: resolvedUserIdForCreate,
					phone: value.phone || undefined,
					jobPositionId: value.jobPositionId,
					locationId: value.locationId,
					department: value.department || undefined,
					status: value.status,
					hireDate: trimmedHireDate === '' ? undefined : trimmedHireDate,
					sbcDailyOverride: trimmedSbcOverride === '' ? undefined : parsedSbcOverride ?? undefined,
					shiftType: value.shiftType,
					schedule,
				});
			}
			setIsDialogOpen(false);
			setEditingEmployee(null);
			form.reset();
		},
	});

	const firstName = useStore(form.store, (state) => state.values.firstName);
	const lastName = useStore(form.store, (state) => state.values.lastName);
	const codeValue = useStore(form.store, (state) => state.values.code);

	const generateEmployeeCode = (first: string, last: string): string => {
		const random = Math.floor(1000 + Math.random() * 9000).toString();
		const base = [first, last]
			.filter(Boolean)
			.join('.')
			.replace(/[^a-zA-Z0-9.]/g, '')
			.toUpperCase();
		return (base || 'EMP') + `-${random}`;
	};

	useEffect(() => {
		if (editingEmployee) return;
		if (hasCustomCode) return;
		// Only auto-generate when the code field is empty to avoid update loops
		if (codeValue.trim() !== '') return;
		const generated = generateEmployeeCode(firstName, lastName);
		form.setFieldValue('code', generated);
	}, [editingEmployee, hasCustomCode, firstName, lastName, codeValue, form]);

	/**
	 * Upserts a schedule entry for a specific day.
	 *
	 * @param dayOfWeek - Day index (0=Sunday)
	 * @param updates - Partial entry updates
	 */
	const upsertScheduleEntry = useCallback(
		(dayOfWeek: number, updates: Partial<EmployeeScheduleEntry>): void => {
			setSchedule((prev) => {
				const existing = prev.find((entry) => entry.dayOfWeek === dayOfWeek);
				if (existing) {
					return prev.map((entry) =>
						entry.dayOfWeek === dayOfWeek ? { ...entry, ...updates } : entry,
					);
				}
				return [
					...prev,
					{
						dayOfWeek,
						startTime: '09:00',
						endTime: '17:00',
						isWorkingDay: true,
						...updates,
					},
				];
			});
		},
		[],
	);

	/**
	 * Opens the dialog for creating a new employee.
	 */
	const handleCreateNew = useCallback((): void => {
		setEditingEmployee(null);
		form.reset();
		setHasCustomCode(false);
		setSchedule(createDefaultSchedule());
		setIsDialogOpen(true);
	}, [form]);

	/**
	 * Opens the dialog for editing an existing employee.
	 *
	 * @param employee - The employee to edit
	 */
	const handleEdit = useCallback(
		async (employee: Employee): Promise<void> => {
			setIsScheduleLoading(true);
			setEditingEmployee(employee);
			form.setFieldValue('code', employee.code);
			form.setFieldValue('firstName', employee.firstName);
			form.setFieldValue('lastName', employee.lastName);
			form.setFieldValue('email', employee.email ?? '');
			form.setFieldValue('userId', employee.userId ?? 'none');
			form.setFieldValue('phone', employee.phone ?? '');
			form.setFieldValue('jobPositionId', employee.jobPositionId ?? '');
			form.setFieldValue('locationId', employee.locationId ?? '');
			form.setFieldValue('department', employee.department ?? '');
			form.setFieldValue('status', employee.status);
			form.setFieldValue('shiftType', employee.shiftType ?? 'DIURNA');
			form.setFieldValue(
				'hireDate',
				employee.hireDate ? format(new Date(employee.hireDate), 'yyyy-MM-dd') : '',
			);
			form.setFieldValue(
				'sbcDailyOverride',
				employee.sbcDailyOverride ? String(employee.sbcDailyOverride) : '',
			);
			setHasCustomCode(true);

			const detail = await fetchEmployeeById(employee.id);
			if (detail?.schedule && detail.schedule.length > 0) {
				setSchedule(
					detail.schedule.map((entry) => ({
						dayOfWeek: entry.dayOfWeek,
						startTime: entry.startTime,
						endTime: entry.endTime,
						isWorkingDay: entry.isWorkingDay,
					})),
				);
			} else {
				setSchedule(createDefaultSchedule());
			}
			setIsScheduleLoading(false);
			setIsDialogOpen(true);
		},
		[form],
	);

	/**
	 * Handles dialog close and resets form state.
	 *
	 * @param open - Whether the dialog should be open
	 */
	const handleDialogOpenChange = useCallback(
		(open: boolean): void => {
			setIsDialogOpen(open);
			if (!open) {
				setEditingEmployee(null);
				form.reset();
				setHasCustomCode(false);
				setSchedule(createDefaultSchedule());
			}
		},
		[form],
	);

	/**
	 * Handles employee deletion.
	 *
	 * @param id - The employee ID to delete
	 */
	const handleDelete = (id: string): void => {
		deleteMutation.mutate(id);
	};

	if (!isOrgSelected) {
		return (
			<div className="space-y-4">
				<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
				<p className="text-muted-foreground">{t('noOrganization')}</p>
			</div>
		);
	}

	/**
	 * Opens the face enrollment dialog for an employee.
	 *
	 * @param employee - The employee to enroll
	 */
	const handleOpenEnrollDialog = (employee: Employee): void => {
		setEnrollingEmployee(employee);
		setIsEnrollDialogOpen(true);
	};

	/**
	 * Handles Rekognition user deletion.
	 *
	 * @param id - The employee ID to remove Rekognition data for
	 */
	const handleDeleteRekognition = (id: string): void => {
		deleteRekognitionMutation.mutate(id);
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
					<p className="text-muted-foreground">{t('subtitle')}</p>
				</div>
				<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew}>
							<Plus className="mr-2 h-4 w-4" />
							{t('actions.addEmployee')}
						</Button>
					</DialogTrigger>
					<DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-h-[calc(100vh-6rem)] sm:max-w-5xl lg:max-w-6xl">
						<form
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								form.handleSubmit();
							}}
						>
							<DialogHeader>
								<DialogTitle>
									{editingEmployee
										? t('dialog.title.edit')
										: t('dialog.title.add')}
								</DialogTitle>
								<DialogDescription>
									{editingEmployee
										? t('dialog.description.edit')
										: t('dialog.description.add')}
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4 py-4 sm:grid-cols-2">
								<div className="col-span-2 sm:col-span-1">
									<form.AppField
										name="code"
										validators={{
											onChange: ({ value }) =>
												!value.trim()
													? t('validation.codeRequired')
													: undefined,
										}}
									>
										{(field) => (
											<field.TextField
												label={t('fields.code')}
												onValueChange={(next) => {
													setHasCustomCode(true);
													return next;
												}}
											/>
										)}
									</form.AppField>
								</div>
								<div className="col-span-2 sm:col-span-1">
									<form.AppField
										name="firstName"
										validators={{
											onChange: ({ value }) =>
												!value.trim()
													? t('validation.firstNameRequired')
													: undefined,
										}}
									>
										{(field) => (
											<field.TextField label={t('fields.firstName')} />
										)}
									</form.AppField>
								</div>
								<div className="col-span-2 sm:col-span-1">
									<form.AppField
										name="lastName"
										validators={{
											onChange: ({ value }) =>
												!value.trim()
													? t('validation.lastNameRequired')
													: undefined,
										}}
									>
										{(field) => (
											<field.TextField label={t('fields.lastName')} />
										)}
									</form.AppField>
								</div>
								<div className="col-span-2 sm:col-span-1">
									<form.AppField name="email">
										{(field) => (
											<field.TextField
												label={t('fields.email')}
												type="email"
												placeholder={tCommon('optional')}
											/>
										)}
									</form.AppField>
								</div>
								<div className="col-span-2 sm:col-span-1">
									<form.AppField name="userId">
										{(field) => (
											<field.SelectField
												label={t('fields.user')}
												options={memberOptions}
												placeholder={
													isLoadingMembers
														? tCommon('loading')
														: t('placeholders.selectUser')
												}
												disabled={isLoadingMembers}
											/>
										)}
									</form.AppField>
								</div>
								<div className="col-span-2 sm:col-span-1">
									<form.AppField name="phone">
										{(field) => (
											<field.TextField
												label={t('fields.phone')}
												placeholder={tCommon('optional')}
											/>
										)}
									</form.AppField>
								</div>
								<div className="col-span-2 sm:col-span-1">
									<form.AppField
										name="locationId"
										validators={{
											onChange: ({ value }) =>
												!value
													? t('validation.locationRequired')
													: undefined,
										}}
									>
										{(field) => (
											<field.SelectField
												label={t('fields.location')}
												options={locations.map((location) => ({
													value: location.id,
													label: location.name,
												}))}
												placeholder={
													isLoadingLocations
														? tCommon('loading')
														: t('placeholders.selectLocation')
												}
												disabled={isLoadingLocations}
											/>
										)}
									</form.AppField>
								</div>
								<div className="col-span-2 sm:col-span-1">
									<form.AppField
										name="jobPositionId"
										validators={{
											onChange: ({ value }) =>
												!editingEmployee && !value
													? t('validation.jobPositionRequired')
													: undefined,
										}}
									>
										{(field) => (
											<field.SelectField
												label={t('fields.jobPosition')}
												options={jobPositions.map((position) => ({
													value: position.id,
													label: position.name,
												}))}
												placeholder={
													isLoadingJobPositions
														? tCommon('loading')
														: t('placeholders.selectJobPosition')
												}
												disabled={isLoadingJobPositions}
											/>
										)}
									</form.AppField>
								</div>
								<div className="col-span-2 sm:col-span-1">
									<form.AppField name="department">
										{(field) => (
											<field.TextField
												label={t('fields.department')}
												placeholder={tCommon('optional')}
											/>
										)}
									</form.AppField>
								</div>
								<div className="col-span-2 sm:col-span-1">
									<form.AppField name="status">
										{(field) => (
											<field.SelectField
												label={t('fields.status')}
												options={[
													{ value: 'ACTIVE', label: t('status.ACTIVE') },
													{
														value: 'INACTIVE',
														label: t('status.INACTIVE'),
													},
													{
														value: 'ON_LEAVE',
														label: t('status.ON_LEAVE'),
													},
												]}
												placeholder={t('placeholders.selectStatus')}
											/>
										)}
									</form.AppField>
								</div>
								<div className="col-span-2 sm:col-span-1">
									<form.AppField name="shiftType">
										{(field) => (
											<field.SelectField
												label={t('fields.shiftType')}
												options={shiftTypeOptions.map((option) => ({
													value: option.value,
													label: t(option.labelKey),
												}))}
												placeholder={t('placeholders.selectShiftType')}
											/>
										)}
									</form.AppField>
								</div>
								<div className="col-span-2 sm:col-span-1">
									<form.AppField name="hireDate">
										{(field) => (
											<field.DateField
												label={t('fields.hireDate')}
												placeholder={t('placeholders.hireDate')}
											/>
										)}
									</form.AppField>
								</div>
								<div className="col-span-2 sm:col-span-1">
									<form.AppField
										name="sbcDailyOverride"
										validators={{
											onChange: ({ value }) => {
												const trimmed = value.trim();
												if (!trimmed) {
													return undefined;
												}
												const parsed = Number(trimmed);
												if (!Number.isFinite(parsed) || parsed <= 0) {
													return t('validation.sbcDailyOverride');
												}
												return undefined;
											},
										}}
									>
										{(field) => (
											<field.TextField
												label={t('fields.sbcDailyOverride')}
												placeholder={t('placeholders.sbcDailyOverride')}
												description={t('helpers.sbcDailyOverride')}
											/>
										)}
									</form.AppField>
								</div>

								<div className="col-span-2 space-y-2 rounded-md border p-3">
									<div className="flex items-center justify-between">
										<div>
											<p className="text-sm font-medium">
												{t('schedule.title')}
											</p>
											<p className="text-xs text-muted-foreground">
												{t('schedule.subtitle')}
											</p>
										</div>
										{isScheduleLoading && (
											<div className="flex items-center gap-2 text-xs text-muted-foreground">
												<Loader2 className="h-4 w-4 animate-spin" />
												{t('schedule.loading')}
											</div>
										)}
									</div>
									<div className="grid gap-2">
										{daysOfWeek.map((day) => {
											const entry = schedule.find(
												(item) => item.dayOfWeek === day.value,
											) ?? {
												dayOfWeek: day.value,
												startTime: '09:00',
												endTime: '17:00',
												isWorkingDay: day.value >= 1 && day.value <= 5,
											};
											return (
												<div
													key={day.value}
													className="grid grid-cols-12 items-center gap-2 rounded-md border p-2"
												>
													<div className="col-span-3 flex items-center gap-2">
														<input
															type="checkbox"
															className="h-4 w-4 accent-primary"
															checked={entry.isWorkingDay}
															onChange={(e) =>
																upsertScheduleEntry(day.value, {
																	isWorkingDay: e.target.checked,
																})
															}
														/>
														<span className="text-sm">
															{t(day.labelKey)}
														</span>
													</div>
													<div className="col-span-4">
														<Label className="text-xs text-muted-foreground">
															{t('schedule.start')}
														</Label>
														<Input
															type="time"
															value={entry.startTime}
															disabled={!entry.isWorkingDay}
															onChange={(e) =>
																upsertScheduleEntry(day.value, {
																	startTime: e.target.value,
																})
															}
														/>
													</div>
													<div className="col-span-4">
														<Label className="text-xs text-muted-foreground">
															{t('schedule.end')}
														</Label>
														<Input
															type="time"
															value={entry.endTime}
															disabled={!entry.isWorkingDay}
															onChange={(e) =>
																upsertScheduleEntry(day.value, {
																	endTime: e.target.value,
																})
															}
														/>
													</div>
												</div>
											);
										})}
									</div>
								</div>
							</div>
							<DialogFooter>
								<form.AppForm>
									<form.SubmitButton
										label={tCommon('save')}
										loadingLabel={tCommon('saving')}
									/>
								</form.AppForm>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</div>

			<div className="flex flex-wrap items-center gap-4">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder={t('search.placeholder')}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>
				<Select
					value={locationFilter}
					onValueChange={setLocationFilter}
					disabled={isLoadingLocations}
				>
					<SelectTrigger className="w-[200px]">
						<SelectValue placeholder={t('filters.location.placeholder')} />
					</SelectTrigger>
					<SelectContent>
						{locationFilterOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={jobPositionFilter}
					onValueChange={setJobPositionFilter}
					disabled={isLoadingJobPositions}
				>
					<SelectTrigger className="w-[200px]">
						<SelectValue placeholder={t('filters.jobPosition.placeholder')} />
					</SelectTrigger>
					<SelectContent>
						{jobPositionFilterOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={statusFilter}
					onValueChange={(value) => setStatusFilter(value as StatusFilterValue)}
				>
					<SelectTrigger className="w-[170px]">
						<SelectValue placeholder={t('filters.status.placeholder')} />
					</SelectTrigger>
					<SelectContent>
						{statusFilterOptions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t('table.headers.code')}</TableHead>
							<TableHead>{t('table.headers.name')}</TableHead>
							<TableHead>{t('table.headers.jobPosition')}</TableHead>
							<TableHead>{t('table.headers.location')}</TableHead>
							<TableHead>{t('table.headers.email')}</TableHead>
							<TableHead>{t('table.headers.department')}</TableHead>
							<TableHead>{t('table.headers.shift')}</TableHead>
							<TableHead>{t('table.headers.status')}</TableHead>
							<TableHead>{t('table.headers.face')}</TableHead>
							<TableHead>{t('table.headers.created')}</TableHead>
							<TableHead className="w-[100px]">
								{t('table.headers.actions')}
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isFetching ? (
							Array.from({ length: 5 }).map((_, i) => (
								<TableRow key={i}>
									{Array.from({ length: 11 }).map((_, j) => (
										<TableCell key={j}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : employees.length === 0 ? (
							<TableRow>
								<TableCell colSpan={11} className="h-24 text-center">
									{t('table.empty')}
								</TableCell>
							</TableRow>
						) : (
							employees.map((employee) => (
								<TableRow key={employee.id}>
									<TableCell className="font-medium">{employee.code}</TableCell>
									<TableCell>
										{employee.firstName} {employee.lastName}
									</TableCell>
									<TableCell>{employee.jobPositionName ?? '-'}</TableCell>
									<TableCell>
										{employee.locationId ? (
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														<span className="block max-w-[200px] truncate text-sm">
															{locationLookup.get(employee.locationId) ??
																t('table.unknownLocation')}
														</span>
													</TooltipTrigger>
													<TooltipContent>
														{employee.locationId}
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										) : (
											'-'
										)}
									</TableCell>
									<TableCell>{employee.email ?? '-'}</TableCell>
									<TableCell>{employee.department ?? '-'}</TableCell>
									<TableCell>
										{employee.shiftType
											? t(`shiftTypeLabels.${employee.shiftType}`)
											: '-'}
									</TableCell>
									<TableCell>
										<Badge variant={statusVariants[employee.status]}>
											{t(`status.${employee.status}`)}
										</Badge>
									</TableCell>
									<TableCell>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													{employee.rekognitionUserId ? (
														<Badge variant="default" className="gap-1">
															<UserCheck className="h-3 w-3" />
															{t('face.enrolled')}
														</Badge>
													) : (
														<Badge
															variant="outline"
															className="gap-1 text-muted-foreground"
														>
															<UserX className="h-3 w-3" />
															{t('face.notEnrolled')}
														</Badge>
													)}
												</TooltipTrigger>
												<TooltipContent>
													{employee.rekognitionUserId
														? t('face.tooltip.enrolled')
														: t('face.tooltip.notEnrolled')}
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</TableCell>
									<TableCell>
										{format(new Date(employee.createdAt), t('dateFormat'))}
									</TableCell>
									<TableCell>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button variant="ghost" size="icon">
													<MoreHorizontal className="h-4 w-4" />
													<span className="sr-only">
														{t('menu.open')}
													</span>
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem
													onClick={() => handleEdit(employee)}
												>
													<Pencil className="mr-2 h-4 w-4" />
													{tCommon('edit')}
												</DropdownMenuItem>
												<DropdownMenuItem
													onClick={() => handleOpenEnrollDialog(employee)}
												>
													<ScanFace className="mr-2 h-4 w-4" />
													{employee.rekognitionUserId
														? t('menu.reEnrollFace')
														: t('menu.enrollFace')}
												</DropdownMenuItem>
												{employee.rekognitionUserId && (
													<DropdownMenuItem
														onClick={() =>
															setDeleteRekognitionConfirmId(
																employee.id,
															)
														}
														className="text-orange-600 focus:text-orange-600"
													>
														<UserX className="mr-2 h-4 w-4" />
														{t('menu.removeFaceEnrollment')}
													</DropdownMenuItem>
												)}
												<DropdownMenuSeparator />
												<DropdownMenuItem
													onClick={() => setDeleteConfirmId(employee.id)}
													className="text-destructive focus:text-destructive"
												>
													<Trash2 className="mr-2 h-4 w-4" />
													{t('menu.deleteEmployee')}
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>

										{/* Delete employee confirmation dialog */}
										<Dialog
											open={deleteConfirmId === employee.id}
											onOpenChange={(open) =>
												setDeleteConfirmId(open ? employee.id : null)
											}
										>
											<DialogContent>
												<DialogHeader>
													<DialogTitle>
														{t('dialogs.deleteEmployee.title')}
													</DialogTitle>
													<DialogDescription>
														{t('dialogs.deleteEmployee.description', {
															name: `${employee.firstName} ${employee.lastName}`.trim(),
														})}
														{employee.rekognitionUserId && (
															<span className="block mt-2 text-orange-600">
																{t(
																	'dialogs.deleteEmployee.faceNote',
																)}
															</span>
														)}
													</DialogDescription>
												</DialogHeader>
												<DialogFooter>
													<Button
														variant="outline"
														onClick={() => setDeleteConfirmId(null)}
													>
														{tCommon('cancel')}
													</Button>
													<Button
														variant="destructive"
														onClick={() => handleDelete(employee.id)}
														disabled={deleteMutation.isPending}
													>
														{deleteMutation.isPending ? (
															<>
																<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																{tCommon('deleting')}
															</>
														) : (
															tCommon('delete')
														)}
													</Button>
												</DialogFooter>
											</DialogContent>
										</Dialog>

										{/* Delete Rekognition confirmation dialog */}
										<Dialog
											open={deleteRekognitionConfirmId === employee.id}
											onOpenChange={(open) =>
												setDeleteRekognitionConfirmId(
													open ? employee.id : null,
												)
											}
										>
											<DialogContent>
												<DialogHeader>
													<DialogTitle>
														{t('dialogs.removeFaceEnrollment.title')}
													</DialogTitle>
													<DialogDescription>
														{t(
															'dialogs.removeFaceEnrollment.description',
															{
																name: `${employee.firstName} ${employee.lastName}`.trim(),
															},
														)}
													</DialogDescription>
												</DialogHeader>
												<DialogFooter>
													<Button
														variant="outline"
														onClick={() =>
															setDeleteRekognitionConfirmId(null)
														}
													>
														{tCommon('cancel')}
													</Button>
													<Button
														variant="destructive"
														onClick={() =>
															handleDeleteRekognition(employee.id)
														}
														disabled={
															deleteRekognitionMutation.isPending
														}
													>
														{deleteRekognitionMutation.isPending ? (
															<>
																<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																{tCommon('removing')}
															</>
														) : (
															t(
																'dialogs.removeFaceEnrollment.confirm',
															)
														)}
													</Button>
												</DialogFooter>
											</DialogContent>
										</Dialog>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{/* Face Enrollment Dialog */}
			<FaceEnrollmentDialog
				open={isEnrollDialogOpen}
				onOpenChange={setIsEnrollDialogOpen}
				employee={enrollingEmployee}
			/>
		</div>
	);
}
