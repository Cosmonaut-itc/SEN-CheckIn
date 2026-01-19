'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ShieldCheck, UserCheck, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
	type AddOrganizationMemberInput,
	type CreateOrganizationUserInput,
	type CreateOrganizationUserErrorCode,
	addOrganizationMember,
	createOrganizationUser,
} from '@/actions/users';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/data-table/data-table';
import {
	fetchAllOrganizations,
	fetchOrganizationMembers,
	fetchUsers,
	type Organization,
	type OrganizationMember,
	type OrganizationsAllResponse,
} from '@/lib/client-functions';
import { useSession } from '@/lib/auth-client';
import { useAppForm } from '@/lib/forms';
import { useOrgContext } from '@/lib/org-client-context';
import { mutationKeys, queryKeys } from '@/lib/query-keys';
import type { ColumnDef, ColumnFiltersState, PaginationState, SortingState } from '@tanstack/react-table';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

type CreateUserFormValues = CreateOrganizationUserInput;
type AssignUserFormValues = Pick<AddOrganizationMemberInput, 'userId' | 'role'>;

const initialFormValues: CreateUserFormValues = {
	name: '',
	email: '',
	username: '',
	password: '',
	role: 'member',
	organizationId: '',
};

const initialAssignFormValues: AssignUserFormValues = {
	userId: '',
	role: 'member',
};

const roleBadgeVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
	owner: 'default',
	admin: 'secondary',
	member: 'outline',
};

/**
 * Computes initials for an avatar fallback.
 *
 * @param name - Full name or email-like string
 * @returns Uppercased initials
 */
function getInitials(name: string): string {
	const parts = name.split(' ').filter(Boolean);
	if (parts.length >= 2) {
		return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
	}
	return name.substring(0, 2).toUpperCase();
}

/**
 * Props for the memoized users table section.
 */
interface UsersTableSectionProps {
	/** Whether the current user can access super admin features. */
	isSuperUser: boolean;
	/** Organization options for the selector. */
	organizationOptions: { value: string; label: string }[];
	/** Whether organizations are loading. */
	isFetchingOrganizations: boolean;
	/** Selected organization id for the selector. */
	resolvedSelectedOrganizationId: string | null;
	/** Callback to update organization selection. */
	onOrganizationSelection: (value: string) => void;
	/** Effective organization id for table data. */
	effectiveOrganizationId: string | null;
	/** Global search filter value. */
	globalFilter: string;
	/** Callback to update the global filter. */
	onGlobalFilterChange: React.Dispatch<React.SetStateAction<string>>;
	/** Table column definitions. */
	columns: ColumnDef<OrganizationMember>[];
	/** Member rows to display. */
	members: OrganizationMember[];
	/** Current sorting state. */
	sorting: SortingState;
	/** Callback to update sorting state. */
	onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
	/** Current pagination state. */
	pagination: PaginationState;
	/** Callback to update pagination state. */
	onPaginationChange: React.Dispatch<React.SetStateAction<PaginationState>>;
	/** Current column filter state. */
	columnFilters: ColumnFiltersState;
	/** Callback to update column filters. */
	onColumnFiltersChange: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
	/** Total number of rows for server pagination. */
	rowCount: number;
	/** Loading indicator for table content. */
	isLoading: boolean;
	/** Empty state label for the table. */
	emptyState: string;
	/** Search input placeholder. */
	searchPlaceholder: string;
	/** Organization selector label. */
	organizationLabel: string;
	/** Organization selector placeholder. */
	organizationPlaceholder: string;
	/** Organization selector loading placeholder. */
	organizationLoadingLabel: string;
	/** Organization selector helper text. */
	organizationHelper: string;
	/** Member count label. */
	memberCountLabel: string;
}

/**
 * Memoized table section to avoid rerendering on unrelated state changes.
 *
 * @param props - Table section props.
 * @returns The users table section React element.
 */
