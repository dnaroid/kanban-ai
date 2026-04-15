import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";
import { taskRepo } from "@/server/repositories/task";
import { projectRepo } from "@/server/repositories/project";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import type { Run } from "@/types/ipc";

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

		const runs = runService.listByTask(taskId);

		let opencodeWebUrl: string | null = null;
		const task = taskRepo.getById(taskId);
		if (task) {
			const project = projectRepo.getById(task.projectId);
			if (project) {
				try {
					const service = getOpencodeService();
					const port = service.getPort();
					const base64Path = Buffer.from(project.path).toString("base64");
					opencodeWebUrl = `http://localhost:${port}/${base64Path}`;
				} catch {
					opencodeWebUrl = null;
				}
			}
		}

		const data: { runs: Run[]; opencodeWebUrl: string | null } = {
			runs,
			opencodeWebUrl,
		};
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to list runs";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
