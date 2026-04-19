import { NextRequest, NextResponse } from "next/server";
import { boardRepo, taskRepo, uploadRepo } from "@/server/repositories";
import { projectRepo } from "@/server/repositories/project";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";
import { runService } from "@/server/run/run-service";
import type { UpdateTaskInput } from "@/server/types";
import { publishSseEvent } from "@/server/events/sse-broker";
import { deleteUploadFile } from "@/server/upload/upload-storage";
import {
	canTransitionColumn,
	canTransitionStatus,
	getDefaultStatusForWorkflowColumn,
	getPreferredColumnIdForStatus,
	getWorkflowColumnSystemKey,
	isStatusAllowedInWorkflowColumn,
	isBlockedReason,
	isClosedReason,
	isWorkflowTaskStatus,
	resolveTaskStatusReasons,
} from "@/server/run/task-state-machine";

interface RouteParams {
	params: Promise<{ id: string }>;
}

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

function isLatestRunActive(taskId: string): boolean {
	const runs = runService.listByTask(taskId);
	if (runs.length === 0) {
		return false;
	}

	const sorted = [...runs].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);
	const status = sorted[0]?.status;
	return status === "running" || status === "queued";
}

function getOpencodeWebUrl(projectId: string): string | null {
	const project = projectRepo.getById(projectId);
	if (!project) {
		return null;
	}

	try {
		const service = getOpencodeService();
		const port = service.getPort();
		const base64Path = Buffer.from(project.path).toString("base64");
		return `http://localhost:${port}/${base64Path}`;
	} catch {
		return null;
	}
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const task = taskRepo.getById(id);

		if (!task) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		const latestSessionId = getLatestSessionId(task.id);

		let openCodeSessionBusy = false;
		if (latestSessionId) {
			try {
				const stats = await getOpencodeSessionManager().getActiveSessionCount();
				openCodeSessionBusy = stats.busySessionIds.includes(latestSessionId);
			} catch {}
		}

		const isSessionBusy = isLatestRunActive(task.id) || openCodeSessionBusy;

		return NextResponse.json({
			success: true,
			data: {
				...task,
				blockedReason: task.blockedReason,
				blockedReasonText: task.blockedReasonText,
				latestSessionId,
				lastExecutionStatus: getLatestExecutionStatus(task.id),
				opencodeWebUrl: getOpencodeWebUrl(task.projectId),
				isSessionBusy,
			},
		});
	} catch (error) {
		console.error("[API] Error fetching task:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to fetch task" },
			{ status: 500 },
		);
	}
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const body = (await request.json()) as UpdateTaskInput;
		const existingTask = taskRepo.getById(id);

		if (!existingTask) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		const board = boardRepo.getById(existingTask.boardId);
		if (!board) {
			return NextResponse.json(
				{ success: false, error: "Board not found" },
				{ status: 400 },
			);
		}

		const requestedStatus = body.status;
		const requestedBlockedReason = body.blockedReason;
		const requestedBlockedReasonText = body.blockedReasonText;
		const requestedClosedReason = body.closedReason;

		if (
			requestedBlockedReason !== undefined &&
			requestedBlockedReason !== null &&
			!isBlockedReason(requestedBlockedReason)
		) {
			return NextResponse.json(
				{ success: false, error: "Unsupported blocked reason" },
				{ status: 400 },
			);
		}

		if (
			requestedClosedReason !== undefined &&
			requestedClosedReason !== null &&
			!isClosedReason(requestedClosedReason)
		) {
			return NextResponse.json(
				{ success: false, error: "Unsupported closed reason" },
				{ status: 400 },
			);
		}

		if (
			requestedStatus !== undefined &&
			!isWorkflowTaskStatus(requestedStatus)
		) {
			return NextResponse.json(
				{ success: false, error: "Unsupported task status" },
				{ status: 400 },
			);
		}

		const currentStatus = isWorkflowTaskStatus(existingTask.status)
			? existingTask.status
			: null;

		if (
			requestedStatus !== undefined &&
			currentStatus &&
			!canTransitionStatus(currentStatus, requestedStatus)
		) {
			return NextResponse.json(
				{ success: false, error: "Status transition is not allowed" },
				{ status: 400 },
			);
		}

		let targetColumnId = body.columnId ?? existingTask.columnId;
		if (requestedStatus !== undefined && body.columnId === undefined) {
			const preferredColumnId = getPreferredColumnIdForStatus(
				board,
				requestedStatus,
			);
			if (preferredColumnId) {
				targetColumnId = preferredColumnId;
			}
		}

		const targetColumn = board.columns.find(
			(column) => column.id === targetColumnId,
		);
		if (!targetColumn) {
			return NextResponse.json(
				{ success: false, error: "Column does not belong to board" },
				{ status: 400 },
			);
		}

		const currentColumnKey = getWorkflowColumnSystemKey(
			board,
			existingTask.columnId,
		);
		const targetColumnKey = getWorkflowColumnSystemKey(board, targetColumn.id);

		if (
			currentColumnKey &&
			targetColumnKey &&
			!canTransitionColumn(currentColumnKey, targetColumnKey)
		) {
			return NextResponse.json(
				{ success: false, error: "Column transition is not allowed" },
				{ status: 400 },
			);
		}

		let resolvedStatus = requestedStatus ?? currentStatus;
		if (targetColumnKey) {
			if (resolvedStatus === null) {
				resolvedStatus = getDefaultStatusForWorkflowColumn(targetColumnKey);
			} else if (
				!isStatusAllowedInWorkflowColumn(resolvedStatus, targetColumnKey)
			) {
				const fallbackStatus = getDefaultStatusForWorkflowColumn(
					targetColumnKey,
					resolvedStatus,
				);

				if (
					currentStatus &&
					!canTransitionStatus(currentStatus, fallbackStatus)
				) {
					return NextResponse.json(
						{
							success: false,
							error: "Status transition is not allowed for target column",
						},
						{ status: 400 },
					);
				}

				resolvedStatus = fallbackStatus;
			}
		}

		const patch: UpdateTaskInput = { ...body };
		delete patch.blockedReason;
		delete patch.closedReason;
		if (requestedBlockedReasonText !== undefined) {
			patch.blockedReasonText = requestedBlockedReasonText;
		}
		if (targetColumnId !== existingTask.columnId) {
			patch.columnId = targetColumnId;
		}
		if (resolvedStatus !== null && resolvedStatus !== existingTask.status) {
			patch.status = resolvedStatus;
		}

		const shouldAutoResolveReasons =
			patch.status !== undefined || patch.columnId !== undefined;

		const effectiveStatus = resolvedStatus ?? currentStatus;
		if (shouldAutoResolveReasons && effectiveStatus !== null) {
			const reasons = resolveTaskStatusReasons(
				effectiveStatus,
				targetColumnKey,
			);
			if (existingTask.blockedReason !== reasons.blockedReason) {
				patch.blockedReason = reasons.blockedReason;
				patch.blockedReasonText =
					reasons.blockedReason === null
						? null
						: existingTask.blockedReasonText;
			}
			if (existingTask.closedReason !== reasons.closedReason) {
				patch.closedReason = reasons.closedReason;
			}
		} else if (targetColumnKey === "blocked") {
			if (requestedBlockedReason !== undefined) {
				patch.blockedReason = requestedBlockedReason;
			}
			if (existingTask.closedReason !== null) {
				patch.closedReason = null;
			}
		} else if (targetColumnKey === "closed") {
			if (requestedClosedReason !== undefined) {
				patch.closedReason = requestedClosedReason;
			}
			if (existingTask.blockedReason !== null) {
				patch.blockedReason = null;
				patch.blockedReasonText = null;
			}
		} else {
			if (existingTask.blockedReason !== null) {
				patch.blockedReason = null;
				patch.blockedReasonText = null;
			}
			if (existingTask.closedReason !== null) {
				patch.closedReason = null;
			}
		}

		const task = taskRepo.update(id, patch);

		if (!task) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		const eventType =
			patch.columnId !== undefined || patch.orderInColumn !== undefined
				? "task:moved"
				: "task:updated";

		publishSseEvent("task:event", {
			taskId: task.id,
			boardId: task.boardId,
			projectId: task.projectId,
			eventType,
			updatedAt: task.updatedAt,
		});

		return NextResponse.json({ success: true, data: task });
	} catch (error) {
		console.error("[API] Error updating task:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to update task" },
			{ status: 500 },
		);
	}
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const existingTask = taskRepo.getById(id);

		if (!existingTask) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		const uploadPaths = uploadRepo.deleteByTask(id);
		for (const filePath of uploadPaths) {
			deleteUploadFile(filePath);
		}

		const deleted = taskRepo.delete(id);

		if (!deleted) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		publishSseEvent("task:event", {
			taskId: id,
			boardId: existingTask.boardId,
			projectId: existingTask.projectId,
			eventType: "task:deleted",
			updatedAt: new Date().toISOString(),
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("[API] Error deleting task:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to delete task" },
			{ status: 500 },
		);
	}
}
