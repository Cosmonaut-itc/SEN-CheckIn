import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const WEB_ROOT = process.cwd();
const INCLUDED_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
const EXCLUDED_DIRECTORY_NAMES = new Set(['.next', 'node_modules', '.turbo', 'coverage', 'public']);

const WHITELISTED_FILES = new Set([
	'app/(marketing)/layout.tsx',
	'app/(marketing)/page.tsx',
	'app/(marketing)/privacidad/page.tsx',
	'app/(marketing)/registrate/page.tsx',
]);

const HARDCODED_COLOR_PATTERN =
	/#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})\b|rgba\([^)]*\)/g;

/**
 * Recursively collects source files that should be scanned.
 *
 * @param directory - Absolute directory path to traverse.
 * @returns Absolute file paths for eligible files.
 */
async function collectFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		if (EXCLUDED_DIRECTORY_NAMES.has(entry.name)) {
			continue;
		}

		const absolutePath = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFiles(absolutePath)));
			continue;
		}

		if (INCLUDED_EXTENSIONS.has(extname(entry.name))) {
			files.push(absolutePath);
		}
	}

	return files;
}

/**
 * Produces line-level color hardcode findings for a given file.
 *
 * @param absoluteFilePath - Absolute file path to scan.
 * @returns List of formatted findings for the file.
 */
async function findHardcodedColors(absoluteFilePath: string): Promise<string[]> {
	const fileContents = await readFile(absoluteFilePath, 'utf8');
	const lines = fileContents.split('\n');
	const findings: string[] = [];
	const relativeFilePath = relative(WEB_ROOT, absoluteFilePath).replaceAll('\\', '/');

	if (WHITELISTED_FILES.has(relativeFilePath)) {
		return findings;
	}

	for (const [lineIndex, line] of lines.entries()) {
		const matches = line.match(HARDCODED_COLOR_PATTERN);
		if (!matches || matches.length === 0) {
			continue;
		}

		const uniqueMatches = [...new Set(matches)];
		findings.push(
			`${relativeFilePath}:${lineIndex + 1} -> ${uniqueMatches.join(', ')} | ${line.trim()}`,
		);
	}

	return findings;
}

/**
 * Entry point for the hardcoded color guardrail.
 *
 * @returns Promise resolved when the check completes.
 * @throws Error when hardcoded colors are found outside the explicit whitelist.
 */
async function run(): Promise<void> {
	const files = await collectFiles(WEB_ROOT);
	const allFindings = (
		await Promise.all(files.map((filePath) => findHardcodedColors(filePath)))
	).flat();

	if (allFindings.length === 0) {
		console.info('No hardcoded colors found outside whitelist.');
		return;
	}

	console.error('Hardcoded colors are not allowed outside whitelist:');
	for (const finding of allFindings) {
		console.error(`- ${finding}`);
	}

	throw new Error('Color hardcode guardrail failed.');
}

await run();
