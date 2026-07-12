import {describe, expect, it, vi} from 'vitest';
import type {JsonValue} from '../../src/shared/types.js';
import {renderJson, type Tree} from '../../src/viewer/formatter.js';
import {createSearch, type Search, type SearchOptions} from '../../src/viewer/search.js';

interface Harness {
	readonly tree: Tree;
	readonly search: Search;
	readonly input: HTMLInputElement;
	readonly count: HTMLElement;
	readonly caseBtn: HTMLButtonElement;
	readonly next: HTMLButtonElement;
	readonly prev: HTMLButtonElement;
}

function setup(value: JsonValue, depth: number = 1, options: SearchOptions = {}): Harness {
	const tree: Tree = renderJson(value, depth);
	const search: Search = createSearch(tree, value, options);
	document.body.append(tree.el, search.el);
	const navButtons = search.el.querySelectorAll<HTMLButtonElement>('.fjf-search-nav');
	return {
		tree,
		search,
		input: search.el.querySelector('.fjf-search-input') as HTMLInputElement,
		count: search.el.querySelector('.fjf-search-count') as HTMLElement,
		caseBtn: search.el.querySelector('.fjf-search-case') as HTMLButtonElement,
		prev: navButtons[0],
		next: navButtons[1]
	};
}

function search(harness: Harness, query: string): void {
	harness.input.value = query;
	harness.input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
}

function clearQuery(harness: Harness): void {
	harness.input.value = '';
	harness.input.dispatchEvent(new Event('input', {bubbles: true}));
}

function isOpen(element: HTMLElement | null): boolean {
	if (element === null) {
		return false;
	}
	return element.classList.contains('fjf-open');
}

