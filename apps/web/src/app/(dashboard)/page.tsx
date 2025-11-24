"use client";

import * as React from "react";
import { format } from "date-fns";
import {
	Building2,
	Calendar,
	MapPin,
	Monitor,
	Users,
	Activity,
} from "lucide-react";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

/**
 * Stats card interface for dashboard metrics.
 */
interface StatsCardProps {
	/** Card title */
	title: string;
	/** Metric value */
	value: string | number;
	/** Optional description text */
	description?: string;
	/** Icon component */
	icon: React.ComponentType<{ className?: string }>;
	/** Loading state */
	isLoading?: boolean;
}

/**
 * Stats card component for displaying metrics.
 *
 * @param props - Stats card props
 * @returns Rendered stats card
 */
function StatsCard({
	title,
	value,
	description,
	icon: Icon,
	isLoading = false,
}: StatsCardProps): React.JSX.Element {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">{title}</CardTitle>
				<Icon className="h-4 w-4 text-muted-foreground" />
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<>
						<Skeleton className="h-8 w-20 mb-1" />
						<Skeleton className="h-4 w-32" />
					</>
				) : (
					<>
						<div className="text-2xl font-bold">{value}</div>
						{description && (
							<p className="text-xs text-muted-foreground">{description}</p>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}

/**
 * Attendance record interface for recent activity.
 */
interface AttendanceRecord {
	id: string;
	employeeId: string;
	timestamp: string;
	type: "CHECK_IN" | "CHECK_OUT";
	employee?: {
		firstName: string;
		lastName: string;
		code: string;
	};
}

/**
 * Dashboard home page component.
 * Displays entity counts and recent attendance records.
 *
 * @returns Rendered dashboard page
 */
export default function DashboardPage(): React.JSX.Element {
	const [stats, setStats] = React.useState({
		employees: 0,
		devices: 0,
		locations: 0,
		clients: 0,
		todayAttendance: 0,
	});
	const [recentAttendance, setRecentAttendance] = React.useState<AttendanceRecord[]>([]);
	const [isLoading, setIsLoading] = React.useState<boolean>(true);

	/**
	 * Fetches dashboard data on component mount.
	 */
	React.useEffect(() => {
		const fetchDashboardData = async (): Promise<void> => {
			try {
				// Fetch counts from API
				const [employeesRes, devicesRes, locationsRes, clientsRes, attendanceRes] =
					await Promise.all([
						api.employees.get({ query: { limit: 1, offset: 0 } }),
						api.devices.get({ query: { limit: 1, offset: 0 } }),
						api.locations.get({ query: { limit: 1, offset: 0 } }),
						api.clients.get({ query: { limit: 1, offset: 0 } }),
						api.attendance.get({ query: { limit: 10, offset: 0 } }),
					]);

				// Update stats with response data
				setStats({
					employees: employeesRes.data?.total ?? 0,
					devices: devicesRes.data?.total ?? 0,
					locations: locationsRes.data?.total ?? 0,
					clients: clientsRes.data?.total ?? 0,
					todayAttendance: attendanceRes.data?.total ?? 0,
				});

				// Set recent attendance records
				if (attendanceRes.data?.data) {
					setRecentAttendance(attendanceRes.data.data as AttendanceRecord[]);
				}
			} catch (error) {
				console.error("Failed to fetch dashboard data:", error);
			} finally {
				setIsLoading(false);
			}
		};

		fetchDashboardData();
	}, []);

	return (
		<>
			<Header title="Dashboard" />
			<div className="p-6 space-y-6">
				{/* Stats Grid */}
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
					<StatsCard
						title="Total Employees"
						value={stats.employees}
						description="Active employees"
						icon={Users}
						isLoading={isLoading}
					/>
					<StatsCard
						title="Devices"
						value={stats.devices}
						description="Registered kiosks"
						icon={Monitor}
						isLoading={isLoading}
					/>
					<StatsCard
						title="Locations"
						value={stats.locations}
						description="Office locations"
						icon={MapPin}
						isLoading={isLoading}
					/>
					<StatsCard
						title="Clients"
						value={stats.clients}
						description="Client organizations"
						icon={Building2}
						isLoading={isLoading}
					/>
					<StatsCard
						title="Today's Check-ins"
						value={stats.todayAttendance}
						description="Attendance records"
						icon={Calendar}
						isLoading={isLoading}
					/>
				</div>

				{/* Recent Activity */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Activity className="h-5 w-5" />
							Recent Attendance
						</CardTitle>
					</CardHeader>
					<CardContent>
						{isLoading ? (
							<div className="space-y-4">
								{Array.from({ length: 5 }).map((_, i) => (
									<div key={i} className="flex items-center gap-4">
										<Skeleton className="h-10 w-10 rounded-full" />
										<div className="space-y-2">
											<Skeleton className="h-4 w-32" />
											<Skeleton className="h-3 w-24" />
										</div>
									</div>
								))}
							</div>
						) : recentAttendance.length === 0 ? (
							<p className="text-sm text-muted-foreground py-8 text-center">
								No recent attendance records
							</p>
						) : (
							<div className="space-y-4">
								{recentAttendance.map((record) => (
									<div
										key={record.id}
										className="flex items-center justify-between py-2 border-b last:border-0"
									>
										<div className="flex items-center gap-4">
											<div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
												<Users className="h-5 w-5 text-muted-foreground" />
											</div>
											<div>
												<p className="font-medium text-sm">
													{record.employee
														? `${record.employee.firstName} ${record.employee.lastName}`
														: `Employee ${record.employeeId.slice(0, 8)}...`}
												</p>
												<p className="text-xs text-muted-foreground">
													{record.employee?.code ?? "N/A"}
												</p>
											</div>
										</div>
										<div className="flex items-center gap-4">
											<Badge
												variant={record.type === "CHECK_IN" ? "success" : "secondary"}
											>
												{record.type === "CHECK_IN" ? "Check In" : "Check Out"}
											</Badge>
											<p className="text-sm text-muted-foreground">
												{format(new Date(record.timestamp), "MMM d, h:mm a")}
											</p>
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
}
