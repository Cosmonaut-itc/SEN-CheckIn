'use client';

import React from 'react';

import { cn } from '@/lib/utils';

/**
 * Props for the dual payroll compensation panel shown in the employee editor.
 */
interface EmployeeDualPayrollCompensationPanelProps {
	/** Section title */
	title: string;
	/** Section subtitle */
	subtitle: string;
	/** Form field content for fiscal daily pay */
	field: React.ReactNode;
	/** Inline helper or validation message below the field */
	feedback: string;
	/** Visual tone for the feedback copy */
	feedbackTone: 'helper' | 'error';
	/** Title for the summary card */
	previewTitle: string;
	/** Label for the real daily pay row */
	realDailyPayLabel: string;
	/** Value for the real daily pay row */
	realDailyPayValue: string;
	/** Label for the fiscal daily pay row */
	fiscalDailyPayLabel: string;
	/** Value for the fiscal daily pay row */
	fiscalDailyPayValue: string;
	/** Label for the daily complement highlight */
	dailyComplementLabel: string;
	/** Value for the daily complement highlight */
	dailyComplementValue: string;
}

/**
 * Displays the dual payroll compensation editor with a readable summary card.
 *
 * @param props - Component props
 * @returns Rendered compensation panel
 */
export function EmployeeDualPayrollCompensationPanel({
	title,
	subtitle,
	field,
	feedback,
	feedbackTone,
	previewTitle,
	realDailyPayLabel,
	realDailyPayValue,
	fiscalDailyPayLabel,
	fiscalDailyPayValue,
	dailyComplementLabel,
	dailyComplementValue,
}: EmployeeDualPayrollCompensationPanelProps): React.ReactElement {
	return (
		<div
			data-testid="employee-dual-payroll-panel"
			className="col-span-2 rounded-2xl border border-[color:var(--accent-primary)]/30 bg-[color:var(--bg-secondary)]/92 p-4 shadow-[var(--shadow-sm)]"
		>
			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
				<div className="space-y-3">
					<div>
						<p className="text-sm font-semibold text-[color:var(--text-primary)]">
							{title}
						</p>
						<p className="text-xs text-[color:var(--text-tertiary)]">{subtitle}</p>
					</div>
					{field}
					<p
						className={cn(
							'text-xs',
							feedbackTone === 'helper'
								? 'text-[color:var(--text-tertiary)]'
								: 'font-medium text-destructive',
						)}
					>
						{feedback}
					</p>
				</div>
				<div
					data-testid="employee-dual-payroll-preview"
					className="rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--bg-elevated)]/95 p-4 shadow-[var(--shadow-sm)]"
				>
					<p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-tertiary)]">
						{previewTitle}
					</p>
					<div className="mt-3 space-y-3">
						<div className="flex items-center justify-between gap-3">
							<span className="text-sm text-[color:var(--text-secondary)]">
								{realDailyPayLabel}
							</span>
							<span className="text-sm font-semibold text-[color:var(--text-primary)]">
								{realDailyPayValue}
							</span>
						</div>
						<div className="flex items-center justify-between gap-3">
							<span className="text-sm text-[color:var(--text-secondary)]">
								{fiscalDailyPayLabel}
							</span>
							<span className="text-sm font-semibold text-[color:var(--text-primary)]">
								{fiscalDailyPayValue}
							</span>
						</div>
						<div
							data-testid="employee-dual-payroll-complement"
							className="rounded-xl border border-[color:var(--accent-secondary)]/25 bg-[color:var(--accent-secondary-bg)] p-3"
						>
							<p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--accent-secondary)]">
								{dailyComplementLabel}
							</p>
							<p className="mt-1 text-lg font-semibold text-[color:var(--text-primary)]">
								{dailyComplementValue}
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
