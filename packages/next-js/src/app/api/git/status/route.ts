import { NextResponse } from "next/server";
import { getVcsManager } from "@/server/vcs/vcs-manager";
import { projectRepo } from "@/server/repositories/project";

export async function GET(request: Request): Promise<Response> {
	try {
		const { searchParams } = new URL(request.url);
		const projectId = searchParams.get("projectId")?.trim() || "";

		if (!projectId) {
			return NextResponse.json(
				{ success: false, error: "projectId is required" },
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

		const vcsManager = getVcsManager();
		const aheadCount = await vcsManager.getAheadCount(project.path);
		return NextResponse.json({ success: true, data: { aheadCount } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to get git status";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
