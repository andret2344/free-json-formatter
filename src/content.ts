import {
	getCaseSensitive,
	getIndent,
	getMaxMb,
	getWrap,
	INDENT_OPTIONS,
	type IndentOption,
	indentById,
	mbToBytes,
	setCaseSensitive,
	setIndent,
	setWrap
} from './config.js';
import {type Detected, detect} from './detect.js';
import {button, createElement, separator} from './dom.js';
import {renderJson, setAllExpanded} from './formatter.js';
import {createSearch, type Search} from './search.js';

type Theme = 'auto' | 'light' | 'dark';

const THEME_KEY = 'fjf-theme';
const THEME_ORDER: readonly Theme[] = ['auto', 'light', 'dark'];
const THEME_LABELS: Readonly<Record<Theme, string>> = {
	auto: 'Theme: Auto',
	light: 'Theme: Light',
	dark: 'Theme: Dark'
};

async function loadTheme(): Promise<Theme> {
	try {
		const stored: Record<string, unknown> = await chrome.storage.local.get(THEME_KEY);
		const value: unknown = stored[THEME_KEY];
		return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
	} catch {
		return 'auto';
	}
}

function saveTheme(theme: Theme): void {
	void chrome.storage.local.set({[THEME_KEY]: theme}).catch((): void => undefined);
}

function applyTheme(theme: Theme): void {
	document.documentElement.dataset.fjfTheme = theme;
}

function nextTheme(theme: Theme): Theme {
	const index: number = THEME_ORDER.indexOf(theme);
	return THEME_ORDER[(index + 1) % THEME_ORDER.length];
}

/** Payloads above this size get a "large - may be slow" warning in the toolbar. */
const LARGE_BYTES: number = 10 * 1024 * 1024;

function indentSelect(current: IndentOption): HTMLSelectElement {
	const select: HTMLSelectElement = createElement('select', 'fjf-select');
	select.title = 'Indentation';
	for (const option of INDENT_OPTIONS) {
		const optionEl: HTMLOptionElement = createElement('option', undefined, `Indent: ${option.label}`);
		optionEl.value = option.id;
		optionEl.selected = option.id === current.id;
		select.append(optionEl);
	}
	return select;
}

