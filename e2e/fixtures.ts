import {createServer, type IncomingMessage, type Server, type ServerResponse} from 'node:http';
import type {AddressInfo} from 'node:net';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {type BrowserContext, test as base, chromium} from '@playwright/test';

const root: string = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const EXTENSION_PATH: string = resolve(root, 'dist/chromium');

/** Wider than any viewport the tests run in, so the tree really does scroll horizontally. */
const LONG_VALUE: string = 'wide-value-'.repeat(60);

/** Nested five levels deep, one distinctive key per level, plus a value only reachable deep down. */
export const SAMPLE: unknown = {
	level1: {
		level2: {
			level3: {
				level4: {
					needle: 'buried-treasure'
				}
			}
		}
	},
	sibling: {other: 'plain'},
	list: [1, 2, 3],
	long: LONG_VALUE
};

/** Collections in LARGE - the expansion runs in batches of 200, so this takes many frames to finish. */
const LARGE_ITEMS = 4_000;

/** Big enough that Expand all is still running when the assertions look at the toolbar. */
function buildLarge(): unknown {
	const items: unknown[] = [];
	for (let index = 0; index < LARGE_ITEMS; index++) {
		items.push({id: index, tags: ['a', 'b'], nested: {value: index}});
	}
	return {items};
}

export const LARGE: unknown = buildLarge();

/** Past a 1 MB size limit, so the viewer has to leave the page as the browser served it. */
const OVERSIZED: string = JSON.stringify({blob: 'x'.repeat(2 * 1024 * 1024)});

/** Served as JSON, but it does not parse - the viewer must not take the page over. */
const BROKEN: string = '{"a": 1,';

const PLAIN_HTML: string = '<!doctype html><html lang="en"><body><h1 id="title">Ordinary page</h1></body></html>';

interface Route {
	readonly body: string;
	readonly type: string;
}

const ROUTES: Readonly<Record<string, Route>> = {
	'/page.html': {body: PLAIN_HTML, type: 'text/html; charset=utf-8'},
	'/data.json': {body: JSON.stringify(SAMPLE), type: 'application/json'},
	'/large.json': {body: JSON.stringify(LARGE), type: 'application/json'},
	'/oversized.json': {body: OVERSIZED, type: 'application/json'},
	'/broken.json': {body: BROKEN, type: 'application/json'}
};

function startServer(): Promise<Server> {
	const server: Server = createServer((request: IncomingMessage, response: ServerResponse): void => {
		const route: Route | undefined = ROUTES[(request.url ?? '').split('?')[0]];
		if (route === undefined) {
			response.writeHead(404).end('not found');
			return;
		}
		response.writeHead(200, {'content-type': route.type}).end(route.body);
	});
	return new Promise<Server>((done: (server: Server) => void): Server => server.listen(0, '127.0.0.1', (): void => done(server)));
}

const EXTENSION_NAME = 'Free JSON Formatter';

interface InternalsEntry {
	readonly id: string;
	readonly name: string;
}

/**
 * The extension has no background worker to read `chrome.runtime.id` from (and it must not grow one),
 * so ask the browser: chrome://extensions-internals dumps every loaded extension as JSON.
 */
async function readExtensionId(context: BrowserContext): Promise<string> {
	const page = await context.newPage();
	await page.goto('chrome://extensions-internals/');
	const dump: string = await page.evaluate((): string => document.body.innerText);
	await page.close();

	const entries = JSON.parse(dump) as InternalsEntry[];

	function isOurs(entry: InternalsEntry): boolean {
		return entry.name === EXTENSION_NAME;
	}

	const ours: InternalsEntry | undefined = entries.find(isOurs);
	if (ours === undefined) {
		throw new Error(`${EXTENSION_NAME} is not loaded - run "yarn build:chromium" first`);
	}
	return ours.id;
}

/** One storage write, carried into the page as a single serializable argument. */
interface StorageSetting {
	readonly key: string;
	readonly value: unknown;
}

export interface ExtensionFixtures {
	readonly context: BrowserContext;
	readonly extensionId: string;
	/** Base URL of the local fixture server, e.g. http://127.0.0.1:53421 */
	readonly baseUrl: string;
	/** Write a value into the extension's storage (settings apply to pages opened afterwards). */
	readonly setSetting: (key: string, value: unknown) => Promise<void>;
}

export const test = base.extend<ExtensionFixtures>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright reads fixture dependencies from this destructuring pattern
	context: async ({}, use): Promise<void> => {
		const context: BrowserContext = await chromium.launchPersistentContext('', {
			channel: 'chromium',
			args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`]
		});
		await use(context);
		await context.close();
	},

	extensionId: async ({context}, use): Promise<void> => await use(await readExtensionId(context)),

	// biome-ignore lint/correctness/noEmptyPattern: Playwright reads fixture dependencies from this destructuring pattern
	baseUrl: async ({}, use): Promise<void> => {
		const server: Server = await startServer();
		const {port} = server.address() as AddressInfo;
		await use(`http://127.0.0.1:${port}`);
		server.close();
	},

	setSetting: async ({context, extensionId}, use): Promise<void> => {
		async function setSetting(key: string, value: unknown): Promise<void> {
			const page = await context.newPage();
			await page.goto(`chrome-extension://${extensionId}/popup.html`);
			await page.evaluate(async (setting: StorageSetting): Promise<void> => await chrome.storage.local.set({[setting.key]: setting.value}), {key, value});
			await page.close();
		}

		await use(setSetting);
	}
});

export const expect = test.expect;
/** Specs read as sentences: describe(...) groups, it(...) states the behaviour. */
export const describe = test.describe;
export const it = test;
