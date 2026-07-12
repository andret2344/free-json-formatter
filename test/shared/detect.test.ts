import {afterEach, describe, expect, it, vi} from 'vitest';
import {
	detect,
	inspectPotentialJsonDocument,
	type PotentialJsonDocument,
	parseDetectedJson
} from '../../src/shared/detect.js';

/** The detector only reads body, contentType and location, so a light stand-in is enough. */
function docWith(html: string, contentType: string = 'text/html', path: string = '/page'): Document {
	const real: Document = document.implementation.createHTMLDocument('t');
	real.body.innerHTML = html;
	return {
		body: real.body,
		contentType,
		location: {pathname: path, search: ''}
	} as unknown as Document;
}

function candidate(rawText: string, jsonLike: boolean = true): PotentialJsonDocument {
	return {rawText, jsonLike};
}

function bytes(text: string): number {
	return new TextEncoder().encode(text).byteLength;
}

afterEach((): void => {
	vi.restoreAllMocks();
});

describe('inspectPotentialJsonDocument (preflight)', () => {
	it('rejects a normal HTML page without ever parsing', () => {
		const parse = vi.spyOn(JSON, 'parse');

		expect(inspectPotentialJsonDocument(docWith('<h1>Title</h1><p>body</p>'))).toBeNull();
		expect(parse).not.toHaveBeenCalled();
	});

	it('rejects a page with several body children', () => {
		expect(inspectPotentialJsonDocument(docWith('<div>a</div><div>b</div>'))).toBeNull();
	});

	it('accepts a lone <pre> holding JSON', () => {
		const result = inspectPotentialJsonDocument(docWith('<pre>{ "a": 1 }</pre>'));
		expect(result?.rawText).toBe('{ "a": 1 }');
		expect(result?.jsonLike).toBe(false); // taken over on its shape, not its content type
	});

	it('rejects a lone <pre> holding anything else', () => {
		expect(inspectPotentialJsonDocument(docWith('<pre>hello world</pre>'))).toBeNull();
	});

	it('accepts application/json', () => {
		const result = inspectPotentialJsonDocument(docWith('<pre>[1]</pre>', 'application/json'));
		expect(result?.jsonLike).toBe(true);
	});

	it('accepts application/problem+json', () => {
		const result = inspectPotentialJsonDocument(docWith('<pre>{"title":"x"}</pre>', 'application/problem+json'));
		expect(result?.jsonLike).toBe(true);
	});

	it('treats a .json URL as potential JSON', () => {
		const result = inspectPotentialJsonDocument(docWith('<pre>{"a":1}</pre>', 'text/plain', '/data/file.json'));
		expect(result?.jsonLike).toBe(true);
	});

	it('treats a .json URL with a query string as potential JSON', () => {
		const real: Document = document.implementation.createHTMLDocument('t');
		real.body.innerHTML = '<pre>{"a":1}</pre>';
		const doc = {
			body: real.body,
			contentType: 'text/plain',
			location: {pathname: '/data/file.json', search: '?v=2'}
		} as unknown as Document;

		expect(inspectPotentialJsonDocument(doc)?.jsonLike).toBe(true);
	});

	it('rejects an empty document', () => {
		expect(inspectPotentialJsonDocument(docWith(''))).toBeNull();
		expect(inspectPotentialJsonDocument(docWith('<pre>   </pre>'))).toBeNull();
	});

	it('rejects an already-mounted document', () => {
		const doc = docWith('<pre>{ "a": 1 }</pre>');
		doc.body.dataset.fjfMounted = '1';
		expect(inspectPotentialJsonDocument(doc)).toBeNull();
	});

	it('trims surrounding whitespace from the raw text', () => {
		expect(inspectPotentialJsonDocument(docWith('<pre>\n  { "a": 1 }\n  </pre>'))?.rawText).toBe('{ "a": 1 }');
	});
});

describe('parseDetectedJson', () => {
	it('parses a candidate and reports its UTF-8 byte length', () => {
		const result = parseDetectedJson(candidate('{ "a": 1, "b": [2, 3] }'));
		expect(result?.value).toEqual({a: 1, b: [2, 3]});
		expect(result?.raw).toBe('{ "a": 1, "b": [2, 3] }');
		expect(result?.rawByteLength).toBe(23);
	});

	it('rejects invalid JSON', () => {
		expect(parseDetectedJson(candidate('{ not: valid }'))).toBeNull();
	});

	it('measures the payload once and hands the byte length on', () => {
		const encode = vi.spyOn(TextEncoder.prototype, 'encode');
		const result = parseDetectedJson(candidate('{"a":"ż"}'));

		expect(encode).toHaveBeenCalledTimes(1);
		expect(result?.rawByteLength).toBe(10); // 8 ASCII bytes + 2 for "ż"
	});
});

describe('the size limit counts UTF-8 bytes, not characters', () => {
	it('accepts ASCII below the limit', () => {
		const text = '{"a":"abc"}';
		expect(parseDetectedJson(candidate(text), bytes(text))).not.toBeNull();
	});

	it('counts Polish characters as two bytes each', () => {
		const text = '{"a":"zażółć"}';
		expect(text.length).toBe(14);
		expect(bytes(text)).toBe(18); // 4 two-byte letters

		expect(parseDetectedJson(candidate(text), text.length)).toBeNull(); // character count is not enough room
		expect(parseDetectedJson(candidate(text), bytes(text))?.rawByteLength).toBe(18);
	});

	it('counts an emoji as four bytes', () => {
		const text = '{"a":"🙂"}';
		expect(bytes(text)).toBe(12);
		expect(parseDetectedJson(candidate(text), 11)).toBeNull();
		expect(parseDetectedJson(candidate(text), 12)).not.toBeNull();
	});

	it('accepts a payload exactly on the limit and rejects one byte over', () => {
		const text = '{"a":1}';
		const size = bytes(text);

		expect(parseDetectedJson(candidate(text), size)).not.toBeNull();
		expect(parseDetectedJson(candidate(text), size - 1)).toBeNull();
	});

	it('rejects when a single multi-byte character pushes the payload over', () => {
		const ascii = '{"a":"xx"}';
		const unicode = '{"a":"xż"}'; // same character count, one byte more
		const limit = bytes(ascii);

		expect(parseDetectedJson(candidate(ascii), limit)).not.toBeNull();
		expect(bytes(unicode)).toBe(limit + 1);
		expect(parseDetectedJson(candidate(unicode), limit)).toBeNull();
	});
});

describe('detect (both stages)', () => {
	it('takes over a lone <pre> containing a JSON array', () => {
		expect(detect(docWith('<pre>[1, 2, 3]</pre>'))?.value).toEqual([1, 2, 3]);
	});

	it('leaves a plain text page alone', () => {
		expect(detect(docWith('just some text'))).toBeNull();
	});

	it('bails when the payload exceeds the byte limit', () => {
		const big = docWith(`<pre>${JSON.stringify({a: 'x'.repeat(100)})}</pre>`);
		expect(detect(big, 10)).toBeNull();
		expect(detect(big, 10_000)).not.toBeNull();
	});
});
