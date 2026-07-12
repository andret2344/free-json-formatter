import {Copy} from 'lucide';
import {describe, expect, it} from 'vitest';
import {button, createElement, icon, separator} from '../../src/viewer/dom.js';

describe('createElement', () => {
	it('builds the tag, and leaves class and text off when they are not asked for', () => {
		const node: HTMLDivElement = createElement('div');

		expect(node.tagName).toBe('DIV');
		expect(node.className).toBe('');
		expect(node.textContent).toBe('');
	});

	it('applies the class name and the text content', () => {
		const node: HTMLSpanElement = createElement('span', 'fjf-key', '"name"');

		expect(node.className).toBe('fjf-key');
		expect(node.textContent).toBe('"name"');
	});
});

describe('button', () => {
	it('is a real button, typed so it never submits a form', () => {
		const control: HTMLButtonElement = button('Raw', 'Show the original JSON text');

		expect(control.tagName).toBe('BUTTON');
		expect(control.type).toBe('button');
		expect(control.textContent).toBe('Raw');
		expect(control.title).toBe('Show the original JSON text');
		expect(control.className).toBe('fjf-btn');
	});

	it('takes a class of its own', () => {
		const element: HTMLButtonElement = button('Cc', 'Match case', 'fjf-btn fjf-search-case');
		expect(element.className).toBe('fjf-btn fjf-search-case');
	});
});

describe('separator', () =>
	it('is an empty span the toolbar can group with', () => {
		const element: HTMLSpanElement = separator();

		expect(element.tagName).toBe('SPAN');
		expect(element.className).toBe('fjf-sep');
		expect(element.textContent).toBe('');
	}));

describe('icon', () =>
	it('is an SVG the CSS sizes and the theme colours, and screen readers skip', () => {
		const svg: SVGElement = icon(Copy);

		expect(svg.tagName.toLowerCase()).toBe('svg');
		expect(svg.getAttribute('aria-hidden')).toBe('true');
		// Lucide's own 24x24 would tower over a 13px line - the stylesheet decides the size.
		expect(svg.hasAttribute('width')).toBe(false);
		expect(svg.hasAttribute('height')).toBe(false);
		expect(svg.getAttribute('stroke')).toBe('currentColor');
	}));
