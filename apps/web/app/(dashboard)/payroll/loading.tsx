import { Skeleton } from '@/components/ui/skeleton';

export default function PayrollLoading(): React.ReactElement {
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-4 w-64" />
			</div>
			<div className="space-y-4">
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-64 w-full" />
				<Skeleton className="h-48 w-full" />
			</div>
		</div>
	);
}
