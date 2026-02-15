"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import type { KanbanTask } from "@/types/kanban";
import type { Board } from "@/server/types";

export function useTaskModel(projectId: string, taskId: string) {
	const [task, setTask] = useState<KanbanTask | null>(null);
	const [board, setBoard] = useState<Board | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
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

	const handleUpdate = async (id: string, patch: Partial<KanbanTask>) => {
		try {
			if (task && task.id === id) {
				setTask((prev) => (prev ? { ...prev, ...patch } : null));
			}

			const updatedTask = await api.updateTask(id, patch as any);
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
