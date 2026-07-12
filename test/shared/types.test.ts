import {describe, expect, it} from 'vitest';
import {isExpandable, looksLikeUrl, typeOf} from '../../src/shared/types.js';

describe('typeOf', () => {
	it('classifies every JSON kind', () => {
		expect(typeOf(null)).toBe('null');
		expect(typeOf(true)).toBe('boolean');
		expect(typeOf(42)).toBe('number');
		expect(typeOf('hi')).toBe('string');
		expect(typeOf([1, 2])).toBe('array');
		expect(typeOf({a: 1})).toBe('object');
	});
});

describe('isExpandable', () => {
	it('is true only for arrays and objects', () => {
		expect(isExpandable({})).toBe(true);
		expect(isExpandable([])).toBe(true);
		expect(isExpandable(null)).toBe(false);
		expect(isExpandable('x')).toBe(false);
		expect(isExpandable(1)).toBe(false);
	});
});

describe('looksLikeUrl', () => {
	it('accepts http(s) and protocol-relative URLs', () => {
		expect(looksLikeUrl('https://example.com/a?b=1')).toBe(true);
		expect(looksLikeUrl('http://x.io')).toBe(true);
		expect(looksLikeUrl('//cdn.example.com/x.js')).toBe(true);
		expect(looksLikeUrl('  https://trimmed.dev  ')).toBe(true);
	});

	it('rejects non-URLs', () => {
		expect(looksLikeUrl('just a string')).toBe(false);
		expect(looksLikeUrl('ftp://x')).toBe(false);
		expect(looksLikeUrl('mailto:a@b.c')).toBe(false);
		expect(looksLikeUrl('https://has space.com')).toBe(false);
	});
});
