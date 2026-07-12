import {MOUNTED_EVENT, RAW_SELECTOR} from '../shared/bridge.js';

/**
 * Runs in the page's own world (manifest `world: MAIN`), which is where the devtools console evaluates -
 * a variable defined by the ordinary content script lives in the isolated world and would be invisible
 * there. Injecting an inline <script> instead is not an option: the extension's CSP blocks it.
 *
 * The handle parses the raw text that the Raw view already holds, and only when it is read, so an unused
 * handle costs nothing and a multi-megabyte document is never kept in memory twice.
 */
function defineHandle(): void {
	Object.defineProperty(window, 'json', {
		configurable: true,
		get: (): unknown => {
			const raw: HTMLElement | null = document.querySelector<HTMLElement>(RAW_SELECTOR);
			return raw === null ? undefined : JSON.parse(raw.textContent ?? 'null');
		}
	});
	console.log('Free JSON Formatter: Type "json" to inspect');
}

// The two worlds both run at document_end, in no guaranteed order: catch the announcement if it is still
// coming, and notice a viewer that mounted before this script did.
if (document.querySelector(RAW_SELECTOR) !== null) {
	defineHandle();
} else {
	window.addEventListener(MOUNTED_EVENT, defineHandle, {once: true});
}
