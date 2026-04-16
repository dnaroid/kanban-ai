import { NextResponse } from "next/server";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";

export async function POST(request: Request): Promise<Response> {
	try {
		const url = new URL(request.url);
		const forceParam = url.searchParams.get("force");

		let force = false;
		if (forceParam !== null) {
			force = forceParam === "true";
		} else {
			try {
				const body = await request.json();
				if (typeof body?.force === "boolean") {
					force = body.force;
				}
			} catch {}
		}

		if (!force) {
			const manager = getOpencodeSessionManager();
			const sessionStats = await manager.getActiveSessionCount();
			if (sessionStats.busySessions > 0) {
				return NextResponse.json(
					{
						success: false,
						error: "Cannot restart: active OpenCode sessions in progress",
						busySessions: sessionStats.busySessions,
						totalSessions: sessionStats.totalSessions,
					},
					{ status: 409 },
				);
			}
		}

		const service = getOpencodeService();
		await service.stop();
		await service.start();
		return NextResponse.json({ success: true, data: { restarted: true } });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to restart opencode serve";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
