import { NextResponse } from "next/server";
import { getOpencodeService } from "@/server/opencode/opencode-service";
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
				// No JSON body or malformed — treat as force=false
			}
		}

		if (!force) {
			const stats = runService.getQueueStats();
			if (stats.totalRunning > 0 || stats.totalQueued > 0) {
				return NextResponse.json(
					{
						success: false,
						error: "Cannot restart: active runs in queue",
						totalRunning: stats.totalRunning,
						totalQueued: stats.totalQueued,
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
