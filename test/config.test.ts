import {describe, expect, it} from 'vitest';
import {clampMaxMb, DEFAULT_MAX_MB, MAX_MAX_MB, MIN_MAX_MB, mbToBytes} from '../src/config.js';

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
