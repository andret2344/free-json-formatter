import type {JsonValue} from './types.js';

export interface Detected {
	/** The original text as served (trimmed). */
	readonly raw: string;
	/** The parsed value. */
	readonly value: JsonValue;
}

const DEFAULT_MAX_BYTES: number = 40 * 1024 * 1024; // ~40MB guard

/** Decide whether the given document is a raw JSON payload we should take over. */
export function detect(doc: Document = document, maxBytes: number = DEFAULT_MAX_BYTES): Detected | null {
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
	if (trimmed.length > maxBytes) {
		return null;
	}

	try {
		const value: JsonValue = JSON.parse(trimmed) as JsonValue;
		return {raw: trimmed, value};
	} catch {
		return null;
	}
}
