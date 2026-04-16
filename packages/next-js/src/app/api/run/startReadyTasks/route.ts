import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";

interface StartReadyTasksBody {
	projectId?: unknown;
	force?: unknown;
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json()) as StartReadyTasksBody;
		const projectId =
			typeof body.projectId === "string" ? body.projectId.trim() : "";

		if (!projectId) {
			return NextResponse.json(
				{ success: false, error: "projectId is required" },
				{ status: 400 },
			);
		}

		const force = body.force === true;
		const data = await runService.startReadyTasks(projectId, force);
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to start ready tasks";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
