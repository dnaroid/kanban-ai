import { NextResponse } from "next/server";
import { taskRepo } from "@/server/repositories";
import { runRepo } from "@/server/repositories/run";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";

export async function GET() {
	try {
		const statusRows = taskRepo.getProjectIdsWithAttentionStatuses() as Array<{
			projectId: string;
		}>;
		const attentionProjectIds = new Set(statusRows.map((r) => r.projectId));

		let busySessionIds: Set<string> = new Set();
		try {
			const stats = await getOpencodeSessionManager().getActiveSessionCount();
			busySessionIds = new Set(stats.busySessionIds);
		} catch {
			// OpenCode not running — no busy sessions
		}

		const activeRunProjectIds = taskRepo.getProjectIdsWithActiveSessions(
			runRepo,
			busySessionIds,
		) as string[];

		for (const pid of activeRunProjectIds) {
			attentionProjectIds.add(pid);
		}

		return NextResponse.json({
			success: true,
			data: { projectIds: Array.from(attentionProjectIds) },
		});
	} catch (error) {
		console.error("[API] Error fetching project attention:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to fetch project attention" },
			{ status: 500 },
		);
	}
}
