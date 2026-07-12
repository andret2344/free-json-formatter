import {afterEach, beforeEach, describe, expect, it, type VitestUtils, vi} from 'vitest';

const MESSAGE = 'Free JSON Formatter: Type "json" to inspect';

interface PageWindow {
	json?: unknown;
}

function handle(): unknown {
	return (window as unknown as PageWindow).json;
}

function addRawView(text: string): HTMLPreElement {
	const raw: HTMLPreElement = document.createElement('pre');
	raw.className = 'fjf-raw';
	raw.textContent = text;
	document.body.append(raw);
	return raw;
}

/** The page-world script defines the handle on import - exactly as the manifest loads it. */
async function loadHandle(): Promise<void> {
	vi.resetModules();
	await import('../../src/content/console-handle.js');
}

beforeEach((): void => {
	document.body.innerHTML = '';
	Reflect.deleteProperty(window, 'json');
	vi.spyOn(console, 'log').mockImplementation((): void => undefined);
});

afterEach((): VitestUtils => vi.restoreAllMocks());

describe('the page-world console handle', () => {
	it('defines `json` when the viewer has already mounted', async () => {
		addRawView('{"a": [1, 2]}');

		await loadHandle();

		expect(handle()).toEqual({a: [1, 2]});
		expect(console.log).toHaveBeenCalledWith(MESSAGE);
	});

	it('waits for the mount announcement when it runs first', async () => {
		await loadHandle();

		expect(handle()).toBeUndefined();
		expect(console.log).not.toHaveBeenCalled();

		addRawView('{"a": 1}');
		window.dispatchEvent(new CustomEvent('fjf-mounted'));

		expect(handle()).toEqual({a: 1});
		expect(console.log).toHaveBeenCalledWith(MESSAGE);
	});

	it('parses only when the handle is read, so an unused one costs nothing', async () => {
		addRawView('{"a": 1}');
		const parse = vi.spyOn(JSON, 'parse');

		await loadHandle();
		expect(parse).not.toHaveBeenCalled();

		expect(handle()).toEqual({a: 1});
		expect(parse).toHaveBeenCalledTimes(1);
	});

	it('re-reads the Raw view on every access, rather than caching a multi-megabyte document', async () => {
		const raw: HTMLPreElement = addRawView('{"a": 1}');
		await loadHandle();
		expect(handle()).toEqual({a: 1});

		raw.textContent = '{"a": 2}';

		expect(handle()).toEqual({a: 2});
	});

	it('yields undefined when there is no Raw view to parse', async () => {
		const raw: HTMLPreElement = addRawView('{"a": 1}');
		await loadHandle();

		raw.remove();

		expect(handle()).toBeUndefined();
	});

	it('says nothing on a page the viewer never touched', async () => {
		document.body.innerHTML = '<h1>Ordinary page</h1>';

		await loadHandle();

		expect(handle()).toBeUndefined();
		expect(console.log).not.toHaveBeenCalled();
	});
});
