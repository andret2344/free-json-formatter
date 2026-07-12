import {
	childCount,
	entriesOf,
	isExpandable,
	type JsonCollection,
	type JsonEntry,
	type JsonPath,
	type JsonPrimitive,
	type JsonValue,
	looksLikeUrl
} from '../shared/types.js';
import {createElement} from './dom.js';

type BracketPair = [open: string, close: string];

/** How many nodes `expandAll` opens before yielding the main thread back to the browser. */
const EXPAND_BATCH_SIZE = 200;

/**
 * Stable, unambiguous id for a JSON path. JSON encoding keeps the object key "0" (`["0"]`)
 * distinct from the array index 0 (`[0]`), and survives dots, slashes, quotes and Unicode.
 */
export function pathKey(path: JsonPath): string {
	return JSON.stringify(path);
}

/** A rendered collection (object/array) with at least one child. */
export interface CollectionNode {
	readonly element: HTMLDivElement;
	readonly path: JsonPath;
	readonly value: JsonCollection;
	readonly isOpen: () => boolean;
	readonly setOpen: (open: boolean) => void;
	/** Child collections. Empty until this node is opened for the first time - children render lazily. */
	readonly children: () => readonly CollectionNode[];
}

export interface Tree {
	readonly el: HTMLDivElement;
	/** The root collection, or null when the document's root value is a primitive. */
	readonly root: CollectionNode | null;
	/** Every collection rendered so far, in creation order. Collapsed branches are simply absent. */
	readonly collections: () => readonly CollectionNode[];
	/** Open every ancestor of `path` (rendering what is missing) and return the entry element at it. */
	readonly reveal: (path: JsonPath) => HTMLElement | null;
	/** The entry element at `path` if it is already rendered. Never builds anything. */
	readonly elementAt: (path: JsonPath) => HTMLElement | null;
}

function primitiveSpan(value: JsonPrimitive): HTMLSpanElement {
	if (typeof value === 'string') {
		if (looksLikeUrl(value)) {
			const wrap: HTMLSpanElement = createElement('span', 'fjf-string');
			wrap.append(document.createTextNode('"'));
			const link: HTMLAnchorElement = createElement('a', 'fjf-link', value);
			link.href = value.startsWith('//') ? `https:${value}` : value;
			link.target = '_blank';
			link.rel = 'noopener noreferrer';
			wrap.append(link);
			wrap.append(document.createTextNode('"'));
			return wrap;
		}
		return createElement('span', 'fjf-string', JSON.stringify(value));
	}
	if (typeof value === 'number') {
		return createElement('span', 'fjf-number', String(value));
	}
	if (typeof value === 'boolean') {
		return createElement('span', 'fjf-boolean', String(value));
	}
	return createElement('span', 'fjf-null', 'null');
}

function keySpan(key: JsonEntry['key']): HTMLSpanElement | null {
	if (key === null || typeof key === 'number') {
		return null; // root or array index: no key label
	}
	return createElement('span', 'fjf-key', JSON.stringify(key));
}

function brackets(value: JsonCollection): BracketPair {
	return Array.isArray(value) ? ['[', ']'] : ['{', '}'];
}

function spacer(): HTMLSpanElement {
	return createElement('span', 'fjf-toggle fjf-toggle-empty');
}

function toggleLabel(key: JsonEntry['key']): string {
	if (key === null) {
		return 'Toggle root';
	}
	return typeof key === 'number' ? `Toggle item ${key}` : `Toggle ${key}`;
}

/** Memoized per collection: the same subtree is measured once, however many ancestors ask for it. */
const lineCounts = new WeakMap<JsonCollection, number>();

/**
 * Lines this value would occupy in a fully expanded document: a primitive or empty collection is one
 * line, a collection is its header line + its children + its closing line. Line numbers come from this
 * and never change, so a collapsed branch leaves a gap in the numbering, the way code folding does.
 * The alternative - a CSS counter - would renumber the visible lines, but a counter on an out-of-flow
 * pseudo makes the browser rebuild the whole counter tree on every layout of the document.
 */
function lineCount(value: JsonValue): number {
	if (!isExpandable(value) || childCount(value) === 0) {
		return 1;
	}
	const cached: number | undefined = lineCounts.get(value);
	if (cached !== undefined) {
		return cached;
	}
	let total = 2; // opening line + closing line
	for (const child of entriesOf(value)) {
		total += lineCount(child.value);
	}
	lineCounts.set(value, total);
	return total;
}

/**
 * Render the tree. Every collection is lazy: its children are created the first time it is opened,
 * and never rebuilt afterwards. `initialDepth` only decides which collections start open - the root
 * sits at depth 0, so a collection is initially open when its depth is below `initialDepth`.
 */
