'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppForm, useStore } from '@/lib/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
	DialogTrigger,
} from '@/components/ui/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Loader2, MoreHorizontal, UserCheck, UserX, ScanFace } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchEmployeesList, fetchJobPositionsList, type Employee, type EmployeeStatus, type JobPosition } from '@/lib/client-functions';
import { createEmployee, updateEmployee, deleteEmployee } from '@/actions/employees';
import { deleteRekognitionUser } from '@/actions/employees-rekognition';
import { FaceEnrollmentDialog } from '@/components/face-enrollment-dialog';
import { useOrgContext } from '@/lib/org-client-context';

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
	/** Employee's phone number */
	phone: string;
	/** Job position ID (required for new employees) */
	jobPositionId: string;
	/** Employee's department */
	department: string;
	/** Employee's status */
	status: EmployeeStatus;
}

/**
 * Initial empty form values.
 */
const initialFormValues: EmployeeFormValues = {
	code: '',
	firstName: '',
	lastName: '',
	email: '',
	phone: '',
	jobPositionId: '',
	department: '',
	status: 'ACTIVE',
};

/**
 * Status badge variant mapping.
 */
const statusVariants: Record<EmployeeStatus, 'default' | 'secondary' | 'outline'> = {
	ACTIVE: 'default',
	INACTIVE: 'secondary',
	ON_LEAVE: 'outline',
};

/**
 * Employees page client component.
 * Provides CRUD operations for employee management using TanStack Query.
 *
 * @returns The employees page JSX element
 */
