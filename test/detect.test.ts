import {describe, expect, it} from 'vitest';
import {detect} from '../src/detect.js';

function docWith(html: string): Document {
	const d = document.implementation.createHTMLDocument('t');
	d.body.innerHTML = html;
	return d;
}

describe('detect', () => {
	it('takes over a lone <pre> containing a JSON object', () => {
		const d = docWith('<pre>{ "a": 1, "b": [2, 3] }</pre>');
		const result = detect(d);
		expect(result).not.toBeNull();
		expect(result?.value).toEqual({a: 1, b: [2, 3]});
		expect(result?.raw).toBe('{ "a": 1, "b": [2, 3] }');
	});

	it('takes over a lone <pre> containing a JSON array', () => {
		const d = docWith('<pre>[1, 2, 3]</pre>');
		expect(detect(d)?.value).toEqual([1, 2, 3]);
	});

	it('ignores a lone <pre> that is not JSON', () => {
		expect(detect(docWith('<pre>hello world</pre>'))).toBeNull();
	});

	it('ignores invalid JSON', () => {
		expect(detect(docWith('<pre>{ not: valid }</pre>'))).toBeNull();
	});

	it('ignores a normal HTML page with multiple children', () => {
		expect(detect(docWith('<h1>Title</h1><p>body</p>'))).toBeNull();
	});

	it('ignores plain text that does not start as JSON', () => {
		expect(detect(docWith('just some text'))).toBeNull();
	});

	it('does not re-mount an already-mounted document', () => {
		const d = docWith('<pre>{ "a": 1 }</pre>');
		d.body.dataset.fjfMounted = '1';
		expect(detect(d)).toBeNull();
	});

	it('trims surrounding whitespace from the raw text', () => {
		const result = detect(docWith('<pre>\n  { "a": 1 }\n  </pre>'));
		expect(result?.raw).toBe('{ "a": 1 }');
	});

	it('bails when the payload exceeds the max byte limit', () => {
		const big = docWith(`<pre>${JSON.stringify({a: 'x'.repeat(100)})}</pre>`);
		expect(detect(big, 10)).toBeNull(); // 10-byte cap
		expect(detect(big, 10_000)).not.toBeNull(); // generous cap
	});
});
