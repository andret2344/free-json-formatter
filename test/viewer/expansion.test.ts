import {describe, expect, it} from 'vitest';
import type {InitialExpansionDepth} from '../../src/shared/config.js';
import type {JsonObject, JsonValue} from '../../src/shared/types.js';
import {countCollections, resolveInitialExpansionDepth, SCAN_NODE_LIMIT, scanJson} from '../../src/viewer/expansion.js';
import {createExpansionController, renderJson} from '../../src/viewer/formatter.js';

function numbers(count: number): number[] {
	const list: number[] = [];
	for (let index = 0; index < count; index++) {
		list.push(index);
	}
	return list;
}

function nested(levels: number): JsonValue {
	let value: JsonValue = {leaf: 1};
	for (let level = 0; level < levels; level++) {
		const wrapper: JsonObject = {child: value};
		value = wrapper;
	}
	return value;
}

/** Byte length of a value as the detector would have measured it. */
function bytesOf(value: JsonValue): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

describe('scanJson', () => {
	it('counts every value and records the deepest collection level', () => {
		const result = scanJson({a: [1, 2]});
		// root object, the array, and its two numbers.
		expect(result.nodes).toBe(4);
		expect(result.maxDepth).toBe(1); // root is 0, the array sits one level down
		expect(result.truncated).toBe(false);
	});

	it('stops once the visit limit is reached', () => {
		const result = scanJson(numbers(1_000), 10);
		expect(result.nodes).toBe(10);
		expect(result.truncated).toBe(true);
	});

	it('gives up on documents larger than the default scan limit', () => {
		const result = scanJson(numbers(SCAN_NODE_LIMIT + 100));
		expect(result.truncated).toBe(true);
	});
});

describe('countCollections', () => {
	it('counts every collection an expansion run will open', () => {
		// root + a + a.b + list = 4; the empty object and the primitives get no toggle.
		expect(countCollections({a: {b: {c: 1}}, list: [1, 2], empty: {}, plain: 'x'})).toBe(4);
	});

	it('is zero for a value with nothing to expand', () => {
		expect(countCollections(42)).toBe(0);
		expect(countCollections({})).toBe(0);
	});

	it('counts only what a depth-limited run walks: the collections down to that depth', () => {
		const value: JsonValue = {a: {b: {c: {d: 1}}}, e: {f: 2}};

		// A run walks the collections it opens *and* the ones it dequeues and finds too deep, so a limit
		// of 1 opens the root and still visits its two children.
		expect(countCollections(value, 1)).toBe(3); // root + a + e
		expect(countCollections(value, 2)).toBe(4); // + a.b
		expect(countCollections(value)).toBe(5); // + a.b.c
	});

	it('matches what a depth-limited run actually walks', async () => {
		const value: JsonValue = {a: {b: {c: {d: 1}}}, e: {f: 2}};
		const walked: number[] = [];

		function onProgress(count: number): void {
			walked.push(count);
		}

		const tree = renderJson(value, 1);
		await createExpansionController(tree, {onProgress}).expandAll(2);

		expect(walked[walked.length - 1]).toBe(countCollections(value, 2));
	});

	it('agrees with the number of nodes the renderer creates', async () => {
		const value: JsonValue = {a: {b: [{c: 1}, {d: 2}]}, e: [[1], [2, 3]]};
		const tree = renderJson(value, 1);
		const expansion = createExpansionController(tree);

		await expansion.expandAll();

		expect(tree.collections()).toHaveLength(countCollections(value));
	});
});

describe('resolveInitialExpansionDepth', () => {
	it.each<InitialExpansionDepth>([1, 2, 3, 4, 5, 'all'])('passes an explicit preference through: %s', (depth) => {
		expect(resolveInitialExpansionDepth({a: 1}, 10, depth)).toBe(depth);
	});

	it('expands a very small document completely', () => {
		const value: JsonValue = {a: 1, b: {c: 2}};
		expect(resolveInitialExpansionDepth(value, bytesOf(value), 'auto')).toBe('all');
	});

	it('opens three levels of a small document', () => {
		const value: JsonValue = numbers(500); // past the very-small node count, still small
		expect(resolveInitialExpansionDepth(value, bytesOf(value), 'auto')).toBe(3);
	});

	it('opens two levels of a medium document', () => {
		const value: JsonValue = numbers(3_000);
		expect(resolveInitialExpansionDepth(value, bytesOf(value), 'auto')).toBe(2);
	});

	it('opens only the root of a large document', () => {
		const value: JsonValue = numbers(6_000);
		expect(resolveInitialExpansionDepth(value, bytesOf(value), 'auto')).toBe(1);
	});

	it('opens only the root when the scan gives up', () => {
		const value: JsonValue = numbers(SCAN_NODE_LIMIT + 1_000);
		expect(resolveInitialExpansionDepth(value, bytesOf(value), 'auto')).toBe(1);
	});

	it('judges by element count, not only by byte size', () => {
		// A short document can still hold a lot of small values.
		const value: JsonValue = numbers(3_000);
		expect(bytesOf(value)).toBeLessThan(32 * 1024 * 4);
		expect(resolveInitialExpansionDepth(value, bytesOf(value), 'auto')).not.toBe('all');
	});

	it('judges by byte size, not only by element count', () => {
		const value: JsonValue = {blob: 'x'.repeat(4 * 1024 * 1024)};
		expect(resolveInitialExpansionDepth(value, bytesOf(value), 'auto')).toBe(1);
	});

	it('does not fully expand a deeply nested document', () => {
		const value: JsonValue = nested(12);
		expect(resolveInitialExpansionDepth(value, bytesOf(value), 'auto')).toBe(3);
	});

	it('never resolves below depth 1', () => {
		const cases: JsonValue[] = [numbers(50_000), {blob: 'x'.repeat(3 * 1024 * 1024)}, 42, {}];
		for (const value of cases) {
			const resolved = resolveInitialExpansionDepth(value, bytesOf(value), 'auto');
			expect(resolved === 'all' || resolved >= 1).toBe(true);
		}
	});
});
