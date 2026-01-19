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
					className="relative h-9 w-9"
					aria-label={t('toggleAriaLabel')}
				>
					<Sun className="h-5 w-5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
					<Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
					<span className="sr-only">{t('toggleAriaLabel')}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-44">
				<DropdownMenuLabel>{t('label')}</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuRadioGroup
					value={theme ?? 'system'}
					onValueChange={(value) => setTheme(value)}
				>
					{themeOptions.map(({ label, value, icon: Icon }) => (
						<DropdownMenuRadioItem key={value} value={value}>
							<Icon className="mr-2 h-4 w-4" />
							{label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
