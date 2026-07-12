import {MOUNTED_EVENT} from '../shared/bridge.js';
import {
	getCaseSensitive,
	getIndent,
	getInitialExpansionDepth,
	getMaxMb,
	getWrap,
	INDENT_OPTIONS,
	type IndentOption,
	type InitialExpansionDepth,
	indentById,
	mbToBytes,
	type ResolvedExpansionDepth,
	setCaseSensitive,
	setIndent,
	setWrap
} from '../shared/config.js';
import {type Detected, inspectPotentialJsonDocument, type PotentialJsonDocument, parseDetectedJson} from '../shared/detect.js';
import {button, createElement, separator} from '../viewer/dom.js';
import {countCollections, resolveInitialExpansionDepth} from '../viewer/expansion.js';
import {createExpansionController, type ExpansionController, pathAtLine, renderJson, type Tree} from '../viewer/formatter.js';
import {createSearch, type Search} from '../viewer/search.js';

type Theme = 'auto' | 'light' | 'dark';

const THEME_KEY = 'fjf-theme';
const THEME_ORDER: readonly Theme[] = ['auto', 'light', 'dark'];
const THEME_LABELS: Readonly<Record<Theme, string>> = {
	auto: 'Theme: Auto',
	light: 'Theme: Light',
	dark: 'Theme: Dark'
};

/** Payloads above this size get a "large - may be slow" warning in the toolbar. */
const LARGE_BYTES: number = 10 * 1024 * 1024;
/** Above this size, re-serializing the whole document is slow enough to ask first. */
const CONFIRM_SERIALIZE_BYTES: number = 20 * 1024 * 1024;
const FEEDBACK_MS: number = 1500;

const EXPAND_LABEL = 'Expand all';
const EXPANDING_LABEL = 'Expanding…';

/** Deep link to a line of the fully expanded document, the way code hosts write it: `…/data.json#L21`. */
const LINE_HASH = /^#L(\d+)$/;
const TARGET_LINE_CLASS = 'fjf-line-target';

/** Temporary label swap ("Copied" / "Copy failed"), one pending timer per button. */
const feedbackTimers = new WeakMap<HTMLButtonElement, number>();

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

function lineFromHash(hash: string): number | null {
	const match: RegExpMatchArray | null = new RegExp(LINE_HASH).exec(hash);
	return match === null ? null : Number(match[1]);
}

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

function flashLabel(target: HTMLButtonElement, message: string, originalLabel: string): void {
	const pending: number | undefined = feedbackTimers.get(target);
	if (pending !== undefined) {
		window.clearTimeout(pending);
	}
	target.textContent = message;
	const timer: number = window.setTimeout((): void => {
		target.textContent = originalLabel;
		feedbackTimers.delete(target);
	}, FEEDBACK_MS);
	feedbackTimers.set(target, timer);
}

async function copyToClipboard(target: HTMLButtonElement, label: string, text: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		flashLabel(target, 'Copied', label);
	} catch {
		/* clipboard may be blocked - say so instead of failing silently */
		flashLabel(target, 'Copy failed', label);
	}
}

