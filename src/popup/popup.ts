import {
	clampMaxMb,
	DEFAULT_INITIAL_EXPANSION_DEPTH,
	DEFAULT_MAX_MB,
	depthFromValue,
	getInitialExpansionDepth,
	getMaxMb,
	type InitialExpansionDepth,
	MAX_MAX_MB,
	MIN_MAX_MB,
	setInitialExpansionDepth,
	setMaxMb
} from '../shared/config.js';

const maxInput: HTMLInputElement = document.getElementById('max-mb') as HTMLInputElement;
const depthSelect: HTMLSelectElement = document.getElementById('initial-depth') as HTMLSelectElement;
const resetBtn: HTMLButtonElement = document.getElementById('reset') as HTMLButtonElement;
const status: HTMLElement = document.getElementById('status') as HTMLElement;

const SAVE_DEBOUNCE_MS = 400;
const STATUS_MS = 1500;

let statusTimer = 0;
let saveTimer = 0;
/** Only the newest save is allowed to write the status, so a slow older save cannot overwrite it. */
let saveSequence = 0;

function flashStatus(text: string, failed: boolean): void {
	status.textContent = text;
	status.classList.toggle('failed', failed);
	window.clearTimeout(statusTimer);
	statusTimer = window.setTimeout((): void => {
		status.textContent = '';
		status.classList.remove('failed');
	}, STATUS_MS);
}

function currentDepth(): InitialExpansionDepth {
	return depthFromValue(depthSelect.value);
}

function currentMaxMb(): number {
	return clampMaxMb(Number(maxInput.value));
}

async function persist(maxMb: number, depth: InitialExpansionDepth): Promise<void> {
	const sequence: number = ++saveSequence;
	try {
		await Promise.all([setMaxMb(maxMb), setInitialExpansionDepth(depth)]);
		if (sequence === saveSequence) {
			flashStatus('Saved', false);
		}
	} catch {
		/* storage may be unavailable - the user needs to know the value did not stick */
		if (sequence === saveSequence) {
			flashStatus('Save failed', true);
		}
	}
}

function saveNow(): void {
	window.clearTimeout(saveTimer);
	void persist(currentMaxMb(), currentDepth());
}

function scheduleSave(): void {
	if (maxInput.value.trim() === '' || !Number.isFinite(Number(maxInput.value))) {
		return; // wait for a valid number
	}
	window.clearTimeout(saveTimer);
	saveTimer = window.setTimeout(saveNow, SAVE_DEBOUNCE_MS);
}

function normalizeOnBlur(): void {
	maxInput.value = String(currentMaxMb());
}

async function init(): Promise<void> {
	maxInput.min = String(MIN_MAX_MB);
	maxInput.max = String(MAX_MAX_MB);

	const [maxMb, depth]: [number, InitialExpansionDepth] = await Promise.all([getMaxMb(), getInitialExpansionDepth()]);
	maxInput.value = String(maxMb);
	depthSelect.value = String(depth);

	maxInput.addEventListener('input', scheduleSave);
	maxInput.addEventListener('blur', normalizeOnBlur);
	depthSelect.addEventListener('change', saveNow);
	resetBtn.addEventListener('click', (): void => {
		maxInput.value = String(DEFAULT_MAX_MB);
		depthSelect.value = String(DEFAULT_INITIAL_EXPANSION_DEPTH);
		saveNow();
	});
}

void init();
