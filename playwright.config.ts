import {defineConfig} from '@playwright/test';

// The extension is loaded from dist/chromium, so `yarn build` must run first (CI does).
export default defineConfig({
	testDir: 'e2e',
	// A Chromium profile with an unpacked extension is a single persistent context - no parallelism.
	workers: 1,
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: 'list',
	use: {
		actionTimeout: 10_000
	}
});
