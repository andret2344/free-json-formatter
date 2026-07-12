import type {Page, Request} from '@playwright/test';
import {describe, expect, it, SAMPLE} from './fixtures.js';

const DEPTH_KEY = 'fjf-depth';
const MAX_MB_KEY = 'fjf-max-mb';

/**
 * The page's `window` as the specs reach into it: `json` is the console handle the page-world script defines,
 * `probe` and `marker` are values a test writes and then re-reads to prove the page was never reloaded.
 * They are written from inside `page.evaluate`, so none of them can be readonly.
 */
interface PageWindow {
	json?: unknown;
	probe?: string;
	marker?: number;
}

/** The tree is on screen and no expansion is running - the initial depth is reached in batches now. */
function waitForTree(page: Page): Promise<unknown> {
	return page.waitForFunction((): boolean => document.querySelector<HTMLElement>('.fjf-loading')?.hidden === true);
}

async function openJson(page: Page, baseUrl: string): Promise<void> {
	await page.goto(`${baseUrl}/data.json`);
	await page.waitForSelector('.fjf-root');
	await waitForTree(page);
}

/** Entries whose header line is visible in the formatted tree. */
function visibleKeys(page: Page): Promise<string[]> {
	return page.$$eval('.fjf-entry:not(.fjf-collapsed) > .fjf-line > .fjf-key, .fjf-key', (nodes: Element[]) => nodes.map((node: Element): string => node.textContent ?? ''));
}

/** The line number the gutter shows for the entry with this key. */
function lineNumberOf(page: Page, key: string): Promise<string | null> {
	return page.evaluate((wanted: string): string | null => {
		function isWanted(node: Element): boolean {
			return node.textContent === `"${wanted}"`;
		}

		const found: Element | undefined = [...document.querySelectorAll('.fjf-line > .fjf-key')].find(isWanted);
		if (found === undefined) {
			return null;
		}
		return (found.parentElement as HTMLElement).dataset.line ?? null;
	}, key);
}

function scrollToRightEdge(page: Page): Promise<void> {
	return page.evaluate((): void => {
		const tree = document.querySelector('.fjf-tree') as HTMLElement;
		tree.scrollLeft = tree.scrollWidth - tree.clientWidth;
	});
}

interface TreeScroll {
	readonly left: number;
	readonly top: number;
}

function treeScroll(page: Page): Promise<TreeScroll> {
	return page.evaluate((): TreeScroll => {
		const tree = document.querySelector('.fjf-tree') as HTMLElement;
		return {left: tree.scrollLeft, top: tree.scrollTop};
	});
}

describe('the formatted view', () => {
	it('leaves an ordinary HTML page untouched', async ({context, baseUrl}) => {
		const page: Page = await context.newPage();
		await page.goto(`${baseUrl}/page.html`);

		await expect(page.locator('#title')).toHaveText('Ordinary page');
		await expect(page.locator('.fjf-root')).toHaveCount(0);
	});

	it('formats a raw JSON page and switches between Formatted and Raw', async ({context, baseUrl}) => {
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);

		await expect(page.locator('.fjf-tree')).toBeVisible();
		await expect(page.locator('.fjf-raw')).toBeHidden();

		await page.getByRole('button', {name: 'Raw', exact: true}).click();
		await expect(page.locator('.fjf-raw')).toBeVisible();
		await expect(page.locator('.fjf-tree')).toBeHidden();

		await page.getByRole('button', {name: 'Formatted', exact: true}).click();
		await expect(page.locator('.fjf-tree')).toBeVisible();
	});

	it('makes no external requests while formatting', async ({context, baseUrl}) => {
		const external: string[] = [];
		context.on('request', (request: Request): void => {
			const url: string = request.url();
			if (!url.startsWith(baseUrl) && !url.startsWith('chrome-extension://') && !url.startsWith('devtools://')) {
				external.push(url);
			}
		});

		const page: Page = await context.newPage();
		await openJson(page, baseUrl);
		await page.getByRole('button', {name: 'Expand all'}).click();

		expect(external).toEqual([]);
	});
});

