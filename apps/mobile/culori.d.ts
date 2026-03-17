declare module 'culori' {
	export type ParsedColor = {
		mode: string;
		alpha?: number;
		[key: string]: number | string | undefined;
	};

	export type RgbColor = {
		mode: 'rgb';
		r: number;
		g: number;
		b: number;
		alpha?: number;
	};

	export function parse(color: string): ParsedColor | undefined;
	export function converter(mode: 'rgb'): (color: ParsedColor) => RgbColor | undefined;
	export function formatRgb(color: RgbColor): string;
}
