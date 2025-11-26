'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { fetchEmployeesList, type Employee, type EmployeeStatus } from '@/lib/client-functions';
import { createEmployee, updateEmployee, deleteEmployee } from '@/actions/employees';

/**
 * Form data interface for creating/editing employees.
 */
interface EmployeeFormData {
	code: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	department: string;
	status: EmployeeStatus;
}

/**
 * Initial empty form data.
 */
const initialFormData: EmployeeFormData = {
	code: '',
	firstName: '',
	lastName: '',
	email: '',
	phone: '',
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
	const [search, setSearch] = useState<string>('');
	const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
	const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
	const [formData, setFormData] = useState<EmployeeFormData>(initialFormData);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	// Build query params - only include search if it has a value
	const queryParams = search
		? { search, limit: 100, offset: 0 }
		: { limit: 100, offset: 0 };

	// Query for employees list
	const { data, isFetching } = useQuery({
		queryKey: queryKeys.employees.list(queryParams),
		queryFn: () => fetchEmployeesList(queryParams),
	});

	const employees = data?.data ?? [];

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

	const isSubmitting = createMutation.isPending || updateMutation.isPending;

	/**
	 * Opens the dialog for creating a new employee.
	 */
	const handleCreateNew = (): void => {
		setEditingEmployee(null);
		setFormData(initialFormData);
		setIsDialogOpen(true);
	};

	/**
	 * Opens the dialog for editing an existing employee.
	 *
	 * @param employee - The employee to edit
	 */
	const handleEdit = (employee: Employee): void => {
		setEditingEmployee(employee);
		setFormData({
			code: employee.code,
			firstName: employee.firstName,
			lastName: employee.lastName,
			email: employee.email ?? '',
			phone: employee.phone ?? '',
			department: employee.department ?? '',
			status: employee.status,
		});
		setIsDialogOpen(true);
	};

	/**
	 * Handles form submission for creating or updating an employee.
	 *
	 * @param e - The form submission event
	 */
	const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
		e.preventDefault();

		if (editingEmployee) {
			updateMutation.mutate({
				id: editingEmployee.id,
				code: formData.code,
				firstName: formData.firstName,
				lastName: formData.lastName,
				email: formData.email || undefined,
				phone: formData.phone || undefined,
				department: formData.department || undefined,
				status: formData.status,
			});
		} else {
			createMutation.mutate({
				code: formData.code,
				firstName: formData.firstName,
				lastName: formData.lastName,
				email: formData.email || undefined,
				phone: formData.phone || undefined,
				department: formData.department || undefined,
				status: formData.status,
			});
		}
	};

	/**
	 * Handles employee deletion.
	 *
	 * @param id - The employee ID to delete
	 */
	const handleDelete = (id: string): void => {
		deleteMutation.mutate(id);
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
				<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
					<DialogTrigger asChild>
						<Button onClick={handleCreateNew}>
							<Plus className="mr-2 h-4 w-4" />
							Add Employee
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-[425px]">
						<form onSubmit={handleSubmit}>
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
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="code" className="text-right">
										Code
									</Label>
									<Input
										id="code"
										value={formData.code}
										onChange={(e) =>
											setFormData({ ...formData, code: e.target.value })
										}
										className="col-span-3"
										required
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="firstName" className="text-right">
										First Name
									</Label>
									<Input
										id="firstName"
										value={formData.firstName}
										onChange={(e) =>
											setFormData({ ...formData, firstName: e.target.value })
										}
										className="col-span-3"
										required
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="lastName" className="text-right">
										Last Name
									</Label>
									<Input
										id="lastName"
										value={formData.lastName}
										onChange={(e) =>
											setFormData({ ...formData, lastName: e.target.value })
										}
										className="col-span-3"
										required
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="email" className="text-right">
										Email
									</Label>
									<Input
										id="email"
										type="email"
										value={formData.email}
										onChange={(e) =>
											setFormData({ ...formData, email: e.target.value })
										}
										className="col-span-3"
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="phone" className="text-right">
										Phone
									</Label>
									<Input
										id="phone"
										value={formData.phone}
										onChange={(e) =>
											setFormData({ ...formData, phone: e.target.value })
										}
										className="col-span-3"
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="department" className="text-right">
										Department
									</Label>
									<Input
										id="department"
										value={formData.department}
										onChange={(e) =>
											setFormData({ ...formData, department: e.target.value })
										}
										className="col-span-3"
									/>
								</div>
								<div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="status" className="text-right">
										Status
									</Label>
									<Select
										value={formData.status}
										onValueChange={(value: EmployeeStatus) =>
											setFormData({ ...formData, status: value })
										}
									>
										<SelectTrigger className="col-span-3">
											<SelectValue placeholder="Select status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="ACTIVE">Active</SelectItem>
											<SelectItem value="INACTIVE">Inactive</SelectItem>
											<SelectItem value="ON_LEAVE">On Leave</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
							<DialogFooter>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Saving...
										</>
									) : (
										'Save'
									)}
								</Button>
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
							<TableHead>Email</TableHead>
							<TableHead>Department</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Created</TableHead>
							<TableHead className="w-[100px]">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isFetching ? (
							Array.from({ length: 5 }).map((_, i) => (
								<TableRow key={i}>
									{Array.from({ length: 7 }).map((_, j) => (
										<TableCell key={j}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : employees.length === 0 ? (
							<TableRow>
								<TableCell colSpan={7} className="h-24 text-center">
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
									<TableCell>{employee.email ?? '-'}</TableCell>
									<TableCell>{employee.department ?? '-'}</TableCell>
									<TableCell>
										<Badge variant={statusVariants[employee.status]}>
											{employee.status}
										</Badge>
									</TableCell>
									<TableCell>
										{format(new Date(employee.createdAt), 'MMM d, yyyy')}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button
												variant="ghost"
												size="icon"
												onClick={() => handleEdit(employee)}
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<Dialog
												open={deleteConfirmId === employee.id}
												onOpenChange={(open) =>
													setDeleteConfirmId(open ? employee.id : null)
												}
											>
												<DialogTrigger asChild>
													<Button variant="ghost" size="icon">
														<Trash2 className="h-4 w-4 text-destructive" />
													</Button>
												</DialogTrigger>
												<DialogContent>
													<DialogHeader>
														<DialogTitle>Delete Employee</DialogTitle>
														<DialogDescription>
															Are you sure you want to delete {employee.firstName}{' '}
															{employee.lastName}? This action cannot be undone.
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
														>
															Delete
														</Button>
													</DialogFooter>
												</DialogContent>
											</Dialog>
										</div>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}

