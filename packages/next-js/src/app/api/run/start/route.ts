import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";

interface StartRunBody {
	taskId?: unknown;
	roleId?: unknown;
	mode?: unknown;
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json()) as StartRunBody;
		const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";

		if (!taskId) {
			return NextResponse.json(
				{ success: false, error: "taskId is required" },
				{ status: 400 },
			);
		}

		const roleId =
			typeof body.roleId === "string" && body.roleId.trim().length > 0
				? body.roleId.trim()
				: undefined;
		const mode =
			typeof body.mode === "string" && body.mode.trim().length > 0
				? body.mode.trim()
				: undefined;

		const data = await runService.start({ taskId, roleId, mode });
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to start run";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
