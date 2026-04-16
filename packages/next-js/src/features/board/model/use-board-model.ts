import { useCallback, useEffect, useRef, useState } from "react";
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
import { useToast } from "@/components/common/toast/ToastContext";

interface UseBoardModelArgs {
	projectId: string;
}

type PromptAttachment = {
	name: string;
	path?: string;
};

function createBoardPollingViewerId(): string {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}

	return `board-viewer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeQuickRunPrompt(
	prompt: string | null | undefined,
): string {
	return typeof prompt === "string" ? prompt.trim() : "";
}

export function normalizeOptionalRoleId(roleId: unknown): string | null {
	if (typeof roleId !== "string") {
		return null;
	}

	const trimmedRoleId = roleId.trim();
	return trimmedRoleId.length > 0 ? trimmedRoleId : null;
}

export function normalizeQuickRunRawStoryInput(
	prompt: string | null | undefined,
	roleId: unknown,
): { cleanPrompt: string; preferredRoleId: string | null } {
	return {
		cleanPrompt: normalizeQuickRunPrompt(prompt),
		preferredRoleId: normalizeOptionalRoleId(roleId),
	};
}

export function useBoardModel({ projectId }: UseBoardModelArgs) {
	const router = useRouter();
	const pathname = usePathname();
	const { addToast } = useToast();
	const boardPollingViewerIdRef = useRef<string>(createBoardPollingViewerId());
	const [board, setBoard] = useState<Board | null>(null);
	const [tasks, setTasks] = useState<KanbanTask[]>([]);
	const [globalTags, setGlobalTags] = useState<Tag[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);
	const [activeColumn, setActiveColumn] = useState<string | null>(null);
	const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
	const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
	const [isQueueingSignalRuns, setIsQueueingSignalRuns] = useState(false);

	const [deleteTaskConfirm, setDeleteTaskConfirm] = useState<{
		isOpen: boolean;
		taskId: string | null;
	}>({
		isOpen: false,
		taskId: null,
	});
	const [deleteColumnConfirm, setDeleteColumnConfirm] = useState<{
		isOpen: boolean;
		columnId: string | null;
	}>({
		isOpen: false,
		columnId: null,
	});
	const [columnHasTasksConfirm, setColumnHasTasksConfirm] = useState<{
		isOpen: boolean;
	}>({
		isOpen: false,
	});
	const [signalErrorConfirm, setSignalErrorConfirm] = useState<{
		isOpen: boolean;
		message: string | null;
	}>({
		isOpen: false,
		message: null,
	});

	const [dirtyGitConfirm, setDirtyGitConfirm] = useState(false);

	const pendingStoryGenerations = useRef<Map<string, string>>(new Map());
	const pendingSseTaskRefreshIdsRef = useRef<Set<string>>(new Set());
	const sseTaskRefreshDebounceTimerRef = useRef<number | null>(null);

	const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState<{
		isOpen: boolean;
		columnId: string | null;
		taskCount: number;
	}>({
		isOpen: false,
		columnId: null,
		taskCount: 0,
	});

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
	const refreshSingleTaskFromServer = refreshTaskFromServer;

	const scheduleDebouncedBoardTasksRefresh = useCallback(
		(taskId: string) => {
			pendingSseTaskRefreshIdsRef.current.add(taskId);

			if (sseTaskRefreshDebounceTimerRef.current !== null) {
				window.clearTimeout(sseTaskRefreshDebounceTimerRef.current);
			}

			sseTaskRefreshDebounceTimerRef.current = window.setTimeout(() => {
				sseTaskRefreshDebounceTimerRef.current = null;
				pendingSseTaskRefreshIdsRef.current.clear();
				void refreshBoardTasksFromServer();
			}, 100);
		},
		[refreshBoardTasksFromServer],
	);

	const isBoardRoute = pathname === `/board/${projectId}`;

	useEffect(() => {
		if (!isBoardRoute) {
			return;
		}

		const viewerId = boardPollingViewerIdRef.current;
		const refreshBoardPolling = () =>
			api.startProjectBoardPolling(projectId, viewerId).catch((error) => {
				console.error("Failed to start project board polling:", error);
			});

		void refreshBoardPolling();
		const heartbeat = window.setInterval(() => {
			void refreshBoardPolling();
		}, 5_000);

		return () => {
			window.clearInterval(heartbeat);
			void api.stopProjectBoardPolling(projectId, viewerId).catch((error) => {
				console.error("Failed to stop project board polling:", error);
			});
		};
	}, [isBoardRoute, projectId]);

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
		const pendingSseTaskRefreshIds = pendingSseTaskRefreshIdsRef.current;
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
					if (sseTaskRefreshDebounceTimerRef.current !== null) {
						window.clearTimeout(sseTaskRefreshDebounceTimerRef.current);
						sseTaskRefreshDebounceTimerRef.current = null;
					}
					pendingSseTaskRefreshIds.clear();
					void refreshBoardTasksFromServer();
					return;
				}

				if (!payload.taskId) {
					return;
				}

				scheduleDebouncedBoardTasksRefresh(payload.taskId);
			} catch (eventError) {
				console.error("Failed to parse task:event payload:", eventError);
			}
		};

		const onRunEvent = (event: MessageEvent<string>) => {
			try {
				const payload = JSON.parse(event.data) as {
					taskId?: string;
					runId?: string;
					status?: string;
				};
				if (!payload.taskId) {
					return;
				}

				if (
					payload.runId &&
					payload.status === "completed" &&
					pendingStoryGenerations.current.has(payload.runId)
				) {
					const storyTaskId = pendingStoryGenerations.current.get(
						payload.runId,
					)!;
					pendingStoryGenerations.current.delete(payload.runId);
					addToast("User story generated — click to view", "success", {
						duration: 8000,
						onClick: () => {
							router.push(`/board/${projectId}/task/${storyTaskId}`);
						},
					});
				}

				scheduleDebouncedBoardTasksRefresh(payload.taskId);
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
			if (sseTaskRefreshDebounceTimerRef.current !== null) {
				window.clearTimeout(sseTaskRefreshDebounceTimerRef.current);
				sseTaskRefreshDebounceTimerRef.current = null;
			}
			pendingSseTaskRefreshIds.clear();
			eventSource.removeEventListener("task:event", onTaskEvent);
			eventSource.removeEventListener("run:event", onRunEvent);
			eventSource.close();
		};
	}, [
		board,
		projectId,
		refreshBoardTasksFromServer,
		scheduleDebouncedBoardTasksRefresh,
		addToast,
		router,
	]);

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
		const tab = ["question", "running", "in_progress"].includes(task.status)
			? "?tab=runs"
			: "";
		router.push(`/board/${projectId}/task/${task.id}${tab}`);
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
			addToast("Task created successfully", "success");
		} catch (createError) {
			console.error("Failed to create task:", createError);
			addToast("Failed to create task", "error");
		}
	};

	const buildFileUrlFromPath = (filePath: string) => {
		const normalizedPath = filePath.replace(/\\/g, "/");
		const withPrefix = /^[A-Za-z]:\//.test(normalizedPath)
			? `/${normalizedPath}`
			: normalizedPath;
		return `file://${encodeURI(withPrefix)}`;
	};

	const appendFileReferencesToPrompt = (
		prompt: string,
		attachments?: PromptAttachment[],
	) => {
		if (!attachments || attachments.length === 0) {
			return prompt;
		}

		const attachmentMap = new Map<string, PromptAttachment>();
		for (const attachment of attachments) {
			const normalizedName = attachment.name.trim();
			if (!normalizedName) {
				continue;
			}

			const normalizedPath = attachment.path?.trim();
			const key = normalizedPath
				? `path:${normalizedPath}`
				: `name:${normalizedName}`;

			attachmentMap.set(key, {
				name: normalizedName,
				path: normalizedPath,
			});
		}

		const normalizedAttachments = Array.from(attachmentMap.values());

		if (normalizedAttachments.length === 0) {
			return prompt;
		}

		const fileLines = normalizedAttachments.map((attachment) => {
			if (!attachment.path) {
				return `- ${attachment.name}`;
			}

			const normalized = attachment.path.replace(/\\/g, "/");
			const name = normalized.split("/").pop() || attachment.path;
			return `- [${name}](${buildFileUrlFromPath(attachment.path)})`;
		});

		const cleanPrompt = prompt.trimEnd();
		const separator = cleanPrompt.length > 0 ? "\n\n" : "";
		return `${cleanPrompt}${separator}Attached files:\n${fileLines.join("\n")}`;
	};

	const handleQuickGenerateStory = async (
		columnId: string,
		prompt: string,
		selectedAttachments?: PromptAttachment[],
	) => {
		if (!board) {
			throw new Error("Board not found");
		}

		const cleanPrompt = normalizeQuickRunPrompt(prompt);
		if (!cleanPrompt) {
			throw new Error("Prompt cannot be empty");
		}

		const firstLine = cleanPrompt.split(/\r?\n/)[0]?.trim() ?? "";
		const title = (firstLine.length > 0 ? firstLine : cleanPrompt).slice(
			0,
			120,
		);
		const promptWithFiles = appendFileReferencesToPrompt(
			cleanPrompt,
			selectedAttachments,
		);

		try {
			const createdTask = await api.createTask({
				boardId: board.id,
				columnId,
				title,
				description: promptWithFiles,
				priority: "normal",
				difficulty: "medium",
				type: "feature",
				projectId,
				tags: [],
			});

			const { runId } = await api.opencode.generateUserStory({
				taskId: createdTask.id,
			});
			pendingStoryGenerations.current.set(runId, createdTask.id);
			await loadBoard();
			addToast("User story generation started", "info");
		} catch (generateError) {
			console.error("Failed to quick-create generated story:", generateError);
			addToast("Failed to generate user story", "error");
			throw new Error(
				generateError instanceof Error
					? generateError.message
					: "Failed to create and generate story",
			);
		}
	};

	const handleQuickRunRawStory = async (
		columnId: string,
		prompt: string,
		options?: {
			modelName?: string | null;
			roleId?: string | null;
			selectedAttachments?: PromptAttachment[];
		},
	) => {
		if (!board) {
			throw new Error("Board not found");
		}

		const { cleanPrompt, preferredRoleId } = normalizeQuickRunRawStoryInput(
			prompt,
			options?.roleId,
		);
		if (!cleanPrompt) {
			throw new Error("Prompt cannot be empty");
		}

		const firstLine = cleanPrompt.split(/\r?\n/)[0]?.trim() ?? "";
		const title = (firstLine.length > 0 ? firstLine : cleanPrompt).slice(
			0,
			120,
		);
		const promptWithFiles = appendFileReferencesToPrompt(
			cleanPrompt,
			options?.selectedAttachments,
		);

		try {
			const rolesResponse = await api.roles.listFull();
			const roleWithBehavior = rolesResponse.roles.map((role) => {
				try {
					const parsed = JSON.parse(role.preset_json) as {
						behavior?: {
							preferredForStoryGeneration?: unknown;
							quickSelect?: unknown;
							recommended?: unknown;
						};
					};
					return {
						role,
						behavior: {
							preferredForStoryGeneration:
								parsed.behavior?.preferredForStoryGeneration === true,
							quickSelect: parsed.behavior?.quickSelect === true,
							recommended: parsed.behavior?.recommended === true,
						},
					};
				} catch {
					return {
						role,
						behavior: {
							preferredForStoryGeneration: false,
							quickSelect: false,
							recommended: false,
						},
					};
				}
			});

			const executionRoleId =
				preferredRoleId ??
				roleWithBehavior.find(
					(item) =>
						item.behavior.quickSelect &&
						!item.behavior.preferredForStoryGeneration,
				)?.role.id ??
				roleWithBehavior.find(
					(item) =>
						item.behavior.recommended &&
						!item.behavior.preferredForStoryGeneration,
				)?.role.id ??
				roleWithBehavior.find(
					(item) => !item.behavior.preferredForStoryGeneration,
				)?.role.id;

			const createdTask = await api.createTask({
				boardId: board.id,
				columnId,
				title,
				description: promptWithFiles,
				priority: "normal",
				difficulty: "medium",
				type: "feature",
				projectId,
				modelName: options?.modelName ?? null,
				tags: [],
			});

			await api.run.start({
				taskId: createdTask.id,
				roleId: executionRoleId,
				mode: "execute",
				modelName: options?.modelName ?? null,
			});
			await loadBoard();
			addToast("Raw story queued for execution", "success");
		} catch (createError) {
			console.error("Failed to quick-run raw story:", createError);
			addToast("Failed to run raw story", "error");
			throw new Error(
				createError instanceof Error
					? createError.message
					: "Failed to run raw story",
			);
		}
	};

	const handleDeleteTask = (taskId: string) => {
		setDeleteTaskConfirm({ isOpen: true, taskId });
	};

	const confirmDeleteTask = async () => {
		if (!deleteTaskConfirm.taskId) return;
		try {
			await api.deleteTask(deleteTaskConfirm.taskId);
			await loadBoard();
			addToast("Task deleted successfully", "success");
		} catch (deleteError) {
			console.error("Failed to delete task:", deleteError);
			addToast("Failed to delete task", "error");
		} finally {
			setDeleteTaskConfirm({ isOpen: false, taskId: null });
		}
	};

	const handleBulkDelete = (columnId: string, taskCount: number) => {
		if (taskCount === 0) return;
		setBulkDeleteConfirm({ isOpen: true, columnId, taskCount });
	};

	const confirmBulkDelete = async () => {
		if (!bulkDeleteConfirm.columnId) return;
		const columnTasks = tasks.filter(
			(task) => task.columnId === bulkDeleteConfirm.columnId,
		);
		try {
			await Promise.all(columnTasks.map((task) => api.deleteTask(task.id)));
			await loadBoard();
			addToast(
				`Deleted ${columnTasks.length} task${columnTasks.length === 1 ? "" : "s"} successfully`,
				"success",
			);
		} catch (deleteError) {
			console.error("Failed to bulk delete tasks:", deleteError);
			addToast("Failed to delete tasks", "error");
		} finally {
			setBulkDeleteConfirm({ isOpen: false, columnId: null, taskCount: 0 });
		}
	};

	const handleStartReadyTasks = async (force = false) => {
		setIsQueueingSignalRuns(true);
		try {
			const result = await api.run.startReadyTasks({ projectId, force });
			await refreshBoardTasksFromServer();
			addToast("Tasks queued for execution", "success");
			return result;
		} catch (startError) {
			const message =
				startError instanceof Error
					? startError.message
					: "Failed to queue runs";

			if (message.startsWith("DIRTY_GIT:")) {
				throw Object.assign(new Error(message.replace("DIRTY_GIT: ", "")), {
					isDirtyGit: true,
				});
			}

			console.error("Failed to queue runs:", startError);
			addToast("Failed to queue tasks", "error");
			throw new Error(message);
		} finally {
			setIsQueueingSignalRuns(false);
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
			addToast("Column updated", "success");
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
			addToast("Column created", "success");
		}

		setIsColumnModalOpen(false);
		setEditingColumnId(null);
	};

	const handleDeleteColumn = (columnId: string) => {
		if (!board) return;
		if (tasks.filter((task) => task.columnId === columnId).length > 0) {
			setColumnHasTasksConfirm({ isOpen: true });
			return;
		}
		setDeleteColumnConfirm({ isOpen: true, columnId });
	};

	const confirmDeleteColumn = async () => {
		if (!board || !deleteColumnConfirm.columnId) return;

		const newColumns = (board.columns || [])
			.filter((column) => column.id !== deleteColumnConfirm.columnId)
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
			addToast("Column deleted", "success");
		} catch (deleteError) {
			console.error("Failed to delete column:", deleteError);
			addToast("Failed to delete column", "error");
		} finally {
			setDeleteColumnConfirm({ isOpen: false, columnId: null });
		}
	};

	const handleTaskUpdate = async (
		taskId: string,
		patch: Partial<KanbanTask>,
	) => {
		const previousTask = tasks.find((task) => task.id === taskId);
		if (!previousTask) {
			addToast("Task not found", "error");
			return false;
		}

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

		const optimisticTask: KanbanTask = {
			...previousTask,
			...patch,
			updatedAt: new Date().toISOString(),
		};

		setTasks((prev) =>
			prev.map((task) => (task.id === taskId ? optimisticTask : task)),
		);

		try {
			const updatedTask = await api.updateTask(taskId, updateData);
			setTasks((prev) =>
				prev.map((task) =>
					task.id === taskId ? { ...task, ...updatedTask } : task,
				),
			);
			addToast("Task updated", "success");
			return true;
		} catch (updateError) {
			setTasks((prev) =>
				prev.map((task) => (task.id === taskId ? previousTask : task)),
			);
			console.error("Failed to update task:", updateError);
			addToast("Failed to update task", "error");
			return false;
		}
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

	const findColumnBySystemKey = (
		targetSystemKey: string,
	): BoardColumn | undefined =>
		(board?.columns || []).find(
			(column) => column.systemKey === targetSystemKey,
		);

	const handleContextAction = async (
		taskId: string,
		systemKey: string,
	): Promise<void> => {
		if (!board) return;

		try {
			switch (systemKey) {
				case "backlog": {
					const { runId } = await api.opencode.generateUserStory({ taskId });
					pendingStoryGenerations.current.set(runId, taskId);
					await refreshBoardTasksFromServer();
					addToast("User story generation started", "info");
					break;
				}
				case "ready": {
					const targetColumn = findColumnBySystemKey("deferred");
					if (!targetColumn) {
						addToast("Deferred column not found", "error");
						return;
					}
					const newIndex = tasks.filter(
						(task) => task.columnId === targetColumn.id,
					).length;
					await api.moveTask(taskId, targetColumn.id, newIndex);
					await refreshBoardTasksFromServer();
					addToast("Task moved to Deferred", "success");
					break;
				}
				case "deferred": {
					const targetColumn = findColumnBySystemKey("ready");
					if (!targetColumn) {
						addToast("Ready column not found", "error");
						return;
					}
					const newIndex = tasks.filter(
						(task) => task.columnId === targetColumn.id,
					).length;
					await api.moveTask(taskId, targetColumn.id, newIndex);
					await refreshBoardTasksFromServer();
					addToast("Task moved to Ready", "success");
					break;
				}
				case "in_progress": {
					const { runs } = await api.run.listByTask({ taskId });
					const activeRun = runs.find(
						(run) => run.status === "running" || run.status === "queued",
					);

					if (!activeRun) {
						addToast("No active run found for this task", "error");
						return;
					}

					await api.run.cancel({ runId: activeRun.id });
					await refreshBoardTasksFromServer();
					addToast("Run cancelled, task moved to Ready", "success");
					break;
				}
				case "review": {
					const { runs } = await api.run.listByTask({ taskId });
					const completedRun = runs.find((run) => run.status === "completed");
					if (!completedRun) {
						addToast("No completed run found for this task", "error");
						return;
					}
					await api.run.merge({ runId: completedRun.id });
					const closedColumn = findColumnBySystemKey("closed");
					if (closedColumn) {
						const newIndex = tasks.filter(
							(task) => task.columnId === closedColumn.id,
						).length;
						await api.moveTask(taskId, closedColumn.id, newIndex);
					}
					await refreshBoardTasksFromServer();
					addToast("Run merged, task moved to Closed", "success");
					break;
				}
				default:
					break;
			}
		} catch (actionError) {
			console.error("Context action failed:", actionError);
			addToast(
				actionError instanceof Error ? actionError.message : "Action failed",
				"error",
			);
		}
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
		handleQuickGenerateStory,
		handleQuickRunRawStory,
		handleDeleteTask,
		handleColumnSubmit,
		handleDeleteColumn,
		handleTaskUpdate,
		refreshTaskFromServer: refreshSingleTaskFromServer,
		handleContextAction,
		closeColumnModal,
		openEditColumnModal,
		openCreateColumnModal,
		handleStartReadyTasks,
		isQueueingSignalRuns,
		deleteTaskConfirm,
		setDeleteTaskConfirm,
		confirmDeleteTask,
		deleteColumnConfirm,
		setDeleteColumnConfirm,
		confirmDeleteColumn,
		columnHasTasksConfirm,
		setColumnHasTasksConfirm,
		signalErrorConfirm,
		setSignalErrorConfirm,
		dirtyGitConfirm,
		setDirtyGitConfirm,
		bulkDeleteConfirm,
		setBulkDeleteConfirm,
		handleBulkDelete,
		confirmBulkDelete,
	};
}