describe('createSearch over the parsed model', () => {
	it('finds a value inside a branch that was never rendered', () => {
		const harness = setup({a: {b: 'needle'}, c: {d: 'other'}});
		expect(harness.tree.elementAt(['a', 'b'])).toBeNull(); // collapsed, not built

		search(harness, 'needle');

		expect(harness.count.textContent).toBe('1 / 1');
		expect(harness.tree.elementAt(['a', 'b'])).not.toBeNull(); // only this branch got rendered
	});

	it('finds a matching object key', () => {
		const harness = setup({outer: {secretKey: 1}});
		search(harness, 'secretKey');

		expect(harness.count.textContent).toBe('1 / 1');
		const entry = harness.tree.elementAt(['outer', 'secretKey']) as HTMLElement;
		expect(entry.querySelector('.fjf-key .fjf-hl')).not.toBeNull();
	});

	it('does not expand the whole tree to find a match', () => {
		const harness = setup({a: {b: 'needle'}, c: {d: {e: 'other'}}});
		search(harness, 'needle');

		expect(isOpen(harness.tree.elementAt(['a']))).toBe(true);
		expect(isOpen(harness.tree.elementAt(['c']))).toBe(false);
		expect(harness.tree.elementAt(['c', 'd'])).toBeNull();
	});

	it('reveals another branch on the next match and keeps the previous one open', () => {
		const harness = setup({a: {b: 'hit one'}, c: {d: 'hit two'}});
		search(harness, 'hit');
		expect(harness.count.textContent).toBe('1 / 2');
		expect(isOpen(harness.tree.elementAt(['a']))).toBe(true);
		expect(harness.tree.elementAt(['c', 'd'])).toBeNull();

		harness.next.click();

		expect(harness.count.textContent).toBe('2 / 2');
		expect(harness.tree.elementAt(['c', 'd'])).not.toBeNull();
		expect(isOpen(harness.tree.elementAt(['a']))).toBe(true); // still open
	});

	it('steps back to the previous match', () => {
		const harness = setup({a: 'hit one', b: 'hit two'});
		search(harness, 'hit');
		harness.next.click();
		expect(harness.count.textContent).toBe('2 / 2');

		harness.prev.click();
		expect(harness.count.textContent).toBe('1 / 2');
	});

	it('highlights the current match once it is rendered', () => {
		const harness = setup({a: {b: 'needle'}});
		search(harness, 'needle');

		const entry = harness.tree.elementAt(['a', 'b']) as HTMLElement;
		expect(entry.querySelector('.fjf-hl-current')).not.toBeNull();
	});

	it('clears the highlights when the query is emptied', () => {
		const harness = setup({a: 'needle'});
		search(harness, 'needle');
		expect(harness.tree.el.querySelectorAll('.fjf-hl')).toHaveLength(1);

		clearQuery(harness);

		expect(harness.tree.el.querySelectorAll('.fjf-hl')).toHaveLength(0);
		expect(harness.count.textContent).toBe('');
	});

	it('reports zero matches without highlighting', () => {
		const harness = setup({a: 'value'});
		search(harness, 'zzz');
		expect(harness.count.textContent).toBe('0 / 0');
		expect(harness.tree.el.querySelectorAll('.fjf-hl')).toHaveLength(0);
	});

	it('respects the case-sensitivity toggle and its accessible state', () => {
		const harness = setup({a: 'alpha', b: 'alphabet'}, 2);
		search(harness, 'ALPHA');
		expect(harness.count.textContent).toBe('1 / 2'); // case-insensitive by default
		expect(harness.caseBtn.getAttribute('aria-label')).toBe('Enable case-sensitive search');

		harness.caseBtn.click();

		expect(harness.caseBtn.getAttribute('aria-pressed')).toBe('true');
		expect(harness.caseBtn.getAttribute('aria-label')).toBe('Disable case-sensitive search');
		expect(harness.count.textContent).toBe('0 / 0');
	});

	it('keeps the focused match when toggling case, if it still matches', () => {
		const harness = setup({a: 'xy', b: 'Xy', c: 'xy'}, 2);
		search(harness, 'xy');
		harness.next.click();
		harness.next.click();
		expect(harness.count.textContent).toBe('3 / 3'); // c: "xy"

		harness.caseBtn.click(); // case-sensitive drops b: "Xy"; c: "xy" is now 2nd of 2

		expect(harness.count.textContent).toBe('2 / 2');
	});

	it('labels the navigation buttons for screen readers', () => {
		const harness = setup({a: 1});
		expect(harness.prev.getAttribute('aria-label')).toBe('Previous match');
		expect(harness.next.getAttribute('aria-label')).toBe('Next match');
	});

	it('handles keys with dots, quotes, slashes and Unicode', () => {
		const value: JsonValue = {
			'a.b': {'x"y': {'p/q': {zażółć: 'needle'}}}
		};
		const harness = setup(value);
		search(harness, 'needle');

		expect(harness.count.textContent).toBe('1 / 1');
		const entry = harness.tree.elementAt(['a.b', 'x"y', 'p/q', 'zażółć']) as HTMLElement;
		expect(entry).not.toBeNull();
		expect(entry.querySelector('.fjf-hl-current')).not.toBeNull();
	});

	it('does not confuse the array index 0 with the object key "0"', () => {
		const value: JsonValue = {arr: ['needle'], obj: {'0': 'needle'}};
		const harness = setup(value);
		search(harness, 'needle');
		expect(harness.count.textContent).toBe('1 / 2');

		// First hit sits in the array, second under the object key "0" - two distinct entries.
		const inArray = harness.tree.elementAt(['arr', 0]) as HTMLElement;
		expect(inArray).not.toBeNull();
		expect(inArray.querySelector('.fjf-hl-current')).not.toBeNull();

		harness.next.click();

		const inObject = harness.tree.elementAt(['obj', '0']) as HTMLElement;
		expect(inObject).not.toBeNull();
		expect(inObject).not.toBe(inArray);
		expect(inObject.querySelector('.fjf-hl-current')).not.toBeNull();
	});

	it('clears highlights when disabled', () => {
		const harness = setup({a: 'needle'});
		search(harness, 'needle');
		harness.search.setEnabled(false);

		expect(harness.tree.el.querySelectorAll('.fjf-hl')).toHaveLength(0);
		expect(harness.count.textContent).toBe('');
		expect(harness.search.el.style.display).toBe('none');
	});

	it('comes back when it is enabled again', () => {
		const harness = setup({a: 'needle'});
		harness.search.setEnabled(false);

		harness.search.setEnabled(true);

		expect(harness.search.el.style.display).toBe('');
	});
});

