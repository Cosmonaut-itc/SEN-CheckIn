/**
 * Typed design tokens for the SEN web design system.
 *
 * Initial scope: Michoacan palette only.
 */
export type ThemeVariant = 'light' | 'dark';

/**
 * Brand color tokens grouped by semantic usage.
 */
export interface BrandColorScale {
	background: {
		primary: string;
		secondary: string;
		tertiary: string;
		elevated: string;
		inverse: string;
	};
	text: {
		primary: string;
		secondary: string;
		tertiary: string;
		muted: string;
		inverse: string;
		onAccent: string;
	};
	border: {
		default: string;
		subtle: string;
		strong: string;
	};
	accent: {
		primary: string;
		primaryHover: string;
		primaryBg: string;
		primaryBgHover: string;
		primaryLight: string;
		secondary: string;
		secondaryHover: string;
		secondaryBg: string;
		secondaryBgHover: string;
		secondaryLight: string;
		tertiary: string;
		tertiaryBg: string;
	};
	status: {
		success: string;
		successBg: string;
		warning: string;
		warningBg: string;
		error: string;
		errorBg: string;
		info: string;
		infoBg: string;
	};
	overlay: string;
	navigationBackground: string;
	codeBackground: string;
}

/**
 * Shadow tokens for elevations.
 */
export interface ShadowScale {
	sm: string;
	md: string;
	lg: string;
	xl: string;
}

/**
 * Radius tokens.
 */
export interface RadiusScale {
	sm: string;
	md: string;
	lg: string;
	xl: string;
	full: string;
}

/**
 * Motion tokens.
 */
export interface MotionScale {
	fast: string;
	base: string;
	slow: string;
}

/**
 * Typography families.
 */
export interface TypographyScale {
	display: string;
	body: string;
	mono: string;
}

/**
 * Complete token set for one theme variant.
 */
export interface ThemeTokens {
	colors: BrandColorScale;
	shadows: ShadowScale;
	radius: RadiusScale;
	motion: MotionScale;
	typography: TypographyScale;
}

/**
 * Shared non-theme-dependent values.
 */
export const michoacanShared = {
	radius: {
		sm: '6px',
		md: '10px',
		lg: '14px',
		xl: '20px',
		full: '100px',
	},
	motion: {
		fast: '150ms cubic-bezier(0.23, 1, 0.32, 1)',
		base: '250ms cubic-bezier(0.23, 1, 0.32, 1)',
		slow: '400ms cubic-bezier(0.23, 1, 0.32, 1)',
	},
	typography: {
		display: "'Playfair Display', Georgia, serif",
		body: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
		mono: "'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace",
	},
} as const;

/**
 * Michoacan light and dark token values.
 */