function UsersTableSection({
	isSuperUser,
	organizationOptions,
	isFetchingOrganizations,
	resolvedSelectedOrganizationId,
	onOrganizationSelection,
	effectiveOrganizationId,
	globalFilter,
	onGlobalFilterChange,
	columns,
	members,
	sorting,
	onSortingChange,
	pagination,
	onPaginationChange,
	columnFilters,
	onColumnFiltersChange,
	rowCount,
	isLoading,
	emptyState,
	searchPlaceholder,
	organizationLabel,
	organizationPlaceholder,
	organizationLoadingLabel,
	organizationHelper,
	memberCountLabel,
}: UsersTableSectionProps): React.ReactElement {
	return (
		<div className="space-y-4">
			{isSuperUser ? (
				<div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/20 px-4 py-3">
					<div className="flex items-center gap-3">
						<span className="text-sm font-medium text-foreground">
							{organizationLabel}
						</span>
						<Select
							value={resolvedSelectedOrganizationId ?? ''}
							onValueChange={onOrganizationSelection}
							disabled={isFetchingOrganizations}
						>
							<SelectTrigger className="w-[260px]">
								<SelectValue
									placeholder={
										isFetchingOrganizations
											? organizationLoadingLabel
											: organizationPlaceholder
									}
								/>
							</SelectTrigger>
							<SelectContent>
								{organizationOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{!effectiveOrganizationId ? (
						<span className="text-sm text-muted-foreground">{organizationHelper}</span>
					) : null}
				</div>
			) : null}

			<div className="flex items-center gap-4">
				<div className="relative flex-1 max-w-sm">
					<Input
						placeholder={searchPlaceholder}
						value={globalFilter}
						onChange={(event) => onGlobalFilterChange(event.target.value)}
						className="pl-3"
						disabled={isLoading || !effectiveOrganizationId}
					/>
				</div>
				<Badge variant="outline">{memberCountLabel}</Badge>
			</div>

			<DataTable
				columns={columns}
				data={members}
				sorting={sorting}
				onSortingChange={onSortingChange}
				pagination={pagination}
				onPaginationChange={onPaginationChange}
				columnFilters={columnFilters}
				onColumnFiltersChange={onColumnFiltersChange}
				globalFilter={globalFilter}
				onGlobalFilterChange={onGlobalFilterChange}
				showToolbar={false}
				manualPagination
				manualFiltering
				rowCount={rowCount}
				emptyState={emptyState}
				isLoading={isLoading}
			/>
		</div>
	);
}

const MemoizedUsersTableSection = React.memo(UsersTableSection);

export function UsersPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId, organizationName } = useOrgContext();
	const t = useTranslations('Users');
	const tCommon = useTranslations('Common');
	const { data: session, isPending: isSessionPending } = useSession();
	const isSuperUser = session?.user?.role === 'admin';
	const [globalFilter, setGlobalFilter] = useState<string>('');
	const [sorting, setSorting] = useState<SortingState>([]);
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
	const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(
		organizationId ?? null,
	);
	const searchValue = globalFilter.trim();

	const resolvedSelectedOrganizationId = isSuperUser
		? (selectedOrganizationId ?? organizationId ?? null)
		: null;
	const effectiveOrganizationId = isSuperUser ? resolvedSelectedOrganizationId : organizationId;

	const organizationsQueryParams = {
		limit: 100,
		offset: 0,
	};

	const { data: organizationsResponse, isFetching: isFetchingOrganizations } = useQuery({
		queryKey: queryKeys.super.organizationsAll.list(organizationsQueryParams),
		queryFn: () => fetchAllOrganizations(organizationsQueryParams),
		enabled: isSuperUser && !isSessionPending,
	});

	const organizations = useMemo<Organization[]>(
		() =>
			isSuperUser
				? (organizationsResponse as OrganizationsAllResponse | undefined)?.organizations ?? []
				: [],
		[isSuperUser, organizationsResponse],
	);

	const organizationOptions = useMemo(
		() =>
			organizations.map((org) => ({
				value: org.id,
				label: org.name,
			})),
		[organizations],
	);

	const createOrganizationOptions = useMemo(() => {
		if (isSuperUser) {
			return organizationOptions;
		}
		if (!organizationId) {
			return [];
		}
		return [
			{
				value: organizationId,
				label: organizationName ?? t('organizationSelector.fallback'),
			},
		];
	}, [isSuperUser, organizationId, organizationName, organizationOptions, t]);

	const selectedOrganization = useMemo(
		() => organizations.find((org) => org.id === effectiveOrganizationId) ?? null,
		[effectiveOrganizationId, organizations],
	);
	const organizationLabel = isSuperUser
		? selectedOrganization?.name ?? t('organizationSelector.fallback')
		: (organizationName ?? t('fallbackOrganization'));

	const membersQueryParams = {
		organizationId: effectiveOrganizationId ?? null,
		limit: pagination.pageSize,
		offset: pagination.pageIndex * pagination.pageSize,
		...(searchValue ? { search: searchValue } : {}),
	};

	const { data, isFetching } = useQuery({
		queryKey: queryKeys.organizationMembers.list(membersQueryParams),
		queryFn: () => fetchOrganizationMembers(membersQueryParams),
		enabled: Boolean(effectiveOrganizationId),
	});

	const { data: usersResponse = [], isFetching: isFetchingUsers } = useQuery({
		queryKey: queryKeys.users.list({ limit: 100, offset: 0 }),
		queryFn: () => fetchUsers({ limit: 100, offset: 0 }),
		enabled: isSuperUser && isAssignDialogOpen,
	});

	const members = useMemo(() => data?.members ?? [], [data?.members]);
	const totalRows = data?.total ?? 0;
	const userOptions = useMemo(
		() =>
			usersResponse.map((userItem) => ({
				value: userItem.id,
				label: userItem.name ? `${userItem.name} (${userItem.email})` : userItem.email,
			})),
		[usersResponse],
	);
	const isLoading = isFetching || isSessionPending;
	const tableEmptyState = effectiveOrganizationId
		? t('table.empty')
		: t('table.emptyNoOrganization');

	const createUserErrorMessages = useMemo<Partial<Record<CreateOrganizationUserErrorCode, string>>>(
		() => ({
			PASSWORD_TOO_SHORT: t('errors.passwordTooShort'),
			PASSWORD_TOO_LONG: t('errors.passwordTooLong'),
			PASSWORD_REQUIRED: t('errors.passwordRequired'),
			INVALID_EMAIL: t('errors.invalidEmail'),
			EMAIL_REQUIRED: t('errors.emailRequired'),
			USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: t('errors.emailAlreadyExists'),
			USERNAME_IS_ALREADY_TAKEN: t('errors.usernameTaken'),
			USERNAME_IS_INVALID: t('errors.usernameInvalid'),
			INVALID_USERNAME: t('errors.usernameInvalid'),
			USERNAME_TOO_SHORT: t('errors.usernameTooShort'),
			USERNAME_TOO_LONG: t('errors.usernameTooLong'),
			NAME_REQUIRED: t('errors.nameRequired'),
			USERNAME_REQUIRED: t('errors.usernameRequired'),
			ORGANIZATION_REQUIRED: t('errors.organizationRequired'),
			ORGANIZATION_MEMBERSHIP_REQUIRED: t('errors.organizationMembershipRequired'),
			ORGANIZATION_ADMIN_REQUIRED: t('errors.organizationAdminRequired'),
			USER_SIGNUP_FAILED: t('errors.createFailed'),
			ADD_MEMBER_FAILED: t('errors.addMemberFailed'),
			PROVISION_USER_FAILED: t('errors.createFailed'),
		}),
		[t],
	);

	const resolveCreateUserErrorMessage = useCallback(
		(code?: CreateOrganizationUserErrorCode): string => {
			if (!code) {
				return t('toast.createError');
			}
			return createUserErrorMessages[code] ?? t('toast.createError');
		},
		[createUserErrorMessages, t],
	);

	const form = useAppForm({
		defaultValues: initialFormValues,
		onSubmit: async ({ value }) => {
			const resolvedOrganizationId = value.organizationId || effectiveOrganizationId;

			if (!resolvedOrganizationId) {
				toast.error(t('toast.selectOrganization'));
				return;
			}

			await createUserMutation.mutateAsync({
				...value,
				organizationId: resolvedOrganizationId,
			});
		},
	});

	const assignForm = useAppForm({
		defaultValues: initialAssignFormValues,
		onSubmit: async ({ value }) => {
			if (!effectiveOrganizationId) {
				toast.error(t('toast.selectOrganization'));
				return;
			}

			await addMemberMutation.mutateAsync({
				userId: value.userId,
				role: value.role,
				organizationId: effectiveOrganizationId,
			});
		},
	});

	useEffect(() => {
		if (!isDialogOpen) {
			return;
		}
		form.setFieldValue('organizationId', effectiveOrganizationId ?? '');
	}, [effectiveOrganizationId, form, isDialogOpen]);

	const createUserMutation = useMutation({
		mutationKey: mutationKeys.organizationMembers.create,
		mutationFn: createOrganizationUser,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.createSuccess'));
				setIsDialogOpen(false);
				form.reset();
				queryClient.invalidateQueries({
					queryKey: queryKeys.organizationMembers.all,
				});
			} else {
				toast.error(resolveCreateUserErrorMessage(result.errorCode));
			}
		},
		onError: () => {
			toast.error(t('toast.createError'));
		},
	});

	const addMemberMutation = useMutation({
		mutationKey: mutationKeys.organizationMembers.create,
		mutationFn: addOrganizationMember,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.assignSuccess'));
				setIsAssignDialogOpen(false);
				assignForm.reset();
				queryClient.invalidateQueries({
					queryKey: queryKeys.organizationMembers.all,
				});
			} else {
				toast.error(t('toast.assignError'));
			}
		},
		onError: () => {
			toast.error(t('toast.assignError'));
		},
	});

	/**
	 * Handles create-user dialog open state changes.
	 *
	 * @param open - Next dialog open state
	 * @returns void
	 */
	const handleCreateDialogOpenChange = useCallback(
		(open: boolean): void => {
			setIsDialogOpen(open);
			if (!open) {
				form.reset();
			}
		},
		[form],
	);

	/**
	 * Updates the global filter and resets pagination.
	 *
	 * @param value - Next global filter value or updater
	 * @returns void
	 */
	const handleGlobalFilterChange = useCallback(
		(value: React.SetStateAction<string>): void => {
			setGlobalFilter((prev) => (typeof value === 'function' ? value(prev) : value));
			setPagination((prev) => ({ ...prev, pageIndex: 0 }));
		},
		[],
	);

	/**
	 * Updates the selected organization for superusers and resets pagination.
	 *
	 * @param value - Selected organization ID
	 * @returns void
	 */
	const handleOrganizationSelection = useCallback((value: string): void => {
		setSelectedOrganizationId(value || null);
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, []);

	const columns = useMemo<ColumnDef<OrganizationMember>[]>(
		() => [
			{
				id: 'member',
				accessorFn: (row) =>
					`${row.user.name ?? ''} ${row.user.email ?? ''}`.trim(),
				header: t('table.headers.member'),
				cell: ({ row }) => (
					<div className="flex items-center gap-3">
						<Avatar className="h-8 w-8">
							<AvatarImage src={row.original.user.image ?? undefined} />
							<AvatarFallback className="text-xs">
								{getInitials(row.original.user.name || row.original.user.email)}
							</AvatarFallback>
						</Avatar>
						<span className="font-medium">
							{row.original.user.name || row.original.user.email}
						</span>
					</div>
				),
			},
			{
				id: 'email',
				accessorFn: (row) => row.user.email,
				header: t('table.headers.email'),
				cell: ({ row }) => (
					<span className="text-muted-foreground">{row.original.user.email}</span>
				),
			},
			{
				id: 'role',
				accessorFn: (row) => row.role,
				header: t('table.headers.role'),
				cell: ({ row }) => (
					<Badge variant={roleBadgeVariant[row.original.role] ?? 'outline'}>
						<ShieldCheck className="mr-1 h-3 w-3" />
						{t(`roles.${row.original.role}`)}
					</Badge>
				),
				enableGlobalFilter: false,
			},
			{
				id: 'joined',
				accessorFn: (row) => new Date(row.createdAt).getTime(),
				header: t('table.headers.joined'),
				cell: ({ row }) => format(new Date(row.original.createdAt), t('dateFormat')),
				enableGlobalFilter: false,
			},
		],
		[t],
	);

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
					<p className="text-muted-foreground">
						{t('subtitle', {
							organization: organizationLabel,
						})}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{isSuperUser ? (
						<Dialog
							open={isAssignDialogOpen}
							onOpenChange={(open) => {
								setIsAssignDialogOpen(open);
								if (!open) {
									assignForm.reset();
								}
							}}
						>
							<DialogTrigger asChild>
								<Button variant="outline" disabled={!effectiveOrganizationId}>
									<UserCheck className="mr-2 h-4 w-4" />
									{t('actions.assignExisting')}
								</Button>
							</DialogTrigger>
							<DialogContent>
								<form
									onSubmit={(e) => {
										e.preventDefault();
										e.stopPropagation();
										assignForm.handleSubmit();
									}}
								>
									<DialogHeader>
										<DialogTitle>{t('assignDialog.title')}</DialogTitle>
										<DialogDescription>{t('assignDialog.description')}</DialogDescription>
									</DialogHeader>
									<assignForm.AppForm>
										<div className="mt-6 space-y-6">
											<assignForm.AppField
												name="userId"
												validators={{
													onChange: ({ value }) =>
														value ? undefined : t('validation.userRequired'),
												}}
											>
											{(field) => (
												<field.SelectField
													label={t('fields.existingUser')}
													placeholder={
														isFetchingUsers
															? t('assignDialog.loadingUsers')
															: t('placeholders.existingUser')
													}
													options={userOptions}
													disabled={isFetchingUsers || userOptions.length === 0}
													orientation="vertical"
												/>
											)}
										</assignForm.AppField>
										<assignForm.AppField name="role">
											{(field) => (
												<field.SelectField
													label={t('fields.role')}
													placeholder={t('placeholders.selectRole')}
													options={[
														{ value: 'admin', label: t('roles.admin') },
														{ value: 'member', label: t('roles.member') },
													]}
													orientation="vertical"
												/>
											)}
										</assignForm.AppField>
										</div>
										<DialogFooter className="mt-4">
											<Button
												variant="outline"
												type="button"
												onClick={() => setIsAssignDialogOpen(false)}
											>
												{tCommon('cancel')}
											</Button>
											<assignForm.SubmitButton
												label={t('actions.assignExisting')}
												loadingLabel={t('actions.assigning')}
											/>
										</DialogFooter>
									</assignForm.AppForm>
								</form>
							</DialogContent>
						</Dialog>
					) : null}
					<Dialog open={isDialogOpen} onOpenChange={handleCreateDialogOpenChange}>
						<DialogTrigger asChild>
							<Button disabled={!effectiveOrganizationId && !isSuperUser}>
								<UserPlus className="mr-2 h-4 w-4" />
								{t('actions.create')}
							</Button>
						</DialogTrigger>
						<DialogContent>
							<form
								onSubmit={(e) => {
									e.preventDefault();
									e.stopPropagation();
									form.handleSubmit();
								}}
							>
								<DialogHeader>
									<DialogTitle>{t('dialog.title')}</DialogTitle>
									<DialogDescription>{t('dialog.description')}</DialogDescription>
								</DialogHeader>
								<form.AppForm>
									<div className="mt-6 space-y-6">
										<form.AppField
											name="organizationId"
											validators={{
												onChange: ({ value }) =>
													value ? undefined : t('validation.organizationRequired'),
											}}
										>
											{(field) => (
												<field.SelectField
													label={t('fields.organization')}
													placeholder={
														isFetchingOrganizations
															? t('organizationSelector.loading')
															: t('organizationSelector.placeholder')
													}
													options={createOrganizationOptions}
													disabled={
														!isSuperUser ||
														isFetchingOrganizations ||
														createOrganizationOptions.length === 0
													}
													onValueChange={(value) => {
														if (isSuperUser) {
															handleOrganizationSelection(value);
														}
													}}
												/>
											)}
										</form.AppField>
										<form.AppField name="name">
											{(field) => (
												<field.TextField
													label={t('fields.fullName')}
													placeholder={t('placeholders.fullName')}
													orientation="vertical"
												/>
											)}
										</form.AppField>
										<form.AppField
											name="email"
											validators={{
												onChange: ({ value }) =>
													value.includes('@')
														? undefined
														: t('validation.validEmailRequired'),
											}}
										>
											{(field) => (
												<field.TextField
													label={t('fields.email')}
													placeholder={t('placeholders.email')}
													orientation="vertical"
												/>
											)}
										</form.AppField>
										<form.AppField name="username">
											{(field) => (
												<field.TextField
													label={t('fields.username')}
													placeholder={t('placeholders.username')}
													orientation="vertical"
												/>
											)}
										</form.AppField>
										<form.AppField name="password">
											{(field) => (
												<field.TextField
													label={t('fields.temporaryPassword')}
													type="password"
													placeholder={t('placeholders.temporaryPassword')}
													orientation="vertical"
												/>
											)}
										</form.AppField>
										<form.AppField name="role">
											{(field) => (
												<field.SelectField
													label={t('fields.role')}
													placeholder={t('placeholders.selectRole')}
													options={[
														{ value: 'admin', label: t('roles.admin') },
														{ value: 'member', label: t('roles.member') },
													]}
												/>
											)}
										</form.AppField>
									</div>
									<DialogFooter className="mt-4">
										<Button
											variant="outline"
											type="button"
											onClick={() => setIsDialogOpen(false)}
										>
											{tCommon('cancel')}
										</Button>
										<form.SubmitButton
											label={t('actions.createUser')}
											loadingLabel={t('actions.creating')}
										/>
									</DialogFooter>
								</form.AppForm>
							</form>
						</DialogContent>
					</Dialog>
				</div>
			</div>

			<MemoizedUsersTableSection
				isSuperUser={Boolean(isSuperUser)}
				organizationOptions={organizationOptions}
				isFetchingOrganizations={isFetchingOrganizations}
				resolvedSelectedOrganizationId={resolvedSelectedOrganizationId}
				onOrganizationSelection={handleOrganizationSelection}
				effectiveOrganizationId={effectiveOrganizationId}
				globalFilter={globalFilter}
				onGlobalFilterChange={handleGlobalFilterChange}
				columns={columns}
				members={members}
				sorting={sorting}
				onSortingChange={setSorting}
				pagination={pagination}
				onPaginationChange={setPagination}
				columnFilters={columnFilters}
				onColumnFiltersChange={setColumnFilters}
				rowCount={totalRows}
				isLoading={isLoading}
				emptyState={tableEmptyState}
				searchPlaceholder={t('search.placeholder')}
				organizationLabel={t('organizationSelector.label')}
				organizationPlaceholder={t('organizationSelector.placeholder')}
				organizationLoadingLabel={t('organizationSelector.loading')}
				organizationHelper={t('organizationSelector.helper')}
				memberCountLabel={t('memberCount', { count: totalRows })}
			/>
		</div>
	);
}