describe('the documents the viewer leaves alone', () => {
	it('does not format a payload over the configured size limit', async ({context, baseUrl, setSetting}) => {
		await setSetting(MAX_MB_KEY, 1); // the fixture is 2 MB
		const page: Page = await context.newPage();
		await page.goto(`${baseUrl}/oversized.json`);

		await expect(page.locator('.fjf-root')).toHaveCount(0);
		// The browser's own raw view is still there, untouched.
		expect(await page.evaluate((): string => document.body.textContent?.slice(0, 8) ?? '')).toBe('{"blob":');
	});

	it('does not format a document served as JSON that does not parse', async ({context, baseUrl}) => {
		const page: Page = await context.newPage();
		await page.goto(`${baseUrl}/broken.json`);

		await expect(page.locator('.fjf-root')).toHaveCount(0);
		expect(await page.evaluate((): string => document.body.textContent ?? '')).toContain('{"a": 1,');
	});
});

describe('searching', () => {
	it('finds a value in a branch that was never rendered, and paints it without touching the DOM', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 1);
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);
		await expect(page.locator('.fjf-key', {hasText: '"needle"'})).toHaveCount(0); // collapsed, never built

		await page.locator('.fjf-search-input').fill('buried');

		await expect(page.locator('.fjf-search-count')).toHaveText('1 / 1');
		await expect(page.locator('.fjf-key', {hasText: '"needle"'})).toBeVisible();
		// Chromium has the CSS Custom Highlight API, so the hit is painted as a range: no <mark>, no reflow.
		const painted: number = await page.evaluate((): number => CSS.highlights.get('fjf-hl')?.size ?? 0);
		expect(painted).toBe(1);
		await expect(page.locator('.fjf-tree mark')).toHaveCount(0);
	});

	it('steps through the matches', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 1);
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);

		await page.locator('.fjf-search-input').fill('level');
		await expect(page.locator('.fjf-search-count')).toHaveText('1 / 4'); // level1 … level4

		await page.getByRole('button', {name: 'Next match'}).click();
		await expect(page.locator('.fjf-search-count')).toHaveText('2 / 4');

		await page.getByRole('button', {name: 'Previous match'}).click();
		await expect(page.locator('.fjf-search-count')).toHaveText('1 / 4');
	});
});

describe('the toolbar preferences', () => {
	it('cycles the theme and remembers it on the next JSON page', async ({context, baseUrl}) => {
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);

		await page.getByRole('button', {name: 'Theme: Auto'}).click();
		await expect(page.locator('html')).toHaveAttribute('data-fjf-theme', 'light');

		const second: Page = await context.newPage();
		await openJson(second, baseUrl);

		await expect(second.locator('html')).toHaveAttribute('data-fjf-theme', 'light');
		await expect(second.getByRole('button', {name: 'Theme: Light'})).toBeVisible();
	});

	it('remembers wrapping and indentation on the next JSON page', async ({context, baseUrl}) => {
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);

		await page.getByRole('button', {name: 'Wrap'}).click();
		await page.selectOption('select.fjf-select', '1t');
		await expect(page.locator('.fjf-tree')).toHaveClass(/fjf-wrap/);

		const second: Page = await context.newPage();
		await openJson(second, baseUrl);

		await expect(second.locator('.fjf-tree')).toHaveClass(/fjf-wrap/);
		await expect(second.locator('select.fjf-select')).toHaveValue('1t');
		const tab: string = await second.evaluate((): string => (document.querySelector('.fjf-tree') as HTMLElement).style.getPropertyValue('--fjf-tab'));
		expect(tab).toBe('4'); // a tab is drawn 4ch wide
	});
});

describe('copying', () =>
	it('puts the raw document on the clipboard', async ({context, baseUrl}) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: baseUrl});
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);

		await page.getByRole('button', {name: 'Copy raw'}).click();

		await expect(page.getByRole('button', {name: 'Copied'})).toBeVisible();
		const copied: string = await page.evaluate((): Promise<string> => navigator.clipboard.readText());
		expect(JSON.parse(copied)).toEqual(SAMPLE);
	}));

