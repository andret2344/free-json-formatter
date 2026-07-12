import type {InitialExpansionDepth, ResolvedExpansionDepth} from '../shared/config.js';
import {entriesOf, isExpandable, type JsonCollection, type JsonValue} from '../shared/types.js';

/**
 * Upper bound on how many values the `auto` scan looks at. A document that is still not exhausted
 * after this many values is treated as large - we stop instead of walking a huge structure twice
 * (once to measure it, once to render it).
 */
export const SCAN_NODE_LIMIT = 20_000;

/** Size/complexity tiers for `auto`. A short document can still hold a huge number of small values, so both matter. */
export const VERY_SMALL_BYTES = 32 * 1024;
export const VERY_SMALL_NODES = 200;
export const SMALL_BYTES = 256 * 1024;
export const SMALL_NODES = 1_000;
export const MEDIUM_BYTES = 2 * 1024 * 1024;
export const MEDIUM_NODES = 5_000;
/** Fully expanding a deeply nested document floods the view even when it is small, so it stays out of the `all` tier. */
export const DEEP_NESTING_LEVELS = 8;

export interface ScanResult {
	/** Values visited (collections and primitives), capped at the scan limit. */
	readonly nodes: number;
	/** Deepest collection level seen, root collection being 0. */
	readonly maxDepth: number;
	/** True when the scan stopped at the limit instead of finishing the document. */
	readonly truncated: boolean;
}

interface StackItem {
	readonly value: JsonValue;
	readonly depth: number;
}

/** Walk the parsed value iteratively, giving up after `limit` values. Builds no DOM. */
export function scanJson(value: JsonValue, limit: number = SCAN_NODE_LIMIT): ScanResult {
	const stack: StackItem[] = [{value, depth: 0}];
	let nodes = 0;
	let maxDepth = 0;

	while (stack.length > 0) {
		if (nodes >= limit) {
			return {nodes, maxDepth, truncated: true};
		}
		const item: StackItem = stack.pop() as StackItem;
		nodes++;
		if (!isExpandable(item.value)) {
			continue;
		}
		const collection: JsonCollection = item.value;
		if (item.depth > maxDepth) {
			maxDepth = item.depth;
		}
		for (const entry of entriesOf(collection)) {
			stack.push({value: entry.value, depth: item.depth + 1});
		}
	}
	return {nodes, maxDepth, truncated: false};
}

/**
 * The collections an expansion run down to `maxDepth` will walk: the root sits at depth 0, and a run
 * queues every collection down to `maxDepth` itself (it dequeues those, finds them too deep, and leaves
 * them closed). That count is exactly the denominator of the progress bar. Unbounded on purpose - it is
 * only computed when a run starts, and that run is about to walk the same values anyway.
 */
export function countCollections(value: JsonValue, maxDepth: number = Number.POSITIVE_INFINITY): number {
	const stack: StackItem[] = [{value, depth: 0}];
	let collections = 0;

	while (stack.length > 0) {
		const item: StackItem = stack.pop() as StackItem;
		if (!isExpandable(item.value)) {
			continue;
		}
		const collection: JsonCollection = item.value;
		let empty = true;
		for (const entry of entriesOf(collection)) {
			empty = false;
			if (item.depth < maxDepth) {
				stack.push({value: entry.value, depth: item.depth + 1}); // a deeper node is never opened, so it is never queued
			}
		}
		if (!empty) {
			collections++; // empty collections have no toggle - the renderer never makes a node for them
		}
	}
	return collections;
}

/**
 * Turn the stored preference into a depth the renderer can act on.
 * Explicit choices pass through; `auto` is decided from a bounded scan, never below depth 1.
 */
export function resolveInitialExpansionDepth(
	value: JsonValue,
	rawByteLength: number,
	preference: InitialExpansionDepth
): ResolvedExpansionDepth {
	if (preference !== 'auto') {
		return preference;
	}

	const scan: ScanResult = scanJson(value, SCAN_NODE_LIMIT);
	// The scan gave up: too many values to judge, so open as little as possible.
	if (scan.truncated) {
		return 1;
	}
	if (rawByteLength <= VERY_SMALL_BYTES && scan.nodes <= VERY_SMALL_NODES && scan.maxDepth <= DEEP_NESTING_LEVELS) {
		return 'all';
	}
	if (rawByteLength <= SMALL_BYTES && scan.nodes <= SMALL_NODES) {
		return 3;
	}
	if (rawByteLength <= MEDIUM_BYTES && scan.nodes <= MEDIUM_NODES) {
		return 2;
	}
	return 1;
}
