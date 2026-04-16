"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import type { KanbanTask, KanbanTaskPatch } from "@/types/kanban";
import type { Board, UpdateTaskInput } from "@/server/types";

function mapPatchToUpdateInput(patch: KanbanTaskPatch): UpdateTaskInput {
	const updateData: UpdateTaskInput = {};

	if (patch.title !== undefined) updateData.title = patch.title;
	if (patch.description !== undefined)
		updateData.description = patch.description;
	if (patch.descriptionMd !== undefined)
		updateData.descriptionMd = patch.descriptionMd;
	if (patch.status !== undefined) updateData.status = patch.status;
	if (patch.blockedReason !== undefined)
		updateData.blockedReason = patch.blockedReason;
	if (patch.closedReason !== undefined)
		updateData.closedReason = patch.closedReason;
	if (patch.priority !== undefined) updateData.priority = patch.priority;
	if (patch.difficulty !== undefined) updateData.difficulty = patch.difficulty;
	if (patch.type !== undefined) updateData.type = patch.type;
	if (patch.columnId !== undefined) updateData.columnId = patch.columnId;
	if (patch.orderInColumn !== undefined)
		updateData.orderInColumn = patch.orderInColumn;
	if (patch.tags !== undefined) updateData.tags = JSON.stringify(patch.tags);
	if (patch.startDate !== undefined) updateData.startDate = patch.startDate;
	if (patch.dueDate !== undefined) updateData.dueDate = patch.dueDate;
	if (patch.estimatePoints !== undefined)
		updateData.estimatePoints = patch.estimatePoints;
	if (patch.estimateHours !== undefined)
		updateData.estimateHours = patch.estimateHours;
	if (patch.assignee !== undefined) updateData.assignee = patch.assignee;
	if (patch.modelName !== undefined) updateData.modelName = patch.modelName;

	return updateData;
}

export function useTaskModel(projectId: string, taskId: string) {
	const [task, setTask] = useState<KanbanTask | null>(null);
	const [board, setBoard] = useState<Board | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const refreshTaskFromServer = useCallback(async () => {
		try {
			const nextTask = await api.getTask(taskId);
			if (nextTask) {
				setTask(nextTask);
			}
		} catch (err) {
			console.error("Failed to refresh task from server:", err);
		}
	}, [taskId]);

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const [taskData, boardData] = await Promise.all([
				api.getTask(taskId),
				api.getBoardByProject(projectId),
			]);

			if (!taskData) {
				setError("Task not found");
			} else {
				setTask(taskData);
			}

			setBoard(boardData);
		} catch (err) {
			console.error("Failed to load task data:", err);
			setError("Failed to load data");
		} finally {
			setLoading(false);
		}
	}, [projectId, taskId]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	useEffect(() => {
		const token = localStorage.getItem("token");
		const params = new URLSearchParams();
		const terminalStatuses = new Set([
			"completed",
			"failed",
			"cancelled",
			"timeout",
			"paused",
		]);
		const pendingRefreshes = new Set<number>();
		if (token) {
			params.set("token", token);
		}

		const query = params.toString();
		const eventSource = new EventSource(
			query.length > 0 ? `/events?${query}` : "/events",
		);

		const onRunEvent = (event: MessageEvent<string>) => {
			try {
				const payload = JSON.parse(event.data) as {
					taskId?: string;
					status?: string;
				};

				if (!payload.taskId || payload.taskId !== taskId) {
					return;
				}

				void refreshTaskFromServer();

				if (payload.status && terminalStatuses.has(payload.status)) {
					const timerId = window.setTimeout(() => {
						pendingRefreshes.delete(timerId);
						void refreshTaskFromServer();
					}, 600);
					pendingRefreshes.add(timerId);
				}
			} catch (err) {
				console.error("Failed to parse run:event payload:", err);
			}
		};

		const onTaskEvent = (event: MessageEvent<string>) => {
			try {
				const payload = JSON.parse(event.data) as {
					taskId?: string;
				};

				if (!payload.taskId || payload.taskId !== taskId) {
					return;
				}

				void refreshTaskFromServer();
			} catch (err) {
				console.error("Failed to parse task:event payload:", err);
			}
		};

		eventSource.addEventListener("run:event", onRunEvent);
		eventSource.addEventListener("task:event", onTaskEvent);

		eventSource.onerror = (event) => {
			console.error("Task model SSE error:", event);
		};

		return () => {
			eventSource.removeEventListener("run:event", onRunEvent);
			eventSource.removeEventListener("task:event", onTaskEvent);
			eventSource.close();
			for (const timerId of pendingRefreshes) {
				window.clearTimeout(timerId);
			}
			pendingRefreshes.clear();
		};
	}, [taskId, refreshTaskFromServer]);

	const handleUpdate = async (id: string, patch: KanbanTaskPatch) => {
		try {
			if (task && task.id === id) {
				setTask((prev) => (prev ? { ...prev, ...patch } : null));
			}

			const updatedTask = await api.updateTask(
				id,
				mapPatchToUpdateInput(patch),
			);
			if (updatedTask) {
				setTask(updatedTask);
			}
		} catch (err) {
			console.error("Failed to update task:", err);
			loadData();
		}
	};

	const column = board?.columns.find((c) => c.id === task?.columnId);

	return {
		task,
		columnName: column?.name,
		columnSystemKey: column?.systemKey ?? null,
		loading,
		error,
		handleUpdate,
		board,
	};
}