describe('typing in the search box', () => {
	function type(harness: Harness, query: string): void {
		harness.input.value = query;
		harness.input.dispatchEvent(new Event('input', {bubbles: true}));
	}

	it('runs the search a moment after the last keystroke, not on every one', async () => {
		const harness = setup({a: 'needle'});
		const nav: HTMLElement = harness.search.el.querySelector('.fjf-search-nav-group') as HTMLElement;

		type(harness, 'nee');
		type(harness, 'need');
		type(harness, 'needle');
		expect(harness.count.textContent).toBe(''); // debounced: nothing has run yet

		await vi.waitFor((): void => expect(harness.count.textContent).toBe('1 / 1'));
		expect(nav.hidden).toBe(false);
	});

	it('hides the navigation immediately when the field is emptied, without waiting for the debounce', async () => {
		const harness = setup({a: 'needle'});
		const nav: HTMLElement = harness.search.el.querySelector('.fjf-search-nav-group') as HTMLElement;
		type(harness, 'needle');
		await vi.waitFor((): void => expect(harness.count.textContent).toBe('1 / 1'));

		type(harness, '');

		expect(nav.hidden).toBe(true);
		expect(harness.count.textContent).toBe('');
	});
});

describe('navigating the matches', () => {
	function press(harness: Harness, shiftKey: boolean): void {
		harness.input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, shiftKey}));
	}

	it('walks forward with Enter and backwards with Shift+Enter', () => {
		const harness = setup({a: 'hit one', b: 'hit two', c: 'hit three'}, 2);
		search(harness, 'hit');
		expect(harness.count.textContent).toBe('1 / 3');

		press(harness, false);
		expect(harness.count.textContent).toBe('2 / 3');

		press(harness, true);
		expect(harness.count.textContent).toBe('1 / 3');
	});

	it('wraps around at both ends', () => {
		const harness = setup({a: 'hit one', b: 'hit two'}, 2);
		search(harness, 'hit');

		harness.prev.click(); // back from the first match
		expect(harness.count.textContent).toBe('2 / 2');

		harness.next.click(); // forward from the last one
		expect(harness.count.textContent).toBe('1 / 2');
	});

	it('does nothing when there is nothing to navigate', () => {
		const harness = setup({a: 'value'});
		search(harness, 'zzz');

		harness.next.click();
		harness.prev.click();

		expect(harness.count.textContent).toBe('0 / 0');
	});

	it('finds every occurrence inside one value, not just the first', () => {
		const harness = setup({a: 'aha aha aha'}, 2);
		search(harness, 'aha');

		expect(harness.count.textContent).toBe('1 / 3');
		expect(harness.tree.el.querySelectorAll('.fjf-hl')).toHaveLength(3);
	});
});

describe('the case-sensitivity preference', () => {
	it('starts pressed when the stored preference says so', () => {
		const harness = setup({a: 'alpha', b: 'ALPHA'}, 2, {caseSensitive: true});
		expect(harness.caseBtn.getAttribute('aria-pressed')).toBe('true');

		search(harness, 'alpha');

		expect(harness.count.textContent).toBe('1 / 1');
	});

	it('reports every toggle, so the choice can be persisted', () => {
		const changes: boolean[] = [];

		function onCaseChange(value: boolean): void {
			changes.push(value);
		}

		const harness = setup({a: 'alpha'}, 2, {onCaseChange});

		harness.caseBtn.click();
		harness.caseBtn.click();

		expect(changes).toEqual([true, false]);
	});
});

describe('a hit that straddles element boundaries', () => {
	it('is counted but left unmarked, rather than throwing', () => {
		// The value renders as "<a>https://example.com/x</a>" inside quotes - a hit over the opening
		// quote and the link cannot be wrapped in a single <mark>.
		const harness = setup({site: 'https://example.com/x'}, 2);

		search(harness, '"https');

		expect(harness.count.textContent).toBe('1 / 1');
		expect(harness.tree.el.querySelectorAll('.fjf-hl')).toHaveLength(0);
	});

	it('marks a hit that sits wholly inside the link text', () => {
		const harness = setup({site: 'https://example.com/x'}, 2);

		search(harness, 'example');

		expect(harness.count.textContent).toBe('1 / 1');
		expect(harness.tree.el.querySelector('a.fjf-link .fjf-hl')).not.toBeNull();
	});
});
