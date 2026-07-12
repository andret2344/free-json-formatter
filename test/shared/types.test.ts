import {describe, expect, it} from 'vitest';
import {childCount, entriesOf, isExpandable, type JsonEntry, looksLikeUrl, typeOf} from '../../src/shared/types.js';

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

describe('entriesOf', () => {
	it('keys an array by its indices and flags the last item, which is what drops the trailing comma', () => {
		const entries: JsonEntry[] = entriesOf(['a', 'b']);

		expect(entries).toEqual([
			{key: 0, value: 'a', isLast: false},
			{key: 1, value: 'b', isLast: true}
		]);
	});

	it('walks an object in insertion order - the order the tree renders in', () => {
		const entries: JsonEntry[] = entriesOf({b: 1, a: 2});

		expect(entries.map((entry: JsonEntry): string | number | null => entry.key)).toEqual(['b', 'a']);
		expect(entries[1].isLast).toBe(true);
	});

	it('yields nothing for an empty collection', () => {
		expect(entriesOf([])).toEqual([]);
		expect(entriesOf({})).toEqual([]);
	});
});

describe('childCount', () => {
	it('counts items and keys, and reports an empty collection as zero', () => {
		expect(childCount([1, 2, 3])).toBe(3);
		expect(childCount({a: 1, b: 2})).toBe(2);
		expect(childCount([])).toBe(0);
		expect(childCount({})).toBe(0);
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
