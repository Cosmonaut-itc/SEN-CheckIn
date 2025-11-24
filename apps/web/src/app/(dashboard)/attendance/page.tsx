"use client";

import * as React from "react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { Calendar, Clock, LogIn, LogOut, Filter } from "lucide-react";
import { Header } from "@/components/header";
import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

/**
 * Attendance record interface.
 */
interface AttendanceRecord {
	id: string;
	employeeId: string;
	deviceId: string;
	timestamp: string;
	type: "CHECK_IN" | "CHECK_OUT";
	metadata: Record<string, unknown> | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * Employee interface for display purposes.
 */
interface Employee {
	id: string;
	code: string;
	firstName: string;
	lastName: string;
}

/**
 * Device interface for display purposes.
 */
interface Device {
	id: string;
	code: string;
	name: string | null;
}

const PAGE_SIZE = 20;

/**
 * Preset date range options.
 */
type DateRange = "today" | "yesterday" | "last7days" | "last30days" | "custom";

/**
 * Attendance records page component.
 * Displays attendance history with date filtering.
 *
 * @returns Rendered attendance page
 */
export default function AttendancePage(): React.JSX.Element {
	const { toast } = useToast();
	const [records, setRecords] = React.useState<AttendanceRecord[]>([]);
	const [employees, setEmployees] = React.useState<Employee[]>([]);
	const [devices, setDevices] = React.useState<Device[]>([]);
	const [isLoading, setIsLoading] = React.useState<boolean>(true);
	const [page, setPage] = React.useState<number>(1);
	const [totalPages, setTotalPages] = React.useState<number>(1);
	const [totalRecords, setTotalRecords] = React.useState<number>(0);

	// Filter states
	const [dateRange, setDateRange] = React.useState<DateRange>("today");
	const [typeFilter, setTypeFilter] = React.useState<string>("all");
	const [startDate, setStartDate] = React.useState<string>("");
	const [endDate, setEndDate] = React.useState<string>("");

	/**
	 * Fetches attendance records and reference data from the API.
	 */
	const fetchData = React.useCallback(async (): Promise<void> => {
		setIsLoading(true);
		try {
			// Fetch attendance records
			const attendanceRes = await api.attendance.get({
				query: {
					limit: PAGE_SIZE,
					offset: (page - 1) * PAGE_SIZE,
				},
			});

			// Fetch employees for display
			const employeesRes = await api.employees.get({
				query: { limit: 1000, offset: 0 },
			});

			// Fetch devices for display
			const devicesRes = await api.devices.get({
				query: { limit: 1000, offset: 0 },
			});

			if (attendanceRes.data) {
				setRecords(attendanceRes.data.data as AttendanceRecord[]);
				const total = attendanceRes.data.pagination?.total ?? 0;
				setTotalRecords(total);
				setTotalPages(Math.ceil(total / PAGE_SIZE));
			}

			if (employeesRes.data) {
				setEmployees(employeesRes.data.data as Employee[]);
			}

			if (devicesRes.data) {
				setDevices(devicesRes.data.data as Device[]);
			}
		} catch (error) {
			toast({
				title: "Error",
				description: "Failed to fetch attendance records",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	}, [page, toast]);

	React.useEffect(() => {
		fetchData();
	}, [fetchData]);

	/**
	 * Gets employee display name by ID.
	 */
	const getEmployeeName = (employeeId: string): string => {
		const employee = employees.find((e) => e.id === employeeId);
		if (employee) {
			return `${employee.firstName} ${employee.lastName}`;
		}
		return `Employee ${employeeId.slice(0, 8)}...`;
	};

	/**
	 * Gets employee code by ID.
	 */
	const getEmployeeCode = (employeeId: string): string => {
		const employee = employees.find((e) => e.id === employeeId);
		return employee?.code ?? "N/A";
	};

	/**
	 * Gets device display name by ID.
	 */
	const getDeviceName = (deviceId: string): string => {
		const device = devices.find((d) => d.id === deviceId);
		if (device) {
			return device.name ?? device.code;
		}
		return `Device ${deviceId.slice(0, 8)}...`;
	};

	/**
	 * Returns badge component based on attendance type.
	 */
	const getTypeBadge = (type: AttendanceRecord["type"]): React.JSX.Element => {
		if (type === "CHECK_IN") {
			return (
				<Badge variant="success" className="gap-1">
					<LogIn className="h-3 w-3" />
					Check In
				</Badge>
			);
		}
		return (
			<Badge variant="secondary" className="gap-1">
				<LogOut className="h-3 w-3" />
				Check Out
			</Badge>
		);
	};

	/**
	 * Handles date range preset selection.
	 */
	const handleDateRangeChange = (value: DateRange): void => {
		setDateRange(value);
		const today = new Date();

		switch (value) {
			case "today":
				setStartDate(format(startOfDay(today), "yyyy-MM-dd"));
				setEndDate(format(endOfDay(today), "yyyy-MM-dd"));
				break;
			case "yesterday": {
				const yesterday = subDays(today, 1);
				setStartDate(format(startOfDay(yesterday), "yyyy-MM-dd"));
				setEndDate(format(endOfDay(yesterday), "yyyy-MM-dd"));
				break;
			}
			case "last7days":
				setStartDate(format(startOfDay(subDays(today, 7)), "yyyy-MM-dd"));
				setEndDate(format(endOfDay(today), "yyyy-MM-dd"));
				break;
			case "last30days":
				setStartDate(format(startOfDay(subDays(today, 30)), "yyyy-MM-dd"));
				setEndDate(format(endOfDay(today), "yyyy-MM-dd"));
				break;
			case "custom":
				// Keep current custom dates
				break;
		}
	};

	/**
	 * Calculates stats for the current data.
	 */
	const stats = React.useMemo(() => {
		const checkIns = records.filter((r) => r.type === "CHECK_IN").length;
		const checkOuts = records.filter((r) => r.type === "CHECK_OUT").length;
		return { checkIns, checkOuts, total: records.length };
	}, [records]);

	/**
	 * Column definitions for the data table.
	 */
	const columns: Column<AttendanceRecord>[] = [
		{
			key: "employee",
			header: "Employee",
			cell: (record) => (
				<div>
					<p className="font-medium">{getEmployeeName(record.employeeId)}</p>
					<p className="text-xs text-muted-foreground">
						{getEmployeeCode(record.employeeId)}
					</p>
				</div>
			),
		},
		{
			key: "type",
			header: "Type",
			cell: (record) => getTypeBadge(record.type),
		},
		{
			key: "timestamp",
			header: "Time",
			cell: (record) => (
				<div className="flex items-center gap-2">
					<Clock className="h-4 w-4 text-muted-foreground" />
					<span>{format(new Date(record.timestamp), "MMM d, yyyy h:mm a")}</span>
				</div>
			),
		},
		{
			key: "device",
			header: "Device",
			cell: (record) => (
				<span className="text-sm">{getDeviceName(record.deviceId)}</span>
			),
		},
	];

	return (
		<>
			<Header title="Attendance Records" />
			<div className="p-6 space-y-6">
				{/* Stats Cards */}
				<div className="grid gap-4 md:grid-cols-3">
					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Total Records</CardTitle>
							<Calendar className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">{totalRecords}</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Check-Ins</CardTitle>
							<LogIn className="h-4 w-4 text-green-500" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">{stats.checkIns}</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Check-Outs</CardTitle>
							<LogOut className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">{stats.checkOuts}</div>
						</CardContent>
					</Card>
				</div>

				{/* Filters */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Filter className="h-4 w-4" />
							Filters
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-wrap gap-4">
							<div className="space-y-2">
								<Label htmlFor="dateRange">Date Range</Label>
								<Select
									value={dateRange}
									onValueChange={(value: DateRange) =>
										handleDateRangeChange(value)
									}
								>
									<SelectTrigger className="w-[180px]">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="today">Today</SelectItem>
										<SelectItem value="yesterday">Yesterday</SelectItem>
										<SelectItem value="last7days">Last 7 Days</SelectItem>
										<SelectItem value="last30days">Last 30 Days</SelectItem>
										<SelectItem value="custom">Custom</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{dateRange === "custom" && (
								<>
									<div className="space-y-2">
										<Label htmlFor="startDate">Start Date</Label>
										<Input
											id="startDate"
											type="date"
											value={startDate}
											onChange={(e) => setStartDate(e.target.value)}
											className="w-[180px]"
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="endDate">End Date</Label>
										<Input
											id="endDate"
											type="date"
											value={endDate}
											onChange={(e) => setEndDate(e.target.value)}
											className="w-[180px]"
										/>
									</div>
								</>
							)}

							<div className="space-y-2">
								<Label htmlFor="typeFilter">Type</Label>
								<Select value={typeFilter} onValueChange={setTypeFilter}>
									<SelectTrigger className="w-[180px]">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Types</SelectItem>
										<SelectItem value="CHECK_IN">Check In</SelectItem>
										<SelectItem value="CHECK_OUT">Check Out</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="flex items-end">
								<Button onClick={fetchData} variant="outline">
									Apply Filters
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Data Table */}
				<DataTable
					columns={columns}
					data={records}
					isLoading={isLoading}
					keyExtractor={(record) => record.id}
					emptyMessage="No attendance records found"
					page={page}
					totalPages={totalPages}
					onPageChange={setPage}
				/>
			</div>
		</>
	);
}
