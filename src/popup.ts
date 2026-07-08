import {clampMaxMb, DEFAULT_MAX_MB, getMaxMb, MAX_MAX_MB, MIN_MAX_MB, setMaxMb} from './config.js';

const input: HTMLInputElement = document.getElementById('max-mb') as HTMLInputElement;
const resetBtn: HTMLButtonElement = document.getElementById('reset') as HTMLButtonElement;
const status: HTMLElement = document.getElementById('status') as HTMLElement;

let statusTimer = 0;
let reloadTimer = 0;

const RELOAD_DELAY_MS = 500;

function flashStatus(text: string): void {
	status.textContent = text;
	window.clearTimeout(statusTimer);
	statusTimer = window.setTimeout(() => {
		status.textContent = '';
	}, 1500);
}

/** Reload the active tab so the new limit applies to the JSON page immediately. */
function reloadActiveTab(): void {
	void chrome.tabs.reload().catch((): void => undefined);
}

async function save(mb: number): Promise<void> {
	const clamped: number = clampMaxMb(mb);
	await setMaxMb(clamped);
	flashStatus('Saved ✓ Reloading...');
	window.clearTimeout(reloadTimer);
	reloadTimer = window.setTimeout(reloadActiveTab, RELOAD_DELAY_MS);
}

let saveTimer = 0;

function scheduleSave(): void {
	const value: number = Number(input.value);
	if (!Number.isFinite(value) || input.value.trim() === '') {
		return; // wait for a valid number
	}
	window.clearTimeout(saveTimer);
	saveTimer = window.setTimeout((): void => void save(value), 400);
}

function normalizeOnBlur(): void {
	const clamped: number = clampMaxMb(Number(input.value));
	input.value = String(clamped);
}

async function init(): Promise<void> {
	input.min = String(MIN_MAX_MB);
	input.max = String(MAX_MAX_MB);
	input.value = String(await getMaxMb());

	input.addEventListener('input', scheduleSave);
	input.addEventListener('blur', normalizeOnBlur);
	resetBtn.addEventListener('click', () => {
		input.value = String(DEFAULT_MAX_MB);
		void save(DEFAULT_MAX_MB);
	});
}

void init();
