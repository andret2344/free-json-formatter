import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {JsonValue} from '../../src/shared/types.js';
import {installStorageStub, type StorageStub} from '../helpers/storage-stub.js';

/**
 * 1 {  2 "level1": {  3 "level2": {  4 "needle": "buried-treasure"  5 }  6 }
 * 7 "list": [  8 1  9 2  10 ]  11 "plain": "x"  12 }
 */
const SAMPLE: JsonValue = {
	level1: {level2: {needle: 'buried-treasure'}},
	list: [1, 2],
	plain: 'x'
};
const SAMPLE_TEXT: string = JSON.stringify(SAMPLE);

/** Over both toolbar thresholds at once: the "large" warning (10 MB) and the confirm before serializing (20 MB). */
const HUGE_TEXT: string = JSON.stringify({blob: 'x'.repeat(21 * 1024 * 1024)});

/** More collections than one expansion batch (200), so a run is still going when the assertions look at it. */
function wideText(): string {
	const items: JsonValue[] = [];
	for (let index = 0; index < 300; index++) {
		items.push({value: index});
	}
	return JSON.stringify({items});
}

let storage: StorageStub;

function toolbarButton(label: string): HTMLButtonElement {
	const buttons: HTMLButtonElement[] = [...document.querySelectorAll<HTMLButtonElement>('.fjf-toolbar button')];

	function hasLabel(candidate: HTMLButtonElement): boolean {
		return candidate.textContent === label;
	}

	const found: HTMLButtonElement | undefined = buttons.find(hasLabel);
	if (found === undefined) {
		throw new Error(`no toolbar button labelled "${label}"`);
	}
	return found;
}

function treeElement(): HTMLElement {
	return document.querySelector('.fjf-tree') as HTMLElement;
}

function stubClipboard(blocked: boolean = false): ReturnType<typeof vi.fn> {
	const writeText = vi.fn();
	if (blocked) {
		writeText.mockRejectedValue(new Error('clipboard blocked'));
	} else {
		writeText.mockResolvedValue(undefined);
	}
	Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true});
	return writeText;
}

/** Put a raw JSON document in the page and import the content script, which mounts itself on import. */
async function mount(text: string = SAMPLE_TEXT): Promise<void> {
	const pre: HTMLPreElement = document.createElement('pre');
	pre.textContent = text;
	document.body.append(pre);

	vi.resetModules();
	await import('../../src/content/content.js');
	await vi.waitFor((): void => {
		// The initial expansion runs in batches after the swap: the viewer is ready once it is over.
		expect(document.querySelector('.fjf-root')).not.toBeNull();
		expect((document.querySelector('.fjf-loading') as HTMLElement).hidden).toBe(true);
	});
}

/** The content script never mounts on this document - give it a chance to prove it. */
async function importOn(html: string): Promise<void> {
	document.body.innerHTML = html;
	vi.resetModules();
	await import('../../src/content/content.js');
	await new Promise((resolve: (value: unknown) => void): NodeJS.Timeout => setTimeout(resolve, 0));
}

beforeEach((): void => {
	storage = installStorageStub();
	document.documentElement.className = '';
	delete document.documentElement.dataset.fjfTheme;
	document.body.innerHTML = '';
	delete document.body.dataset.fjfMounted;
	window.location.hash = '';
	stubClipboard();
});

