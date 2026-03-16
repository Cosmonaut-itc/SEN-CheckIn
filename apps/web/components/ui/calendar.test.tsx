import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Calendar } from '@/components/ui/calendar';

describe('Calendar', () => {
	it('renders stable ISO-like data-day attributes for day buttons', () => {
		render(
			<Calendar
				mode="single"
				month={new Date(2026, 0, 1)}
				defaultMonth={new Date(2026, 0, 1)}
			/>,
		);

		expect(screen.getByRole('button', { name: 'Wednesday, January 7th, 2026' })).toHaveAttribute(
			'data-day',
			'2026-01-07',
		);
	});
});
