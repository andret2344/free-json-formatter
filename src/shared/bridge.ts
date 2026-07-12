/** The one thing the isolated content script and the page-world script have to agree on. */

/** Dispatched on `window` by the content script once the viewer is mounted and the raw text is in the DOM. */
export const MOUNTED_EVENT = 'fjf-mounted';

/** The Raw view holds the original text - the page-world handle parses it from there, on demand. */
export const RAW_SELECTOR = '.fjf-raw';
