/** Shared configuration: the maximum payload size the extension will format. */

export const DEFAULT_MAX_MB = 40;
export const MIN_MAX_MB = 1;
/** Ceiling for the size limit: the viewer does a full JSON.parse(), so anything past this is not realistic. */
export const MAX_MAX_MB = 200;

const MAX_MB_KEY = 'fjf-max-mb';
const BYTES_PER_MB = 1024 * 1024;

export function clampMaxMb(mb: number): number {
	if (!Number.isFinite(mb)) {
		return DEFAULT_MAX_MB;
	}
	return Math.min(MAX_MAX_MB, Math.max(MIN_MAX_MB, Math.round(mb)));
}

export function mbToBytes(mb: number): number {
	return mb * BYTES_PER_MB;
}

export async function getMaxMb(): Promise<number> {
	try {
		const stored: Record<string, unknown> = await chrome.storage.local.get(MAX_MB_KEY);
		const raw: unknown = stored[MAX_MB_KEY];
		if (typeof raw === 'number') {
			return clampMaxMb(raw);
		}
		return DEFAULT_MAX_MB;
	} catch {
		return DEFAULT_MAX_MB;
	}
}

export async function setMaxMb(mb: number): Promise<void> {
	await chrome.storage.local.set({[MAX_MB_KEY]: clampMaxMb(mb)});
}

/** View preferences, persisted so they survive across pages and sessions. */
const WRAP_KEY = 'fjf-wrap';
const CASE_KEY = 'fjf-case';
const INDENT_KEY = 'fjf-indent';

export type IndentId = '2s' | '4s' | '6s' | '8s' | '1t' | '2t';

export interface IndentOption {
	/** Stable id persisted in storage. */
	readonly id: IndentId;
	/** Human label shown in the picker. */
	readonly label: string;
	/** Indent string passed to JSON.stringify (spaces or tab characters). */
	readonly indent: string;
	/** Visual width in `ch` for the rendered tree gutters. */
	readonly ch: number;
}

export const INDENT_OPTIONS: readonly IndentOption[] = [
	{id: '2s', label: '2 spaces', indent: '  ', ch: 2},
	{id: '4s', label: '4 spaces', indent: '    ', ch: 4},
	{id: '6s', label: '6 spaces', indent: '      ', ch: 6},
	{id: '8s', label: '8 spaces', indent: '        ', ch: 8},
	{id: '1t', label: '1 tab', indent: '\t', ch: 4},
	{id: '2t', label: '2 tabs', indent: '\t\t', ch: 8}
];

export const DEFAULT_INDENT: IndentOption = INDENT_OPTIONS[0];

export function indentById(id: string): IndentOption {
	function hasId(option: IndentOption): boolean {
		return option.id === id;
	}

	return INDENT_OPTIONS.find(hasId) ?? DEFAULT_INDENT;
}

function storeValue(key: string, value: unknown): void {
	void chrome.storage.local.set({[key]: value}).catch((): void => undefined);
}

async function getBool(key: string): Promise<boolean> {
	try {
		const stored: Record<string, unknown> = await chrome.storage.local.get(key);
		return stored[key] === true;
	} catch {
		return false;
	}
}

export function getWrap(): Promise<boolean> {
	return getBool(WRAP_KEY);
}

export function setWrap(value: boolean): void {
	storeValue(WRAP_KEY, value);
}

export function getCaseSensitive(): Promise<boolean> {
	return getBool(CASE_KEY);
}

export function setCaseSensitive(value: boolean): void {
	storeValue(CASE_KEY, value);
}

export async function getIndent(): Promise<IndentOption> {
	try {
		const stored: Record<string, unknown> = await chrome.storage.local.get(INDENT_KEY);
		const raw: unknown = stored[INDENT_KEY];
		return typeof raw === 'string' ? indentById(raw) : DEFAULT_INDENT;
	} catch {
		return DEFAULT_INDENT;
	}
}

export function setIndent(id: IndentId): void {
	storeValue(INDENT_KEY, id);
}

/**
 * How many levels of the tree are expanded when a JSON page opens.
 * The tree is always rendered lazily; this only controls the initial depth.
 */
export type InitialExpansionDepth = 'auto' | 1 | 2 | 3 | 4 | 5 | 'all';

/** Depth resolved to something the renderer can act on: a level count, or "expand everything". */
export type ResolvedExpansionDepth = Exclude<InitialExpansionDepth, 'auto'>;

/** Deepest level a user can pick by hand; full expansion is the separate `all` value. */
export const MAX_MANUAL_DEPTH = 5;

export const DEFAULT_INITIAL_EXPANSION_DEPTH: InitialExpansionDepth = 'auto';

const DEPTH_KEY = 'fjf-depth';

/** Parse a stored/selected value; anything unrecognized falls back to the default. */
export function depthFromValue(value: unknown): InitialExpansionDepth {
	if (value === 'auto' || value === 'all') {
		return value;
	}
	const numeric: number = typeof value === 'number' ? value : Number(value);
	if (Number.isInteger(numeric) && numeric >= 1 && numeric <= MAX_MANUAL_DEPTH) {
		return numeric as InitialExpansionDepth;
	}
	return DEFAULT_INITIAL_EXPANSION_DEPTH;
}

export async function getInitialExpansionDepth(): Promise<InitialExpansionDepth> {
	try {
		const stored: Record<string, unknown> = await chrome.storage.local.get(DEPTH_KEY);
		const raw: unknown = stored[DEPTH_KEY];
		return raw === undefined ? DEFAULT_INITIAL_EXPANSION_DEPTH : depthFromValue(raw);
	} catch {
		return DEFAULT_INITIAL_EXPANSION_DEPTH;
	}
}

export async function setInitialExpansionDepth(value: InitialExpansionDepth): Promise<void> {
	await chrome.storage.local.set({[DEPTH_KEY]: value});
}
