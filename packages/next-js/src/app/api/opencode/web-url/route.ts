import { NextResponse } from "next/server";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import { projectRepo } from "@/server/repositories/project";

export async function GET(request: Request): Promise<Response> {
	try {
		const { searchParams } = new URL(request.url);
		const projectId = searchParams.get("projectId")?.trim();

		if (!projectId) {
			return NextResponse.json(
				{ success: false, error: "projectId query parameter is required" },
				{ status: 400 },
			);
		}

		const project = projectRepo.getById(projectId);
		if (!project) {
			return NextResponse.json(
				{ success: false, error: "Project not found" },
				{ status: 404 },
			);
		}

		const service = getOpencodeService();
		const port = service.getPort();
		const base64Path = Buffer.from(project.path).toString("base64");
		const url = `http://localhost:${port}/${base64Path}`;

		return NextResponse.json({ success: true, data: { url } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to get OpenCode web URL";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
