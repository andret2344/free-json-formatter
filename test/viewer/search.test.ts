import {describe, expect, it} from 'vitest';
import type {JsonValue} from '../../src/shared/types.js';
import {renderJson, type Tree} from '../../src/viewer/formatter.js';
import {createSearch, type Search} from '../../src/viewer/search.js';

interface Harness {
	readonly tree: Tree;
	readonly search: Search;
	readonly input: HTMLInputElement;
	readonly count: HTMLElement;
	readonly caseBtn: HTMLButtonElement;
	readonly next: HTMLButtonElement;
	readonly prev: HTMLButtonElement;
}

function setup(value: JsonValue, depth: number = 1): Harness {
	const tree: Tree = renderJson(value, depth);
	const search: Search = createSearch(tree, value);
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
	});
});
