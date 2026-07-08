/** Small DOM element factories shared across the formatter, toolbar, and search UI. */

/** Create an element with an optional class name and text content. */
export function createElement<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
	text?: string
): HTMLElementTagNameMap[K] {
	const node: HTMLElementTagNameMap[K] = document.createElement(tag);
	if (className !== undefined) {
		node.className = className;
	}
	if (text !== undefined) {
		node.textContent = text;
	}
	return node;
}

/** Create a toolbar-style push button. */
export function button(label: string, title: string, className: string = 'fjf-btn'): HTMLButtonElement {
	const element: HTMLButtonElement = createElement('button', className, label);
	element.title = title;
	element.type = 'button';
	return element;
}

/** Create a vertical separator between toolbar groups. */
export function separator(): HTMLSpanElement {
	return createElement('span', 'fjf-sep');
}
