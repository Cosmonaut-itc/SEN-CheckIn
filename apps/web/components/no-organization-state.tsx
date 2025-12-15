'use client';

import { Building2, Clock3 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import React from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface NoOrganizationStateProps {
	role?: string | null;
}

/**
 * Displays the dashboard empty state when the user has no active organization.
 */
export function NoOrganizationState({ role }: NoOrganizationStateProps): React.ReactElement {
	const isAdmin = role === 'admin' || role === 'owner';
	const t = useTranslations('NoOrganizationState');

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
								{isAdmin ? t('title.admin') : t('title.nonAdmin')}
							</CardTitle>
							<CardDescription>
								{isAdmin ? t('description.admin') : t('description.nonAdmin')}
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{isAdmin ? (
						<>
							<p className="text-sm text-muted-foreground">{t('admin.body')}</p>
							<Button asChild>
								<Link href="/organizations">{t('admin.goToOrganizations')}</Link>
							</Button>
						</>
					) : (
						<div className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
							<Clock3 className="h-4 w-4" />
							<span>{t('nonAdmin.banner')}</span>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
