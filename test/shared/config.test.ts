import {beforeEach, describe, expect, it} from 'vitest';
import {
	clampMaxMb,
	DEFAULT_INITIAL_EXPANSION_DEPTH,
	DEFAULT_MAX_MB,
	depthFromValue,
	getInitialExpansionDepth,
	MAX_MANUAL_DEPTH,
	MAX_MAX_MB,
	MIN_MAX_MB,
	mbToBytes,
	setInitialExpansionDepth
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
