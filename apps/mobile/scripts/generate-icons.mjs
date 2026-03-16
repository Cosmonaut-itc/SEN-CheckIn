#!/usr/bin/env node

import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MOBILE_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(MOBILE_ROOT, '..', '..');
const SOURCE_ICON_PATH = resolve(REPO_ROOT, 'design/checa_icon.svg');
const ASSETS_DIR = resolve(MOBILE_ROOT, 'assets/images');
const ICON_SIZE = 1024;
const FAVICON_SIZE = 48;
const COBRE_MICHOACANO = '#B8602A';
const CREMA_MICHOACAN = '#FAF7F3';
const SPLASH_SIZE = 1024;
const SPLASH_SYMBOL_SIZE = 640;
const SPLASH_TEXT_WIDTH = 520;
const SPLASH_TEXT_HEIGHT = 140;

/**
 * Build an SVG payload for a plain square fill.
 *
 * @param {number} size - Width and height for the square SVG.
 * @param {string} color - Fill color in CSS format.
 * @returns {string} SVG markup for a square image.
 */
function buildSolidSquareSvg(size, color) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${color}"/></svg>`;
}

/**
 * Remove solid/gradient background layers from the canonical icon SVG.
 *
 * @param {string} svgContent - Full icon SVG content.
 * @returns {string} SVG markup with transparent background.
 */
function stripBackgroundLayers(svgContent) {
	return svgContent
		.replace(/<defs>[\s\S]*?<\/defs>\s*/i, '')
		.replace(/<rect[^>]*fill="url\(#bg-glow\)"[^>]*\/>\s*/i, '')
		.replace(/<rect[^>]*fill="#B8602A"[^>]*\/>\s*/i, '');
}

/**
 * Render SVG content into a PNG file at a fixed square size.
 *
 * @param {string} svgContent - SVG markup to render.
 * @param {number} size - Target width and height.
 * @param {string} outputPath - Absolute path for the PNG output.
 * @returns {Promise<Buffer>} The written PNG as an in-memory buffer.
 */
async function renderSvgToPng(svgContent, size, outputPath) {
	const rendered = await sharp(Buffer.from(svgContent))
		.resize(size, size, { fit: 'contain' })
		.png()
		.toBuffer();

	await sharp(rendered).toFile(outputPath);
	return rendered;
}

/**
 * Create a monochrome icon preserving the source alpha silhouette.
 *
 * @param {Buffer} foregroundPng - Foreground icon PNG buffer.
 * @param {number} size - Output width and height.
 * @param {string} outputPath - Absolute path for the PNG output.
 * @returns {Promise<void>} Promise that resolves when file is written.
 */
async function writeMonochromeIcon(foregroundPng, size, outputPath) {
	const alphaChannel = await sharp(foregroundPng)
		.resize(size, size, { fit: 'contain' })
		.ensureAlpha()
		.extractChannel('alpha')
		.toBuffer();

	await sharp({
		create: {
			width: size,
			height: size,
			channels: 3,
			background: '#FFFFFF',
		},
	})
		.joinChannel(alphaChannel)
		.png()
		.toFile(outputPath);
}

/**
 * Paint a single solid color while preserving the alpha from a source image.
 *
 * @param {Buffer} sourcePng - Source image buffer whose alpha channel is reused.
 * @param {number} size - Target width and height.
 * @param {string} color - Solid color to apply.
 * @returns {Promise<Buffer>} Colored PNG buffer with transparent background.
 */
async function paintFromAlpha(sourcePng, size, color) {
	const alphaChannel = await sharp(sourcePng)
		.resize(size, size, { fit: 'contain' })
		.ensureAlpha()
		.extractChannel('alpha')
		.toBuffer();

	return sharp({
		create: {
			width: size,
			height: size,
			channels: 3,
			background: color,
		},
	})
		.joinChannel(alphaChannel)
		.png()
		.toBuffer();
}

/**
 * Build an SVG payload for splash text rendering.
 *
 * @param {number} width - SVG width.
 * @param {number} height - SVG height.
 * @param {string} color - Fill color for the text.
 * @returns {string} SVG markup with centered checa. wordmark.
 */
function buildSplashTextSvg(width, height, color) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><text x="50%" y="50%" fill="${color}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="100" font-weight="700" letter-spacing="-1.5">checa.</text></svg>`;
}

/**
 * Compose splash icon asset with transparent background.
 *
 * @param {Buffer} foregroundPng - Foreground icon source buffer.
 * @param {number} size - Output width and height.
 * @param {string} outputPath - Absolute path for the PNG output.
 * @returns {Promise<void>} Promise that resolves when splash icon is written.
 */
async function writeSplashIcon(foregroundPng, size, outputPath) {
	const symbolBuffer = await paintFromAlpha(
		foregroundPng,
		SPLASH_SYMBOL_SIZE,
		CREMA_MICHOACAN,
	);
	const textBuffer = await sharp(
		Buffer.from(buildSplashTextSvg(SPLASH_TEXT_WIDTH, SPLASH_TEXT_HEIGHT, CREMA_MICHOACAN)),
	)
		.png()
		.toBuffer();

	const symbolX = Math.round((size - SPLASH_SYMBOL_SIZE) / 2);
	const symbolY = 120;
	const textX = Math.round((size - SPLASH_TEXT_WIDTH) / 2);
	const textY = symbolY + SPLASH_SYMBOL_SIZE + 40;

	await sharp({
		create: {
			width: size,
			height: size,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		},
	})
		.composite([
			{ input: symbolBuffer, left: symbolX, top: symbolY },
			{ input: textBuffer, left: textX, top: textY },
		])
		.png()
		.toFile(outputPath);
}

/**
 * Generate all app icon assets from the canonical checa SVG source.
 *
 * @returns {Promise<void>} Promise that resolves once all assets are generated.
 */
async function generateIcons() {
	await mkdir(ASSETS_DIR, { recursive: true });

	const sourceSvg = await readFile(SOURCE_ICON_PATH, 'utf-8');
	const foregroundSvg = stripBackgroundLayers(sourceSvg);
	const iconPath = resolve(ASSETS_DIR, 'icon.png');
	const foregroundPath = resolve(ASSETS_DIR, 'android-icon-foreground.png');
	const backgroundPath = resolve(ASSETS_DIR, 'android-icon-background.png');
	const monochromePath = resolve(ASSETS_DIR, 'android-icon-monochrome.png');
	const faviconPath = resolve(ASSETS_DIR, 'favicon.png');
	const splashPath = resolve(ASSETS_DIR, 'splash-icon.png');

	const foregroundBuffer = await renderSvgToPng(foregroundSvg, ICON_SIZE, foregroundPath);
	await renderSvgToPng(sourceSvg, ICON_SIZE, iconPath);
	await renderSvgToPng(
		buildSolidSquareSvg(ICON_SIZE, COBRE_MICHOACANO),
		ICON_SIZE,
		backgroundPath,
	);
	await writeMonochromeIcon(foregroundBuffer, ICON_SIZE, monochromePath);
	await renderSvgToPng(sourceSvg, FAVICON_SIZE, faviconPath);
	await writeSplashIcon(foregroundBuffer, SPLASH_SIZE, splashPath);
}

try {
	await generateIcons();
	console.log('Icon assets generated successfully.');
} catch (error) {
	console.error('Failed to generate icon assets.', error);
	process.exitCode = 1;
}
