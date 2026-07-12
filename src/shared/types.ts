export type JsonPrimitive = null | boolean | number | string;

/**
 * An interface, not a `type` alias: `Record<string, JsonValue>` is a mapped type and resolves eagerly, so
 * `JsonValue` would circularly reference itself (TS2456), while an interface's members resolve lazily.
 * It also keeps the braces on their own lines, which is the one shape IJ and Biome format identically.
 */
export interface JsonObject {
	readonly [key: string]: JsonValue;
}

export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export type JsonKind = 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object';

/** Value types that can be expanded into child entries. */
export type JsonCollection = JsonValue[] | JsonObject;

/** Location of a value inside the parsed document: object keys and array indices, root first. */
export type JsonPath = readonly (string | number)[];

/** What the viewer turns into a clickable link: an absolute http(s) URL, or a protocol-relative one. */
const URL_RE: RegExp = /^(https?:\/\/|\/\/)[^\s]+$/i;

export function typeOf(value: JsonValue): JsonKind {
	if (value === null) {
		return 'null';
	}
	if (Array.isArray(value)) {
		return 'array';
	}
	const kind: JsonValue = typeof value;
	if (kind === 'boolean' || kind === 'number' || kind === 'string') {
		return kind;
	}
	return 'object';
}

export function isExpandable(value: JsonValue): value is JsonCollection {
	return value !== null && typeof value === 'object';
}

/** A single child of a collection, in render order. */
export interface JsonEntry {
	readonly key: string | number | null;
	readonly value: JsonValue;
	readonly isLast: boolean;
}

export function entriesOf(value: JsonCollection): JsonEntry[] {
	const entries: JsonEntry[] = [];
	if (Array.isArray(value)) {
		const lastIndex: number = value.length - 1;
		for (let index = 0; index < value.length; index++) {
			entries.push({key: index, value: value[index], isLast: index === lastIndex});
		}
		return entries;
	}
	const keys: string[] = Object.keys(value);
	const lastIndex: number = keys.length - 1;
	for (let index = 0; index < keys.length; index++) {
		entries.push({key: keys[index], value: value[keys[index]], isLast: index === lastIndex});
	}
	return entries;
}

export function childCount(value: JsonCollection): number {
	return Array.isArray(value) ? value.length : Object.keys(value).length;
}

export function looksLikeUrl(text: string): boolean {
	return URL_RE.test(text.trim());
}
