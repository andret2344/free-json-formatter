import {describe, expect, it} from 'vitest';
import type {JsonObject, JsonPath, JsonValue} from '../../src/shared/types.js';
import {type CollectionNode, createExpansionController, renderJson, type Tree} from '../../src/viewer/formatter.js';

function entry(tree: Tree, path: JsonPath): HTMLElement | null {
	return tree.elementAt(path);
}

function toggleOf(element: HTMLElement): HTMLButtonElement | null {
	return element.querySelector<HTMLButtonElement>(':scope > .fjf-line > button.fjf-toggle');
}

function directChildren(element: HTMLElement): HTMLElement[] {
	const box: HTMLElement | null = element.querySelector<HTMLElement>(':scope > .fjf-children');
	return box === null ? [] : [...box.querySelectorAll<HTMLElement>(':scope > .fjf-entry')];
}

function isOpen(element: HTMLElement): boolean {
	return element.classList.contains('fjf-open');
}

/** {l1: {l2: {l3: {l4: {l5: {leaf: 1}}}}}} - one collection per level. */
function chain(levels: number): JsonValue {
	let value: JsonValue = {leaf: 1};
	for (let level: number = levels; level >= 1; level--) {
		const wrapper: JsonObject = {};
		wrapper[`l${level}`] = value;
		value = wrapper;
	}
	return value;
}

/** Path to the collection at the given level of `chain()`: 1 -> ['l1'], 2 -> ['l1','l2'], ... */
function chainPath(level: number): JsonPath {
	const path: (string | number)[] = [];
	for (let index = 1; index <= level; index++) {
		path.push(`l${index}`);
	}
	return path;
}

/** An object with `size` collection children: {k0: {v: 0}, k1: {v: 1}, ...} */
function wideObject(size: number): JsonObject {
	const object: JsonObject = {};
	for (let index = 0; index < size; index++) {
		object[`k${index}`] = {v: index};
	}
	return object;
}

function openCount(tree: Tree): number {
	let open = 0;
	for (const node of tree.collections()) {
		if (node.isOpen()) {
			open++;
		}
	}
	return open;
}

describe('renderJson', () => {
	it('renders a primitive root', () => {
		const tree = renderJson(42);
		expect(tree.el.querySelector('.fjf-number')?.textContent).toBe('42');
		expect(tree.el.querySelector('[data-expand="1"]')).toBeNull();
		expect(tree.root).toBeNull();
	});

	it('renders object keys and values with syntax classes', () => {
		const tree = renderJson({name: 'x', n: 1, ok: true, empty: null});
		const keys = [...tree.el.querySelectorAll('.fjf-key')].map((key) => key.textContent);
		expect(keys).toContain('"name"');
		expect(tree.el.querySelector('.fjf-string')?.textContent).toBe('"x"');
		expect(tree.el.querySelector('.fjf-number')?.textContent).toBe('1');
		expect(tree.el.querySelector('.fjf-boolean')?.textContent).toBe('true');
		expect(tree.el.querySelector('.fjf-null')?.textContent).toBe('null');
	});

	it('turns URL strings into safe links', () => {
		const tree = renderJson({site: 'https://example.com/x'});
		const link = tree.el.querySelector('a.fjf-link') as HTMLAnchorElement;
		expect(link).not.toBeNull();
		expect(link.href).toBe('https://example.com/x');
		expect(link.target).toBe('_blank');
		expect(link.rel).toBe('noopener noreferrer');
	});

	it('does not give empty objects and arrays an active toggle button', () => {
		const tree = renderJson({arr: [], obj: {}}, 5);
		const emptyArray = entry(tree, ['arr']) as HTMLElement;
		const emptyObject = entry(tree, ['obj']) as HTMLElement;

		expect(toggleOf(emptyArray)).toBeNull();
		expect(toggleOf(emptyObject)).toBeNull();
		expect(emptyArray.dataset.expand).toBeUndefined();
		expect(emptyObject.dataset.expand).toBeUndefined();
		// Only the root is expandable.
		expect(tree.collections()).toHaveLength(1);
	});
});

