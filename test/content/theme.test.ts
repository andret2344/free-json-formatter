import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const CSS: string = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/content/content.css'), 'utf8');

/**
 * The colour variables declared inside the first block a selector opens. Only colours: `--fjf-tab` and
 * `--fjf-gutter` are metrics the viewer overrides per tree, and they have no place in a theme palette.
 */
function paletteOf(selector: string): string[] {
	// The last occurrence: a theme selector also opens a short color-scheme block earlier in the file.
	const start: number = CSS.lastIndexOf(selector);
	if (start === -1) {
		throw new Error(`${selector} is not in content.css`);
	}
	const open: number = CSS.indexOf('{', start);
	const close: number = CSS.indexOf('}', open);
	const body: string = CSS.slice(open, close);
	return [...body.matchAll(/(--fjf-[\w-]+)\s*:\s*#[0-9a-f]{3,8}/gi)].map((match: RegExpMatchArray): string => match[1]).sort();
}

describe('theme palettes', () => {
	// The tree renders whatever the resolved theme leaves in these variables, and a variable a dark palette
	// forgets silently falls back to the light one - a white gutter on a dark page, and no test would notice.
	it('defines every variable of the base palette in both dark palettes', () => {
		const base: string[] = paletteOf(':root {');
		const auto: string[] = paletteOf('@media (prefers-color-scheme: dark)');
		const dark: string[] = paletteOf(':root[data-fjf-theme="dark"] {');

		expect(base.length).toBeGreaterThan(10);
		expect(auto).toEqual(base);
		expect(dark).toEqual(base);
	});
});
