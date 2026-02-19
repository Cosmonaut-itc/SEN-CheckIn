'use client';

import React from 'react';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Dropdown toggle for switching between light, dark, and system themes.
 */
export function ThemeModeToggle(): React.ReactElement {
	const t = useTranslations('Theme');
	const { setTheme, theme } = useTheme();
	const selectedTheme = theme ?? 'system';

	const themeOptions: { label: string; value: 'light' | 'dark' | 'system'; icon: LucideIcon }[] =
		[
			{ label: t('options.light'), value: 'light', icon: Sun },
			{ label: t('options.dark'), value: 'dark', icon: Moon },
			{ label: t('options.system'), value: 'system', icon: Monitor },
		];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="relative h-10 w-10 rounded-full border border-[color:var(--border-strong)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] shadow-[var(--shadow-sm)] hover:bg-[var(--accent-primary-bg)] hover:text-[var(--accent-primary)]"
					aria-label={t('toggleAriaLabel')}
				>
					<Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
					<Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
					<span className="sr-only">{t('toggleAriaLabel')}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-52 rounded-xl border border-[color:var(--border-subtle)] bg-popover/95 p-1 shadow-[var(--shadow-lg)] backdrop-blur"
			>
				<DropdownMenuLabel className="px-2 pt-1.5 pb-1 text-xs font-semibold tracking-[0.08em] uppercase text-muted-foreground">
					{t('label')}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuRadioGroup
					value={selectedTheme}
					onValueChange={(value) => setTheme(value)}
				>
					{themeOptions.map(({ label, value, icon: Icon }) => (
						<DropdownMenuRadioItem
							key={value}
							value={value}
							className="rounded-md py-2"
						>
							<Icon
								className={`mr-2 h-4 w-4 ${selectedTheme === value ? 'text-[var(--accent-primary)]' : ''}`}
							/>
							{label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
