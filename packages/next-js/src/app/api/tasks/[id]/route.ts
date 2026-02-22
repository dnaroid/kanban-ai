import { NextRequest, NextResponse } from "next/server";
import { boardRepo, taskRepo } from "@/server/repositories";
import type { UpdateTaskInput } from "@/server/types";
import { publishSseEvent } from "@/server/events/sse-broker";
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
} from "@/server/workflow/task-workflow-manager";

interface RouteParams {
	params: Promise<{ id: string }>;
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

		return NextResponse.json({ success: true, data: task });
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
			}
		} else {
			if (existingTask.blockedReason !== null) {
				patch.blockedReason = null;
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
