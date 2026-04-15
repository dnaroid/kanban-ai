import { NextResponse } from "next/server";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";

export async function GET(): Promise<Response> {
	try {
		const manager = getOpencodeSessionManager();
		const stats = await manager.getActiveSessionCount();
		return NextResponse.json({ success: true, data: stats });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to get active session stats";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
