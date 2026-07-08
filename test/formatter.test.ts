import {describe, expect, it} from 'vitest';
import {renderJson, setAllExpanded} from '../src/formatter.js';

describe('renderJson', () => {
	it('renders a primitive root', () => {
		const tree = renderJson(42);
		expect(tree.querySelector('.fjf-number')?.textContent).toBe('42');
		expect(tree.querySelector('[data-expand="1"]')).toBeNull();
	});

	it('renders object keys and values with syntax classes', () => {
		const tree = renderJson({name: 'x', n: 1, ok: true, empty: null});
		const keys = [...tree.querySelectorAll('.fjf-key')].map((k) => k.textContent);
		expect(keys).toContain('"name"');
		expect(tree.querySelector('.fjf-string')?.textContent).toBe('"x"');
		expect(tree.querySelector('.fjf-number')?.textContent).toBe('1');
		expect(tree.querySelector('.fjf-boolean')?.textContent).toBe('true');
		expect(tree.querySelector('.fjf-null')?.textContent).toBe('null');
	});

	it('marks expandable nodes and starts them open', () => {
		const tree = renderJson({a: {b: 1}});
		const expandables = tree.querySelectorAll('[data-expand="1"]');
		expect(expandables).toHaveLength(2); // root object + nested object
		for (const n of expandables) {
			expect(n.classList.contains('fjf-open')).toBe(true);
		}
	});

	it('does not mark empty objects/arrays as expandable', () => {
		const tree = renderJson({arr: [], obj: {}});
		// only the root is expandable
		expect(tree.querySelectorAll('[data-expand="1"]')).toHaveLength(1);
	});

	it('turns URL strings into safe links', () => {
		const tree = renderJson({site: 'https://example.com/x'});
		const a = tree.querySelector('a.fjf-link') as HTMLAnchorElement;
		expect(a).not.toBeNull();
		expect(a.href).toBe('https://example.com/x');
		expect(a.target).toBe('_blank');
		expect(a.rel).toBe('noopener noreferrer');
	});

	it('collapses and expands on toggle click', () => {
		const tree = renderJson({a: {b: 1}});
		const root = tree.querySelector('[data-expand="1"]') as HTMLElement;
		const toggle = root.querySelector(':scope > .fjf-line > .fjf-toggle') as HTMLElement;

		expect(root.classList.contains('fjf-open')).toBe(true);
		toggle.click();
		expect(root.classList.contains('fjf-collapsed')).toBe(true);
		toggle.click();
		expect(root.classList.contains('fjf-open')).toBe(true);
	});
});

describe('setAllExpanded', () =>
	it('collapses then re-expands every node', () => {
		const tree = renderJson({a: {b: {c: 1}}, d: [{e: 2}]});

		setAllExpanded(tree, false);
		for (const n of tree.querySelectorAll('[data-expand="1"]')) {
			expect(n.classList.contains('fjf-collapsed')).toBe(true);
		}

		setAllExpanded(tree, true);
		for (const n of tree.querySelectorAll('[data-expand="1"]')) {
			expect(n.classList.contains('fjf-open')).toBe(true);
		}
	}));
