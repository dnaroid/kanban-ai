import { NextRequest, NextResponse } from "next/server";
import { boardRepo, runRepo, taskRepo } from "@/server/repositories";
import { projectRepo } from "@/server/repositories/project";
import { tagRepo } from "@/server/repositories/tag";
import { getAgentSessionManager } from "@/server/agent/session-manager";

interface RouteParams {
	params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const project = projectRepo.getById(id);

		if (!project) {
			return NextResponse.json(
				{ success: false, error: "Project not found" },
				{ status: 404 },
			);
		}

		const board = boardRepo.getByProjectId(id);
		if (!board) {
			return NextResponse.json(
				{ success: false, error: "Board not found" },
				{ status: 404 },
			);
		}

		const tags = tagRepo.listAll();
		const tasks = taskRepo.listByBoard(board.id);

		const opencodeWebUrl: string | null = null;

		const latestRunsByTaskId = runRepo.getLatestRunsByTaskIds(
			tasks.map((task) => task.id),
		);

		const enrichedTasks = tasks.map((task) => {
			const latestRun = latestRunsByTaskId.get(task.id);
			return {
				...task,
				latestSessionId: latestRun?.sessionId || null,
				lastExecutionStatus: latestRun?.metadata?.lastExecutionStatus ?? null,
				opencodeWebUrl,
			};
		});

		let busySessionIds: Set<string> = new Set();
		try {
			const stats = await getAgentSessionManager().getActiveSessionCount();
			busySessionIds = new Set(stats.busySessionIds);
		} catch {
			// Session stats unavailable — no busy sessions.
		}

		const tasksWithBusyStatus = enrichedTasks.map((task) => {
			const latestRun = latestRunsByTaskId.get(task.id);
			const isLatestRunActive =
				latestRun?.status === "running" || latestRun?.status === "queued";

			return {
				...task,
				isSessionBusy:
					isLatestRunActive ||
					(task.latestSessionId !== null &&
						busySessionIds.has(task.latestSessionId)),
			};
		});

		return NextResponse.json({
			success: true,
			data: {
				project,
				board,
				tags,
				tasks: tasksWithBusyStatus,
			},
		});
	} catch (error) {
		console.error("[API] Error fetching full board payload:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to fetch full board payload" },
			{ status: 500 },
		);
	}
}