describe('mounting the viewer', () => {
	it('swaps the raw document for the tree and marks the body as mounted', async () => {
		await mount();

		expect(document.body.dataset.fjfMounted).toBe('1');
		expect(document.body.querySelector('pre.fjf-raw')).not.toBeNull();
		expect(document.documentElement.classList.contains('fjf-active')).toBe(true);
		expect(document.documentElement.dataset.fjfTheme).toBe('auto');
		expect(treeElement().querySelector('.fjf-key')?.textContent).toBe('"level1"');
	});

	it('keeps the original text in the Raw view, hidden, for the page-world handle to parse', async () => {
		await mount();

		const raw: HTMLElement = document.querySelector('.fjf-raw') as HTMLElement;
		expect(raw.textContent).toBe(SAMPLE_TEXT);
		expect(raw.hidden).toBe(true);
	});

	it('announces the mount to the page world', async () => {
		const announced = vi.fn();
		window.addEventListener('fjf-mounted', announced, {once: true});

		await mount();

		expect(announced).toHaveBeenCalledTimes(1);
	});

	it('leaves an ordinary HTML page alone', async () => {
		await importOn('<h1>Ordinary page</h1><p>text</p>');

		expect(document.querySelector('.fjf-root')).toBeNull();
		expect(document.body.dataset.fjfMounted).toBeUndefined();
	});

	it('leaves the page alone when the payload is over the configured limit', async () => {
		storage.data['fjf-max-mb'] = 1;
		const overLimit: string = JSON.stringify({blob: 'x'.repeat(1_200_000)});

		await importOn(`<pre>${overLimit}</pre>`);

		expect(document.querySelector('.fjf-root')).toBeNull();
		expect(document.querySelector('pre')?.textContent).toBe(overLimit);
	});

	it('opens only the stored number of levels', async () => {
		storage.data['fjf-depth'] = 1;
		await mount();

		expect(treeElement().querySelector('.fjf-entry.fjf-open > .fjf-children')).not.toBeNull();
		// level1 is collapsed at depth 1, so its children were never built.
		const keys: (string | null)[] = [...treeElement().querySelectorAll('.fjf-key')].map((key: Element): string | null => key.textContent);
		expect(keys).toContain('"level1"');
		expect(keys).not.toContain('"level2"');
	});
});

describe('the view switch', () => {
	it('shows the raw text and locks the tree controls', async () => {
		await mount();

		toolbarButton('Raw').click();

		expect(treeElement().hidden).toBe(true);
		expect((document.querySelector('.fjf-raw') as HTMLElement).hidden).toBe(false);
		expect(toolbarButton('Expand all').disabled).toBe(true);
		expect(toolbarButton('Wrap').disabled).toBe(true);
		expect(toolbarButton('Copy formatted').disabled).toBe(true);
		expect((document.querySelector('.fjf-search') as HTMLElement).style.display).toBe('none');
	});

	it('comes back to the tree', async () => {
		await mount();
		toolbarButton('Raw').click();

		toolbarButton('Formatted').click();

		expect(treeElement().hidden).toBe(false);
		expect((document.querySelector('.fjf-raw') as HTMLElement).hidden).toBe(true);
		expect(toolbarButton('Expand all').disabled).toBe(false);
		expect((document.querySelector('.fjf-search') as HTMLElement).style.display).toBe('');
	});
});

describe('the theme', () => {
	it('cycles auto - light - dark and persists every step', async () => {
		await mount();
		const themeBtn: HTMLButtonElement = toolbarButton('Theme: Auto');

		themeBtn.click();
		expect(themeBtn.textContent).toBe('Theme: Light');
		expect(document.documentElement.dataset.fjfTheme).toBe('light');
		await vi.waitFor((): void => expect(storage.data['fjf-theme']).toBe('light'));

		themeBtn.click();
		expect(themeBtn.textContent).toBe('Theme: Dark');

		themeBtn.click();
		expect(themeBtn.textContent).toBe('Theme: Auto');
		await vi.waitFor((): void => expect(storage.data['fjf-theme']).toBe('auto'));
	});

	it('applies the stored theme as the page is swapped', async () => {
		storage.data['fjf-theme'] = 'dark';
		await mount();

		expect(document.documentElement.dataset.fjfTheme).toBe('dark');
		expect(toolbarButton('Theme: Dark')).not.toBeNull();
	});

	it('falls back to auto when storage holds nonsense, or is unavailable', async () => {
		storage.data['fjf-theme'] = 'chartreuse';
		await mount();

		expect(document.documentElement.dataset.fjfTheme).toBe('auto');
	});
});

describe('wrapping', () => {
	it('toggles the class and persists the choice', async () => {
		await mount();

		toolbarButton('Wrap').click();

		expect(treeElement().classList.contains('fjf-wrap')).toBe(true);
		await vi.waitFor((): void => expect(storage.data['fjf-wrap']).toBe(true));

		toolbarButton('Wrap').click();
		expect(treeElement().classList.contains('fjf-wrap')).toBe(false);
		await vi.waitFor((): void => expect(storage.data['fjf-wrap']).toBe(false));
	});

	it('restores a stored preference on mount', async () => {
		storage.data['fjf-wrap'] = true;
		await mount();

		expect(treeElement().classList.contains('fjf-wrap')).toBe(true);
		expect(toolbarButton('Wrap').classList.contains('fjf-active-view')).toBe(true);
	});
});

