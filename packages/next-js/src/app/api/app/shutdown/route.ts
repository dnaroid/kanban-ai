import { NextResponse } from "next/server";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";
import { runService } from "@/server/run/run-service";

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
			} catch {
				// body is optional — ignore parse failures
			}
		}

		if (!force) {
			const queueStats = runService.getQueueStats();
			if (queueStats.totalRunning > 0 || queueStats.totalQueued > 0) {
				return NextResponse.json(
					{
						success: false,
						error: "Cannot shutdown: active runs in progress",
						totalRunning: queueStats.totalRunning,
						totalQueued: queueStats.totalQueued,
					},
					{ status: 409 },
				);
			}

			const manager = getOpencodeSessionManager();
			const sessionStats = await manager.getActiveSessionCount();
			if (sessionStats.busySessions > 0) {
				return NextResponse.json(
					{
						success: false,
						error: "Cannot shutdown: active OpenCode sessions in progress",
						busySessions: sessionStats.busySessions,
						totalSessions: sessionStats.totalSessions,
					},
					{ status: 409 },
				);
			}
		}

		const service = getOpencodeService();
		await service.stop();

		// Defer process.exit so the HTTP response can flush out first
		setImmediate(() => {
			process.exit(0);
		});

		return NextResponse.json({ success: true, data: { shutdown: true } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to shutdown application";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