describe('the initial expansion depth', () => {
	it('opens the root only at depth 1', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 1);
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);

		const keys: string[] = await visibleKeys(page);
		expect(keys).toContain('"level1"'); // a direct child of the root
		expect(keys).not.toContain('"level2"'); // level1 is collapsed, so its children were never built
	});

	it('opens two levels at depth 2', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 2);
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);

		const keys: string[] = await visibleKeys(page);
		expect(keys).toContain('"level2"');
		expect(keys).not.toContain('"level3"');
	});

	it('starts expanding after the UI is mounted at depth "all", without blocking it', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 'all');
		const page: Page = await context.newPage();

		await page.goto(`${baseUrl}/data.json`);
		// The toolbar is on screen before the whole tree exists: mounting never waited for the expansion.
		await page.waitForSelector('.fjf-toolbar');

		await expect(page.locator('.fjf-key', {hasText: '"needle"'})).toBeVisible();
	});
});

describe('expanding the whole tree', () => {
	it('can be cancelled with Collapse all', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 1);
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);

		await page.getByRole('button', {name: 'Expand all'}).click();
		await page.getByRole('button', {name: 'Collapse all'}).click();

		// Collapse wins: the run is cancelled and every collection ends up closed.
		await expect(page.getByRole('button', {name: 'Expand all'})).toBeEnabled();
		await expect(page.locator('.fjf-entry.fjf-open')).toHaveCount(0);
	});

	it('locks the tree controls and shows progress until the tree is built', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 1);
		const page: Page = await context.newPage();
		await page.goto(`${baseUrl}/large.json`);
		await page.waitForSelector('.fjf-root');

		await page.getByRole('button', {name: 'Expand all'}).click();

		await expect(page.locator('.fjf-loading')).toBeVisible();
		await expect(page.locator('.fjf-progress-label')).toHaveText(/^\d+%$/);
		// The tree comes off-screen while it grows: laying it out after every batch is what made a big
		// expansion quadratic. The preloader stands in for it.
		await expect(page.locator('.fjf-tree')).toBeHidden();
		await expect(page.locator('select.fjf-select')).toBeDisabled();
		await expect(page.getByRole('button', {name: 'Wrap'})).toBeDisabled();
		await expect(page.getByRole('button', {name: 'Raw', exact: true})).toBeDisabled();
		await expect(page.getByRole('button', {name: 'Copy formatted'})).toBeDisabled();
		// Collapse all is the way out of a long run - locking it too would trap the user in the wait.
		await expect(page.getByRole('button', {name: 'Collapse all'})).toBeEnabled();

		await expect(page.getByRole('button', {name: 'Expand all'})).toBeEnabled({timeout: 120_000});
		await expect(page.locator('.fjf-loading')).toBeHidden();
		await expect(page.locator('.fjf-progress-label')).toHaveText('100%');
		await expect(page.locator('.fjf-tree')).toBeVisible();
		await expect(page.locator('select.fjf-select')).toBeEnabled();
		await expect(page.getByRole('button', {name: 'Wrap'})).toBeEnabled();
	});
});

