"use client";

import * as React from "react";
import { format } from "date-fns";
import { Plus, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import { Header } from "@/components/header";
import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

/**
 * Employee interface representing an employee record.
 */
interface Employee {
	id: string;
	code: string;
	firstName: string;
	lastName: string;
	email: string | null;
	phone: string | null;
	jobPositionId: string | null;
	department: string | null;
	status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
	hireDate: string | null;
	locationId: string | null;
	rekognitionUserId: string | null;
	createdAt: string;
	updatedAt: string;
}

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
	status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
}

const PAGE_SIZE = 10;

/**
 * Employees page component.
 * Provides CRUD operations for employee management.
 *
 * @returns Rendered employees page
 */
export default function EmployeesPage(): React.JSX.Element {
	const { toast } = useToast();
	const [employees, setEmployees] = React.useState<Employee[]>([]);
	const [isLoading, setIsLoading] = React.useState<boolean>(true);
	const [page, setPage] = React.useState<number>(1);
	const [totalPages, setTotalPages] = React.useState<number>(1);
	const [searchQuery, setSearchQuery] = React.useState<string>("");

	// Dialog states
	const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState<boolean>(false);
	const [isEditDialogOpen, setIsEditDialogOpen] = React.useState<boolean>(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState<boolean>(false);
	const [selectedEmployee, setSelectedEmployee] = React.useState<Employee | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);

	// Form state
	const [formData, setFormData] = React.useState<EmployeeFormData>({
		code: "",
		firstName: "",
		lastName: "",
		email: "",
		phone: "",
		department: "",
		status: "ACTIVE",
	});

	/**
	 * Fetches employees from the API.
	 */
	const fetchEmployees = React.useCallback(async (): Promise<void> => {
		setIsLoading(true);
		try {
			const response = await api.employees.get({
				query: {
					limit: PAGE_SIZE,
					offset: (page - 1) * PAGE_SIZE,
					search: searchQuery || undefined,
				},
			});

			if (response.data) {
				setEmployees(response.data.data as Employee[]);
				const total = response.data.pagination?.total ?? 0;
				setTotalPages(Math.ceil(total / PAGE_SIZE));
			}
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to fetch employees",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	}, [page, searchQuery, toast]);

	React.useEffect(() => {
		fetchEmployees();
	}, [fetchEmployees]);

	/**
	 * Resets form data to initial state.
	 */
	const resetForm = (): void => {
		setFormData({
			code: "",
			firstName: "",
			lastName: "",
			email: "",
			phone: "",
			department: "",
			status: "ACTIVE",
		});
	};

	/**
	 * Handles creating a new employee.
	 */
	const handleCreate = async (): Promise<void> => {
		setIsSubmitting(true);
		try {
			const response = await api.employees.post({
				code: formData.code,
				firstName: formData.firstName,
				lastName: formData.lastName,
				email: formData.email || undefined,
				phone: formData.phone || undefined,
				department: formData.department || undefined,
				status: formData.status,
			});

			if (response.error) {
				toast({
					title: "Error",
					description: "Failed to create employee",
					variant: "destructive",
				});
				return;
			}

			toast({
				title: "Success",
				description: "Employee created successfully",
			});
			setIsCreateDialogOpen(false);
			resetForm();
			fetchEmployees();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to create employee",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Handles updating an employee.
	 */
	const handleUpdate = async (): Promise<void> => {
		if (!selectedEmployee) return;

		setIsSubmitting(true);
		try {
			const response = await api.employees({ id: selectedEmployee.id }).put({
				code: formData.code,
				firstName: formData.firstName,
				lastName: formData.lastName,
				email: formData.email || undefined,
				phone: formData.phone || undefined,
				department: formData.department || undefined,
				status: formData.status,
			});

			if (response.error) {
				toast({
					title: "Error",
					description: "Failed to update employee",
					variant: "destructive",
				});
				return;
			}

			toast({
				title: "Success",
				description: "Employee updated successfully",
			});
			setIsEditDialogOpen(false);
			setSelectedEmployee(null);
			resetForm();
			fetchEmployees();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to update employee",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Handles deleting an employee.
	 */
	const handleDelete = async (): Promise<void> => {
		if (!selectedEmployee) return;

		setIsSubmitting(true);
		try {
			const response = await api.employees({ id: selectedEmployee.id }).delete();

			if (response.error) {
				toast({
					title: "Error",
					description: "Failed to delete employee",
					variant: "destructive",
				});
				return;
			}

			toast({
				title: "Success",
				description: "Employee deleted successfully",
			});
			setIsDeleteDialogOpen(false);
			setSelectedEmployee(null);
			fetchEmployees();
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to delete employee",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	/**
	 * Opens the edit dialog with employee data.
	 */
	const openEditDialog = (employee: Employee): void => {
		setSelectedEmployee(employee);
		setFormData({
			code: employee.code,
			firstName: employee.firstName,
			lastName: employee.lastName,
			email: employee.email ?? "",
			phone: employee.phone ?? "",
			department: employee.department ?? "",
			status: employee.status,
		});
		setIsEditDialogOpen(true);
	};

	/**
	 * Opens the delete confirmation dialog.
	 */
	const openDeleteDialog = (employee: Employee): void => {
		setSelectedEmployee(employee);
		setIsDeleteDialogOpen(true);
	};

	/**
	 * Returns badge variant based on employee status.
	 */
	const getStatusBadge = (status: Employee["status"]): React.JSX.Element => {
		const variants: Record<Employee["status"], "success" | "secondary" | "warning"> = {
			ACTIVE: "success",
			INACTIVE: "secondary",
			ON_LEAVE: "warning",
		};
		const labels: Record<Employee["status"], string> = {
			ACTIVE: "Active",
			INACTIVE: "Inactive",
			ON_LEAVE: "On Leave",
		};
		return <Badge variant={variants[status]}>{labels[status]}</Badge>;
	};

	/**
	 * Column definitions for the data table.
	 */
	const columns: Column<Employee>[] = [
		{
			key: "code",
			header: "Code",
			cell: (employee) => (
				<span className="font-mono text-sm">{employee.code}</span>
			),
		},
		{
			key: "name",
			header: "Name",
			cell: (employee) => (
				<div>
					<p className="font-medium">
						{employee.firstName} {employee.lastName}
					</p>
					{employee.email && (
						<p className="text-xs text-muted-foreground">{employee.email}</p>
					)}
				</div>
			),
		},
		{
			key: "department",
			header: "Department",
			cell: (employee) => employee.department ?? "—",
		},
		{
			key: "status",
			header: "Status",
			cell: (employee) => getStatusBadge(employee.status),
		},
		{
			key: "face",
			header: "Face Enrolled",
			cell: (employee) =>
				employee.rekognitionUserId ? (
					<Badge variant="success" className="gap-1">
						<UserCheck className="h-3 w-3" />
						Yes
					</Badge>
				) : (
					<Badge variant="outline" className="gap-1">
						<UserX className="h-3 w-3" />
						No
					</Badge>
				),
		},
		{
			key: "createdAt",
			header: "Created",
			cell: (employee) => format(new Date(employee.createdAt), "MMM d, yyyy"),
		},
		{
			key: "actions",
			header: "Actions",
			cell: (employee) => (
				<div className="flex gap-2">
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => {
							e.stopPropagation();
							openEditDialog(employee);
						}}
					>
						<Pencil className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={(e) => {
							e.stopPropagation();
							openDeleteDialog(employee);
						}}
					>
						<Trash2 className="h-4 w-4 text-destructive" />
					</Button>
				</div>
			),
		},
	];

	return (
		<>
			<Header title="Employees" />
			<div className="p-6 space-y-6">
				{/* Toolbar */}
				<div className="flex items-center justify-between gap-4">
					<div className="flex-1 max-w-sm">
						<Input
							placeholder="Search by name or code..."
							value={searchQuery}
							onChange={(e) => {
								setSearchQuery(e.target.value);
								setPage(1);
							}}
						/>
					</div>
					<Button
						onClick={() => {
							resetForm();
							setIsCreateDialogOpen(true);
						}}
					>
						<Plus className="h-4 w-4 mr-2" />
						Add Employee
					</Button>
				</div>

				{/* Data Table */}
				<DataTable
					columns={columns}
					data={employees}
					isLoading={isLoading}
					keyExtractor={(employee) => employee.id}
					emptyMessage="No employees found"
					page={page}
					totalPages={totalPages}
					onPageChange={setPage}
				/>
			</div>

			{/* Create Dialog */}
			<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add Employee</DialogTitle>
						<DialogDescription>
							Create a new employee record. Fill in the required fields below.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="code">Employee Code *</Label>
								<Input
									id="code"
									value={formData.code}
									onChange={(e) =>
										setFormData({ ...formData, code: e.target.value })
									}
									placeholder="EMP001"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="status">Status *</Label>
								<Select
									value={formData.status}
									onValueChange={(value: Employee["status"]) =>
										setFormData({ ...formData, status: value })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="ACTIVE">Active</SelectItem>
										<SelectItem value="INACTIVE">Inactive</SelectItem>
										<SelectItem value="ON_LEAVE">On Leave</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="firstName">First Name *</Label>
								<Input
									id="firstName"
									value={formData.firstName}
									onChange={(e) =>
										setFormData({ ...formData, firstName: e.target.value })
									}
									placeholder="John"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="lastName">Last Name *</Label>
								<Input
									id="lastName"
									value={formData.lastName}
									onChange={(e) =>
										setFormData({ ...formData, lastName: e.target.value })
									}
									placeholder="Doe"
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									type="email"
									value={formData.email}
									onChange={(e) =>
										setFormData({ ...formData, email: e.target.value })
									}
									placeholder="john@example.com"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="phone">Phone</Label>
								<Input
									id="phone"
									value={formData.phone}
									onChange={(e) =>
										setFormData({ ...formData, phone: e.target.value })
									}
									placeholder="+1 234 567 8900"
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="department">Department</Label>
							<Input
								id="department"
								value={formData.department}
								onChange={(e) =>
									setFormData({ ...formData, department: e.target.value })
								}
								placeholder="Engineering"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsCreateDialogOpen(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button
							onClick={handleCreate}
							disabled={
								isSubmitting ||
								!formData.code ||
								!formData.firstName ||
								!formData.lastName
							}
						>
							{isSubmitting ? "Creating..." : "Create Employee"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Edit Dialog */}
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Employee</DialogTitle>
						<DialogDescription>
							Update the employee information below.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="edit-code">Employee Code *</Label>
								<Input
									id="edit-code"
									value={formData.code}
									onChange={(e) =>
										setFormData({ ...formData, code: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="edit-status">Status *</Label>
								<Select
									value={formData.status}
									onValueChange={(value: Employee["status"]) =>
										setFormData({ ...formData, status: value })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="ACTIVE">Active</SelectItem>
										<SelectItem value="INACTIVE">Inactive</SelectItem>
										<SelectItem value="ON_LEAVE">On Leave</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="edit-firstName">First Name *</Label>
								<Input
									id="edit-firstName"
									value={formData.firstName}
									onChange={(e) =>
										setFormData({ ...formData, firstName: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="edit-lastName">Last Name *</Label>
								<Input
									id="edit-lastName"
									value={formData.lastName}
									onChange={(e) =>
										setFormData({ ...formData, lastName: e.target.value })
									}
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="edit-email">Email</Label>
								<Input
									id="edit-email"
									type="email"
									value={formData.email}
									onChange={(e) =>
										setFormData({ ...formData, email: e.target.value })
									}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="edit-phone">Phone</Label>
								<Input
									id="edit-phone"
									value={formData.phone}
									onChange={(e) =>
										setFormData({ ...formData, phone: e.target.value })
									}
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="edit-department">Department</Label>
							<Input
								id="edit-department"
								value={formData.department}
								onChange={(e) =>
									setFormData({ ...formData, department: e.target.value })
								}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsEditDialogOpen(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button
							onClick={handleUpdate}
							disabled={
								isSubmitting ||
								!formData.code ||
								!formData.firstName ||
								!formData.lastName
							}
						>
							{isSubmitting ? "Saving..." : "Save Changes"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Employee</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete{" "}
							<strong>
								{selectedEmployee?.firstName} {selectedEmployee?.lastName}
							</strong>
							? This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setIsDeleteDialogOpen(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleDelete}
							disabled={isSubmitting}
						>
							{isSubmitting ? "Deleting..." : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
