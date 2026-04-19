import { NextResponse } from "next/server";
import { uploadRepo } from "@/server/repositories";
import type { UploadRecord } from "@/server/repositories/upload";

export async function GET(request: Request): Promise<Response> {
	try {
		const { searchParams } = new URL(request.url);
		const taskId = searchParams.get("taskId")?.trim();

		if (!taskId) {
			return NextResponse.json(
				{ success: false, error: "taskId query parameter is required" },
				{ status: 400 },
			);
		}

		const uploads: UploadRecord[] = uploadRepo.listByTask(taskId);
		return NextResponse.json({ success: true, data: { uploads } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to list uploads by task";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
