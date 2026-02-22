import { getOpencodeService } from "@/server/opencode/opencode-service";

let startupPromise: Promise<void> | null = null;

declare global {
	var __opencodeBootstrapped: boolean | undefined;
}

export function bootstrapOpencodeService(): Promise<void> {
	if (globalThis.__opencodeBootstrapped) {
		return Promise.resolve();
	}

	if (!startupPromise) {
		startupPromise = getOpencodeService()
			.start()
			.then(() => {
				globalThis.__opencodeBootstrapped = true;
			})
			.catch((error: unknown) => {
				startupPromise = null;
				const message =
					error instanceof Error ? error.message : "Unknown startup error";
				console.error(
					`[opencode-bootstrap] failed to start opencode serve: ${message}`,
				);
			});
	}

	return startupPromise;
}
