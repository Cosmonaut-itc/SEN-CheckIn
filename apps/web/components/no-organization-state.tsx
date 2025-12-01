'use client';

import React from 'react';
import Link from 'next/link';
import { Building2, Clock3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

interface NoOrganizationStateProps {
	role?: string | null;
}

/**
 * Displays the dashboard empty state when the user has no active organization.
 */
export function NoOrganizationState({
	role,
}: NoOrganizationStateProps): React.ReactElement {
	const isAdmin = role === 'admin' || role === 'owner';

	return (
		<div className="flex h-full items-center justify-center">
			<Card className="w-full max-w-2xl border-dashed shadow-none">
				<CardHeader className="space-y-2">
					<div className="flex items-center gap-3">
						<div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
							<Building2 className="h-5 w-5 text-primary" />
						</div>
						<div>
							<CardTitle className="text-xl">
								{isAdmin
									? 'Create your first organization'
									: 'Waiting for an invitation'}
							</CardTitle>
							<CardDescription>
								{isAdmin
									? 'Start by creating an organization to manage locations, devices, and members.'
									: 'An admin needs to invite you to an organization before you can access the dashboard.'}
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{isAdmin ? (
						<>
							<p className="text-sm text-muted-foreground">
								You can create an organization, invite teammates, and assign roles.
								Once set, all dashboard data will be scoped to that organization.
							</p>
							<Button asChild>
								<Link href="/dashboard/organizations">Go to organizations</Link>
							</Button>
						</>
					) : (
						<div className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
							<Clock3 className="h-4 w-4" />
							<span>
								You&apos;re signed in but not part of any organization yet. Please ask
								an administrator to invite you.
							</span>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