describe('line numbers', () => {
	function lineNumbersOf(element: HTMLElement): string[] {
		function lineNumber(line: Element): string {
			return (line as HTMLElement).dataset.line ?? '';
		}

		return [...element.querySelectorAll('.fjf-line')].map(lineNumber);
	}

	it('numbers the lines by their position in the fully expanded document', () => {
		// 1 {  2 "a": [  3 1  4 2  5 ]  6 "b": {  7 "c": 3  8 }  9 }
		const tree = renderJson({a: [1, 2], b: {c: 3}}, 5);

		expect(lineNumbersOf(tree.el)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
	});

	it('keeps a number stable when a preceding branch is collapsed, leaving a gap', () => {
		const tree = renderJson({a: [1, 2], b: {c: 3}}, 5);
		const collapsed = entry(tree, ['a']) as HTMLElement;

		collapsed.querySelector<HTMLButtonElement>(':scope > .fjf-line > button.fjf-toggle')?.click();

		// "a" now renders as one line, but "b" keeps line 6 - the gap is the folded branch.
		const visible = [...tree.el.querySelectorAll('.fjf-entry:not(.fjf-collapsed) > .fjf-line')];
		expect(lineNumbersOf(entry(tree, ['b']) as HTMLElement)).toEqual(['6', '7', '8']);
		expect(visible.length).toBeGreaterThan(0);
	});

	it('sizes the gutter to the widest line number', () => {
		const tree = renderJson({a: 1}, 1);

		expect(tree.el.style.getPropertyValue('--fjf-gutter')).toBe('2ch'); // 3 lines -> 1 digit + 1
	});
});

describe('lazy rendering', () => {
	it('does not create the children of a collapsed collection', () => {
		const tree = renderJson({a: {b: {c: 1}}, d: [{e: 2}]}, 1);

		expect(isOpen(entry(tree, []) as HTMLElement)).toBe(true);
		expect(isOpen(entry(tree, ['a']) as HTMLElement)).toBe(false);
		expect(entry(tree, ['a', 'b'])).toBeNull();
		expect(entry(tree, ['d', 0])).toBeNull();
	});

	it('creates the direct children when a node is expanded, and nothing deeper', () => {
		const tree = renderJson({a: {b: {c: 1}}}, 1);
		const nodeA = entry(tree, ['a']) as HTMLElement;

		(toggleOf(nodeA) as HTMLButtonElement).click();

		expect(entry(tree, ['a', 'b'])).not.toBeNull();
		expect(entry(tree, ['a', 'b', 'c'])).toBeNull(); // 'b' is still collapsed
	});

	it('does not duplicate children when a node is collapsed and expanded again', () => {
		const tree = renderJson({a: {b: 1, c: 2}}, 2);
		const nodeA = entry(tree, ['a']) as HTMLElement;
		const toggle = toggleOf(nodeA) as HTMLButtonElement;

		expect(directChildren(nodeA)).toHaveLength(2);
		toggle.click();
		toggle.click();
		expect(directChildren(nodeA)).toHaveLength(2);
	});

	it('expanding one branch does not render the sibling branch', () => {
		const tree = renderJson({a: {b: 1}, d: {e: 2}}, 1);

		(toggleOf(entry(tree, ['a']) as HTMLElement) as HTMLButtonElement).click();

		expect(entry(tree, ['a', 'b'])).not.toBeNull();
		expect(entry(tree, ['d', 'e'])).toBeNull();
	});
});

describe('toggle accessibility', () => {
	it('exposes a real button whose aria-expanded tracks the state', () => {
		const tree = renderJson({a: {b: 1}}, 1);
		const root = entry(tree, []) as HTMLElement;
		const toggle = toggleOf(root) as HTMLButtonElement;

		expect(toggle.tagName).toBe('BUTTON');
		expect(toggle.type).toBe('button');
		expect(toggle.getAttribute('aria-expanded')).toBe('true');

		toggle.click();
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(isOpen(root)).toBe(false);

		toggle.click();
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
	});

	it('labels the button with the property name or the array index', () => {
		const tree = renderJson({items: [{x: 1}]}, 3);

		expect(toggleOf(entry(tree, []) as HTMLElement)?.getAttribute('aria-label')).toBe('Toggle root');
		expect(toggleOf(entry(tree, ['items']) as HTMLElement)?.getAttribute('aria-label')).toBe('Toggle items');
		expect(toggleOf(entry(tree, ['items', 0]) as HTMLElement)?.getAttribute('aria-label')).toBe('Toggle item 0');
	});

	it('activating the button (Enter/Space fire a click) toggles exactly once', () => {
		const tree = renderJson({a: {b: 1}}, 1);
		const root = entry(tree, []) as HTMLElement;
		const toggle = toggleOf(root) as HTMLButtonElement;

		// Enter/Space on a native button dispatch a click; it must not also fire the row shortcut.
		toggle.click();
		expect(isOpen(root)).toBe(false);
	});

	it('clicking a link inside a value does not toggle the node', () => {
		const tree = renderJson({site: 'https://example.com/x'}, 1);
		const root = entry(tree, []) as HTMLElement;
		const link = tree.el.querySelector('a.fjf-link') as HTMLAnchorElement;

		link.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
		expect(isOpen(root)).toBe(true);
	});
});

describe('initial expansion depth', () => {
	it('depth 1 opens only the root', () => {
		const tree = renderJson(chain(5), 1);

		expect(isOpen(entry(tree, []) as HTMLElement)).toBe(true);
		expect(isOpen(entry(tree, chainPath(1)) as HTMLElement)).toBe(false);
		expect(entry(tree, chainPath(2))).toBeNull();
	});

	it('depth 2 opens the root and its direct collections', () => {
		const tree = renderJson(chain(5), 2);

		expect(isOpen(entry(tree, chainPath(1)) as HTMLElement)).toBe(true);
		expect(isOpen(entry(tree, chainPath(2)) as HTMLElement)).toBe(false);
		expect(entry(tree, chainPath(3))).toBeNull();
	});

	it.each([3, 4, 5])('depth %i opens exactly that many levels', (depth: number) => {
		const tree = renderJson(chain(6), depth);

		for (let level = 1; level < depth; level++) {
			expect(isOpen(entry(tree, chainPath(level)) as HTMLElement)).toBe(true);
		}
		// The collection sitting on the boundary stays collapsed, and its children do not exist.
		expect(isOpen(entry(tree, chainPath(depth)) as HTMLElement)).toBe(false);
		expect(entry(tree, chainPath(depth + 1))).toBeNull();
	});
});

describe('createExpansionController', () => {
	it('expandAll eventually opens the whole document without duplicating nodes', async () => {
		const tree = renderJson(chain(6), 1);
		const expansion = createExpansionController(tree);

		await expansion.expandAll();

		expect(expansion.running).toBe(false);
		for (const node of tree.collections()) {
			expect(node.isOpen()).toBe(true);
		}
		expect(entry(tree, chainPath(6))).not.toBeNull();
		expect(directChildren(entry(tree, chainPath(1)) as HTMLElement)).toHaveLength(1);
	});

	it('expands in batches instead of blocking on one synchronous pass', async () => {
		const tree = renderJson(wideObject(300), 1);
		const expansion = createExpansionController(tree);

		const done: Promise<void> = expansion.expandAll();
		// Control is back before the tree is finished: the first batch ran, the rest is queued.
		const openedInFirstBatch: number = openCount(tree);
		expect(expansion.running).toBe(true);
		expect(openedInFirstBatch).toBeLessThan(tree.collections().length);

		await done;
		expect(openCount(tree)).toBe(tree.collections().length);
		expect(expansion.running).toBe(false);
	});

	it('cancel stops the run and creates no further nodes', async () => {
		const tree = renderJson(wideObject(300), 1);
		const expansion = createExpansionController(tree);

		const done: Promise<void> = expansion.expandAll();
		const openedInFirstBatch: number = openCount(tree);
		expansion.cancel();
		await done;

		expect(expansion.running).toBe(false);
		expect(openCount(tree)).toBe(openedInFirstBatch);
		expect(openCount(tree)).toBeLessThan(tree.collections().length);
	});

	it('collapseAll cancels the expansion, collapses everything, and creates no DOM', async () => {
		const tree = renderJson(wideObject(300), 1);
		const expansion = createExpansionController(tree);

		const done: Promise<void> = expansion.expandAll();
		const before: number = tree.collections().length;
		expansion.collapseAll();
		await done;

		expect(expansion.running).toBe(false);
		expect(tree.collections()).toHaveLength(before); // nothing new was rendered
		expect(openCount(tree)).toBe(0);
	});

	it('expandAll(maxDepth) opens down to that depth and builds no DOM below it', async () => {
		const tree = renderJson(chain(6), 1);
		const expansion = createExpansionController(tree);

		await expansion.expandAll(3); // root is depth 0, so l1 and l2 open, l3 stays closed

		expect(isOpen(entry(tree, chainPath(1)) as HTMLElement)).toBe(true);
		expect(isOpen(entry(tree, chainPath(2)) as HTMLElement)).toBe(true);
		expect(isOpen(entry(tree, chainPath(3)) as HTMLElement)).toBe(false);
		expect(entry(tree, chainPath(4))).toBeNull(); // never rendered: its parent was never opened
	});

	it('reports progress while it runs, ending on the number of collections it opened', async () => {
		const tree = renderJson(wideObject(300), 1);
		const opened: number[] = [];

		function onProgress(count: number): void {
			opened.push(count);
		}

		const expansion = createExpansionController(tree, {onProgress});
		await expansion.expandAll();

		expect(opened[0]).toBe(0); // a run always starts by reporting an empty tree
		expect(opened.length).toBeGreaterThan(2); // reported per batch, not just at the end
		expect(opened).toEqual([...opened].sort((left: number, right: number): number => left - right));
		expect(opened[opened.length - 1]).toBe(tree.collections().length);
	});

	it('stops reporting progress once a run is cancelled', async () => {
		const tree = renderJson(wideObject(300), 1);
		const opened: number[] = [];

		function onProgress(count: number): void {
			opened.push(count);
		}

		const expansion = createExpansionController(tree, {onProgress});
		const done: Promise<void> = expansion.expandAll();
		expansion.cancel();
		await done;
		const afterCancel: number = opened.length;
		await new Promise((resolve: (value: unknown) => void): void => {
			setTimeout(resolve, 20);
		});

		expect(opened.length).toBe(afterCancel);
		expect(opened[opened.length - 1]).toBeLessThan(tree.collections().length);
	});

	it('keeps already-built children when collapsing', async () => {
		const tree = renderJson({a: {b: 1}}, 1);
		const expansion = createExpansionController(tree);
		await expansion.expandAll();

		expansion.collapseAll();

		const nodeA = entry(tree, ['a']) as HTMLElement;
		expect(isOpen(nodeA)).toBe(false);
		expect(directChildren(nodeA)).toHaveLength(1); // built once, kept in the DOM
	});

	it('restarting expandAll retires the previous run instead of running both', async () => {
		const tree = renderJson(wideObject(300), 1);
		const expansion = createExpansionController(tree);

		const first: Promise<void> = expansion.expandAll();
		const second: Promise<void> = expansion.expandAll();
		await Promise.all([first, second]);

		expect(expansion.running).toBe(false);
		expect(openCount(tree)).toBe(tree.collections().length);
		const nodes: readonly CollectionNode[] = tree.collections();
		expect(directChildren(nodes[1].element)).toHaveLength(1); // no duplicated children
	});
});
