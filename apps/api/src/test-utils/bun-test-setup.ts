import { afterEach, mock } from 'bun:test';

/**
 * Restores module/function mocks after each test so module-level stubs do not
 * leak into later tests or files when the API suite is executed as a single run.
 *
 * @returns Nothing
 */
afterEach(() => {
	mock.restore();
});