export const michoacanTokens: Record<ThemeVariant, ThemeTokens> = {
	light: {
		colors: {
			background: {
				primary: '#FAF7F3',
				secondary: '#FFFFFF',
				tertiary: '#F3EDE6',
				elevated: '#FFFFFF',
				inverse: '#1A1210',
			},
			text: {
				primary: '#2B1810',
				secondary: '#3D2B20',
				tertiary: '#7A6558',
				muted: '#A8978B',
				inverse: '#FAF7F3',
				onAccent: '#FFFFFF',
			},
			border: {
				default: '#E6DCD3',
				subtle: '#F0E8E1',
				strong: '#D1C2B6',
			},
			accent: {
				primary: '#B8602A',
				primaryHover: '#9E4E1E',
				primaryBg: 'rgba(184, 96, 42, 0.08)',
				primaryBgHover: 'rgba(184, 96, 42, 0.14)',
				primaryLight: '#D4956A',
				secondary: '#4A7C3F',
				secondaryHover: '#3A6430',
				secondaryBg: 'rgba(74, 124, 63, 0.08)',
				secondaryBgHover: 'rgba(74, 124, 63, 0.14)',
				secondaryLight: '#7FB573',
				tertiary: '#8B2252',
				tertiaryBg: 'rgba(139, 34, 82, 0.08)',
			},
			status: {
				success: '#2D8659',
				successBg: 'rgba(45, 134, 89, 0.10)',
				warning: '#CC8A17',
				warningBg: 'rgba(204, 138, 23, 0.10)',
				error: '#C4302B',
				errorBg: 'rgba(196, 48, 43, 0.10)',
				info: '#4A7C3F',
				infoBg: 'rgba(74, 124, 63, 0.10)',
			},
			overlay: 'rgba(26, 18, 16, 0.55)',
			navigationBackground: 'rgba(250, 247, 243, 0.88)',
			codeBackground: '#F3EDE6',
		},
		shadows: {
			sm: '0 1px 3px rgba(43, 24, 16, 0.05)',
			md: '0 4px 16px rgba(43, 24, 16, 0.08)',
			lg: '0 12px 40px rgba(43, 24, 16, 0.12)',
			xl: '0 20px 60px rgba(43, 24, 16, 0.14)',
		},
		radius: { ...michoacanShared.radius },
		motion: { ...michoacanShared.motion },
		typography: { ...michoacanShared.typography },
	},
	dark: {
		colors: {
			background: {
				primary: '#110D0A',
				secondary: '#1C1613',
				tertiary: '#28201B',
				elevated: '#342A24',
				inverse: '#FAF7F3',
			},
			text: {
				primary: '#F0EAE4',
				secondary: '#D6CCC3',
				tertiary: '#9A8B80',
				muted: '#665A50',
				inverse: '#2B1810',
				onAccent: '#FFFFFF',
			},
			border: {
				default: '#3D3028',
				subtle: '#2D231C',
				strong: '#4D3F36',
			},
			accent: {
				primary: '#D4835E',
				primaryHover: '#E09A78',
				primaryBg: 'rgba(212, 131, 94, 0.14)',
				primaryBgHover: 'rgba(212, 131, 94, 0.22)',
				primaryLight: '#E0A882',
				secondary: '#7FB573',
				secondaryHover: '#96C88C',
				secondaryBg: 'rgba(127, 181, 115, 0.14)',
				secondaryBgHover: 'rgba(127, 181, 115, 0.22)',
				secondaryLight: '#A0D096',
				tertiary: '#C85A8A',
				tertiaryBg: 'rgba(200, 90, 138, 0.14)',
			},
			status: {
				success: '#5CC98A',
				successBg: 'rgba(92, 201, 138, 0.16)',
				warning: '#E8B44A',
				warningBg: 'rgba(232, 180, 74, 0.16)',
				error: '#E8605A',
				errorBg: 'rgba(232, 96, 90, 0.16)',
				info: '#7FB573',
				infoBg: 'rgba(127, 181, 115, 0.16)',
			},
			overlay: 'rgba(0, 0, 0, 0.7)',
			navigationBackground: 'rgba(17, 13, 10, 0.88)',
			codeBackground: '#28201B',
		},
		shadows: {
			sm: '0 1px 3px rgba(0, 0, 0, 0.3)',
			md: '0 4px 16px rgba(0, 0, 0, 0.35)',
			lg: '0 12px 40px rgba(0, 0, 0, 0.4)',
			xl: '0 20px 60px rgba(0, 0, 0, 0.45)',
		},
		radius: { ...michoacanShared.radius },
		motion: { ...michoacanShared.motion },
		typography: { ...michoacanShared.typography },
	},
};

/**
 * Semantic aliases consumed by shadcn/ui and app surfaces.
 */
export const michoacanSemantic = {
	light: {
		primary: michoacanTokens.light.colors.accent.primary,
		primaryForeground: michoacanTokens.light.colors.text.onAccent,
		secondary: michoacanTokens.light.colors.background.tertiary,
		secondaryForeground: michoacanTokens.light.colors.text.primary,
		accent: michoacanTokens.light.colors.accent.primaryBg,
		accentForeground: michoacanTokens.light.colors.accent.primary,
		destructive: michoacanTokens.light.colors.status.error,
		destructiveForeground: '#FFFFFF',
	},
	dark: {
		primary: michoacanTokens.dark.colors.accent.primary,
		primaryForeground: michoacanTokens.dark.colors.text.onAccent,
		secondary: michoacanTokens.dark.colors.background.tertiary,
		secondaryForeground: michoacanTokens.dark.colors.text.primary,
		accent: michoacanTokens.dark.colors.accent.primaryBg,
		accentForeground: michoacanTokens.dark.colors.accent.primary,
		destructive: michoacanTokens.dark.colors.status.error,
		destructiveForeground: '#FFFFFF',
	},
} as const;
