import {beforeEach, describe, expect, it} from 'vitest';
import {
	clampMaxMb,
	DEFAULT_INDENT,
	DEFAULT_INITIAL_EXPANSION_DEPTH,
	DEFAULT_MAX_MB,
	depthFromValue,
	getCaseSensitive,
	getIndent,
	getInitialExpansionDepth,
	getMaxMb,
	getWrap,
	INDENT_OPTIONS,
	type IndentOption,
	indentById,
	MAX_MANUAL_DEPTH,
	MAX_MAX_MB,
	MIN_MAX_MB,
	mbToBytes,
	setCaseSensitive,
	setIndent,
	setInitialExpansionDepth,
	setMaxMb,
	setWrap
} from '../../src/shared/config.js';
import {installStorageStub, type StorageStub} from '../helpers/storage-stub.js';

let storage: StorageStub;

beforeEach((): void => {
	storage = installStorageStub();
});

describe('clampMaxMb', () => {
	it('keeps in-range values (rounded)', () => {
		expect(clampMaxMb(40)).toBe(40);
		expect(clampMaxMb(12.4)).toBe(12);
		expect(clampMaxMb(12.6)).toBe(13);
	});

	it('clamps below the minimum and above the maximum', () => {
		expect(clampMaxMb(0)).toBe(MIN_MAX_MB);
		expect(clampMaxMb(-5)).toBe(MIN_MAX_MB);
		expect(clampMaxMb(999999)).toBe(MAX_MAX_MB);
		expect(MAX_MAX_MB).toBe(200);
	});

	it('falls back to the default for non-finite input', () => {
		expect(clampMaxMb(NaN)).toBe(DEFAULT_MAX_MB);
		expect(clampMaxMb(Infinity)).toBe(DEFAULT_MAX_MB);
	});
});

describe('mbToBytes', () => {
	it('converts megabytes to bytes', () => {
		expect(mbToBytes(1)).toBe(1024 * 1024);
		expect(mbToBytes(40)).toBe(40 * 1024 * 1024);
	});
});

describe('depthFromValue', () => {
	it('accepts auto, all, and every manual level', () => {
		expect(depthFromValue('auto')).toBe('auto');
		expect(depthFromValue('all')).toBe('all');
		for (let depth = 1; depth <= MAX_MANUAL_DEPTH; depth++) {
			expect(depthFromValue(depth)).toBe(depth);
			expect(depthFromValue(String(depth))).toBe(depth);
		}
	});

	it('falls back to the default for anything else', () => {
		expect(depthFromValue(0)).toBe(DEFAULT_INITIAL_EXPANSION_DEPTH);
		expect(depthFromValue(MAX_MANUAL_DEPTH + 1)).toBe(DEFAULT_INITIAL_EXPANSION_DEPTH);
		expect(depthFromValue(2.5)).toBe(DEFAULT_INITIAL_EXPANSION_DEPTH);
		expect(depthFromValue('deep')).toBe(DEFAULT_INITIAL_EXPANSION_DEPTH);
		expect(depthFromValue(null)).toBe(DEFAULT_INITIAL_EXPANSION_DEPTH);
	});
});

describe('the initial expansion depth preference', () => {
	it('defaults to auto when nothing is stored', async () => {
		await expect(getInitialExpansionDepth()).resolves.toBe('auto');
	});

	it('round-trips through storage', async () => {
		await setInitialExpansionDepth(4);
		await expect(getInitialExpansionDepth()).resolves.toBe(4);

		await setInitialExpansionDepth('all');
		await expect(getInitialExpansionDepth()).resolves.toBe('all');
	});

	it('replaces a corrupted stored value with the default', async () => {
		storage.data['fjf-depth'] = 'nonsense';
		await expect(getInitialExpansionDepth()).resolves.toBe(DEFAULT_INITIAL_EXPANSION_DEPTH);
	});

	it('degrades to the default when storage throws', async () => {
		storage.failReads = true;
		await expect(getInitialExpansionDepth()).resolves.toBe(DEFAULT_INITIAL_EXPANSION_DEPTH);
	});
});

describe('the size limit preference', () => {
	it('defaults when nothing is stored', async () => {
		await expect(getMaxMb()).resolves.toBe(DEFAULT_MAX_MB);
	});

	it('round-trips through storage, clamped on the way in and on the way out', async () => {
		await setMaxMb(9_999);
		expect(storage.data['fjf-max-mb']).toBe(MAX_MAX_MB);

		storage.data['fjf-max-mb'] = 500; // a value written by an older build, or by hand
		await expect(getMaxMb()).resolves.toBe(MAX_MAX_MB);
	});

	it('ignores a stored value that is not a number', async () => {
		storage.data['fjf-max-mb'] = '80';
		await expect(getMaxMb()).resolves.toBe(DEFAULT_MAX_MB);
	});

	it('degrades to the default when storage throws', async () => {
		storage.failReads = true;
		await expect(getMaxMb()).resolves.toBe(DEFAULT_MAX_MB);
	});
});

describe('the boolean preferences', () => {
	it('are off until they are stored', async () => {
		await expect(getWrap()).resolves.toBe(false);
		await expect(getCaseSensitive()).resolves.toBe(false);
	});

	it('round-trip through storage under their own keys', async () => {
		setWrap(true);
		setCaseSensitive(true);

		await expect(getWrap()).resolves.toBe(true);
		await expect(getCaseSensitive()).resolves.toBe(true);
		expect(storage.data['fjf-wrap']).toBe(true);
		expect(storage.data['fjf-case']).toBe(true);
	});

	it('read anything other than a stored `true` as off', async () => {
		storage.data['fjf-wrap'] = 'yes';
		await expect(getWrap()).resolves.toBe(false);
	});

	it('degrade to off when storage throws, and swallow a rejected write', async () => {
		storage.failReads = true;
		storage.failWrites = true;

		expect((): void => setWrap(true)).not.toThrow();
		await expect(getWrap()).resolves.toBe(false);
	});
});

describe('the indentation preference', () => {
	it('lists options with unique ids - they are what storage holds', () => {
		const ids: string[] = INDENT_OPTIONS.map((option: IndentOption): string => option.id);

		expect(new Set(ids).size).toBe(ids.length);
		expect(DEFAULT_INDENT).toBe(INDENT_OPTIONS[0]);
	});

	it('resolves an id to its option, and anything unknown to the default', () => {
		expect(indentById('1t').indent).toBe('\t');
		expect(indentById('8s').ch).toBe(8);
		expect(indentById('nonsense')).toBe(DEFAULT_INDENT);
	});

	it('defaults to two spaces, and round-trips a stored choice', async () => {
		await expect(getIndent()).resolves.toBe(DEFAULT_INDENT);

		setIndent('2t');

		await expect(getIndent()).resolves.toBe(indentById('2t'));
		expect(storage.data['fjf-indent']).toBe('2t');
	});

	it('falls back to the default for a corrupted or unreadable value', async () => {
		storage.data['fjf-indent'] = 42;
		await expect(getIndent()).resolves.toBe(DEFAULT_INDENT);

		storage.failReads = true;
		await expect(getIndent()).resolves.toBe(DEFAULT_INDENT);
	});
});
