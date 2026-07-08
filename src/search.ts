import {button, createElement} from './dom.js';
import {setAllExpanded} from './formatter.js';

export interface Search {
	readonly el: HTMLElement;
	readonly setEnabled: (on: boolean) => void;
}

export interface SearchOptions {
	/** Initial case-sensitivity state (persisted preference). */
	readonly caseSensitive?: boolean;
	/** Called whenever the user toggles case sensitivity, so it can be persisted. */
	readonly onCaseChange?: (value: boolean) => void;
}

interface Match {
	readonly node: Text;
	readonly start: number;
	readonly end: number;
}

const HIGHLIGHT: string = 'fjf-hl';
const CURRENT: string = 'fjf-hl-current';
const DEBOUNCE_MS: number = 120;

// CSS Custom Highlight API paints ranges with zero DOM mutation — no <mark> wrapping, no reflow,
// O(1) clearing. Fall back to wrapping <mark> elements only where it is unavailable (e.g. jsdom).
const supportsHighlight: boolean =
	typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

/** Builds the search box and wires fast, non-destructive highlighting over the rendered tree. */
export function createSearch(tree: HTMLElement, options: SearchOptions = {}): Search {
	const wrap: HTMLDivElement = createElement('div', 'fjf-search');

	// Navigation group sits to the LEFT of the input and is hidden until there is a query,
	// so an empty search box shows just the field (the bare arrows looked like an error).
	const nav: HTMLDivElement = createElement('div', 'fjf-search-nav-group');
	nav.hidden = true;

	const prev: HTMLButtonElement = button('‹', 'Previous match', 'fjf-btn fjf-search-nav');
	const count: HTMLSpanElement = createElement('span', 'fjf-search-count');
	const next: HTMLButtonElement = button('›', 'Next match', 'fjf-btn fjf-search-nav');

	nav.append(prev, count, next);

	const input: HTMLInputElement = createElement('input', 'fjf-search-input');
	input.type = 'search';
	input.placeholder = 'Search…';
	input.id = 'fjf-search-input';

	// Case-sensitivity toggle: pressed = match case, released (default) = ignore case.
	const caseBtn: HTMLButtonElement = button('Cc', 'Match case', 'fjf-btn fjf-search-case');

	wrap.append(nav, input, caseBtn);

	let caseSensitive: boolean = options.caseSensitive === true;
	caseBtn.classList.toggle('fjf-active-view', caseSensitive);
	caseBtn.setAttribute('aria-pressed', String(caseSensitive));

	// Fast path state.
	const allHl: Highlight | null = supportsHighlight ? new Highlight() : null;
	const curHl: Highlight | null = supportsHighlight ? new Highlight() : null;
	if (allHl !== null && curHl !== null) {
		CSS.highlights.set(HIGHLIGHT, allHl);
		CSS.highlights.set(CURRENT, curHl);
	}

	let ranges: Range[] = [];
	// Fallback path state.
	let marks: HTMLElement[] = [];
	// Matches from the last run, parallel to ranges/marks (same order/index).
	let matches: Match[] = [];
	let index: number = -1;

	function setNavVisible(show: boolean): void {
		nav.hidden = !show;
	}

	function clear(): void {
		if (allHl !== null && curHl !== null) {
			allHl.clear();
			curHl.clear();
		}
		ranges = [];
		if (marks.length > 0) {
			const parents = new Set<Node>();
			for (const mark of marks) {
				const parent: ParentNode | null = mark.parentNode;
				if (parent === null) {
					continue;
				}
				parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark);
				parents.add(parent);
			}
			// Normalize each affected parent once (merges the split text nodes back together).
			for (const parent of parents) {
				parent.normalize();
			}
			marks = [];
		}
		matches = [];
		index = -1;
	}

	function collectMatches(query: string): Match[] {
		const found: Match[] = [];
		const needle: string = caseSensitive ? query : query.toLowerCase();
		const walker: TreeWalker = document.createTreeWalker(tree, NodeFilter.SHOW_TEXT);
		let node: Node | null = walker.nextNode();
		while (node !== null) {
			const raw: string = node.nodeValue ?? '';
			const hay: string = caseSensitive ? raw : raw.toLowerCase();
			let from: number = hay.indexOf(needle);
			while (from !== -1) {
				found.push({node: node as Text, start: from, end: from + query.length});
				from = hay.indexOf(needle, from + query.length);
			}
			node = walker.nextNode();
		}
		return found;
	}

	function rangeFor(match: Match): Range {
		const range: Range = document.createRange();
		range.setStart(match.node, match.start);
		range.setEnd(match.node, match.end);
		return range;
	}

	function scrollToNode(node: Node): void {
		const target: HTMLElement | null = node.parentElement;
		if (target !== null && typeof target.scrollIntoView === 'function') {
			target.scrollIntoView({block: 'center', behavior: 'smooth'});
		}
	}

	function total(): number {
		return supportsHighlight ? ranges.length : marks.length;
	}

	function focus(position: number): void {
		const matchCount: number = total();
		if (matchCount === 0) {
			return;
		}
		index = ((position % matchCount) + matchCount) % matchCount;

		if (curHl !== null) {
			curHl.clear();
			curHl.add(ranges[index]);
			scrollToNode(ranges[index].startContainer);
		} else {
			for (const mark of marks) {
				mark.classList.remove(CURRENT);
			}
			const current: HTMLElement = marks[index];
			current.classList.add(CURRENT);
			scrollToNode(current);
		}
		count.textContent = `${index + 1} / ${matchCount}`;
	}

	function indexOfMatch(list: Match[], target: Match | null): number {
		if (target === null) {
			return -1;
		}
		const wanted: Match = target;

		function sameAsTarget(candidate: Match): boolean {
			return candidate.node === wanted.node && candidate.start === wanted.start;
		}

		return list.findIndex(sameAsTarget);
	}

	function run(focusMatch: Match | null = null): void {
		clear();
		const query: string = input.value;
		if (query.length < 1) {
			setNavVisible(false);
			count.textContent = '';
			return;
		}

		setNavVisible(true);
		setAllExpanded(tree, true);
		const found: Match[] = collectMatches(query);
		matches = found;

		if (found.length === 0) {
			count.textContent = '0 / 0';
			return;
		}

		if (allHl !== null) {
			for (const match of found) {
				const range: Range = rangeFor(match);
				ranges.push(range);
				allHl.add(range);
			}
		} else {
			// Wrap from last to first so earlier offsets stay valid within each text node.
			for (let matchIndex: number = found.length - 1; matchIndex >= 0; matchIndex--) {
				const range: Range = rangeFor(found[matchIndex]);
				const mark: HTMLElement = document.createElement('mark');
				mark.className = HIGHLIGHT;
				range.surroundContents(mark);
				marks.unshift(mark);
			}
		}

		// Keep the previously focused match selected (e.g. after toggling case), otherwise start at 0.
		const preferred: number = indexOfMatch(found, focusMatch);
		focus(Math.max(preferred, 0));
	}

	let timer: number = 0;
	input.addEventListener('input', (): void => {
		window.clearTimeout(timer);
		// Hide the controls immediately when the field is emptied; debounce the actual search.
		if (input.value.length < 1) {
			run();
			return;
		}
		timer = window.setTimeout(run, DEBOUNCE_MS);
	});
	input.addEventListener('keydown', (event: KeyboardEvent): void => {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (total() === 0) {
				run();
			} else {
				focus(index + (event.shiftKey ? -1 : 1));
			}
		}
	});
	next.addEventListener('click', (): void => focus(index + 1));
	prev.addEventListener('click', (): void => focus(index - 1));
	caseBtn.addEventListener('click', (): void => {
		const prevMatch: Match | null = index >= 0 && index < matches.length ? matches[index] : null;
		caseSensitive = !caseSensitive;
		caseBtn.classList.toggle('fjf-active-view', caseSensitive);
		caseBtn.setAttribute('aria-pressed', String(caseSensitive));
		options.onCaseChange?.(caseSensitive);
		run(prevMatch);
	});

	return {
		el: wrap,
		setEnabled(on: boolean): void {
			wrap.style.display = on ? '' : 'none';
			if (!on) {
				clear();
				setNavVisible(false);
				count.textContent = '';
			}
		}
	};
}
