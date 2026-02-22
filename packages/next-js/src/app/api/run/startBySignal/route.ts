import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";

interface StartBySignalBody {
	projectId?: unknown;
	signalKey?: unknown;
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json()) as StartBySignalBody;
		const projectId =
			typeof body.projectId === "string" ? body.projectId.trim() : "";
		const signalKey =
			typeof body.signalKey === "string" ? body.signalKey.trim() : "";

		if (!projectId) {
			return NextResponse.json(
				{ success: false, error: "projectId is required" },
				{ status: 400 },
			);
		}

		if (!signalKey) {
			return NextResponse.json(
				{ success: false, error: "signalKey is required" },
				{ status: 400 },
			);
		}

		const data = await runService.startRunsBySignal(projectId, signalKey);
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to start runs by signal";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
