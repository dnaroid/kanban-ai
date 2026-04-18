export async function register(): Promise<void> {
	if (process.env.NEXT_RUNTIME !== "nodejs") {
		return;
	}

	const { bootstrapOpencodeService } = await import(
		"./server/opencode/opencode-bootstrap"
	);
	void bootstrapOpencodeService();

	const { cleanupStaleUploads } = await import(
		"./server/upload/startup-cleanup"
	);
	void cleanupStaleUploads();
}
