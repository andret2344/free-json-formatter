import {beforeEach, describe, expect, it, vi} from 'vitest';
import {DEFAULT_MAX_MB, MAX_MAX_MB, MIN_MAX_MB} from '../../src/shared/config.js';
import {type ChromeGlobal, installStorageStub, type StorageStub} from '../helpers/storage-stub.js';

const POPUP_HTML: string = `
	<input id='max-mb' type='number'/>
	<select id='initial-depth'>
		<option value='auto'>Auto</option>
		<option value='1'>1</option>
		<option value='2'>2</option>
		<option value='3'>3</option>
		<option value='4'>4</option>
		<option value='5'>5</option>
		<option value='all'>All</option>
	</select>
	<button id='reset' type='button'></button>
	<output id='status'></output>
`;

interface Popup {
	readonly maxInput: HTMLInputElement;
	readonly depthSelect: HTMLSelectElement;
	readonly resetBtn: HTMLButtonElement;
	readonly status: HTMLElement;
	readonly reload: ReturnType<typeof vi.fn>;
}

let storage: StorageStub;

/** Load popup.ts against a fresh DOM; the module wires itself up on import. */
async function loadPopup(): Promise<Popup> {
	document.body.innerHTML = POPUP_HTML;
	const reload = vi.fn();
	(globalThis as unknown as ChromeGlobal).chrome.tabs.reload = reload;

	vi.resetModules();
	await import('../../src/popup/popup.js');
	await vi.waitFor((): void => expect((document.getElementById('max-mb') as HTMLInputElement).value).not.toBe(''));

	return {
		maxInput: document.getElementById('max-mb') as HTMLInputElement,
		depthSelect: document.getElementById('initial-depth') as HTMLSelectElement,
		resetBtn: document.getElementById('reset') as HTMLButtonElement,
		status: document.getElementById('status') as HTMLElement,
		reload
	};
}

function typeMaxMb(popup: Popup, value: string): void {
	popup.maxInput.value = value;
	popup.maxInput.dispatchEvent(new Event('input', {bubbles: true}));
}

function pickDepth(popup: Popup, value: string): void {
	popup.depthSelect.value = value;
	popup.depthSelect.dispatchEvent(new Event('change', {bubbles: true}));
}

beforeEach((): void => {
	storage = installStorageStub();
});

describe('popup settings', () => {
	it('reads both settings from storage', async () => {
		storage.data['fjf-max-mb'] = 75;
		storage.data['fjf-depth'] = 3;

		const popup = await loadPopup();

		expect(popup.maxInput.value).toBe('75');
		expect(popup.depthSelect.value).toBe('3');
	});

	it('shows auto when no depth is stored', async () => {
		const popup = await loadPopup();
		expect(popup.depthSelect.value).toBe('auto');
	});

	it('replaces a corrupted stored depth with the default', async () => {
		storage.data['fjf-depth'] = 'nonsense';
		const popup = await loadPopup();
		expect(popup.depthSelect.value).toBe('auto');
	});

	it.each(['1', '2', '3', '4', '5', 'auto', 'all'])('saves the depth %s', async (value: string) => {
		const popup = await loadPopup();
		pickDepth(popup, value);

		await vi.waitFor((): void => expect(popup.status.textContent).toBe('Saved'));
		expect(String(storage.data['fjf-depth'])).toBe(value);
	});

	it('clamps the limit to the maximum and the minimum', async () => {
		const popup = await loadPopup();

		typeMaxMb(popup, '9999');
		await vi.waitFor((): void => expect(storage.data['fjf-max-mb']).toBe(MAX_MAX_MB));

		typeMaxMb(popup, '0');
		await vi.waitFor((): void => expect(storage.data['fjf-max-mb']).toBe(MIN_MAX_MB));
	});

	it('saves nothing while the limit field holds no usable number', async () => {
		const popup = await loadPopup();

		typeMaxMb(popup, '');

		await new Promise((resolve: (value: unknown) => void): void => {
			setTimeout(resolve, 500); // past the save debounce
		});
		expect(storage.data['fjf-max-mb']).toBeUndefined();
		expect(popup.status.textContent).toBe('');
	});

	it('normalizes the field on blur', async () => {
		const popup = await loadPopup();
		popup.maxInput.value = '9999';
		popup.maxInput.dispatchEvent(new Event('blur', {bubbles: true}));

		expect(popup.maxInput.value).toBe(String(MAX_MAX_MB));
	});

	it('resets both settings to their defaults', async () => {
		storage.data['fjf-max-mb'] = 120;
		storage.data['fjf-depth'] = 5;
		const popup = await loadPopup();

		popup.resetBtn.click();

		await vi.waitFor((): void => {
			expect(storage.data['fjf-max-mb']).toBe(DEFAULT_MAX_MB);
			expect(storage.data['fjf-depth']).toBe('auto');
		});
		expect(popup.maxInput.value).toBe(String(DEFAULT_MAX_MB));
		expect(popup.depthSelect.value).toBe('auto');
	});

	it('never reloads the active tab', async () => {
		const popup = await loadPopup();

		pickDepth(popup, '2');
		typeMaxMb(popup, '55');
		popup.resetBtn.click();

		await vi.waitFor((): void => expect(storage.data['fjf-max-mb']).toBe(DEFAULT_MAX_MB));
		expect(popup.reload).not.toHaveBeenCalled();
	});

	it('reports "Saved" only after the write went through', async () => {
		const popup = await loadPopup();

		pickDepth(popup, '2');
		expect(popup.status.textContent).toBe(''); // the write has not resolved yet

		await vi.waitFor((): void => expect(popup.status.textContent).toBe('Saved'));
	});

	it('reports "Save failed" when storage rejects', async () => {
		const popup = await loadPopup();
		storage.failWrites = true;

		pickDepth(popup, '2');

		await vi.waitFor((): void => expect(popup.status.textContent).toBe('Save failed'));
		expect(popup.status.classList.contains('failed')).toBe(true);
	});

	it('stores the newest value when changes come in quickly', async () => {
		const popup = await loadPopup();

		typeMaxMb(popup, '11');
		typeMaxMb(popup, '22');
		typeMaxMb(popup, '33');

		await vi.waitFor((): void => expect(popup.status.textContent).toBe('Saved'));
		expect(storage.data['fjf-max-mb']).toBe(33);
	});
});
