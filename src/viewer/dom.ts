/** Small DOM element factories shared across the formatter, toolbar, and search UI. */

import {createElement as createLucideIcon, type IconNode} from 'lucide';

/** Create an element with an optional class name and text content. */
export function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
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

/**
 * Build one of Lucide's icons. `lucide` is a devDependency: esbuild inlines the two icon definitions the
 * viewer actually names and drops the rest, so the runtime stays dependency-free and nothing is fetched.
 * The icon strokes in `currentColor` and is sized by CSS, so it follows the theme and the font like text.
 */
export function icon(node: IconNode): SVGElement {
	const svg: SVGElement = createLucideIcon(node);
	svg.setAttribute('aria-hidden', 'true');
	svg.removeAttribute('width'); // the CSS sizes it; Lucide's own 24x24 would tower over a 13px line
	svg.removeAttribute('height');
	return svg;
}
