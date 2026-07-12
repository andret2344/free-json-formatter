/** Minimal in-memory stand-in for chrome.storage.local, enough for the config and popup tests. */
export interface StorageStub {
	readonly data: Record<string, unknown>;
	/** When true, get() rejects - the code under test must degrade to its defaults. */
	failReads: boolean;
	/** When true, set() rejects - the popup must report the failure instead of claiming success. */
	failWrites: boolean;
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

	const chromeStub = {
		storage: {local: {get, set}},
		tabs: {reload: (): Promise<void> => Promise.resolve()}
	};
	(globalThis as unknown as {chrome: unknown}).chrome = chromeStub;

	return stub;
}