async function mount(detected: Detected): Promise<void> {
	const body: HTMLElement = document.body;
	body.dataset.fjfMounted = '1';

	// Read persisted preferences first, but do NOT touch the page yet: the browser keeps showing
	// its own raw JSON untouched. Theming the page before the tree is ready would recolor that raw
	// text for a frame ("raw in different colors") before the formatted view appears.
	const [theme, wrap, caseSensitive, indent]: [Theme, boolean, boolean, IndentOption] = await Promise.all([
		loadTheme(),
		getWrap(),
		getCaseSensitive(),
		getIndent()
	]);
	let currentIndent: IndentOption = indent;

	// Build UI off-DOM, then swap in one shot.
	const root: HTMLDivElement = createElement('div', 'fjf-root');
	const toolbar: HTMLDivElement = createElement('div', 'fjf-toolbar');

	const tree: HTMLDivElement = renderJson(detected.value);
	tree.style.setProperty('--fjf-tab', String(currentIndent.ch));
	const search: Search = createSearch(tree, {caseSensitive, onCaseChange: setCaseSensitive});

	// Raw view shows the original JSON text exactly as served.
	const rawPre: HTMLPreElement = createElement('pre', 'fjf-raw', detected.raw);
	rawPre.hidden = true;

	const formattedBtn: HTMLButtonElement = button('Formatted', 'Show the interactive tree');
	const rawBtn: HTMLButtonElement = button('Raw', 'Show the original JSON text');
	formattedBtn.classList.add('fjf-active-view');

	const expandBtn: HTMLButtonElement = button('Expand all', 'Expand every node');
	const collapseBtn: HTMLButtonElement = button('Collapse all', 'Collapse every node');
	expandBtn.addEventListener('click', (): void => setAllExpanded(tree, true));
	collapseBtn.addEventListener('click', (): void => setAllExpanded(tree, false));

	const wrapBtn: HTMLButtonElement = button('Wrap', 'Toggle wrapping of long lines');
	const indentSel: HTMLSelectElement = indentSelect(currentIndent);
	const copyBtn: HTMLButtonElement = button('Copy raw', 'Copy the raw JSON to the clipboard');
	const copyFmtBtn: HTMLButtonElement = button('Copy formatted', 'Copy the indented JSON as shown');

	function setView(raw: boolean): void {
		tree.hidden = raw;
		rawPre.hidden = !raw;
		formattedBtn.classList.toggle('fjf-active-view', !raw);
		rawBtn.classList.toggle('fjf-active-view', raw);
		// Tree-only controls - disable them in the raw view.
		expandBtn.disabled = raw;
		collapseBtn.disabled = raw;
		wrapBtn.disabled = raw;
		indentSel.disabled = raw;
		copyFmtBtn.disabled = raw;
		search.setEnabled(!raw);
	}

	formattedBtn.addEventListener('click', (): void => setView(false));
	rawBtn.addEventListener('click', (): void => setView(true));

	tree.classList.toggle('fjf-wrap', wrap);
	wrapBtn.classList.toggle('fjf-active-view', wrap);
	wrapBtn.addEventListener('click', (): void => {
		const wrapping: boolean = tree.classList.toggle('fjf-wrap');
		wrapBtn.classList.toggle('fjf-active-view', wrapping);
		setWrap(wrapping);
	});

	indentSel.addEventListener('change', (): void => {
		currentIndent = indentById(indentSel.value);
		tree.style.setProperty('--fjf-tab', String(currentIndent.ch));
		setIndent(currentIndent.id);
	});

	function flashCopied(targetButton: HTMLButtonElement): void {
		const previousLabel: string | null = targetButton.textContent;
		targetButton.textContent = 'Copied';
		setTimeout((): void => {
			targetButton.textContent = previousLabel;
		}, 1200);
	}

	copyBtn.addEventListener('click', async (): Promise<void> => {
		try {
			await navigator.clipboard.writeText(detected.raw);
			flashCopied(copyBtn);
		} catch {
			/* clipboard blocked */
		}
	});

	// Copy the value re-serialized with the chosen indentation (unicode letters stay literal).
	copyFmtBtn.addEventListener('click', async (): Promise<void> => {
		try {
			const text: string = JSON.stringify(detected.value, null, currentIndent.indent);
			await navigator.clipboard.writeText(text);
			flashCopied(copyFmtBtn);
		} catch {
			/* clipboard blocked */
		}
	});

	let currentTheme: Theme = theme;
	const themeBtn: HTMLButtonElement = button(THEME_LABELS[theme], 'Cycle theme (auto / light / dark)');
	themeBtn.addEventListener('click', (): void => {
		currentTheme = nextTheme(currentTheme);
		applyTheme(currentTheme);
		saveTheme(currentTheme);
		themeBtn.textContent = THEME_LABELS[currentTheme];
	});

	const spacer: HTMLSpanElement = createElement('span', 'fjf-spacer');

	toolbar.append(
		formattedBtn,
		rawBtn,
		separator(),
		expandBtn,
		collapseBtn,
		wrapBtn,
		indentSel,
		separator(),
		copyBtn,
		copyFmtBtn
	);

	// Warn when the payload is large enough that rendering/search may feel slow.
	if (detected.raw.length > LARGE_BYTES) {
		const megabytes: string = (detected.raw.length / (1024 * 1024)).toFixed(1);
		const warn: HTMLSpanElement = createElement('span', 'fjf-warn', `⚠ Large (${megabytes} MB)`);
		warn.title = `This JSON is ${megabytes} MB. Rendering, expand/collapse, and search may be slow.`;
		toolbar.append(warn);
	}

	toolbar.append(spacer, search.el, themeBtn);

	root.append(toolbar, tree, rawPre);

	// Atomic swap in one synchronous block (no await between): apply the theme, activate our
	// styles, drop the browser's raw JSON, and insert the tree. The browser paints this as a
	// single transition from plain raw text straight to the themed formatted view - no white
	// flash and no intermediate recolored-raw frame.
	applyTheme(theme);
	document.documentElement.classList.add('fjf-active');
	body.textContent = '';
	body.append(root);
}

async function start(): Promise<void> {
	const maxMb: number = await getMaxMb();
	const detected: Detected | null = detect(document, mbToBytes(maxMb));
	if (detected !== null) {
		await mount(detected);
	}
}

void start();