describe('line links', () => {
	/** Click the gutter of a line: a few pixels in from the tree's left edge, at that line's height. */
	async function clickGutterOf(page: Page, line: string): Promise<void> {
		const treeBox = await page.locator('.fjf-tree').boundingBox();
		const lineBox = await page.locator(`.fjf-line[data-line="${line}"]`).first().boundingBox();
		await page.mouse.click((treeBox?.x ?? 0) + 6, (lineBox?.y ?? 0) + (lineBox?.height ?? 0) / 2);
	}

	it('opens the branch a #L link points into, even though it was never rendered', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 1);
		const page: Page = await context.newPage();
		await page.goto(`${baseUrl}/data.json#L6`); // line 6 is "needle", four levels down
		await page.waitForSelector('.fjf-root');
		await waitForTree(page);

		await expect(page.locator('.fjf-key', {hasText: '"needle"'})).toBeVisible();
		await expect(page.locator('.fjf-line-target')).toHaveAttribute('data-line', '6');
	});

	it('clicking a line number writes it into the URL instead of toggling the node', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 'all');
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);
		await expect(page.locator('.fjf-key', {hasText: '"needle"'})).toBeVisible();

		await clickGutterOf(page, '2'); // the header line of "level1", which is also a toggle

		// replaceState reaches the browser's URL a beat after the click resolves - wait for it, don't race it.
		await page.waitForFunction((): boolean => window.location.hash === '#L2');
		expect(new URL(page.url()).hash).toBe('#L2');
		await expect(page.locator('.fjf-key', {hasText: '"level2"'})).toBeVisible(); // still open
		await expect(page.locator('.fjf-line-target')).toHaveAttribute('data-line', '2');
	});

	it('does not move the view when a visible line number is clicked', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 'all');
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);
		await expect(page.locator('.fjf-key', {hasText: '"needle"'})).toBeVisible();
		await scrollToRightEdge(page); // a long value makes the tree scrollable sideways

		const before = await treeScroll(page);
		await clickGutterOf(page, '2');
		await page.waitForFunction((): boolean => window.location.hash === '#L2');

		// The line is under the pointer already: the click marks it, and leaves the view exactly where it was.
		expect(await treeScroll(page)).toEqual(before);
	});

	it('scrolls a linked line back to the left edge, however the tree was scrolled', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 'all');
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);
		await expect(page.locator('.fjf-key', {hasText: '"needle"'})).toBeVisible();
		await scrollToRightEdge(page);
		expect((await treeScroll(page)).left).toBeGreaterThan(0);

		await page.evaluate((): void => {
			window.location.hash = '#L6';
		});

		await expect(page.locator('.fjf-line-target')).toHaveAttribute('data-line', '6');
		expect((await treeScroll(page)).left).toBe(0);
	});

	it('offers Clear line only while a line is marked, and clearing it reloads nothing', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 'all');
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);
		await expect(page.locator('.fjf-key', {hasText: '"needle"'})).toBeVisible();

		const clear = page.getByRole('button', {name: 'Clear line'});
		await expect(clear).toBeHidden(); // nothing is marked yet, so the button is not in the toolbar

		await clickGutterOf(page, '2');
		await expect(clear).toBeVisible();

		// A value that only survives if the page is never reloaded.
		await page.evaluate((): void => {
			(window as unknown as PageWindow).probe = 'alive';
		});
		await clear.click();

		await expect(page.locator('.fjf-line-target')).toHaveCount(0);
		await expect(clear).toBeHidden();
		await page.waitForFunction((): boolean => window.location.hash === '');
		expect(await page.evaluate((): string | undefined => (window as unknown as PageWindow).probe)).toBe('alive');
	});

	it('follows a #L link that changes while the page is open', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 1);
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);

		await page.evaluate((): void => {
			window.location.hash = '#L12'; // "other", inside the collapsed "sibling"
		});

		await expect(page.locator('.fjf-key', {hasText: '"other"'})).toBeVisible();
		await expect(page.locator('.fjf-line-target')).toHaveAttribute('data-line', '12');
	});
});

describe('the line-number gutter', () => {
	it('numbers lines by their place in the fully expanded document, so collapsing leaves a gap', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 'all');
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);
		await expect(page.locator('.fjf-key', {hasText: '"needle"'})).toBeVisible();

		expect(await lineNumberOf(page, 'level1')).toBe('2');
		expect(await lineNumberOf(page, 'sibling')).toBe('11');

		const level1Line = page.locator('.fjf-line', {has: page.locator('.fjf-key', {hasText: '"level1"'})}).first();
		await level1Line.locator('button.fjf-toggle').click();

		// level1 is one line now, but sibling keeps its number: line 2 is followed by line 11.
		await expect(page.locator('.fjf-key', {hasText: '"needle"'})).toBeHidden();
		expect(await lineNumberOf(page, 'level1')).toBe('2');
		expect(await lineNumberOf(page, 'sibling')).toBe('11');
	});

	it('stays pinned to the left edge when the tree is scrolled sideways', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 'all');
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);

		const overflowing: boolean = await page.evaluate((): boolean => {
			const tree = document.querySelector('.fjf-tree') as HTMLElement;
			return tree.scrollWidth > tree.clientWidth;
		});
		expect(overflowing).toBe(true); // the long value makes the tree scroll horizontally

		await scrollToRightEdge(page);

		// The number is a pseudo-element - so that selecting the tree never copies it - which leaves its
		// computed style as the only observable. Sticky at the scrollport's left edge is what pins it.
		const gutter: Record<string, string> = await page.evaluate((): Record<string, string> => {
			const line = document.querySelector('.fjf-line') as HTMLElement;
			const style: CSSStyleDeclaration = getComputedStyle(line, '::before');
			return {position: style.position, left: style.left, userSelect: style.userSelect};
		});

		expect(gutter.position).toBe('sticky');
		expect(gutter.left).toBe('0px');
		expect(gutter.userSelect).toBe('none');
	});
});

