import { NextResponse } from "next/server";
import { listPendingQuestions } from "@/server/opencode/session-store";

export async function GET(request: Request): Promise<Response> {
	try {
		const url = new URL(request.url);
		const sessionId = url.searchParams.get("sessionId")?.trim() ?? "";
		if (!sessionId) {
			return NextResponse.json(
				{ success: false, error: "sessionId is required" },
				{ status: 400 },
			);
		}
		const questions = await listPendingQuestions(sessionId);
		return NextResponse.json({ success: true, questions });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to list questions";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
