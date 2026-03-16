import { existsSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';

const assetsDir = resolve(__dirname, '../assets/images');

describe('Icon assets', () => {
	it('icon.png exists and is 1024x1024', async () => {
		const iconPath = resolve(assetsDir, 'icon.png');
		expect(existsSync(iconPath)).toBe(true);

		const metadata = await sharp(iconPath).metadata();
		expect(metadata.width).toBe(1024);
		expect(metadata.height).toBe(1024);
	});

	it('android-icon-foreground.png exists and is 1024x1024', async () => {
		const iconPath = resolve(assetsDir, 'android-icon-foreground.png');
		expect(existsSync(iconPath)).toBe(true);

		const metadata = await sharp(iconPath).metadata();
		expect(metadata.width).toBe(1024);
		expect(metadata.height).toBe(1024);
	});

	it('android-icon-background.png exists and is 1024x1024', async () => {
		const iconPath = resolve(assetsDir, 'android-icon-background.png');
		expect(existsSync(iconPath)).toBe(true);

		const metadata = await sharp(iconPath).metadata();
		expect(metadata.width).toBe(1024);
		expect(metadata.height).toBe(1024);
	});

	it('android-icon-monochrome.png exists and is 1024x1024', async () => {
		const iconPath = resolve(assetsDir, 'android-icon-monochrome.png');
		expect(existsSync(iconPath)).toBe(true);

		const metadata = await sharp(iconPath).metadata();
		expect(metadata.width).toBe(1024);
		expect(metadata.height).toBe(1024);
	});

	it('favicon.png exists and is 48x48', async () => {
		const iconPath = resolve(assetsDir, 'favicon.png');
		expect(existsSync(iconPath)).toBe(true);

		const metadata = await sharp(iconPath).metadata();
		expect(metadata.width).toBe(48);
		expect(metadata.height).toBe(48);
	});
});
