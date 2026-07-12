import {Copy, type IconNode, Route} from 'lucide';
import {CONSOLE_HANDLE} from '../shared/bridge.js';
import {childCount, entriesOf, isExpandable, type JsonCollection, type JsonEntry, type JsonPath, type JsonPrimitive, type JsonValue, looksLikeUrl} from '../shared/types.js';
import {createElement, icon} from './dom.js';

type BracketPair = [open: string, close: string];

/** How many nodes `expandAll` opens before yielding the main thread back to the browser. */
const EXPAND_BATCH_SIZE = 200;

/** Keys a JavaScript property accessor can take unquoted; every other key has to go in brackets. */
const IDENTIFIER_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** How long a copy control shows its result before it goes back to its icon. */
const COPY_FEEDBACK_MS = 1200;
const COPY_OK_CLASS = 'fjf-copy-ok';
const COPY_FAIL_CLASS = 'fjf-copy-fail';

/** Fallback indentation for a copied value when no toolbar owns the tree (tests, embedding). */
const DEFAULT_COPY_INDENT = '  ';

/** Memoized per collection: the same subtree is measured once, however many ancestors ask for it. */
const lineCounts = new WeakMap<JsonCollection, number>();
/** Temporary glyph swap after a copy attempt, one pending timer per control. */
const copyTimers = new WeakMap<HTMLButtonElement, number>();

/**
 * Stable, unambiguous id for a JSON path. JSON encoding keeps the object key "0" (`["0"]`)
 * distinct from the array index 0 (`[0]`), and survives dots, slashes, quotes and Unicode.
 */
export function pathKey(path: JsonPath): string {
	return JSON.stringify(path);
}

/**
 * A path written as a JavaScript accessor chain rooted at the console handle (`json.items[0]["odd key"]`).
 * That is the point of the format: what the user copies pastes straight into the devtools console, where
 * the page-world script has already defined that handle (see console-handle.ts).
 */
export function formatPath(path: JsonPath): string {
	let text: string = CONSOLE_HANDLE;
	for (const step of path) {
		if (typeof step === 'number') {
			text += `[${step}]`;
		} else if (IDENTIFIER_KEY.test(step)) {
			text += `.${step}`;
		} else {
			text += `[${JSON.stringify(step)}]`;
		}
	}
	return text;
}

/** The result is a class, not a swapped glyph: the icon is an SVG child, and text would wipe it out. */
function flashResult(control: HTMLButtonElement, copied: boolean): void {
	const pending: number | undefined = copyTimers.get(control);
	if (pending !== undefined) {
		window.clearTimeout(pending);
	}
	control.classList.remove(COPY_OK_CLASS, COPY_FAIL_CLASS);
	control.classList.add(copied ? COPY_OK_CLASS : COPY_FAIL_CLASS);
	const timer: number = window.setTimeout((): void => {
		control.classList.remove(COPY_OK_CLASS, COPY_FAIL_CLASS);
		copyTimers.delete(control);
	}, COPY_FEEDBACK_MS);
	copyTimers.set(control, timer);
}

async function copyToClipboard(control: HTMLButtonElement, text: () => string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text());
		flashResult(control, true);
	} catch {
		/* the clipboard may be blocked (permission, unfocused document) - say so rather than lie */
		flashResult(control, false);
	}
}

/**
 * A per-line copy control, shown on hover/focus (see content.css). The text is produced on click, not up
 * front: serializing every value at render time would cost more than the whole tree.
 */
function copyButton(className: string, iconNode: IconNode, label: string, text: () => string): HTMLButtonElement {
	const control: HTMLButtonElement = createElement('button', `fjf-line-action ${className}`);
	control.type = 'button';
	control.title = label;
	control.setAttribute('aria-label', label);
	control.append(icon(iconNode));
	control.addEventListener('click', (event: MouseEvent): void => {
		// A collection's header line is itself a toggle - copying must not fold it.
		event.stopPropagation();
		void copyToClipboard(control, text);
	});
	return control;
}

function copyPathButton(path: JsonPath): HTMLButtonElement {
	const text: string = formatPath(path);
	return copyButton('fjf-copy-path', Route, `Copy path: ${text}`, (): string => text);
}

/**
 * Copies the entry's value as JSON: a primitive as its literal (`"buried-treasure"`, `42`, `null`), a
 * collection as its whole subtree, re-indented the way the toolbar's Indent selector is set. Always JSON,
 * whatever the line holds - one icon that sometimes yields JSON and sometimes bare text is a worse tool.
 */
