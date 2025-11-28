'use client';

import React from 'react';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
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
	const { setTheme, theme } = useTheme();

	const themeOptions: { label: string; value: 'light' | 'dark' | 'system'; icon: LucideIcon }[] = [
		{ label: 'Light', value: 'light', icon: Sun },
		{ label: 'Dark', value: 'dark', icon: Moon },
		{ label: 'System', value: 'system', icon: Monitor },
	];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="relative h-9 w-9"
					aria-label="Toggle theme"
				>
					<Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
					<Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
					<span className="sr-only">Toggle theme</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-44">
				<DropdownMenuLabel>Appearance</DropdownMenuLabel>
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
