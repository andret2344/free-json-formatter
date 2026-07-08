export type JsonPrimitive = null | boolean | number | string;
export type JsonObject = {[key: string]: JsonValue};
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export type JsonKind = 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object';

export function typeOf(value: JsonValue): JsonKind {
	if (value === null) {
		return 'null';
	}
	if (Array.isArray(value)) {
		return 'array';
	}
	const kind = typeof value;
	if (kind === 'boolean' || kind === 'number' || kind === 'string') {
		return kind;
	}
	return 'object';
}

export function isExpandable(value: JsonValue): value is JsonValue[] | JsonObject {
	return value !== null && typeof value === 'object';
}

const URL_RE: RegExp = /^(https?:\/\/|\/\/)[^\s]+$/i;

export function looksLikeUrl(text: string): boolean {
	return URL_RE.test(text.trim());
}