export function EmployeesPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId } = useOrgContext();
	const [search, setSearch] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [enrollingEmployee, setEnrollingEmployee] = useState<Employee | null>(null);
	const [isEnrollDialogOpen, setIsEnrollDialogOpen] = useState<boolean>(false);
	const [deleteRekognitionConfirmId, setDeleteRekognitionConfirmId] = useState<string | null>(null);
	const [hasCustomCode, setHasCustomCode] = useState<boolean>(false);

	// Build query params - only include search if it has a value
	const baseParams = { limit: 100, offset: 0, organizationId };
	const queryParams = search ? { ...baseParams, search } : baseParams;

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
				organizationId ? { limit: 100, offset: 0, organizationId } : { limit: 100, offset: 0 },
			),
		enabled: Boolean(organizationId),
	});

	const employees = data?.data ?? [];
	const jobPositions: JobPosition[] = jobPositionsData?.data ?? [];

	// Create mutation
	const createMutation = useMutation({
		mutationKey: mutationKeys.employees.create,
		mutationFn: createEmployee,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Employee created successfully');
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? 'Failed to create employee');
			}
		},
		onError: () => {
			toast.error('Failed to create employee');
		},
	});

	// Update mutation
	const updateMutation = useMutation({
		mutationKey: mutationKeys.employees.update,
		mutationFn: updateEmployee,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Employee updated successfully');
				setIsDialogOpen(false);
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? 'Failed to update employee');
			}
		},
		onError: () => {
			toast.error('Failed to update employee');
		},
	});

	// Delete mutation
	const deleteMutation = useMutation({
		mutationKey: mutationKeys.employees.delete,
		mutationFn: deleteEmployee,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Employee deleted successfully');
				setDeleteConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? 'Failed to delete employee');
			}
		},
		onError: () => {
			toast.error('Failed to delete employee');
		},
	});

	// Delete Rekognition user mutation
	const deleteRekognitionMutation = useMutation({
		mutationKey: mutationKeys.employees.deleteRekognitionUser,
		mutationFn: deleteRekognitionUser,
		onSuccess: (result) => {
			if (result.success && result.data?.success) {
				toast.success('Face enrollment data removed');
				setDeleteRekognitionConfirmId(null);
				queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
			} else {
				toast.error(result.error ?? result.data?.message ?? 'Failed to remove face enrollment');
			}
		},
		onError: () => {
			toast.error('Failed to remove face enrollment');
		},
	});

	// TanStack Form instance for employee create/edit
	const form = useAppForm({
		defaultValues: initialFormValues,
		onSubmit: async ({ value }) => {
			if (editingEmployee) {
				await updateMutation.mutateAsync({
					id: editingEmployee.id,
					code: value.code,
					firstName: value.firstName,
					lastName: value.lastName,
					email: value.email || undefined,
					phone: value.phone || undefined,
					jobPositionId: value.jobPositionId || undefined,
					department: value.department || undefined,
					status: value.status,
				});
			} else {
				// Validate that jobPositionId is selected for new employees
				if (!value.jobPositionId) {
					toast.error('Please select a job position');
					return;
				}
				await createMutation.mutateAsync({
					code: value.code,
					firstName: value.firstName,
					lastName: value.lastName,
					email: value.email || undefined,
					phone: value.phone || undefined,
					jobPositionId: value.jobPositionId,
					department: value.department || undefined,
					status: value.status,
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
	 * Opens the dialog for creating a new employee.
	 */
	const handleCreateNew = useCallback((): void => {
		setEditingEmployee(null);
		form.reset();
		setHasCustomCode(false);
		setIsDialogOpen(true);
	}, [form]);

	/**
	 * Opens the dialog for editing an existing employee.
	 *
	 * @param employee - The employee to edit
	 */
	const handleEdit = useCallback((employee: Employee): void => {
		setEditingEmployee(employee);
		form.setFieldValue('code', employee.code);
		form.setFieldValue('firstName', employee.firstName);
		form.setFieldValue('lastName', employee.lastName);
		form.setFieldValue('email', employee.email ?? '');
		form.setFieldValue('phone', employee.phone ?? '');
		form.setFieldValue('jobPositionId', employee.jobPositionId ?? '');
		form.setFieldValue('department', employee.department ?? '');
		form.setFieldValue('status', employee.status);
		setHasCustomCode(true);
		setIsDialogOpen(true);
	}, [form]);

	/**
	 * Handles dialog close and resets form state.
	 *
	 * @param open - Whether the dialog should be open
	 */
	const handleDialogOpenChange = useCallback((open: boolean): void => {
		setIsDialogOpen(open);
		if (!open) {
			setEditingEmployee(null);
			form.reset();
			setHasCustomCode(false);
		}
	}, [form]);

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
				<h1 className="text-3xl font-bold tracking-tight">Employees</h1>
				<p className="text-muted-foreground">
					Select an active organization to manage employees.
				</p>
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
					<h1 className="text-3xl font-bold tracking-tight">Employees</h1>
					<p className="text-muted-foreground">
						Manage employee records and face enrollment
					</p>
				</div>
				<Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew}>
							<Plus className="mr-2 h-4 w-4" />
							Add Employee
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
						<form
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								form.handleSubmit();
							}}
						>
							<DialogHeader>
								<DialogTitle>
									{editingEmployee ? 'Edit Employee' : 'Add Employee'}
								</DialogTitle>
								<DialogDescription>
									{editingEmployee
										? 'Update the employee details below.'
										: 'Fill in the details to create a new employee.'}
								</DialogDescription>
							</DialogHeader>
							<div className="grid gap-4 py-4">
						<form.AppField
							name="code"
							validators={{ onChange: ({ value }) => (!value.trim() ? 'Code is required' : undefined) }}
						>
							{(field) => (
								<field.TextField
									label="Code"
									onValueChange={(next) => {
										setHasCustomCode(true);
										return next;
									}}
								/>
							)}
						</form.AppField>
                        <form.AppField name="firstName" validators={{ onChange: ({ value }) => (!value.trim() ? 'First name is required' : undefined) }}>
                            {(field) => <field.TextField label="First Name" />}
                        </form.AppField>
                        <form.AppField name="lastName" validators={{ onChange: ({ value }) => (!value.trim() ? 'Last name is required' : undefined) }}>
                            {(field) => <field.TextField label="Last Name" />}
                        </form.AppField>
                        <form.AppField name="email">
                            {(field) => <field.TextField label="Email" type="email" placeholder="Optional" />}
                        </form.AppField>
                        <form.AppField name="phone">
                            {(field) => <field.TextField label="Phone" placeholder="Optional" />}
                        </form.AppField>
                        <form.AppField name="jobPositionId" validators={{ onChange: ({ value }) => (!editingEmployee && !value ? 'Job position is required' : undefined) }}>
                            {(field) => (
                                <field.SelectField
                                    label="Job Position"
                                    options={jobPositions.map((position) => ({ value: position.id, label: position.name }))}
                                    placeholder={isLoadingJobPositions ? 'Loading...' : 'Select job position'}
                                    disabled={isLoadingJobPositions}
                                />
                            )}
                        </form.AppField>
                        <form.AppField name="department">
                            {(field) => <field.TextField label="Department" placeholder="Optional" />}
                        </form.AppField>
                        <form.AppField name="status">
                            {(field) => (
                                <field.SelectField
                                    label="Status"
                                    options={[
                                        { value: 'ACTIVE', label: 'Active' },
                                        { value: 'INACTIVE', label: 'Inactive' },
                                        { value: 'ON_LEAVE', label: 'On Leave' },
                                    ]}
                                    placeholder="Select status"
                                />
                            )}
                        </form.AppField>
                    </div>
                    <DialogFooter>
                        <form.AppForm>
                            <form.SubmitButton label="Save" loadingLabel="Saving..." />
                        </form.AppForm>
                    </DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
			</div>

			<div className="flex items-center gap-4">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search employees..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Code</TableHead>
							<TableHead>Name</TableHead>
							<TableHead>Job Position</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Department</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Face</TableHead>
							<TableHead>Created</TableHead>
							<TableHead className="w-[100px]">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isFetching ? (
							Array.from({ length: 5 }).map((_, i) => (
								<TableRow key={i}>
									{Array.from({ length: 9 }).map((_, j) => (
										<TableCell key={j}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : employees.length === 0 ? (
							<TableRow>
								<TableCell colSpan={9} className="h-24 text-center">
									No employees found.
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
									<TableCell>{employee.email ?? '-'}</TableCell>
									<TableCell>{employee.department ?? '-'}</TableCell>
									<TableCell>
										<Badge variant={statusVariants[employee.status]}>
											{employee.status}
										</Badge>
									</TableCell>
									<TableCell>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													{employee.rekognitionUserId ? (
														<Badge variant="default" className="gap-1">
															<UserCheck className="h-3 w-3" />
															Enrolled
														</Badge>
													) : (
														<Badge variant="outline" className="gap-1 text-muted-foreground">
															<UserX className="h-3 w-3" />
															Not enrolled
														</Badge>
													)}
												</TooltipTrigger>
												<TooltipContent>
													{employee.rekognitionUserId
														? 'Face recognition is set up for this employee'
														: 'Face recognition not yet configured'}
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</TableCell>
									<TableCell>
										{format(new Date(employee.createdAt), 'MMM d, yyyy')}
									</TableCell>
									<TableCell>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button variant="ghost" size="icon">
													<MoreHorizontal className="h-4 w-4" />
													<span className="sr-only">Open menu</span>
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem onClick={() => handleEdit(employee)}>
													<Pencil className="mr-2 h-4 w-4" />
													Edit
												</DropdownMenuItem>
												<DropdownMenuItem onClick={() => handleOpenEnrollDialog(employee)}>
													<ScanFace className="mr-2 h-4 w-4" />
													{employee.rekognitionUserId ? 'Re-enroll face' : 'Enroll face'}
												</DropdownMenuItem>
												{employee.rekognitionUserId && (
													<DropdownMenuItem
														onClick={() => setDeleteRekognitionConfirmId(employee.id)}
														className="text-orange-600 focus:text-orange-600"
													>
														<UserX className="mr-2 h-4 w-4" />
														Remove face enrollment
													</DropdownMenuItem>
												)}
												<DropdownMenuSeparator />
												<DropdownMenuItem
													onClick={() => setDeleteConfirmId(employee.id)}
													className="text-destructive focus:text-destructive"
												>
													<Trash2 className="mr-2 h-4 w-4" />
													Delete employee
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
													<DialogTitle>Delete Employee</DialogTitle>
													<DialogDescription>
														Are you sure you want to delete {employee.firstName}{' '}
														{employee.lastName}? This action cannot be undone.
														{employee.rekognitionUserId && (
															<span className="block mt-2 text-orange-600">
																This will also remove their face enrollment data.
															</span>
														)}
													</DialogDescription>
												</DialogHeader>
												<DialogFooter>
													<Button
														variant="outline"
														onClick={() => setDeleteConfirmId(null)}
													>
														Cancel
													</Button>
													<Button
														variant="destructive"
														onClick={() => handleDelete(employee.id)}
														disabled={deleteMutation.isPending}
													>
														{deleteMutation.isPending ? (
															<>
																<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																Deleting...
															</>
														) : (
															'Delete'
														)}
													</Button>
												</DialogFooter>
											</DialogContent>
										</Dialog>

										{/* Delete Rekognition confirmation dialog */}
										<Dialog
											open={deleteRekognitionConfirmId === employee.id}
											onOpenChange={(open) =>
												setDeleteRekognitionConfirmId(open ? employee.id : null)
											}
										>
											<DialogContent>
												<DialogHeader>
													<DialogTitle>Remove Face Enrollment</DialogTitle>
													<DialogDescription>
														Are you sure you want to remove the face enrollment for{' '}
														{employee.firstName} {employee.lastName}? They will need to
														be re-enrolled to use face recognition.
													</DialogDescription>
												</DialogHeader>
												<DialogFooter>
													<Button
														variant="outline"
														onClick={() => setDeleteRekognitionConfirmId(null)}
													>
														Cancel
													</Button>
													<Button
														variant="destructive"
														onClick={() => handleDeleteRekognition(employee.id)}
														disabled={deleteRekognitionMutation.isPending}
													>
														{deleteRekognitionMutation.isPending ? (
															<>
																<Loader2 className="mr-2 h-4 w-4 animate-spin" />
																Removing...
															</>
														) : (
															'Remove Enrollment'
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
