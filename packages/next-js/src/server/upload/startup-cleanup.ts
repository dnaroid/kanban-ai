import { uploadRepo } from "@/server/repositories/upload";
import { deleteUploadFile, getStaleTtlHours } from "./upload-storage";

export function cleanupStaleUploads(): void {
	try {
		const staleUploads = uploadRepo.listStale(getStaleTtlHours());

		for (const upload of staleUploads) {
			deleteUploadFile(upload.absolutePath);
			uploadRepo.deleteById(upload.id);
		}

		if (staleUploads.length > 0) {
			console.log(`[Startup] Cleaned ${staleUploads.length} stale uploads`);
		}
	} catch {
		// Non-critical: uploads table may not exist yet (pre-migration)
	}
}
