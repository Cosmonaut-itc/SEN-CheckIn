'use client';

import React from 'react';
import { Pencil, X } from 'lucide-react';
import type { EmployeeDetailTab } from '@sen-checkin/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Detail tab identifiers available in the mobile employee shell.
 */
export type EmployeeMobileDetailTabId = EmployeeDetailTab | 'info';

/**
 * Mobile detail panel definition.
 */
export interface EmployeeMobileDetailPanel {
	/** Unique tab identifier. */
	id: EmployeeMobileDetailTabId;
	/** Visible tab label. */
	label: string;
	/** Panel content rendered inside the scrollable region. */
	content: React.ReactNode;
}

/**
 * Props required by the mobile employee detail shell.
 */
export interface EmployeeMobileDetailShellProps {
	/** Employee display name. */
	employeeName: string;
	/** Employee code shown below the name. */
	employeeCode: string;
	/** Employee status label. */
	employeeStatusLabel: string;
	/** Badge tone for the employee status. */
	employeeStatusTone: 'default' | 'secondary' | 'outline';
	/** Label for the edit button. */
	editLabel: string;
	/** Label for the close button. */
	closeLabel: string;
	/** Label for the info tab. */
	infoLabel: string;
	/** Active tab identifier. */
	activeTab: EmployeeMobileDetailTabId;
	/** Available panels. */
	panels: EmployeeMobileDetailPanel[];
	/** Called when the active tab changes. */
	onActiveTabChange: (tab: EmployeeMobileDetailTabId) => void;
	/** Called when the edit button is pressed. */
	onEdit: () => void;
	/** Called when the close button is pressed. */
	onClose: () => void;
}

/**
 * Keeps the active tab centered within the horizontal tab scroller.
 *
 * @param container - Horizontal scroller container
 * @param activeTab - Active tab identifier
 * @returns Nothing
 */
function centerActiveTab(
	container: HTMLDivElement | null,
	activeTab: EmployeeMobileDetailTabId,
): void {
	if (!container) {
		return;
	}

	const activeTrigger = container.querySelector<HTMLElement>(
		`[data-employee-mobile-tab="${activeTab}"]`,
	);
	if (typeof activeTrigger?.scrollIntoView !== 'function') {
		return;
	}

	activeTrigger.scrollIntoView({
		behavior: 'smooth',
		inline: 'center',
		block: 'nearest',
	});
}

/**
 * Renders the mobile shell used by the employee detail dialog.
 *
 * @param props - Component props
 * @returns Mobile detail shell JSX
 */
export function EmployeeMobileDetailShell({
	employeeName,
	employeeCode,
	employeeStatusLabel,
	employeeStatusTone,
	editLabel,
	closeLabel,
	infoLabel,
	activeTab,
	panels,
	onActiveTabChange,
	onEdit,
	onClose,
}: EmployeeMobileDetailShellProps): React.ReactElement {
	const tabsListRef = React.useRef<HTMLDivElement | null>(null);

	React.useEffect(() => {
		centerActiveTab(tabsListRef.current, activeTab);
	}, [activeTab]);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="sticky top-0 z-20 shrink-0 border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
				<div className="flex items-start gap-3">
					<div className="min-w-0 flex-1 space-y-1">
						<p className="truncate text-base font-semibold text-foreground">
							{employeeName}
						</p>
						<div className="flex items-center gap-2">
							<p className="truncate text-sm text-muted-foreground">
								{employeeCode}
							</p>
							<Badge variant={employeeStatusTone}>{employeeStatusLabel}</Badge>
						</div>
					</div>
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="h-11 w-11 shrink-0"
						onClick={onEdit}
						aria-label={editLabel}
					>
						<Pencil className="h-4 w-4" />
						<span className="sr-only">{editLabel}</span>
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="h-11 w-11 shrink-0"
						onClick={onClose}
						aria-label={closeLabel}
					>
						<X className="h-4 w-4" />
						<span className="sr-only">{closeLabel}</span>
					</Button>
				</div>
			</div>

			<Tabs
				value={activeTab}
				onValueChange={(value) => onActiveTabChange(value as EmployeeMobileDetailTabId)}
				className="flex min-h-0 flex-1 flex-col gap-0"
			>
				<div
					ref={tabsListRef}
					data-testid="employee-mobile-detail-tabs"
					className="overflow-x-auto border-b"
				>
					<TabsList
						className="h-auto w-max min-w-full justify-start gap-2 rounded-none border-0 bg-transparent px-4 py-2"
						aria-label={infoLabel}
					>
						{panels.map((panel) => (
							<TabsTrigger
								key={panel.id}
								value={panel.id}
								data-employee-mobile-tab={panel.id}
								className="min-h-11 flex-none px-4"
							>
								{panel.label}
							</TabsTrigger>
						))}
					</TabsList>
				</div>

				<div
					data-testid="employee-mobile-detail-panel"
					className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3"
				>
					{panels.map((panel) => (
						<TabsContent key={panel.id} value={panel.id} className="mt-0 outline-none">
							{panel.content}
						</TabsContent>
					))}
				</div>
			</Tabs>
		</div>
	);
}
