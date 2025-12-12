import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { queryKeys, mutationKeys } from '@/lib/query-keys';
import { formatShortDateUtc } from '@/lib/date-format';
import {
	fetchScheduleExceptionsList,
	type Employee,
	type ScheduleException,
} from '@/lib/client-functions';
import {
	createScheduleException,
	deleteScheduleException,
	updateScheduleException,
} from '@/actions/schedules';
import { ExceptionFormDialog } from './exception-form-dialog';

/**
 * Derives the first and last day of the current month.
 *
 * @returns Tuple with start and end ISO strings
 */
function getCurrentMonthRange(): { start: string; end: string } {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), 1);
	const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/**
 * Props for ScheduleExceptionsTab component.
 */
interface ScheduleExceptionsTabProps {
	/** Organization identifier */
	organizationId?: string | null;
	/** Employee list for filtering and selection */
	employees: Employee[];
}

/**
 * Exceptions management tab for creating, editing, and deleting schedule exceptions.
 *
 * @param props - Component props
 * @returns Rendered exceptions tab
 */
export function ScheduleExceptionsTab({
	organizationId,
	employees,
}: ScheduleExceptionsTabProps): React.ReactElement {
	const queryClient = useQueryClient();
	const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
	const [editingException, setEditingException] = useState<ScheduleException | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
	const monthRange = useMemo(() => getCurrentMonthRange(), []);
	const [fromDate, setFromDate] = useState<string>(monthRange.start);
	const [toDate, setToDate] = useState<string>(monthRange.end);

	const listParams = useMemo(
		() => ({
			limit: 100,
			offset: 0,
			organizationId: organizationId ?? undefined,
			employeeId: selectedEmployeeId !== 'all' ? selectedEmployeeId : undefined,
			fromDate: fromDate ? new Date(fromDate) : undefined,
			toDate: toDate ? new Date(toDate) : undefined,
		}),
		[organizationId, selectedEmployeeId, fromDate, toDate],
	);

	const { data: exceptionsResponse, isFetching } = useQuery({
		queryKey: queryKeys.scheduleExceptions.list(listParams),
		queryFn: () => fetchScheduleExceptionsList(listParams),
		enabled: Boolean(organizationId),
	});

	const createMutation = useMutation({
		mutationKey: mutationKeys.scheduleExceptions.create,
		mutationFn: createScheduleException,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Exception created successfully');
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduleExceptions.all });
				setIsFormOpen(false);
			} else {
				toast.error(result.error ?? 'Failed to create exception');
			}
		},
		onError: () => toast.error('Failed to create exception'),
	});

	const updateMutation = useMutation({
		mutationKey: mutationKeys.scheduleExceptions.update,
		mutationFn: updateScheduleException,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Exception updated successfully');
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduleExceptions.all });
				setIsFormOpen(false);
				setEditingException(null);
			} else {
				toast.error(result.error ?? 'Failed to update exception');
			}
		},
		onError: () => toast.error('Failed to update exception'),
	});

	const deleteMutation = useMutation({
		mutationKey: mutationKeys.scheduleExceptions.delete,
		mutationFn: deleteScheduleException,
		onSuccess: (result) => {
			if (result.success) {
				toast.success('Exception deleted successfully');
				queryClient.invalidateQueries({ queryKey: queryKeys.scheduleExceptions.all });
			} else {
				toast.error(result.error ?? 'Failed to delete exception');
			}
		},
		onError: () => toast.error('Failed to delete exception'),
	});

	const exceptions = exceptionsResponse?.data ?? [];

	const handleSubmit = async (input: {
		id?: string;
		employeeId: string;
		exceptionDate: Date;
		exceptionType: ScheduleException['exceptionType'];
		startTime?: string | null;
		endTime?: string | null;
		reason?: string | null;
	}): Promise<void> => {
		if (input.id) {
			await updateMutation.mutateAsync({
				id: input.id,
				exceptionDate: input.exceptionDate,
				exceptionType: input.exceptionType,
				startTime: input.startTime,
				endTime: input.endTime,
				reason: input.reason,
			});
		} else {
			if (!organizationId) {
				toast.error('No active organization selected.');
				return;
			}
			await createMutation.mutateAsync({
				employeeId: input.employeeId,
				exceptionDate: input.exceptionDate,
				exceptionType: input.exceptionType,
				startTime: input.startTime ?? undefined,
				endTime: input.endTime ?? undefined,
				reason: input.reason,
			});
		}
	};

	if (!organizationId) {
		return (
			<div className="space-y-2 rounded-md border p-4">
				<h2 className="text-lg font-semibold">Exceptions</h2>
				<p className="text-muted-foreground">
					Select an active organization to manage schedule exceptions.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 className="text-xl font-semibold">Schedule Exceptions</h2>
					<p className="text-sm text-muted-foreground">
						Manage day-off, modified hours, and extra working days.
					</p>
				</div>
				<Button
					onClick={() => {
						setEditingException(null);
						setIsFormOpen(true);
					}}
				>
					<Plus className="mr-2 h-4 w-4" />
					Add Exception
				</Button>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
					<SelectTrigger className="w-[240px]">
						<SelectValue placeholder="All employees" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All employees</SelectItem>
						{employees.map((employee) => (
							<SelectItem key={employee.id} value={employee.id}>
								{employee.firstName} {employee.lastName}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<label className="flex items-center gap-2">
						<span>From</span>
						<input
							type="date"
							className="rounded border px-2 py-1 text-sm"
							value={fromDate}
							onChange={(event) => setFromDate(event.target.value)}
						/>
					</label>
					<label className="flex items-center gap-2">
						<span>To</span>
						<input
							type="date"
							className="rounded border px-2 py-1 text-sm"
							value={toDate}
							onChange={(event) => setToDate(event.target.value)}
						/>
					</label>
				</div>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Employee</TableHead>
							<TableHead>Date</TableHead>
							<TableHead>Type</TableHead>
							<TableHead>Time</TableHead>
							<TableHead>Reason</TableHead>
							<TableHead className="w-[120px]">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isFetching ? (
							<TableRow>
								<TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
									Loading exceptions...
								</TableCell>
							</TableRow>
						) : exceptions.length === 0 ? (
							<TableRow>
								<TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
									No exceptions found.
								</TableCell>
							</TableRow>
						) : (
							exceptions.map((exception) => (
								<TableRow key={exception.id}>
									<TableCell>
										{exception.employeeName
											? `${exception.employeeName} ${exception.employeeLastName ?? ''}`
											: exception.employeeId}
									</TableCell>
									<TableCell>
										{formatShortDateUtc(new Date(exception.exceptionDate))}
									</TableCell>
									<TableCell className="uppercase">{exception.exceptionType}</TableCell>
									<TableCell>
										{exception.startTime && exception.endTime
											? `${exception.startTime} - ${exception.endTime}`
											: 'N/A'}
									</TableCell>
									<TableCell>{exception.reason ?? '-'}</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button
												variant="ghost"
												size="icon"
												onClick={() => {
													setEditingException(exception);
													setIsFormOpen(true);
												}}
												title="Edit exception"
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => setDeleteId(exception.id)}
												title="Delete exception"
											>
												<Trash2 className="h-4 w-4 text-destructive" />
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			<ExceptionFormDialog
				open={isFormOpen}
				onOpenChange={(open) => {
					setIsFormOpen(open);
					if (!open) {
						setEditingException(null);
					}
				}}
				employees={employees}
				onSubmit={handleSubmit}
				initialException={editingException}
			/>

			<Dialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete exception</DialogTitle>
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
		</div>
	);
}
