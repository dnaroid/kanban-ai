import { NextRequest, NextResponse } from "next/server";
import { uploadRepo } from "@/server/repositories";
import {
	deleteUploadFile,
	saveUploadFile,
	validateUpload,
} from "@/server/upload/upload-storage";

export async function POST(request: NextRequest) {
	try {
		const formData = await request.formData();
		const files = formData.getAll("files") as File[];

		if (!files || files.length === 0) {
			return NextResponse.json(
				{ success: false, error: "No files provided" },
				{ status: 400 },
			);
		}

		const results: Array<{ uploadId: string; name: string; path: string }> = [];

		for (const file of files) {
			const validationError = validateUpload(file.type, file.size);
			if (validationError) {
				return NextResponse.json(
					{ success: false, error: validationError },
					{ status: 400 },
				);
			}

			const saved = await saveUploadFile(file);

			try {
				const record = uploadRepo.create({
					storedName: saved.storedName,
					originalName: file.name || "clipboard-image",
					absolutePath: saved.absolutePath,
					mimeType: file.type,
					size: saved.size,
				});

				results.push({
					uploadId: record.id,
					name: record.originalName,
					path: record.absolutePath,
				});
			} catch (error) {
				deleteUploadFile(saved.absolutePath);
				throw error;
			}
		}

		return NextResponse.json({ success: true, data: results });
	} catch (error) {
		console.error("[API] Error uploading files:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to upload files" },
			{ status: 500 },
		);
	}
}
