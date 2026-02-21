import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Board, BoardColumn } from "@/server/types";
import type { KanbanTask, Tag, BoardColumnInput } from "@/types/kanban";
import { api } from "@/lib/api-client";

interface UseBoardModelArgs {
	projectId: string;
}

export function useBoardModel({ projectId }: UseBoardModelArgs) {
	const router = useRouter();
	const pathname = usePathname();
	const [board, setBoard] = useState<Board | null>(null);
	const [tasks, setTasks] = useState<KanbanTask[]>([]);
	const [globalTags, setGlobalTags] = useState<Tag[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);
	const [activeColumn, setActiveColumn] = useState<string | null>(null);
	const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
	const [editingColumnId, setEditingColumnId] = useState<string | null>(null);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const normalizeColumns = (
		columns: Array<{
			id?: BoardColumn["id"];
			name: BoardColumn["name"];
			systemKey?: BoardColumn["systemKey"];
			color?: string | null;
		}>,
	): BoardColumnInput[] =>
		columns.map((column, index) => ({
			id: column.id,
			name: column.name,
			systemKey: column.systemKey || "",
			orderIndex: index,
			color: column.color || "",
		}));

	const loadBoard = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			const [boardData, tagsData] = await Promise.all([
				api.getBoardByProject(projectId),
				api.getGlobalTags(),
			]);

			if (!boardData) {
				throw new Error("Board not found");
			}

			setBoard(boardData);
			setGlobalTags(tagsData);

			const tasksData = await api.getTasks(boardData.id);
			setTasks(tasksData);
		} catch (loadError) {
			console.error("Failed to load board:", loadError);
			setError(
				loadError instanceof Error
					? loadError.message
					: "An unknown error occurred",
			);
		} finally {
			setLoading(false);
		}
	}, [projectId]);

	useEffect(() => {
		void loadBoard();
	}, [loadBoard]);

	const refreshTaskFromServer = useCallback(async (taskId: string) => {
		try {
			const nextTask = await api.getTask(taskId);
			if (!nextTask) {
				setTasks((prev) => prev.filter((task) => task.id !== taskId));
				setActiveTask((prev) => (prev && prev.id === taskId ? null : prev));
				return;
			}

			setTasks((prev) =>
				prev.map((task) => (task.id === taskId ? nextTask : task)),
			);

			setActiveTask((prev) => (prev && prev.id === taskId ? nextTask : prev));
		} catch (refreshError) {
			console.error("Failed to refresh board task from server:", refreshError);
		}
	}, []);

	const refreshBoardTasksFromServer = useCallback(async () => {
		if (!board) {
			return;
		}

		try {
			const nextTasks = await api.getTasks(board.id);
			setTasks(nextTasks);
			setActiveTask((prev) => {
				if (!prev) {
					return prev;
				}
				return nextTasks.find((task) => task.id === prev.id) ?? null;
			});
		} catch (refreshError) {
			console.error("Failed to refresh board tasks from server:", refreshError);
		}
	}, [board]);

	const isBoardRoute = pathname === `/board/${projectId}`;

	useEffect(() => {
		if (!isBoardRoute) {
			return;
		}

		void refreshBoardTasksFromServer();
	}, [isBoardRoute, refreshBoardTasksFromServer]);

	useEffect(() => {
		if (!isBoardRoute) {
			return;
		}

		const refreshIfVisible = () => {
			if (document.visibilityState !== "visible") {
				return;
			}

			void refreshBoardTasksFromServer();
		};

		window.addEventListener("focus", refreshIfVisible);
		document.addEventListener("visibilitychange", refreshIfVisible);

		return () => {
			window.removeEventListener("focus", refreshIfVisible);
			document.removeEventListener("visibilitychange", refreshIfVisible);
		};
	}, [isBoardRoute, refreshBoardTasksFromServer]);

	useEffect(() => {
		const token = localStorage.getItem("token");
		const params = new URLSearchParams();
		if (token) {
			params.set("token", token);
		}

		const query = params.toString();
		const eventSource = new EventSource(
			query.length > 0 ? `/events?${query}` : "/events",
		);

		const onTaskEvent = (event: MessageEvent<string>) => {
			try {
				const payload = JSON.parse(event.data) as {
					taskId?: string;
					boardId?: string;
					projectId?: string;
					eventType?: string;
				};

				const matchesBoard =
					(payload.boardId && board && payload.boardId === board.id) ||
					(payload.projectId && payload.projectId === projectId);

				if (matchesBoard && payload.eventType) {
					void refreshBoardTasksFromServer();
					return;
				}

				if (!payload.taskId) {
					return;
				}

				void refreshTaskFromServer(payload.taskId);
			} catch (eventError) {
				console.error("Failed to parse task:event payload:", eventError);
			}
		};

		const onRunEvent = (event: MessageEvent<string>) => {
			try {
				const payload = JSON.parse(event.data) as {
					taskId?: string;
				};
				if (!payload.taskId) {
					return;
				}

				void refreshTaskFromServer(payload.taskId);
			} catch (eventError) {
				console.error("Failed to parse run:event payload:", eventError);
			}
		};

		eventSource.addEventListener("task:event", onTaskEvent);
		eventSource.addEventListener("run:event", onRunEvent);

		eventSource.onerror = (event) => {
			console.error("Board model SSE error:", event);
		};

		return () => {
			eventSource.removeEventListener("task:event", onTaskEvent);
			eventSource.removeEventListener("run:event", onRunEvent);
			eventSource.close();
		};
	}, [board, projectId, refreshTaskFromServer, refreshBoardTasksFromServer]);

	const handleDragStart = (event: DragStartEvent) => {
		if (event.active.data.current?.type === "task") {
			setActiveTask(
				tasks.find((entry) => entry.id === event.active.id) || null,
			);
		} else {
			setActiveColumn(event.active.id as string);
		}
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveTask(null);
		setActiveColumn(null);
		if (!over || !board) {
			return;
		}

		const activeId = active.id as string;
		const overId = over.id as string;
		const columns = board.columns || [];
		const isColumn = columns.some((column) => column.id === activeId);

		if (isColumn) {
			const oldIndex = columns.findIndex((column) => column.id === activeId);
			const newIndex = columns.findIndex((column) => column.id === overId);
			if (oldIndex !== newIndex) {
				const movedColumns = arrayMove(columns, oldIndex, newIndex).map(
					(column, index) => ({
						...column,
						orderIndex: index,
					}),
				);
				setBoard({ ...board, columns: movedColumns });
				const response = await api.updateBoardColumns(
					board.id,
					normalizeColumns(movedColumns),
				);
				setBoard({ ...board, columns: response });
			}
			return;
		}

		const sourceTask = tasks.find((task) => task.id === activeId);
		const targetTask = tasks.find((task) => task.id === overId);
		if (!sourceTask) {
			return;
		}

		const activeColumnId = sourceTask.columnId;
		let overColumnId = targetTask?.columnId || activeColumnId;
		const targetColumn = board.columns?.find((column) => column.id === overId);
		if (targetColumn) {
			overColumnId = targetColumn.id;
		}

		if (activeColumnId === overColumnId) {
			const filtered = tasks
				.filter((task) => task.columnId === activeColumnId)
				.sort((a, b) => a.orderInColumn - b.orderInColumn);
			const oldIndex = filtered.findIndex((task) => task.id === activeId);
			const newIndex = filtered.findIndex((task) => task.id === overId);
			if (oldIndex !== newIndex && targetTask) {
				const updatedTasks = arrayMove(filtered, oldIndex, newIndex);
				updatedTasks.forEach((task, index) => {
					task.orderInColumn = index;
				});

				setTasks((prev) => {
					const others = prev.filter(
						(task) => task.columnId !== activeColumnId,
					);
					return [...others, ...updatedTasks];
				});

				await api.moveTask(activeId, activeColumnId, newIndex);
			}
			return;
		}

		const newIndex = tasks.filter(
			(task) => task.columnId === overColumnId,
		).length;

		setTasks((prev) =>
			prev.map((task) => {
				if (task.id === activeId) {
					return { ...task, columnId: overColumnId, orderInColumn: newIndex };
				}
				return task;
			}),
		);

		await api.moveTask(activeId, overColumnId, newIndex);
	};

	const handleTaskClick = (task: KanbanTask) => {
		router.push(`/board/${projectId}/task/${task.id}`);
	};

	const handleAddTask = async (columnId: string) => {
		if (!board) {
			return;
		}

		try {
			const response = await api.createTask({
				boardId: board.id,
				columnId,
				title: "New Task",
				priority: "normal",
				difficulty: "medium",
				type: "feature",
				projectId,
				tags: [],
			});

			router.push(`/board/${projectId}/task/${response.id}`);
			await loadBoard();
		} catch (createError) {
			console.error("Failed to create task:", createError);
		}
	};

	const handleDeleteTask = async (taskId: string) => {
		if (!confirm("Are you sure you want to delete this task?")) {
			return;
		}

		try {
			await api.deleteTask(taskId);
			await loadBoard();
		} catch (deleteError) {
			console.error("Failed to delete task:", deleteError);
		}
	};

	const handleColumnSubmit = async (name: string, color: string) => {
		if (!board) {
			return;
		}

		if (editingColumnId) {
			const currentColumns = (board.columns || []).map((column) =>
				column.id === editingColumnId
					? { ...column, name: name.trim(), color }
					: {
							id: column.id,
							name: column.name,
							systemKey: column.systemKey,
							color: column.color,
							orderIndex: column.orderIndex,
						},
			);
			setBoard({
				...board,
				columns: board.columns?.map((column) =>
					column.id === editingColumnId
						? { ...column, name: name.trim(), color }
						: column,
				),
			});
			const response = await api.updateBoardColumns(
				board.id,
				normalizeColumns(currentColumns),
			);
			setBoard({ ...board, columns: response });
		} else {
			const currentColumns = (board.columns || []).map(
				({ id, name: columnName, systemKey, color: columnColor }) => ({
					id,
					name: columnName,
					systemKey,
					color: columnColor,
				}),
			);
			const newColumns = [...currentColumns, { name: name.trim(), color }];
			setBoard({
				...board,
				columns: [
					...(board.columns || []),
					{
						id: "temp-" + Date.now(),
						boardId: board.id,
						name: name.trim(),
						systemKey: "",
						color,
						orderIndex: (board.columns || []).length,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					},
				],
			});
			const response = await api.updateBoardColumns(
				board.id,
				normalizeColumns(newColumns),
			);
			setBoard({ ...board, columns: response });
		}

		setIsColumnModalOpen(false);
		setEditingColumnId(null);
	};

	const handleDeleteColumn = async (columnId: string) => {
		if (!board) {
			return;
		}
		if (tasks.filter((task) => task.columnId === columnId).length > 0) {
			alert("Cannot delete column with tasks.");
			return;
		}
		if (!confirm("Are you sure you want to delete this column?")) {
			return;
		}

		const newColumns = (board.columns || [])
			.filter((column) => column.id !== columnId)
			.map(({ id, name, systemKey, color }) => ({
				id,
				name,
				systemKey,
				color,
			}));
		try {
			const response = await api.updateBoardColumns(
				board.id,
				normalizeColumns(newColumns),
			);
			setBoard({ ...board, columns: response });
		} catch (deleteError) {
			console.error("Failed to delete column:", deleteError);
		}
	};

	const handleTaskUpdate = async (
		taskId: string,
		patch: Partial<KanbanTask>,
	) => {
		const updateData: Record<string, unknown> = {};

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
		if (patch.difficulty !== undefined)
			updateData.difficulty = patch.difficulty;
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

		await api.updateTask(taskId, updateData);
		setTasks((prev) =>
			prev.map((task) =>
				task.id === taskId
					? { ...task, ...patch, updatedAt: new Date().toISOString() }
					: task,
			),
		);
	};

	const closeColumnModal = () => {
		setIsColumnModalOpen(false);
		setEditingColumnId(null);
	};

	const openEditColumnModal = (columnId: string) => {
		setEditingColumnId(columnId);
		setIsColumnModalOpen(true);
	};

	const openCreateColumnModal = () => {
		setEditingColumnId(null);
		setIsColumnModalOpen(true);
	};

	return {
		board,
		tasks,
		globalTags,
		loading,
		error,
		activeTask,
		activeColumn,
		isColumnModalOpen,
		editingColumnId,
		sensors,
		columns: board?.columns || [],
		handleDragStart,
		handleDragEnd,
		handleTaskClick,
		handleAddTask,
		handleDeleteTask,
		handleColumnSubmit,
		handleDeleteColumn,
		handleTaskUpdate,
		closeColumnModal,
		openEditColumnModal,
		openCreateColumnModal,
	};
}
