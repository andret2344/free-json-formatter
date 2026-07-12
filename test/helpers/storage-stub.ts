/** Minimal in-memory stand-in for chrome.storage.local, enough for the config and popup tests. */
export interface StorageStub {
	readonly data: Record<string, unknown>;
	/** When true, get() rejects - the code under test must degrade to its defaults. */
	failReads: boolean;
	/** When true, set() rejects - the popup must report the failure instead of claiming success. */
	failWrites: boolean;
}

/** `chrome.tabs.reload` is not readonly: the popup tests swap it for a spy to prove the popup never calls it. */
export interface ChromeTabsStub {
	reload: unknown;
}

export interface ChromeStub {
	readonly storage: unknown;
	readonly tabs: ChromeTabsStub;
}

/** The shape the tests pretend `globalThis` has, so the cast that installs the stub needs no inline type. */
export interface ChromeGlobal {
	chrome: ChromeStub;
}

export function installStorageStub(): StorageStub {
	const stub: StorageStub = {data: {}, failReads: false, failWrites: false};

	async function get(key: string): Promise<Record<string, unknown>> {
		if (stub.failReads) {
			throw new Error('storage unavailable');
		}
		return key in stub.data ? {[key]: stub.data[key]} : {};
	}

	async function set(values: Record<string, unknown>): Promise<void> {
		if (stub.failWrites) {
			throw new Error('storage unavailable');
		}
		Object.assign(stub.data, values);
	}

	(globalThis as unknown as ChromeGlobal).chrome = {
		storage: {local: {get, set}},
		tabs: {reload: (): Promise<void> => Promise.resolve()}
	};

	return stub;
}
