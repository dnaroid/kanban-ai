import { NextResponse } from "next/server";
import { uploadRepo } from "@/server/repositories";
import {
	deleteUploadFile,
	getStaleTtlHours,
} from "@/server/upload/upload-storage";

export async function DELETE() {
	try {
		const staleUploads = uploadRepo.listStale(getStaleTtlHours());

		for (const upload of staleUploads) {
			deleteUploadFile(upload.absolutePath);
			uploadRepo.deleteById(upload.id);
		}

		return NextResponse.json({
			success: true,
			data: { cleaned: staleUploads.length },
		});
	} catch (error) {
		console.error("[API] Error cleaning stale uploads:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to clean stale uploads" },
			{ status: 500 },
		);
	}
}
