import {describe, expect, it} from 'vitest';
import {renderJson} from '../src/formatter.js';
import {createSearch} from '../src/search.js';

function setup() {
	const tree = renderJson({name: 'alpha', other: 'alphabet', n: 1});
	const search = createSearch(tree);
	document.body.append(tree, search.el);
	const input = search.el.querySelector('.fjf-search-input') as HTMLInputElement;
	const count = search.el.querySelector('.fjf-search-count') as HTMLElement;
	return {tree, search, input, count};
}

function pressEnter(input: HTMLInputElement): void {
	input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
}

function typeInto(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input', {bubbles: true}));
}

describe('createSearch', () => {
	it('reveals the nav controls only when a query is present', () => {
		const {search, input} = setup();
		const nav = search.el.querySelector('.fjf-search-nav-group') as HTMLElement;

		expect(nav.hidden).toBe(true);

		input.value = 'alpha';
		pressEnter(input);
		expect(nav.hidden).toBe(false);

		typeInto(input, '');
		expect(nav.hidden).toBe(true);
	});

	it('respects the case-sensitivity toggle', () => {
		const {search, input, count} = setup();
		const caseBtn = search.el.querySelector('.fjf-search-case') as HTMLButtonElement;

		input.value = 'ALPHA';
		pressEnter(input);
		expect(count.textContent).toBe('1 / 2'); // case-insensitive by default

		caseBtn.click(); // match case; the text is lowercase "alpha"/"alphabet"
		expect(caseBtn.getAttribute('aria-pressed')).toBe('true');
		expect(count.textContent).toBe('0 / 0');

		caseBtn.click(); // back to case-insensitive
		expect(count.textContent).toBe('1 / 2');
	});

	it('keeps the focused match selected when toggling case, recomputing its ordinal', () => {
		const tree = renderJson({a: 'xy', b: 'Xy', c: 'xy'});
		const search = createSearch(tree);
		document.body.append(tree, search.el);
		const input = search.el.querySelector('.fjf-search-input') as HTMLInputElement;
		const count = search.el.querySelector('.fjf-search-count') as HTMLElement;
		const caseBtn = search.el.querySelector('.fjf-search-case') as HTMLButtonElement;
		const next = search.el.querySelectorAll('.fjf-search-nav')[1] as HTMLButtonElement;

		input.value = 'xy';
		pressEnter(input);
		expect(count.textContent).toBe('1 / 3');
		next.click();
		next.click();
		expect(count.textContent).toBe('3 / 3'); // on the 3rd match: c."xy"

		caseBtn.click(); // case-sensitive drops b."Xy"; c."xy" stays, now 2nd of 2
		expect(count.textContent).toBe('2 / 2');
	});

	it('honors the initial case-sensitivity option and reports toggles', () => {
		const tree = renderJson({name: 'alpha'});
		const changes: boolean[] = [];
		const search = createSearch(tree, {caseSensitive: true, onCaseChange: (v) => changes.push(v)});
		const caseBtn = search.el.querySelector('.fjf-search-case') as HTMLButtonElement;

		expect(caseBtn.getAttribute('aria-pressed')).toBe('true');
		expect(caseBtn.classList.contains('fjf-active-view')).toBe(true);

		caseBtn.click();
		expect(changes).toEqual([false]);
		expect(caseBtn.getAttribute('aria-pressed')).toBe('false');
	});

	it('highlights every match and reports the count', () => {
		const {tree, input, count} = setup();
		input.value = 'alpha';
		pressEnter(input);

		// "alpha" occurs in "alpha" and in "alphabet".
		expect(tree.querySelectorAll('.fjf-hl')).toHaveLength(2);
		expect(count.textContent).toBe('1 / 2');
		expect(tree.querySelector('.fjf-hl-current')).not.toBeNull();
	});

	it('navigates to the next match on repeated Enter', () => {
		const {tree, input, count} = setup();
		input.value = 'alpha';
		pressEnter(input);
		pressEnter(input);
		expect(count.textContent).toBe('2 / 2');
		expect(tree.querySelectorAll('.fjf-hl-current')).toHaveLength(1);
	});

	it('reports zero matches without highlighting', () => {
		const {tree, input, count} = setup();
		input.value = 'zzz';
		pressEnter(input);
		expect(tree.querySelectorAll('.fjf-hl')).toHaveLength(0);
		expect(count.textContent).toBe('0 / 0');
	});

	it('clears highlights when disabled', () => {
		const {tree, search, input, count} = setup();
		input.value = 'alpha';
		pressEnter(input);
		search.setEnabled(false);
		expect(tree.querySelectorAll('.fjf-hl')).toHaveLength(0);
		expect(count.textContent).toBe('');
	});
});
