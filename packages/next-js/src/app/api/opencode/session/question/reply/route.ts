import { NextResponse } from "next/server";
import { replyToQuestion } from "@/server/opencode/session-store";

interface QuestionReplyBody {
	sessionId?: unknown;
	requestId?: unknown;
	answers?: unknown;
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json()) as QuestionReplyBody;
		const sessionId =
			typeof body.sessionId === "string" ? body.sessionId.trim() : "";
		const requestId =
			typeof body.requestId === "string" ? body.requestId.trim() : "";
		const answers = Array.isArray(body.answers)
			? (body.answers as unknown[]).map((a) =>
					Array.isArray(a)
						? a.filter((s): s is string => typeof s === "string")
						: [],
				)
			: [];

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

		await replyToQuestion(sessionId, requestId, answers);
		return NextResponse.json({ success: true });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to reply to question";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
