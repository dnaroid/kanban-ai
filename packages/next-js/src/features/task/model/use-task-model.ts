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

	const columnName = board?.columns.find((c) => c.id === task?.columnId)?.name;

	return {
		task,
		columnName,
		loading,
		error,
		handleUpdate,
		board,
	};
}
