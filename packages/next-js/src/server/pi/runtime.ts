import { ModelRuntime } from "@earendil-works/pi-coding-agent";

let runtimePromise: Promise<ModelRuntime> | null = null;

export function getPiModelRuntime(): Promise<ModelRuntime> {
	if (!runtimePromise) {
		runtimePromise = ModelRuntime.create().catch((error: unknown) => {
			runtimePromise = null;
			throw error;
		});
	}

	return runtimePromise;
}
