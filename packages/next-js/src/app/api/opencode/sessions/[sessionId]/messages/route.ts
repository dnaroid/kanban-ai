import { NextResponse } from "next/server";
import type {
	OpenCodeSessionMessagesResponse,
	OpencodeSendMessageResponse,
} from "@/types/ipc";
import {
	getSessionMessages,
	sendSessionMessage,
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
		const { searchParams } = new URL(request.url);
		const limit = parseLimit(searchParams.get("limit"));
		const messages = getSessionMessages(sessionId, limit);
		const data: OpenCodeSessionMessagesResponse = { sessionId, messages };
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to fetch OpenCode session messages";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request, { params }: RouteParams) {
	try {
		const { sessionId } = await params;
		const body = (await request.json()) as { message?: unknown };

		if (typeof body.message !== "string" || body.message.trim().length === 0) {
			return NextResponse.json(
				{ success: false, error: "message is required" },
				{ status: 400 },
			);
		}

		sendSessionMessage(sessionId, body.message.trim());
		const data: OpencodeSendMessageResponse = { ok: true };
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to send OpenCode message";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