export function renderJson(root: JsonValue, initialDepth: number = 1): Tree {
	const container: HTMLDivElement = createElement('div', 'fjf-tree');
	const entryElements = new Map<string, HTMLElement>();
	const collectionsByPath = new Map<string, CollectionNode>();
	const allCollections: CollectionNode[] = [];

	function renderEntry(entry: JsonEntry, depth: number, path: JsonPath, lineNumber: number): HTMLDivElement {
		const node: HTMLDivElement = createElement('div', 'fjf-entry');
		// The gutter number sits in the line's flow (so it can be sticky) and has to undo the nesting
		// indent to land in a straight column - which takes the depth. Both lines of the entry inherit it.
		node.style.setProperty('--fjf-depth', String(depth));
		const line: HTMLDivElement = createElement('div', 'fjf-line');
		line.dataset.line = String(lineNumber);
		node.append(line);
		entryElements.set(pathKey(path), node);

		const keyEl: HTMLSpanElement | null = keySpan(entry.key);
		const comma: string = entry.isLast ? '' : ',';

		if (!isExpandable(entry.value)) {
			line.append(spacer());
			if (keyEl !== null) {
				line.append(keyEl);
				line.append(createElement('span', 'fjf-colon', ': '));
			}
			line.append(primitiveSpan(entry.value));
			if (comma !== '') {
				line.append(createElement('span', 'fjf-punct', comma));
			}
			return node;
		}

		const collection: JsonCollection = entry.value;
		const [open, close]: BracketPair = brackets(collection);
		const count: number = childCount(collection);

		// Empty collections have nothing to expand: a plain spacer, no button, no toggle state.
		if (count === 0) {
			line.append(spacer());
			if (keyEl !== null) {
				line.append(keyEl);
				line.append(createElement('span', 'fjf-colon', ': '));
			}
			line.append(createElement('span', 'fjf-punct', open));
			line.append(createElement('span', 'fjf-punct', close));
			if (comma !== '') {
				line.append(createElement('span', 'fjf-punct', comma));
			}
			return node;
		}

		const toggle: HTMLButtonElement = createElement('button', 'fjf-toggle');
		toggle.type = 'button';
		toggle.setAttribute('aria-label', toggleLabel(entry.key));
		line.append(toggle);

		if (keyEl !== null) {
			line.append(keyEl);
			line.append(createElement('span', 'fjf-colon', ': '));
		}
		line.append(createElement('span', 'fjf-punct', open));

		const preview: HTMLSpanElement = createElement(
			'span',
			'fjf-preview',
			` ${count} ${count === 1 ? 'item' : 'items'} `
		);
		const closeInline: HTMLSpanElement = createElement('span', 'fjf-punct', close);

		const closeLine: HTMLDivElement = createElement('div', 'fjf-line fjf-close');
		closeLine.dataset.line = String(lineNumber + lineCount(collection) - 1);
		closeLine.append(spacer());
		closeLine.append(createElement('span', 'fjf-punct', close));
		if (comma !== '') {
			closeLine.append(createElement('span', 'fjf-punct', comma));
		}

		const childrenBox: HTMLDivElement = createElement('div', 'fjf-children');
		const childCollections: CollectionNode[] = [];
		let built = false;

		function build(): void {
			if (built) {
				return; // children exist already - reopening must not duplicate them
			}
			built = true;
			let childLine: number = lineNumber + 1;
			for (const child of entriesOf(collection)) {
				const childPath: JsonPath = [...path, child.key as string | number];
				childrenBox.append(renderEntry(child, depth + 1, childPath, childLine));
				childLine += lineCount(child.value);
				const childNode: CollectionNode | undefined = collectionsByPath.get(pathKey(childPath));
				if (childNode !== undefined) {
					childCollections.push(childNode);
				}
			}
		}

		function isOpen(): boolean {
			return node.classList.contains('fjf-open');
		}

		function setOpen(openState: boolean): void {
			// Children are created only when the node actually becomes visible-expanded.
			if (openState) {
				build();
			}
			node.classList.toggle('fjf-open', openState);
			node.classList.toggle('fjf-collapsed', !openState);
			toggle.textContent = openState ? '▾' : '▸';
			toggle.setAttribute('aria-expanded', String(openState));
		}

		line.append(preview);
		line.append(closeInline);
		if (comma !== '') {
			line.append(createElement('span', 'fjf-punct fjf-inline-comma', comma));
		}
		node.append(childrenBox);
		node.append(closeLine);
		node.dataset.expand = '1';

		toggle.addEventListener('click', (event: MouseEvent): void => {
			// The line below us toggles too; without this the button's own click would flip it back.
			event.stopPropagation();
			setOpen(!isOpen());
		});

		// Clicking anywhere on the header line is a shortcut for the button - except on links.
		line.addEventListener('click', (event: MouseEvent): void => {
			const target: EventTarget | null = event.target;
			if (target instanceof Element && target.closest('a') !== null) {
				return;
			}
			event.preventDefault();
			setOpen(!isOpen());
		});

		const collectionNode: CollectionNode = {
			element: node,
			path,
			value: collection,
			isOpen,
			setOpen,
			children: (): readonly CollectionNode[] => childCollections
		};
		collectionsByPath.set(pathKey(path), collectionNode);
		allCollections.push(collectionNode);

		setOpen(depth < initialDepth);

		return node;
	}

	const rootPath: JsonPath = [];
	// The gutter has to fit the highest line number the document can reach - digits known up front.
	const totalLines: number = lineCount(root);
	container.style.setProperty('--fjf-gutter', `${String(totalLines).length + 1}ch`);
	container.append(renderEntry({key: null, value: root, isLast: true}, 0, rootPath, 1));

	function reveal(path: JsonPath): HTMLElement | null {
		for (let depth = 0; depth < path.length; depth++) {
			const ancestor: CollectionNode | undefined = collectionsByPath.get(pathKey(path.slice(0, depth)));
			if (ancestor === undefined) {
				return null;
			}
			ancestor.setOpen(true); // renders the missing children of exactly this branch
		}
		return entryElements.get(pathKey(path)) ?? null;
	}

	function elementAt(path: JsonPath): HTMLElement | null {
		return entryElements.get(pathKey(path)) ?? null;
	}

	return {
		el: container,
		root: collectionsByPath.get(pathKey(rootPath)) ?? null,
		collections: (): readonly CollectionNode[] => allCollections,
		reveal,
		elementAt
	};
}

