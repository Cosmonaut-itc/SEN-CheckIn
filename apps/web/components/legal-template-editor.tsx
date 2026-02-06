'use client';

import React from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

/**
 * Props for legal template editor component.
 */
export interface LegalTemplateEditorProps {
	/** Editor title. */
	title: string;
	/** Optional supporting text. */
	description?: string;
	/** Template HTML content. */
	value: string;
	/** Change callback for template HTML content. */
	onChange: (value: string) => void;
	/** Variable tokens available for insertion. */
	tokens: string[];
	/** Disables textarea edits when true. */
	disabled?: boolean;
}

/**
 * Legal template editor with visible token list.
 *
 * @param props - Editor props
 * @returns Legal template editor UI
 */
export function LegalTemplateEditor({
	title,
	description,
	value,
	onChange,
	tokens,
	disabled = false,
}: LegalTemplateEditorProps): React.ReactElement {
	return (
		<Card>
			<CardHeader className="space-y-2">
				<CardTitle>{title}</CardTitle>
				{description ? <CardDescription>{description}</CardDescription> : null}
				<div className="flex flex-wrap gap-2">
					{tokens.map((token) => (
						<Badge key={token} variant="outline">
							{token}
						</Badge>
					))}
				</div>
			</CardHeader>
			<CardContent>
				<Textarea
					value={value}
					onChange={(event) => onChange(event.target.value)}
					rows={18}
					disabled={disabled}
				/>
			</CardContent>
		</Card>
	);
}
