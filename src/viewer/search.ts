import {entriesOf, isExpandable, type JsonPath, type JsonValue} from '../shared/types.js';
import {button, createElement} from './dom.js';
import {pathKey, type Tree} from './formatter.js';

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

/** Which half of an entry line a hit sits in: the object key, or the primitive value. */
type MatchField = 'key' | 'value';

interface Match {
	readonly path: JsonPath;
	readonly field: MatchField;
	/** Offset inside the rendered text of that key/value (quotes included, as displayed). */
	readonly start: number;
	readonly length: number;
}

const HIGHLIGHT: string = 'fjf-hl';
const CURRENT: string = 'fjf-hl-current';
const DEBOUNCE_MS: number = 120;

const VALUE_SELECTOR: string = [
	':scope > .fjf-line > .fjf-string',
	':scope > .fjf-line > .fjf-number',
	':scope > .fjf-line > .fjf-boolean',
	':scope > .fjf-line > .fjf-null'
].join(', ');

// CSS Custom Highlight API paints ranges with zero DOM mutation - no <mark> wrapping, no reflow,
// O(1) clearing. Fall back to wrapping <mark> elements only where it is unavailable (e.g. jsdom).
const supportsHighlight: boolean =
	typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

/** The text the renderer shows for a primitive value - what the user actually sees and searches. */
function renderedValueText(value: JsonValue): string | null {
	if (typeof value === 'string') {
		return JSON.stringify(value);
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (value === null) {
		return 'null';
	}
	return null; // collections show brackets and a preview, not a searchable value
}

interface StackItem {
	readonly value: JsonValue;
	readonly path: JsonPath;
	/** The object key this value is stored under, if any (array indices are not rendered). */
	readonly key: string | null;
}

/** Collect hits from the parsed JSON, not from the DOM: unrendered branches match too. */
function collectMatches(root: JsonValue, query: string, caseSensitive: boolean): Match[] {
	const found: Match[] = [];
	const needle: string = caseSensitive ? query : query.toLowerCase();
	const stack: StackItem[] = [{value: root, path: [], key: null}];

	function pushHits(haystack: string, path: JsonPath, field: MatchField): void {
		const hay: string = caseSensitive ? haystack : haystack.toLowerCase();
		let from: number = hay.indexOf(needle);
		while (from !== -1) {
			found.push({path, field, start: from, length: query.length});
			from = hay.indexOf(needle, from + query.length);
		}
	}

	while (stack.length > 0) {
		const item: StackItem = stack.pop() as StackItem;
		if (item.key !== null) {
			pushHits(JSON.stringify(item.key), item.path, 'key');
		}
		if (!isExpandable(item.value)) {
			const text: string | null = renderedValueText(item.value);
			if (text !== null) {
				pushHits(text, item.path, 'value');
			}
			continue;
		}
		// Push in reverse so the stack pops children in document order - match order follows the tree.
		const children = entriesOf(item.value);
		for (let index: number = children.length - 1; index >= 0; index--) {
			const child = children[index];
			const childKey: string | number = child.key as string | number;
			stack.push({
				value: child.value,
				path: [...item.path, childKey],
				key: typeof childKey === 'string' ? childKey : null
			});
		}
	}
	return found;
}

/** Map an offset inside an element's rendered text onto a Range, crossing its text nodes. */
function rangeAt(container: HTMLElement, start: number, length: number): Range | null {
	const walker: TreeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
	const range: Range = document.createRange();
	const end: number = start + length;
	let consumed = 0;
	let startSet = false;
	let node: Node | null = walker.nextNode();

	while (node !== null) {
		const text: string = node.nodeValue ?? '';
		const nodeEnd: number = consumed + text.length;
		if (!startSet && start >= consumed && start <= nodeEnd) {
			range.setStart(node, start - consumed);
			startSet = true;
		}
		if (startSet && end <= nodeEnd) {
			range.setEnd(node, end - consumed);
			return range;
		}
		consumed = nodeEnd;
		node = walker.nextNode();
	}
	return null;
}

function matchKey(match: Match): string {
	return `${pathKey(match.path)}|${match.field}|${match.start}`;
}

/** Builds the search box and wires model-driven, branch-local highlighting over the tree. */
export function createSearch(tree: Tree, root: JsonValue, options: SearchOptions = {}): Search {
	const wrap: HTMLDivElement = createElement('div', 'fjf-search');

	// Navigation group sits to the LEFT of the input and is hidden until there is a query,
	// so an empty search box shows just the field (the bare arrows looked like an error).
	const nav: HTMLDivElement = createElement('div', 'fjf-search-nav-group');
	nav.hidden = true;

	const prev: HTMLButtonElement = button('‹', 'Previous match', 'fjf-btn fjf-search-nav');
	const count: HTMLSpanElement = createElement('span', 'fjf-search-count');
	const next: HTMLButtonElement = button('›', 'Next match', 'fjf-btn fjf-search-nav');
	prev.setAttribute('aria-label', 'Previous match');
	next.setAttribute('aria-label', 'Next match');

	nav.append(prev, count, next);

	const input: HTMLInputElement = createElement('input', 'fjf-search-input');
	input.type = 'search';
	input.placeholder = 'Search…';
	input.id = 'fjf-search-input';

	// Case-sensitivity toggle: pressed = match case, released (default) = ignore case.
	const caseBtn: HTMLButtonElement = button('Cc', 'Match case', 'fjf-btn fjf-search-case');

	wrap.append(nav, input, caseBtn);

	let caseSensitive: boolean = options.caseSensitive === true;

	function syncCaseButton(): void {
		caseBtn.classList.toggle('fjf-active-view', caseSensitive);
		caseBtn.setAttribute('aria-pressed', String(caseSensitive));
		caseBtn.setAttribute(
			'aria-label',
			caseSensitive ? 'Disable case-sensitive search' : 'Enable case-sensitive search'
		);
	}

	syncCaseButton();

	const allHl: Highlight | null = supportsHighlight ? new Highlight() : null;
	const curHl: Highlight | null = supportsHighlight ? new Highlight() : null;
	if (allHl !== null && curHl !== null) {
		CSS.highlights.set(HIGHLIGHT, allHl);
		CSS.highlights.set(CURRENT, curHl);
	}

	// Fallback path state: the <mark> elements currently wrapped into the tree.
	let marks: HTMLElement[] = [];
	let matches: Match[] = [];
	let index: number = -1;

	function clearHighlights(): void {
		if (allHl !== null && curHl !== null) {
			allHl.clear();
			curHl.clear();
		}
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
	}

	function targetSpan(match: Match): HTMLElement | null {
		const entry: HTMLElement | null = tree.elementAt(match.path);
		if (entry === null) {
			return null;
		}
		const selector: string = match.field === 'key' ? ':scope > .fjf-line > .fjf-key' : VALUE_SELECTOR;
		return entry.querySelector<HTMLElement>(selector);
	}

	/** Repaint highlights for every match that is currently rendered. Renders nothing itself. */
	function paint(): void {
		clearHighlights();
		if (allHl !== null && curHl !== null) {
			for (let position: number = 0; position < matches.length; position++) {
				const span: HTMLElement | null = targetSpan(matches[position]);
				if (span === null) {
					continue;
				}
				const range: Range | null = rangeAt(span, matches[position].start, matches[position].length);
				if (range === null) {
					continue;
				}
				allHl.add(range);
				if (position === index) {
					curHl.add(range);
				}
			}
			return;
		}
		// Fallback: wrap from last match to first so earlier offsets stay valid while the DOM changes.
		for (let position: number = matches.length - 1; position >= 0; position--) {
			const span: HTMLElement | null = targetSpan(matches[position]);
			if (span === null) {
				continue;
			}
			const range: Range | null = rangeAt(span, matches[position].start, matches[position].length);
			if (range === null) {
				continue;
			}
			const mark: HTMLElement = document.createElement('mark');
			mark.className = position === index ? `${HIGHLIGHT} ${CURRENT}` : HIGHLIGHT;
			try {
				range.surroundContents(mark);
				marks.unshift(mark);
			} catch {
				/* the hit straddles element boundaries (e.g. a linked URL) - leave it unmarked */
			}
		}
	}

	function scrollTo(element: HTMLElement): void {
		if (typeof element.scrollIntoView === 'function') {
			element.scrollIntoView({block: 'center', behavior: 'smooth'});
		}
	}

	/** Focus a match: open only the branch leading to it, then repaint. Other branches are untouched. */
	function focus(position: number): void {
		if (matches.length === 0) {
			return;
		}
		const wrapped: number = position % matches.length;
		index = (wrapped + matches.length) % matches.length;

		const entry: HTMLElement | null = tree.reveal(matches[index].path);
		paint();
		count.textContent = `${index + 1} / ${matches.length}`;
		if (entry !== null) {
			scrollTo(entry);
		}
	}

	function indexOfMatch(list: Match[], target: Match | null): number {
		if (target === null) {
			return -1;
		}
		const wanted: string = matchKey(target);

		function sameAsTarget(candidate: Match): boolean {
			return matchKey(candidate) === wanted;
		}

		return list.findIndex(sameAsTarget);
	}

	function run(keepMatch: Match | null = null): void {
		clearHighlights();
		matches = [];
		index = -1;

		const query: string = input.value;
		if (query.length < 1) {
			nav.hidden = true;
			count.textContent = '';
			return;
		}

		nav.hidden = false;
		matches = collectMatches(root, query, caseSensitive);

		if (matches.length === 0) {
			count.textContent = '0 / 0';
			return;
		}

		// Keep the previously focused match selected (e.g. after toggling case), otherwise start at 0.
		focus(Math.max(indexOfMatch(matches, keepMatch), 0));
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
			if (matches.length === 0) {
				run();
			} else {
				focus(index + (event.shiftKey ? -1 : 1));
			}
		}
	});
	next.addEventListener('click', (): void => focus(index + 1));
	prev.addEventListener('click', (): void => focus(index - 1));
	caseBtn.addEventListener('click', (): void => {
		const previous: Match | null = index >= 0 && index < matches.length ? matches[index] : null;
		caseSensitive = !caseSensitive;
		syncCaseButton();
		options.onCaseChange?.(caseSensitive);
		run(previous);
	});

	function setEnabled(on: boolean): void {
		wrap.style.display = on ? '' : 'none';
		if (!on) {
			clearHighlights();
			matches = [];
			index = -1;
			nav.hidden = true;
			count.textContent = '';
		}
	}

	return {el: wrap, setEnabled};
}