export interface ExpansionController {
	/** Open every collection down to `maxDepth` (the root is depth 0); the whole document by default. */
	readonly expandAll: (maxDepth?: number) => Promise<void>;
	readonly collapseAll: () => void;
	readonly cancel: () => void;
	readonly running: boolean;
}

export interface ExpansionControllerOptions {
	/** Called whenever a run starts, finishes, or is cancelled - used to drive the toolbar state. */
	readonly onRunningChange?: (running: boolean) => void;
	/** Collections opened so far by the current run, reported once per batch - drives the progress bar. */
	readonly onProgress?: (opened: number) => void;
}

function yieldToBrowser(): Promise<void> {
	return new Promise<void>((resolve: () => void): void => {
		if (typeof requestAnimationFrame === 'function') {
			requestAnimationFrame((): void => resolve());
			return;
		}
		setTimeout(resolve, 0);
	});
}

/**
 * Global expand/collapse. Expansion walks a queue in batches, yielding between them, so a huge
 * document never blocks the tab; each run carries a generation so a newer run (or a cancel)
 * silently retires the older one instead of running alongside it.
 */
export function createExpansionController(tree: Tree, options: ExpansionControllerOptions = {}): ExpansionController {
	let generation = 0;
	let running = false;

	function setRunning(value: boolean): void {
		if (running === value) {
			return;
		}
		running = value;
		options.onRunningChange?.(value);
	}

	function cancel(): void {
		generation++;
		setRunning(false);
	}

	async function expandAll(maxDepth: number = Number.POSITIVE_INFINITY): Promise<void> {
		cancel(); // never run two expansions at once
		const runGeneration: number = ++generation;
		if (tree.root === null) {
			return;
		}
		setRunning(true);

		// Queue with a moving head instead of shift(): O(1) per node on documents with many children.
		const queue: CollectionNode[] = [tree.root];
		let head = 0;
		let sinceYield = 0;
		options.onProgress?.(0);

		while (head < queue.length) {
			if (generation !== runGeneration) {
				return; // cancelled, or superseded by a newer run that now owns `running`
			}
			const node: CollectionNode = queue[head];
			head++;
			// A node at the depth limit is left closed - and so its children are never built, which is the
			// whole point of a bounded run: the DOM below the limit does not exist.
			if (node.path.length < maxDepth) {
				node.setOpen(true); // builds this node's children if they do not exist yet
				for (const child of node.children()) {
					queue.push(child);
				}
			}
			sinceYield++;
			if (sinceYield >= EXPAND_BATCH_SIZE) {
				sinceYield = 0;
				options.onProgress?.(head); // once per batch: the report must not cost more than the work
				await yieldToBrowser();
			}
		}

		if (generation === runGeneration) {
			options.onProgress?.(head);
			setRunning(false);
		}
	}

	function collapseAll(): void {
		cancel();
		for (const node of tree.collections()) {
			node.setOpen(false); // collapse only: keeps already-built children, creates nothing
		}
	}

	return {
		expandAll,
		collapseAll,
		cancel,
		get running(): boolean {
			return running;
		}
	};
}