describe('line hover', () => {
	it('highlights a plain line, not only one that can be opened', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 'all');
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);

		const plain = page.locator('.fjf-entry:not([data-expand]) > .fjf-line').first();
		await plain.hover();

		const colours: Record<string, string> = await page.evaluate((): Record<string, string> => {
			const line = document.querySelector('.fjf-line:hover') as HTMLElement;
			return {
				expandable: line.parentElement?.dataset.expand ?? 'no',
				line: getComputedStyle(line).backgroundColor,
				// the gutter carries its own background, so it has to follow the row - no hole in the highlight
				gutter: getComputedStyle(line, '::before').backgroundColor
			};
		});

		expect(colours.expandable).toBe('no');
		expect(colours.line).not.toBe('rgba(0, 0, 0, 0)');
		expect(colours.gutter).toBe(colours.line);
	});

	it('keeps every line hoverable across the whole scroll width', async ({context, baseUrl, setSetting}) => {
		await setSetting(DEPTH_KEY, 'all');
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);

		// Every line box ends where the widest line ends; a viewport-wide box would end at the fold.
		const distinctRightEdges: number = await page.evaluate((): number => {
			function rightEdge(line: Element): number {
				return Math.round(line.getBoundingClientRect().right);
			}

			return new Set([...document.querySelectorAll('.fjf-line')].map(rightEdge)).size;
		});
		expect(distinctRightEdges).toBe(1);

		await scrollToRightEdge(page);
		const rootLine = await page.locator('.fjf-line').first().boundingBox();
		await page.mouse.move((rootLine?.x ?? 0) + (rootLine?.width ?? 0) - 30, (rootLine?.y ?? 0) + 6);

		await expect(page.locator('.fjf-line:hover')).toHaveCount(1);
	});
});

describe('the console handle', () => {
	it('hands the parsed document to the page console as `json`', async ({context, baseUrl}) => {
		const page: Page = await context.newPage();
		const messages: string[] = [];
		page.on('console', (message): number => messages.push(message.text()));

		await openJson(page, baseUrl);

		await expect.poll((): string[] => messages).toContain('Free JSON Formatter: Type "json" to inspect');
		const handle: unknown = await page.evaluate((): unknown => (window as unknown as PageWindow).json);
		expect(handle).toEqual(SAMPLE);
	});

	it('says nothing on a page it did not format', async ({context, baseUrl}) => {
		const page: Page = await context.newPage();
		const messages: string[] = [];
		page.on('console', (message): number => messages.push(message.text()));

		await page.goto(`${baseUrl}/page.html`);
		await expect(page.locator('#title')).toHaveText('Ordinary page');

		expect(messages).not.toContain('Free JSON Formatter: Type "json" to inspect');
		const handle: unknown = await page.evaluate((): unknown => (window as unknown as PageWindow).json);
		expect(handle).toBeUndefined();
	});
});

describe('the settings popup', () =>
	it('saves without reloading the current page', async ({context, baseUrl, extensionId}) => {
		const page: Page = await context.newPage();
		await openJson(page, baseUrl);
		await page.evaluate((): void => {
			(window as unknown as PageWindow).marker = 1;
		});

		const popup: Page = await context.newPage();
		await popup.goto(`chrome-extension://${extensionId}/popup.html`);
		await popup.selectOption('#initial-depth', '3');
		await expect(popup.locator('#status')).toHaveText('Saved');
		await popup.close();

		// A reload would have wiped the marker off the window.
		await expect.poll(async (): Promise<unknown> => page.evaluate(() => (window as unknown as PageWindow).marker)).toBe(1);
	}));
