import { NextResponse } from "next/server";
import { rejectQuestion } from "@/server/opencode/session-store";

interface QuestionRejectBody {
	sessionId?: unknown;
	requestId?: unknown;
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json()) as QuestionRejectBody;
		const sessionId =
			typeof body.sessionId === "string" ? body.sessionId.trim() : "";
		const requestId =
			typeof body.requestId === "string" ? body.requestId.trim() : "";

		if (!sessionId) {
			return NextResponse.json(
				{ success: false, error: "sessionId is required" },
				{ status: 400 },
			);
		}
		if (!requestId) {
			return NextResponse.json(
				{ success: false, error: "requestId is required" },
				{ status: 400 },
			);
		}

		await rejectQuestion(sessionId, requestId);
		return NextResponse.json({ success: true });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to reject question";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
