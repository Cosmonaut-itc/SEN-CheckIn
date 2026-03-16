import { existsSync } from 'fs';
import { resolve } from 'path';
import sharp from 'sharp';

describe('Splash assets', () => {
	it('splash-icon.png exists, is 1024x1024, and keeps transparent pixels', async () => {
		const splashPath = resolve(__dirname, '../assets/images/splash-icon.png');
		expect(existsSync(splashPath)).toBe(true);

		const metadata = await sharp(splashPath).metadata();
		expect(metadata.width).toBe(1024);
		expect(metadata.height).toBe(1024);
		expect(metadata.hasAlpha).toBe(true);

		const stats = await sharp(splashPath).stats();
		const alphaChannel = stats.channels[3];
		expect(alphaChannel.min).toBeLessThan(255);
		expect(alphaChannel.max).toBe(255);
	});
});