function copyValueButton(value: JsonValue, indent: () => string): HTMLButtonElement {
	return copyButton('fjf-copy-value', Copy, 'Copy value', (): string => JSON.stringify(value, null, indent()));
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
 * The path of the entry that owns a line of the fully expanded document - `lineCount()` run backwards.
 * It reads the parsed JSON, never the DOM, which is the whole point: a deep link (#L21) has to resolve
 * to a branch that was never rendered, so the viewer knows what to open. A collection owns both its
 * opening line and its closing bracket line, so a link to a closing brace lands on the collection.
 */
export function pathAtLine(root: JsonValue, line: number): JsonPath | null {
	if (!Number.isInteger(line) || line < 1 || line > lineCount(root)) {
		return null;
	}
	const path: (string | number)[] = [];
	let value: JsonValue = root;
	let first = 1; // the line `value` opens on

	while (true) {
		const span: number = lineCount(value);
		// The header line, and the closing line of a collection, both belong to `value` itself.
		if (line === first || line === first + span - 1) {
			return path;
		}
		let childFirst: number = first + 1;
		let next: JsonEntry | null = null;
		for (const child of entriesOf(value as JsonCollection)) {
			const childSpan: number = lineCount(child.value);
			if (line < childFirst + childSpan) {
				next = child;
				break;
			}
			childFirst += childSpan;
		}
		if (next === null) {
			return null; // unreachable while `line` is inside `value`'s span, but never trust the arithmetic
		}
		path.push(next.key as string | number);
		value = next.value;
		first = childFirst;
	}
}

export interface RenderOptions {
	/**
	 * Indentation for a value copied off a line. A getter, not a string: the toolbar's Indent selector can
	 * change after the tree is built, and a copy has to use whatever is selected at the moment it is made.
	 */
	readonly indent?: () => string;
}

/**
 * Render the tree. Every collection is lazy: its children are created the first time it is opened,
 * and never rebuilt afterwards. `initialDepth` only decides which collections start open - the root
 * sits at depth 0, so a collection is initially open when its depth is below `initialDepth`.
 */
export function renderJson(root: JsonValue, initialDepth: number = 1, options: RenderOptions = {}): Tree {
	const container: HTMLDivElement = createElement('div', 'fjf-tree');
	const copyIndent: () => string = options.indent ?? ((): string => DEFAULT_COPY_INDENT);
	const entryElements = new Map<string, HTMLElement>();
	const collectionsByPath = new Map<string, CollectionNode>();
	const allCollections: CollectionNode[] = [];

	/**
	 * Apply a state to every collection on the clicked node's own level (Ctrl/Cmd+click). The parent is
	 * necessarily rendered - the click came from a child it built - so this only reaches nodes that exist;
	 * opening a level builds one generation of children, collapsing one builds nothing.
	 */
	function setSiblingsOpen(path: JsonPath, openState: boolean): void {
		if (path.length === 0) {
			return; // the root has no siblings
		}
		const parent: CollectionNode | undefined = collectionsByPath.get(pathKey(path.slice(0, -1)));
		if (parent === undefined) {
			return;
		}
		for (const sibling of parent.children()) {
			sibling.setOpen(openState);
		}
	}

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
				line.append(createElement('span', 'fjf-punctuation', comma));
			}
			line.append(copyPathButton(path), copyValueButton(entry.value, copyIndent));
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
			line.append(createElement('span', 'fjf-punctuation', open));
			line.append(createElement('span', 'fjf-punctuation', close));
			if (comma !== '') {
				line.append(createElement('span', 'fjf-punctuation', comma));
			}
			line.append(copyPathButton(path), copyValueButton(entry.value, copyIndent));
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
		line.append(createElement('span', 'fjf-punctuation', open));

		const preview: HTMLSpanElement = createElement('span', 'fjf-preview', ` ${count} ${count === 1 ? 'item' : 'items'} `);
		const closeInline: HTMLSpanElement = createElement('span', 'fjf-punctuation', close);

		const closeLine: HTMLDivElement = createElement('div', 'fjf-line fjf-close');
		closeLine.dataset.line = String(lineNumber + lineCount(collection) - 1);
		closeLine.append(spacer());
		closeLine.append(createElement('span', 'fjf-punctuation', close));
		if (comma !== '') {
			closeLine.append(createElement('span', 'fjf-punctuation', comma));
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
			line.append(createElement('span', 'fjf-punctuation fjf-inline-comma', comma));
		}
		line.append(copyPathButton(path), copyValueButton(collection, copyIndent));
		node.append(childrenBox);
		node.append(closeLine);
		node.dataset.expand = '1';

		/** Flip this node, and - with Ctrl/Cmd held - every collection sitting next to it, folding a level at once. */
		function toggleFrom(event: MouseEvent): void {
			const openState: boolean = !isOpen();
			setOpen(openState);
			if (event.ctrlKey || event.metaKey) {
				setSiblingsOpen(path, openState);
			}
		}

		toggle.addEventListener('click', (event: MouseEvent): void => {
			// The line below us toggles too; without this the button's own click would flip it back.
			event.stopPropagation();
			toggleFrom(event);
		});

		// Clicking anywhere on the header line is a shortcut for the button - except on links.
		line.addEventListener('click', (event: MouseEvent): void => {
			const target: EventTarget | null = event.target;
			if (target instanceof Element && target.closest('a') !== null) {
				return;
			}
			event.preventDefault();
			toggleFrom(event);
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
