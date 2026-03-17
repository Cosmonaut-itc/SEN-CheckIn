import { readFileSync } from 'fs';
import { resolve } from 'path';

import { getAnimationDuration } from '@/lib/accessibility-motion';

describe('Reduce motion support', () => {
	it('disables animation duration when reduce motion is enabled', () => {
		expect(getAnimationDuration(800, true)).toBe(0);
		expect(getAnimationDuration(300, false)).toBe(300);
	});

	it('uses reduce-motion aware durations in scanner and login animations', () => {
		const scannerContent = readFileSync(
			resolve(__dirname, '../app/(main)/scanner.tsx'),
			'utf-8',
		);
		const loginContent = readFileSync(
			resolve(__dirname, '../app/(auth)/login.tsx'),
			'utf-8',
		);
		const animatedDotsBlock =
			loginContent.match(
				/function AnimatedDots\(\): JSX\.Element \{[\s\S]*?return <Text className="text-primary font-bold">\{dots \|\| '   '\}<\/Text>;\n\}/,
			)?.[0] ?? '';
		const pulseAnimationBlock =
			loginContent.match(
				/function PulseAnimation\(\{ children \}: \{ children: React\.ReactNode \}\): JSX\.Element \{[\s\S]*?return <Animated\.View style=\{\{ transform: \[\{ scale: pulseAnim \}\] \}\}>\{children\}<\/Animated\.View>;\n\}/,
			)?.[0] ?? '';
		const startPulseAnimationBlock =
			scannerContent.match(
				/const startPulseAnimation = useCallback\(\(\) => \{[\s\S]*?\}, \[pulseAnim, shouldReduceMotion\]\);/,
			)?.[0] ?? '';

		expect(scannerContent).toContain('useReducedMotion()');
		expect(scannerContent).toContain('getAnimationDuration(');
		expect(loginContent).toContain('useReducedMotion()');
		expect(loginContent).toContain('getAnimationDuration(');
		expect(animatedDotsBlock).toContain('useReducedMotion()');
		expect(animatedDotsBlock).toContain('if (shouldReduceMotion)');
		expect(startPulseAnimationBlock).toContain('if (shouldReduceMotion)');
		expect(pulseAnimationBlock).toContain('if (shouldReduceMotion)');
	});
});
