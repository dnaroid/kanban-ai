import { NextResponse } from "next/server";
import {
	ensureSessionLive,
	loadSessionSnapshot,
} from "@/server/opencode/session-store";

type RouteParams = { params: Promise<{ sessionId: string }> };

function parseLimit(value: string | null): number | undefined {
	if (!value) return undefined;
	const parsed = Number.parseInt(value, 10);
	if (Number.isNaN(parsed) || parsed <= 0) return undefined;
	return parsed;
}

export async function GET(request: Request, { params }: RouteParams) {
	try {
		const { sessionId } = await params;
		if (!sessionId) {
			return NextResponse.json(
				{ success: false, error: "sessionId is required" },
				{ status: 400 },
			);
		}

		const { searchParams } = new URL(request.url);
		const limit = parseLimit(searchParams.get("limit"));
		const snapshot = await loadSessionSnapshot(sessionId, limit);

		void ensureSessionLive(sessionId).catch(() => {});

		return NextResponse.json({
			success: true,
			data: { ...snapshot, sessionId },
		});
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to load session snapshot";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
