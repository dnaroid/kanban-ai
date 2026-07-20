export async function register(): Promise<void> {
	if (process.env.NEXT_RUNTIME !== "nodejs") {
		return;
	}

	const { cleanupStaleUploads } = await import(
		"./server/upload/startup-cleanup"
	);
	void cleanupStaleUploads();
}