async function mount(detected: Detected, preference: InitialExpansionDepth): Promise<void> {
	const body: HTMLElement = document.body;
	body.dataset.fjfMounted = '1';

	// Read persisted preferences first, but do NOT touch the page yet: the browser keeps showing
	// its own raw JSON untouched. Theming the page before the tree is ready would recolor that raw
	// text for a frame ("raw in different colors") before the formatted view appears.
	const [theme, wrap, caseSensitive, indent]: [Theme, boolean, boolean, IndentOption] = await Promise.all([loadTheme(), getWrap(), getCaseSensitive(), getIndent()]);
	let currentIndent: IndentOption = indent;

	const depth: ResolvedExpansionDepth = resolveInitialExpansionDepth(detected.value, detected.rawByteLength, preference);

	// Build UI off-DOM, then swap in one shot. Only the root is opened synchronously, whatever the depth
	// preference says: rendering straight to depth N builds every one of those nodes in one blocking task
	// (21 900 lines for a 3 MB document), which freezes the tab and cannot paint a preloader from inside
	// itself. Reaching the wanted depth is an ordinary batched expansion, run below after mounting.
	const root: HTMLDivElement = createElement('div', 'fjf-root');
	const toolbar: HTMLDivElement = createElement('div', 'fjf-toolbar');

	// The tree reads the indent through a getter, so a value copied off a line always uses the indentation
	// the toolbar shows now - not the one that happened to be selected when the tree was built.
	const tree: Tree = renderJson(detected.value, 1, {indent: (): string => currentIndent.indent});
	const treeEl: HTMLDivElement = tree.el;
	treeEl.style.setProperty('--fjf-tab', String(currentIndent.ch));
	const search: Search = createSearch(tree, detected.value, {caseSensitive, onCaseChange: setCaseSensitive});

	// Raw view shows the original JSON text exactly as served.
	const rawPre: HTMLPreElement = createElement('pre', 'fjf-raw', detected.raw);
	rawPre.hidden = true;

	const formattedBtn: HTMLButtonElement = button('Formatted', 'Show the interactive tree');
	const rawBtn: HTMLButtonElement = button('Raw', 'Show the original JSON text');
	formattedBtn.classList.add('fjf-active-view');

	const expandBtn: HTMLButtonElement = button(EXPAND_LABEL, 'Expand every node');
	const collapseBtn: HTMLButtonElement = button('Collapse all', 'Collapse every node (stops an expansion in progress)');
	const clearLineBtn: HTMLButtonElement = button('Clear line', 'Unhighlight the linked line and drop #L from the URL');
	// The separator belongs to the button: it comes and goes with it, or it would sit at the end of the
	// toolbar with nothing after it.
	const clearLineSeparator: HTMLSpanElement = separator();
	clearLineBtn.hidden = true;
	clearLineSeparator.hidden = true;

	const wrapBtn: HTMLButtonElement = button('Wrap', 'Toggle wrapping of long lines');
	const indentSel: HTMLSelectElement = indentSelect(currentIndent);
	const copyBtn: HTMLButtonElement = button('Copy raw', 'Copy the raw JSON to the clipboard');
	const copyFmtBtn: HTMLButtonElement = button('Copy formatted', 'Copy the indented JSON as shown');

	const progressBar: HTMLProgressElement = createElement('progress', 'fjf-progress');
	progressBar.max = 100;
	progressBar.value = 0;
	const progressLabel: HTMLSpanElement = createElement('span', 'fjf-progress-label', '0%');
	const loadingBox: HTMLDivElement = createElement('div', 'fjf-loading');
	loadingBox.append(createElement('span', 'fjf-loading-text', 'Building the tree…'), progressBar, progressLabel);

	let rawView = false;
	let loading = false;
	/** Collections the run in progress will walk - the denominator of its progress. */
	let runTotal = 0;
	/** The line a #L link points at, while one does. Drives both the highlight and the Clear line button. */
	let targetLine: HTMLElement | null = null;

	/**
	 * One place decides every control's state. A half-expanded tree is not a tree the user can act on -
	 * every control that touches it stays off until the run finishes. Collapse all is the exception: it
	 * is what cancels the run.
	 *
	 * The tree also comes off screen while it is being built, and that is not cosmetic: an expansion
	 * appends nodes in ~60 batches, and an on-screen tree is laid out again after every one of them, which
	 * is quadratic - 64s to expand a 200 kB document. Hidden, the same run takes 1.4s, and the single
	 * layout at the end costs 4s. The preloader is what the user watches instead.
	 */
	function syncControls(): void {
		treeEl.hidden = rawView || loading;
		rawPre.hidden = !rawView;
		formattedBtn.classList.toggle('fjf-active-view', !rawView);
		rawBtn.classList.toggle('fjf-active-view', rawView);
		formattedBtn.disabled = loading;
		rawBtn.disabled = loading;
		expandBtn.disabled = loading || rawView;
		expandBtn.textContent = loading ? EXPANDING_LABEL : EXPAND_LABEL;
		collapseBtn.disabled = rawView;
		wrapBtn.disabled = loading || rawView;
		indentSel.disabled = loading || rawView;
		copyFmtBtn.disabled = loading || rawView;
		// Nothing to clear until a line is actually marked - the button appears with the highlight it undoes,
		// rather than sitting in the toolbar permanently greyed out.
		const noLineToClear: boolean = targetLine === null || rawView;
		clearLineBtn.hidden = noLineToClear;
		clearLineSeparator.hidden = noLineToClear;
		// Search reveals a branch and scrolls to it - there is nothing to scroll to while the tree is off
		// screen, so it goes away for the duration rather than pretending to work.
		search.setEnabled(!rawView && !loading);
		loadingBox.hidden = !loading;
	}

	function onRunningChange(running: boolean): void {
		loading = running;
		syncControls();
	}

	function onProgress(walked: number): void {
		const percent: number = runTotal === 0 ? 100 : Math.min(100, Math.round((walked / runTotal) * 100));
		progressBar.value = percent;
		progressLabel.textContent = `${percent}%`;
	}

	const expansion: ExpansionController = createExpansionController(tree, {onRunningChange, onProgress});

	/** Every expansion goes through here: the progress bar needs the run's own denominator up front. */
	function expandTo(maxDepth: number): Promise<void> {
		runTotal = countCollections(detected.value, maxDepth);
		return expansion.expandAll(maxDepth);
	}

	expandBtn.addEventListener('click', (): void => void expandTo(Number.POSITIVE_INFINITY));
	collapseBtn.addEventListener('click', (): void => expansion.collapseAll());

	/**
	 * Line links (#L21). The number in the gutter is a ::before pseudo - it cannot take a click and must
	 * not become a real element (a node per line, and the numbers would land in the clipboard whenever the
	 * tree is copied). So the click is caught on the tree instead, and a hit is decided geometrically: the
	 * gutter is sticky at the left edge of the scrollport, so anything left of its right edge is the gutter.
	 * Capture phase, because the line under it is itself a toggle and must not fire.
	 */
	let gutterWidth = 0;

	function gutterPixels(): number {
		if (gutterWidth > 0) {
			return gutterWidth;
		}
		// The root's line starts at the tree's content origin, so the offset of its first inline box - the
		// toggle - is exactly the width the gutter takes, whatever the font, the indent, or the digit count.
		const anchor: HTMLElement | null = treeEl.querySelector<HTMLElement>(':scope > .fjf-entry > .fjf-line > :first-child');
		if (anchor === null) {
			return 0;
		}
		gutterWidth = anchor.getBoundingClientRect().left - treeEl.getBoundingClientRect().left + treeEl.scrollLeft;
		return gutterWidth;
	}

	/**
	 * Bring a line into view. Deliberately not `scrollIntoView()`: a line box is as wide as the widest line
	 * in the document (see .fjf-tree > .fjf-entry in content.css), so the browser decides the line is not
	 * fully visible and nudges the tree sideways to fit more of it in - which slides the text out from under
	 * the reader for no reason. A link lands on a line nobody has seen yet, so it goes to the middle of the
	 * view and to the start of the line; the horizontal position is otherwise the reader's to choose.
	 */
	function scrollToLine(lineEl: HTMLElement): void {
		const centered: number = lineEl.offsetTop - treeEl.clientHeight / 2 + lineEl.offsetHeight / 2;
		treeEl.scrollTop = Math.max(0, centered);
		treeEl.scrollLeft = 0;
	}

	/** Move the highlight (and with it the Clear line button) to a line, or off the tree entirely. */
	function setTargetLine(lineEl: HTMLElement | null): void {
		targetLine?.classList.remove(TARGET_LINE_CLASS);
		targetLine = lineEl;
		lineEl?.classList.add(TARGET_LINE_CLASS);
		syncControls();
	}

	/**
	 * Open the branch that owns `line` (it may never have been rendered) and mark it. `scroll` says whether
	 * the view should move: a link has to travel to the line, but clicking a line's own number must not
	 * move anything - the reader is looking straight at it.
	 */
	function focusLine(line: number, scroll: boolean): void {
		const path = pathAtLine(detected.value, line);
		if (path === null) {
			return;
		}
		const entryEl: HTMLElement | null = tree.reveal(path);
		if (entryEl === null) {
			return;
		}
		// A collection owns two lines (the header and its closing bracket) - mark the one that was asked for.
		const lineEl: HTMLElement | null = entryEl.querySelector<HTMLElement>(`:scope > .fjf-line[data-line="${line}"]`);
		setTargetLine(lineEl);
		if (lineEl !== null && scroll) {
			scrollToLine(lineEl);
		}
	}

	function applyHash(): void {
		if (rawView) {
			return;
		}
		const line: number | null = lineFromHash(window.location.hash);
		if (line === null) {
			setTargetLine(null); // the hash went away (Back, or an edit in the address bar) - so does the mark
			return;
		}
		focusLine(line, true);
	}

	// Clearing is the inverse of a gutter click, and it leaves nothing behind: no highlight, no #L in the
	// URL to copy by accident, and no reload - the tree, its open branches and the scroll position all stay.
	clearLineBtn.addEventListener('click', (): void => {
		setTargetLine(null);
		history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
	});

	treeEl.addEventListener(
		'click',
		(event: MouseEvent): void => {
			const line: string | undefined = (event.target as HTMLElement).closest<HTMLElement>('.fjf-line')?.dataset.line;
			if (line === undefined || event.clientX >= treeEl.getBoundingClientRect().left + gutterPixels()) {
				return; // not a click in the gutter: leave it to the line's own toggle
			}
			event.stopPropagation();
			// replaceState, not location.hash: a hash assignment pushes a history entry per click, and Back
			// would then walk the lines the user visited instead of leaving the page.
			history.replaceState(null, '', `#L${line}`);
			// The reader is already looking at this line - clicking its number must not move the view at all.
			focusLine(Number(line), false);
		},
		true
	);

	window.addEventListener('hashchange', applyHash);

	function setView(raw: boolean): void {
		rawView = raw;
		syncControls();
	}

	formattedBtn.addEventListener('click', (): void => setView(false));
	rawBtn.addEventListener('click', (): void => setView(true));

	treeEl.classList.toggle('fjf-wrap', wrap);
	wrapBtn.classList.toggle('fjf-active-view', wrap);
	wrapBtn.addEventListener('click', (): void => {
		const wrapping: boolean = treeEl.classList.toggle('fjf-wrap');
		wrapBtn.classList.toggle('fjf-active-view', wrapping);
		setWrap(wrapping);
	});

	indentSel.addEventListener('change', (): void => {
		currentIndent = indentById(indentSel.value);
		treeEl.style.setProperty('--fjf-tab', String(currentIndent.ch));
		setIndent(currentIndent.id);
	});

	copyBtn.addEventListener('click', (): void => void copyToClipboard(copyBtn, 'Copy raw', detected.raw));

	// Copy the value re-serialized with the chosen indentation (unicode letters stay literal).
	copyFmtBtn.addEventListener('click', (): void => {
		if (detected.rawByteLength > CONFIRM_SERIALIZE_BYTES) {
			const megabytes: string = (detected.rawByteLength / (1024 * 1024)).toFixed(1);
			const proceed: boolean = window.confirm(`This document is ${megabytes} MB. Re-serializing it may freeze the tab for a moment. Continue?`);
			if (!proceed) {
				return; // no label change: the user did not attempt a copy
			}
		}
		const text: string = JSON.stringify(detected.value, null, currentIndent.indent);
		void copyToClipboard(copyFmtBtn, 'Copy formatted', text);
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

	// Clear line comes and goes with the highlight, so it sits at the end of the group: anywhere else, every
	// control to its right would shift sideways the moment a line is linked or cleared.
	toolbar.append(formattedBtn, rawBtn, separator(), expandBtn, collapseBtn, wrapBtn, indentSel, separator(), copyBtn, copyFmtBtn, clearLineSeparator, clearLineBtn);
	syncControls();

	// Warn when the payload is large enough that rendering/search may feel slow.
	if (detected.rawByteLength > LARGE_BYTES) {
		const megabytes: string = (detected.rawByteLength / (1024 * 1024)).toFixed(1);
		const warn: HTMLSpanElement = createElement('span', 'fjf-warn', `⚠ Large (${megabytes} MB)`);
		warn.title = `This JSON is ${megabytes} MB. Rendering, expand/collapse, and search may be slow.`;
		toolbar.append(warn);
	}

	toolbar.append(spacer, search.el, themeBtn);

	root.append(toolbar, loadingBox, treeEl, rawPre);

	// Atomic swap in one synchronous block (no await between): apply the theme, activate our
	// styles, drop the browser's raw JSON, and insert the tree. The browser paints this as a
	// single transition from plain raw text straight to the themed formatted view - no white
	// flash and no intermediate recolored-raw frame.
	applyTheme(theme);
	document.documentElement.classList.add('fjf-active');
	body.textContent = '';
	body.append(root);

	// The page-world script waits for this to hand the console its `json` handle (see console-handle.ts).
	window.dispatchEvent(new CustomEvent(MOUNTED_EVENT));

	// Reach the preferred depth the same way Expand all does: batched, cancellable, with a preloader.
	// Depth 1 is already on screen - the render above opened the root.
	let initialExpansion: Promise<void> = Promise.resolve();
	if (depth === 'all') {
		initialExpansion = expandTo(Number.POSITIVE_INFINITY);
	} else if (depth > 1) {
		initialExpansion = expandTo(depth);
	}

	// A #L21 the page was opened with is applied once that run is over: the tree is off screen while it
	// expands, and scrolling to a line nobody can see would land wherever the finished layout ends up.
	void initialExpansion.then(applyHash);
}

async function start(): Promise<void> {
	// Cheap first: an ordinary HTML page is rejected here, without reading storage or parsing.
	const candidate: PotentialJsonDocument | null = inspectPotentialJsonDocument(document);
	if (candidate === null) {
		return;
	}

	const [maxMb, preference]: [number, InitialExpansionDepth] = await Promise.all([getMaxMb(), getInitialExpansionDepth()]);

	const detected: Detected | null = parseDetectedJson(candidate, mbToBytes(maxMb));
	if (detected !== null) {
		await mount(detected, preference);
	}
}

void start();
