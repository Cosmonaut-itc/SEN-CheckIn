'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { type CreateOrganizationUserInput, createOrganizationUser } from '@/actions/users';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { type OrganizationMember, fetchOrganizationMembers } from '@/lib/client-functions';
import { useAppForm } from '@/lib/forms';
import { useOrgContext } from '@/lib/org-client-context';
import { mutationKeys, queryKeys } from '@/lib/query-keys';

type CreateUserFormValues = Omit<CreateOrganizationUserInput, 'organizationId'>;

const initialFormValues: CreateUserFormValues = {
	name: '',
	email: '',
	username: '',
	password: '',
	role: 'member',
};

const roleBadgeVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
	owner: 'default',
	admin: 'secondary',
	member: 'outline',
};

/**
 * Computes initials for an avatar fallback.
 *
 * @param name - Full name or email-like string
 * @returns Uppercased initials
 */
function getInitials(name: string): string {
	const parts = name.split(' ').filter(Boolean);
	if (parts.length >= 2) {
		return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
	}
	return name.substring(0, 2).toUpperCase();
}

export function UsersPageClient(): React.ReactElement {
	const queryClient = useQueryClient();
	const { organizationId, organizationName } = useOrgContext();
	const t = useTranslations('Users');
	const tCommon = useTranslations('Common');
	const [search, setSearch] = useState('');
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	const { data, isFetching } = useQuery({
		queryKey: queryKeys.organizationMembers.list({
			organizationId,
			limit: 100,
			offset: 0,
		}),
		queryFn: () =>
			fetchOrganizationMembers({
				organizationId,
				limit: 100,
				offset: 0,
			}),
		enabled: Boolean(organizationId),
	});

	const members = useMemo(() => data?.members ?? [], [data?.members]);
	const filteredMembers = useMemo(
		() =>
			search
				? members.filter((member) => {
						const haystack =
							`${member.user.name ?? ''} ${member.user.email ?? ''}`.toLowerCase();
						return haystack.includes(search.toLowerCase());
					})
				: members,
		[members, search],
	);

	const form = useAppForm({
		defaultValues: initialFormValues,
		onSubmit: async ({ value }) => {
			if (!organizationId) {
				toast.error(t('toast.selectOrganization'));
				return;
			}

			await createUserMutation.mutateAsync({
				...value,
				organizationId,
			});
		},
	});

	const createUserMutation = useMutation({
		mutationKey: mutationKeys.organizationMembers.create,
		mutationFn: createOrganizationUser,
		onSuccess: (result) => {
			if (result.success) {
				toast.success(t('toast.createSuccess'));
				setIsDialogOpen(false);
				form.reset();
				queryClient.invalidateQueries({
					queryKey: queryKeys.organizationMembers.all,
				});
			} else {
				toast.error(result.error ?? t('toast.createError'));
			}
		},
		onError: () => {
			toast.error(t('toast.createError'));
		},
	});

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
					<p className="text-muted-foreground">
						{t('subtitle', {
							organization: organizationName ?? t('fallbackOrganization'),
						})}
					</p>
				</div>
				<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
					<DialogTrigger asChild>
						<Button disabled={!organizationId}>
							<UserPlus className="mr-2 h-4 w-4" />
							{t('actions.create')}
						</Button>
					</DialogTrigger>
					<DialogContent>
						<form
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								form.handleSubmit();
							}}
						>
							<DialogHeader>
								<DialogTitle>{t('dialog.title')}</DialogTitle>
								<DialogDescription>{t('dialog.description')}</DialogDescription>
							</DialogHeader>
							<form.AppForm>
								<div className="mt-6 space-y-6">
									<form.AppField name="name">
										{(field) => (
											<field.TextField
												label={t('fields.fullName')}
												placeholder={t('placeholders.fullName')}
												orientation="vertical"
											/>
										)}
									</form.AppField>
									<form.AppField
										name="email"
										validators={{
											onChange: ({ value }) =>
												value.includes('@')
													? undefined
													: t('validation.validEmailRequired'),
										}}
									>
										{(field) => (
											<field.TextField
												label={t('fields.email')}
												placeholder={t('placeholders.email')}
												orientation="vertical"
											/>
										)}
									</form.AppField>
									<form.AppField name="username">
										{(field) => (
											<field.TextField
												label={t('fields.username')}
												placeholder={t('placeholders.username')}
												orientation="vertical"
											/>
										)}
									</form.AppField>
									<form.AppField name="password">
										{(field) => (
											<field.TextField
												label={t('fields.temporaryPassword')}
												type="password"
												placeholder={t('placeholders.temporaryPassword')}
												orientation="vertical"
											/>
										)}
									</form.AppField>
									<form.AppField name="role">
										{(field) => (
											<field.SelectField
												label={t('fields.role')}
												placeholder={t('placeholders.selectRole')}
												options={[
													{ value: 'admin', label: t('roles.admin') },
													{ value: 'member', label: t('roles.member') },
												]}
											/>
										)}
									</form.AppField>
								</div>
								<DialogFooter className="mt-4">
									<Button
										variant="outline"
										type="button"
										onClick={() => setIsDialogOpen(false)}
									>
										{tCommon('cancel')}
									</Button>
									<form.SubmitButton
										label={t('actions.createUser')}
										loadingLabel={t('actions.creating')}
									/>
								</DialogFooter>
							</form.AppForm>
						</form>
					</DialogContent>
				</Dialog>
			</div>

			<div className="flex items-center gap-4">
				<div className="relative flex-1 max-w-sm">
					<Input
						placeholder={t('search.placeholder')}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-3"
						disabled={isFetching}
					/>
				</div>
				<Badge variant="outline">{t('memberCount', { count: data?.total ?? 0 })}</Badge>
			</div>

			<div className="rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t('table.headers.member')}</TableHead>
							<TableHead>{t('table.headers.email')}</TableHead>
							<TableHead>{t('table.headers.role')}</TableHead>
							<TableHead>{t('table.headers.joined')}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isFetching ? (
							Array.from({ length: 5 }).map((_, i) => (
								<TableRow key={i}>
									{Array.from({ length: 4 }).map((_, j) => (
										<TableCell key={j}>
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : filteredMembers.length === 0 ? (
							<TableRow>
								<TableCell colSpan={4} className="h-24 text-center">
									{t('table.empty')}
								</TableCell>
							</TableRow>
						) : (
							filteredMembers.map((member: OrganizationMember) => (
								<TableRow key={member.id}>
									<TableCell>
										<div className="flex items-center gap-3">
											<Avatar className="h-8 w-8">
												<AvatarImage src={member.user.image ?? undefined} />
												<AvatarFallback className="text-xs">
													{getInitials(
														member.user.name || member.user.email,
													)}
												</AvatarFallback>
											</Avatar>
											<span className="font-medium">
												{member.user.name || member.user.email}
											</span>
										</div>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{member.user.email}
									</TableCell>
									<TableCell>
										<Badge variant={roleBadgeVariant[member.role] ?? 'outline'}>
											<ShieldCheck className="mr-1 h-3 w-3" />
											{t(`roles.${member.role}`)}
										</Badge>
									</TableCell>
									<TableCell>
										{format(new Date(member.createdAt), t('dateFormat'))}
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
