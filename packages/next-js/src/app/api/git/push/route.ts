import { NextResponse } from "next/server";
import { getVcsManager } from "@/server/vcs/vcs-manager";
import { projectRepo } from "@/server/repositories/project";

interface GitPushBody {
	projectId?: unknown;
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json()) as GitPushBody;
		const projectId =
			typeof body.projectId === "string" ? body.projectId.trim() : "";

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
		const result = await vcsManager.push(project.path);
		return NextResponse.json({ success: true, data: result });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Failed to push";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
