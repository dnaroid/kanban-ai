import { NextRequest, NextResponse } from "next/server";
import { boardRepo, taskRepo } from "@/server/repositories";
import { projectRepo } from "@/server/repositories/project";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";
import { runService } from "@/server/run/run-service";
import type { CreateTaskInput } from "@/server/types";
import { publishSseEvent } from "@/server/events/sse-broker";
import {
	getDefaultStatusForWorkflowColumn,
	getWorkflowColumnSystemKey,
	isStatusAllowedInWorkflowColumn,
	isWorkflowTaskStatus,
	resolveTaskStatusReasons,
} from "@/server/run/task-state-machine";

function getLatestSessionId(taskId: string): string | null {
	const runs = runService.listByTask(taskId);
	if (runs.length === 0) {
		return null;
	}

	const sorted = [...runs].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);
	return sorted[0]?.sessionId || null;
}

function getLatestExecutionStatus(
	taskId: string,
): import("@/types/ipc").RunLastExecutionStatus | null {
	const runs = runService.listByTask(taskId);
	if (runs.length === 0) {
		return null;
	}

	const sorted = [...runs].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);
	return sorted[0]?.metadata?.lastExecutionStatus ?? null;
}

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const boardId = searchParams.get("boardId");

		if (!boardId) {
			return NextResponse.json(
				{ success: false, error: "boardId query parameter is required" },
				{ status: 400 },
			);
		}

		const tasks = taskRepo.listByBoard(boardId);

		let opencodeWebUrl: string | null = null;
		if (tasks.length > 0) {
			const project = projectRepo.getById(tasks[0].projectId);
			if (project) {
				try {
					const service = getOpencodeService();
					const port = service.getPort();
					const base64Path = Buffer.from(project.path).toString("base64");
					opencodeWebUrl = `http://localhost:${port}/${base64Path}`;
				} catch {
					opencodeWebUrl = null;
				}
			}
		}

		const enrichedTasks = tasks.map((task) => ({
			...task,
			latestSessionId: getLatestSessionId(task.id),
			lastExecutionStatus: getLatestExecutionStatus(task.id),
			opencodeWebUrl,
		}));

		let busySessionIds: Set<string> = new Set();
		try {
			const stats = await getOpencodeSessionManager().getActiveSessionCount();
			busySessionIds = new Set(stats.busySessionIds);
		} catch {
			// OpenCode not running — no busy sessions
		}

		const tasksWithBusyStatus = enrichedTasks.map((task) => ({
			...task,
			isSessionBusy:
				task.latestSessionId !== null &&
				busySessionIds.has(task.latestSessionId),
		}));

		return NextResponse.json({ success: true, data: tasksWithBusyStatus });
	} catch (error) {
		console.error("[API] Error fetching tasks:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to fetch tasks" },
			{ status: 500 },
		);
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json()) as CreateTaskInput;

		if (!body.projectId || !body.boardId || !body.columnId || !body.title) {
			return NextResponse.json(
				{
					success: false,
					error: "projectId, boardId, columnId, and title are required",
				},
				{ status: 400 },
			);
		}

		const board = boardRepo.getById(body.boardId);
		if (!board) {
			return NextResponse.json(
				{ success: false, error: "Board not found" },
				{ status: 400 },
			);
		}

		const targetColumn = board.columns.find(
			(column) => column.id === body.columnId,
		);
		if (!targetColumn) {
			return NextResponse.json(
				{ success: false, error: "Column does not belong to board" },
				{ status: 400 },
			);
		}

		const targetColumnKey = getWorkflowColumnSystemKey(board, targetColumn.id);
		const initialStatus =
			body.status ??
			(targetColumnKey
				? getDefaultStatusForWorkflowColumn(targetColumnKey)
				: getDefaultStatusForWorkflowColumn("ready"));
		if (!isWorkflowTaskStatus(initialStatus)) {
			return NextResponse.json(
				{ success: false, error: "Unsupported task status" },
				{ status: 400 },
			);
		}

		let resolvedStatus = initialStatus;
		if (
			targetColumnKey &&
			!isStatusAllowedInWorkflowColumn(resolvedStatus, targetColumnKey)
		) {
			if (body.status !== undefined) {
				return NextResponse.json(
					{
						success: false,
						error: "Provided status is not allowed in target workflow column",
					},
					{ status: 400 },
				);
			}

			resolvedStatus = getDefaultStatusForWorkflowColumn(
				targetColumnKey,
				resolvedStatus,
			);
		}

		const reasons = resolveTaskStatusReasons(resolvedStatus, targetColumnKey);

		const task = taskRepo.create({
			projectId: body.projectId,
			boardId: body.boardId,
			columnId: body.columnId,
			title: body.title,
			description: body.description,
			status: resolvedStatus,
			blockedReason: reasons.blockedReason,
			closedReason: reasons.closedReason,
			priority: body.priority ?? "normal",
			difficulty: body.difficulty ?? "medium",
			type: body.type ?? "chore",
			tags: body.tags,
			dueDate: body.dueDate,
			modelName: body.modelName,
		});

		publishSseEvent("task:event", {
			taskId: task.id,
			boardId: task.boardId,
			projectId: task.projectId,
			eventType: "task:created",
			updatedAt: task.updatedAt,
		});

		return NextResponse.json({
			success: true,
			data: {
				...task,
				blockedReason: task.blockedReason,
				blockedReasonText: null,
			},
		});
	} catch (error) {
		console.error("[API] Error creating task:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to create task" },
			{ status: 500 },
		);
	}
}
