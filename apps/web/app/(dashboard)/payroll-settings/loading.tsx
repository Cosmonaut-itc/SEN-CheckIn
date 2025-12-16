import { Skeleton } from '@/components/ui/skeleton';

export default function PayrollSettingsLoading(): React.ReactElement {
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-4 w-64" />
			</div>
			<div className="rounded-lg border p-6">
				<div className="space-y-4">
					<Skeleton className="h-5 w-40" />
					<Skeleton className="h-10 w-64" />
					<Skeleton className="h-10 w-32" />
				</div>
			</div>
		</div>
	);
}