describe('indentation', () => {
	function indentSelect(): HTMLSelectElement {
		return document.querySelector('select.fjf-select') as HTMLSelectElement;
	}

	it('offers every option and starts on the stored one', async () => {
		storage.data['fjf-indent'] = '1t';
		await mount();

		expect(indentSelect().options).toHaveLength(6);
		expect(indentSelect().value).toBe('1t');
		expect(treeElement().style.getPropertyValue('--fjf-tab')).toBe('4'); // a tab is drawn 4ch wide
	});

	it('persists a change and re-sizes the tree indent', async () => {
		await mount();
		expect(treeElement().style.getPropertyValue('--fjf-tab')).toBe('2');

		indentSelect().value = '8s';
		indentSelect().dispatchEvent(new Event('change', {bubbles: true}));

		expect(treeElement().style.getPropertyValue('--fjf-tab')).toBe('8');
		await vi.waitFor((): void => expect(storage.data['fjf-indent']).toBe('8s'));
	});
});

describe('the copy controls', () => {
	it('copies the raw text exactly as it was served', async () => {
		const writeText = stubClipboard();
		await mount();

		toolbarButton('Copy raw').click();

		await vi.waitFor((): void => expect(writeText).toHaveBeenCalledWith(SAMPLE_TEXT));
		expect(toolbarButton('Copied')).not.toBeNull();
	});

	it('says so when the clipboard is blocked, instead of failing silently', async () => {
		stubClipboard(true);
		await mount();

		toolbarButton('Copy raw').click();

		await vi.waitFor((): void => expect(toolbarButton('Copy failed')).not.toBeNull());
	});

	it('copies the document re-serialized with the selected indentation', async () => {
		const writeText = stubClipboard();
		await mount();
		const select: HTMLSelectElement = document.querySelector('select.fjf-select') as HTMLSelectElement;
		select.value = '1t';
		select.dispatchEvent(new Event('change', {bubbles: true}));

		toolbarButton('Copy formatted').click();

		await vi.waitFor((): void => expect(writeText).toHaveBeenCalledWith(JSON.stringify(SAMPLE, null, '\t')));
	});
});

describe('a very large document', () => {
	it('warns about the size in the toolbar', async () => {
		await mount(HUGE_TEXT);

		const warning: HTMLElement = document.querySelector('.fjf-warn') as HTMLElement;
		expect(warning.textContent).toBe('⚠ Large (21.0 MB)');
	});

	it('asks before re-serializing it, and copies nothing when the answer is no', async () => {
		const writeText = stubClipboard();
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
		await mount(HUGE_TEXT);

		toolbarButton('Copy formatted').click();

		expect(confirm).toHaveBeenCalledTimes(1);
		expect(writeText).not.toHaveBeenCalled();
		expect(toolbarButton('Copy formatted')).not.toBeNull(); // no label change: nothing was attempted
		confirm.mockRestore();
	});

	it('copies it once the user agrees', async () => {
		const writeText = stubClipboard();
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
		await mount(HUGE_TEXT);

		toolbarButton('Copy formatted').click();

		await vi.waitFor((): void => expect(writeText).toHaveBeenCalledTimes(1));
		confirm.mockRestore();
	});

	it('does not warn about an ordinary one', async () => {
		await mount();

		expect(document.querySelector('.fjf-warn')).toBeNull();
	});
});

describe('the search preferences', () => {
	function caseButton(): HTMLButtonElement {
		return document.querySelector('.fjf-search-case') as HTMLButtonElement;
	}

	it('starts case-sensitive when that is what was stored', async () => {
		storage.data['fjf-case'] = true;
		await mount();

		expect(caseButton().getAttribute('aria-pressed')).toBe('true');
	});

	it('persists a toggle of the case button', async () => {
		await mount();
		expect(caseButton().getAttribute('aria-pressed')).toBe('false');

		caseButton().click();

		await vi.waitFor((): void => expect(storage.data['fjf-case']).toBe(true));
	});
});

