import {createElement} from './dom.js';
import {isExpandable, type JsonObject, type JsonPrimitive, type JsonValue, looksLikeUrl} from './types.js';

type EntryKey = string | number | null;
type BracketPair = [open: string, close: string];
/** Value types that can be expanded into child entries. */
type JsonCollection = JsonValue[] | JsonObject;

/** A single expandable/primitive entry in the tree. */
interface Entry {
	readonly key: EntryKey;
	readonly value: JsonValue;
	readonly isLast: boolean;
}

function entriesOf(value: JsonCollection): Entry[] {
	if (Array.isArray(value)) {
		const lastIndex: number = value.length - 1;
		return value.map(
			(item: JsonValue, index: number): Entry => ({key: index, value: item, isLast: index === lastIndex})
		);
	}
	const object: JsonObject = value;
	const keys: string[] = Object.keys(object);
	const lastIndex: number = keys.length - 1;
	return keys.map((key: string, index: number): Entry => ({key, value: object[key], isLast: index === lastIndex}));
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

function keySpan(key: EntryKey): HTMLSpanElement | null {
	if (key === null || typeof key === 'number') {
		return null; // root or array index: no key label
	}
	return createElement('span', 'fjf-key', JSON.stringify(key));
}

function brackets(value: JsonCollection): BracketPair {
	return Array.isArray(value) ? ['[', ']'] : ['{', '}'];
}

function childCount(value: JsonCollection): number {
	return Array.isArray(value) ? value.length : Object.keys(value).length;
}

function spacer(): HTMLSpanElement {
	return createElement('span', 'fjf-toggle fjf-toggle-empty');
}

/** Render one entry. Children of expandable entries are built lazily on first expand. */
function renderEntry(entry: Entry): HTMLDivElement {
	const node: HTMLDivElement = createElement('div', 'fjf-entry');
	const line: HTMLDivElement = createElement('div', 'fjf-line');
	node.append(line);

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
	const expandable: boolean = count > 0;

	const toggle: HTMLSpanElement = createElement('span', `fjf-toggle${expandable ? '' : ' fjf-toggle-empty'}`);
	toggle.textContent = expandable ? '▾' : '';
	line.append(toggle);

	if (keyEl !== null) {
		line.append(keyEl);
		line.append(createElement('span', 'fjf-colon', ': '));
	}
	line.append(createElement('span', 'fjf-punct', open));

	if (!expandable) {
		line.append(createElement('span', 'fjf-punct', close));
		if (comma !== '') {
			line.append(createElement('span', 'fjf-punct', comma));
		}
		return node;
	}

	const preview: HTMLSpanElement = createElement(
		'span',
		'fjf-preview',
		` ${count} ${count === 1 ? 'item' : 'items'} `
	);
	const closeInline: HTMLSpanElement = createElement('span', 'fjf-punct', close);

	const closeLine: HTMLDivElement = createElement('div', 'fjf-line fjf-close');
	closeLine.append(spacer());
	closeLine.append(createElement('span', 'fjf-punct', close));
	if (comma !== '') {
		closeLine.append(createElement('span', 'fjf-punct', comma));
	}

	const childrenBox: HTMLDivElement = createElement('div', 'fjf-children');
	let built = false;

	function build(): void {
		if (built) {
			return;
		}
		built = true;
		for (const child of entriesOf(collection)) {
			childrenBox.append(renderEntry(child));
		}
	}

	function setOpen(openState: boolean): void {
		node.classList.toggle('fjf-open', openState);
		node.classList.toggle('fjf-collapsed', !openState);
		toggle.textContent = openState ? '▾' : '▸';
		if (openState) {
			build();
		}
	}

	line.append(preview);
	line.append(closeInline);
	if (comma !== '') {
		line.append(createElement('span', 'fjf-punct fjf-inline-comma', comma));
	}
	node.append(childrenBox);
	node.append(closeLine);
	node.dataset.expand = '1';
	setOpen(true);

	// A single listener on the whole header line: clicking the toggle bubbles here too,
	// so a separate toggle listener would fire twice and cancel itself out.
	line.addEventListener('click', (event: MouseEvent): void => {
		const target: EventTarget | null = event.target;
		if (target instanceof Element && target.closest('a') !== null) {
			return;
		}
		event.preventDefault();
		setOpen(!node.classList.contains('fjf-open'));
	});

	return node;
}

export function renderJson(root: JsonValue): HTMLDivElement {
	const container: HTMLDivElement = createElement('div', 'fjf-tree');
	container.append(renderEntry({key: null, value: root, isLast: true}));
	return container;
}

export function setAllExpanded(tree: HTMLElement, open: boolean): void {
	// Children render lazily, so expanding may reveal new collapsed nodes.
	// Repeat until the tree stops changing (capped to avoid runaway on huge docs).
	for (let pass = 0; pass < 10_000; pass++) {
		let changed = false;
		const nodes: NodeListOf<HTMLElement> = tree.querySelectorAll<HTMLElement>('.fjf-entry[data-expand="1"]');
		for (const node of nodes) {
			const toggle: HTMLElement | null = node.querySelector<HTMLElement>(':scope > .fjf-line > .fjf-toggle');
			const isOpen: boolean = node.classList.contains('fjf-open');
			if (isOpen !== open && toggle !== null) {
				toggle.click();
				changed = true;
			}
		}
		if (!changed) {
			break;
		}
	}
}
