import type {JsonValue} from './types.js';

export interface Detected {
	/** The original text as served (trimmed). */
	readonly raw: string;
	/** Size of `raw` in actual UTF-8 bytes - not characters. Measured once, reused everywhere. */
	readonly rawByteLength: number;
	/** The parsed value. */
	readonly value: JsonValue;
}

/** A page that survived the cheap checks and may hold JSON. Nothing has been parsed yet. */
export interface PotentialJsonDocument {
	readonly rawText: string;
	/** The content-type or the URL says JSON, so the text does not have to start with `{`/`[`. */
	readonly jsonLike: boolean;
}

const DEFAULT_MAX_BYTES: number = 40 * 1024 * 1024; // ~40MB guard

/**
 * Preflight: cheap, side-effect-free rejection of ordinary pages. Reads no storage, parses no JSON,
 * touches no DOM. The content script runs on <all_urls>, so this is the hot path for every page.
 */
export function inspectPotentialJsonDocument(doc: Document = document): PotentialJsonDocument | null {
	const body: HTMLElement | null = doc.body;
	if (!body) {
		return null;
	}
	if (body.dataset.fjfMounted) {
		return null;
	}

	const contentType: string = (doc.contentType || '').toLowerCase();
	const path: string = doc.location ? doc.location.pathname + doc.location.search : '';
	const jsonLike: boolean = contentType.includes('json') || /\.json(\?|#|$)/i.test(path);

	const children: Element[] = Array.from(body.children);
	let text: string | null = null;
	if (children.length === 1 && children[0].tagName === 'PRE') {
		text = children[0].textContent;
	} else if (children.length === 0) {
		text = body.textContent;
	} else if (jsonLike) {
		text = body.textContent;
	}
	if (text === null) {
		return null;
	}

	const trimmed: string = text.trim();
	if (!trimmed) {
		return null;
	}

	// Without a JSON content-type, only take over things that clearly start as JSON,
	// so normal HTML pages containing a lone <pre> are left alone.
	const first: string = trimmed[0];
	if (!jsonLike && first !== '{' && first !== '[') {
		return null;
	}

	return {rawText: trimmed, jsonLike};
}

/** Second stage: measure the payload against the limit, then parse it. */
export function parseDetectedJson(
	candidate: PotentialJsonDocument,
	maxBytes: number = DEFAULT_MAX_BYTES
): Detected | null {
	const raw: string = candidate.rawText;
	const rawByteLength: number = new TextEncoder().encode(raw).byteLength;
	if (rawByteLength > maxBytes) {
		return null;
	}

	try {
		const value: JsonValue = JSON.parse(raw) as JsonValue;
		return {raw, rawByteLength, value};
	} catch {
		return null;
	}
}

/** Both stages at once. Convenience for callers that have no reason to split the work. */
export function detect(doc: Document = document, maxBytes: number = DEFAULT_MAX_BYTES): Detected | null {
	const candidate: PotentialJsonDocument | null = inspectPotentialJsonDocument(doc);
	return candidate === null ? null : parseDetectedJson(candidate, maxBytes);
}