describe('deep links', () => {
	function targetLine(): HTMLElement | null {
		return document.querySelector('.fjf-line-target');
	}

	it('opens the branch a #L link points into, even when it was never rendered', async () => {
		storage.data['fjf-depth'] = 1;
		window.location.hash = '#L4'; // "needle", three levels down

		await mount();

		await vi.waitFor((): void => expect(targetLine()?.dataset.line).toBe('4'));
		expect(treeElement().querySelector('.fjf-string')?.textContent).toBe('"buried-treasure"');
	});

	it('ignores a hash that is not a line link', async () => {
		window.location.hash = '#section';
		await mount();

		expect(targetLine()).toBeNull();
	});

	it('follows a hash that changes while the page is open', async () => {
		storage.data['fjf-depth'] = 1;
		await mount();

		window.location.hash = '#L8'; // the first item of "list"
		window.dispatchEvent(new HashChangeEvent('hashchange'));

		await vi.waitFor((): void => expect(targetLine()?.dataset.line).toBe('8'));
	});

	it('offers Clear line only while a line is marked, and clearing it drops the hash without reloading', async () => {
		window.location.hash = '#L4';
		await mount();
		await vi.waitFor((): void => expect(targetLine()).not.toBeNull());

		const clear: HTMLButtonElement = toolbarButton('Clear line');
		expect(clear.hidden).toBe(false);

		clear.click();

		expect(targetLine()).toBeNull();
		expect(clear.hidden).toBe(true);
		expect(window.location.hash).toBe('');
		expect(document.querySelector('.fjf-root')).not.toBeNull(); // the tree survived: nothing reloaded
	});

	it('drops the mark when the hash goes away (Back, or an edit in the address bar)', async () => {
		window.location.hash = '#L4';
		await mount();
		await vi.waitFor((): void => expect(targetLine()).not.toBeNull());

		window.location.hash = '';
		window.dispatchEvent(new HashChangeEvent('hashchange'));

		expect(targetLine()).toBeNull();
	});
});

describe('expanding from the toolbar', () => {
	it('locks the tree controls and hides the tree while a run is going, and restores them after', async () => {
		storage.data['fjf-depth'] = 1;
		await mount(wideText());

		toolbarButton('Expand all').click();

		const expanding: HTMLButtonElement = toolbarButton('Expanding…');
		expect(expanding.disabled).toBe(true);
		expect(treeElement().hidden).toBe(true);
		expect((document.querySelector('.fjf-loading') as HTMLElement).hidden).toBe(false);
		// Collapse all is the way out of a long run - it stays live.
		expect(toolbarButton('Collapse all').disabled).toBe(false);

		await vi.waitFor((): void => expect(toolbarButton('Expand all').disabled).toBe(false));
		expect(treeElement().hidden).toBe(false);
		expect((document.querySelector('.fjf-progress-label') as HTMLElement).textContent).toBe('100%');
		expect(treeElement().querySelectorAll('.fjf-entry.fjf-collapsed')).toHaveLength(0);
	});

	it('collapses everything, cancelling a run in progress', async () => {
		storage.data['fjf-depth'] = 1;
		await mount(wideText());

		toolbarButton('Expand all').click();
		toolbarButton('Collapse all').click();

		expect(toolbarButton('Expand all').disabled).toBe(false);
		expect(treeElement().querySelectorAll('.fjf-entry.fjf-open')).toHaveLength(0);
	});
});

describe('storage that is unavailable', () => {
	it('mounts anyway, on the defaults', async () => {
		storage.failReads = true;

		await mount();

		expect(document.querySelector('.fjf-root')).not.toBeNull();
		expect(document.documentElement.dataset.fjfTheme).toBe('auto');
		expect(treeElement().classList.contains('fjf-wrap')).toBe(false);
		expect((document.querySelector('select.fjf-select') as HTMLSelectElement).value).toBe('2s');
	});

	it('keeps working when a write is rejected', async () => {
		await mount();
		storage.failWrites = true;

		toolbarButton('Wrap').click();

		expect(treeElement().classList.contains('fjf-wrap')).toBe(true); // the UI does not wait on storage
	});
});
