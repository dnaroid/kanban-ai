import { NextResponse } from "next/server";
import { getSessionTodos } from "@/server/opencode/session-store";
import type { OpenCodeSessionTodosResponse } from "@/types/ipc";

type RouteParams = { params: Promise<{ sessionId: string }> };

export async function GET(_: Request, { params }: RouteParams) {
	try {
		const { sessionId } = await params;
		const todos = getSessionTodos(sessionId);
		const data: OpenCodeSessionTodosResponse = { sessionId, todos };
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to fetch OpenCode session todos";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
