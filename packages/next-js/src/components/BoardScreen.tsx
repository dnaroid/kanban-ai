"use client";

import { closestCenter, DndContext, DragOverlay } from "@dnd-kit/core";
import {
	horizontalListSortingStrategy,
	SortableContext,
} from "@dnd-kit/sortable";
import { AlertCircle, Clock, Plus, Play, Upload, Zap } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { SortableColumn } from "./kanban/board/SortableColumn";
import { SortableTask } from "./kanban/board/SortableTask";
import { QuickCreateModal } from "./kanban/board/QuickCreateModal";
import { RejectModal, type RejectAttachment } from "./kanban/board/RejectModal";
import {
	type ActiveExecutionSessionConfirmationState,
	buildConfirmedReadyStartOptions,
} from "./board/buildConfirmedReadyStartOptions";
import { useBoardModel } from "@/features/board/model/use-board-model";
import { cn } from "@/lib/utils";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { useToast } from "@/components/common/toast/ToastContext";
import { api } from "@/lib/api-client";

interface BoardScreenProps {
	projectId: string;
	projectName: string;
	projectColor?: string;
}

export function BoardScreen({
	projectId,
	projectName,
	projectColor,
}: BoardScreenProps) {
	const { addToast } = useToast();

	const [isQuickCreateModalOpen, setIsQuickCreateModalOpen] = useState(false);
	const [isPushing, setIsPushing] = useState(false);
	const [hasUnpushedCommits, setHasUnpushedCommits] = useState(true);

	const refreshGitStatus = useCallback(() => {
		api.git
			.status({ projectId })
			.then(({ aheadCount }) => {
				setHasUnpushedCommits(aheadCount > 0);
			})
			.catch(() => {
				setHasUnpushedCommits(true);
			});
	}, [projectId]);

	useEffect(() => {
		refreshGitStatus();
	}, [refreshGitStatus]);

	const {
		board,
		tasks,
		globalTags,
		loading,
		error,
		activeTask,
		activeColumn,
		sensors,
		columns,
		handleDragStart,
		handleDragEnd,
		handleTaskClick,
		handleAddTask,
		handleQuickGenerateStory,
		handleStartStoryChat,
		handleQuickSaveDraft,
		handleQuickRunRawStory,
		handleDeleteTask,
		handleTaskUpdate,
		handleStartReadyTasks,
		isQueueingSignalRuns,
		handleContextAction,
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
		handleRejectTask,
		refreshBoardTasksFromServer,
		deletingTaskId,
	} = useBoardModel({ projectId, onTasksRefreshed: refreshGitStatus });

	const [activeExecutionSessionConfirm, setActiveExecutionSessionConfirm] =
		useState<ActiveExecutionSessionConfirmationState | null>(null);

	const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
	const [rejectTaskId, setRejectTaskId] = useState<string | null>(null);
	const [rejectTaskTitle, setRejectTaskTitle] = useState<string>("");

	if (loading)
		return (
			<div className="h-full flex items-center justify-center animate-pulse">
				<Clock className="w-8 h-8 text-blue-400 animate-spin" />
			</div>
		);
	if (error || !board)
		return (
			<div className="h-full flex items-center justify-center text-red-400">
				<AlertCircle className="w-8 h-8 mr-2" /> {error || "Board not found"}
			</div>
		);

	const firstColumnId = columns[0]?.id;
	const readyColumnId = columns.find((col) => col.systemKey === "ready")?.id;
	const hasReadyTasks = readyColumnId
		? tasks.some((t) => t.columnId === readyColumnId)
		: false;
	const startReadyDisabled = isQueueingSignalRuns || !hasReadyTasks;
	const pushDisabled = isPushing || !hasUnpushedCommits;

	const handleOpenRejectModal = (taskId: string) => {
		const task = tasks.find((t) => t.id === taskId);
		setRejectTaskId(taskId);
		setRejectTaskTitle(task?.title ?? "");
		setIsRejectModalOpen(true);
	};

	const handleRejectSubmit = async (
		qaReport: string,
		attachments: RejectAttachment[],
	) => {
		if (!rejectTaskId) return;
		await handleRejectTask(rejectTaskId, qaReport, attachments);
		setIsRejectModalOpen(false);
		setRejectTaskId(null);
	};

	const handleRejectAndRerun = async (
		qaReport: string,
		attachments: RejectAttachment[],
	) => {
		if (!rejectTaskId) return;
		const taskId = rejectTaskId;

		let fullReport = qaReport;
		if (attachments.length > 0) {
			fullReport +=
				"\n\nAttached files:\n" +
				attachments
					.map((a) => `- ${a.name}${a.path ? ` (${a.path})` : ""}`)
					.join("\n");
		}

		try {
			await api.task.reject({ taskId, qaReport: fullReport });
		} catch (rejectError) {
			console.error("Reject failed:", rejectError);
			return;
		}

		await refreshBoardTasksFromServer();

		setIsRejectModalOpen(false);
		setRejectTaskId(null);

		try {
			await api.run.start({ taskId });
			addToast("Task rejected and re-run started", "success");
		} catch (runError) {
			console.error("Run start failed after reject:", runError);
			await refreshBoardTasksFromServer();
		}
	};

	const handleReadyStartRequest = async () => {
		try {
			await handleStartReadyTasks();
		} catch (startError) {
			if (
				startError instanceof Error &&
				(startError as Error & { isDirtyGit?: boolean }).isDirtyGit
			) {
				setDirtyGitConfirm({ type: "startReady" });
				return;
			}

			if (
				startError instanceof Error &&
				(startError as Error & { isActiveExecutionSessionRisk?: boolean })
					.isActiveExecutionSessionRisk
			) {
				setActiveExecutionSessionConfirm({
					message: startError.message,
					forceDirtyGit: false,
				});
				return;
			}

			const message =
				startError instanceof Error
					? startError.message
					: "Failed to start the next Ready task";
			setSignalErrorConfirm({ isOpen: true, message });
			// Error toast handled by ApiClient.onError.
		}
	};

	const handleDirtyGitConfirmStart = async () => {
		const confirmState = dirtyGitConfirm;
		setDirtyGitConfirm(false);

		if (!confirmState) return;

		try {
			if (confirmState.type === "individualRun") {
				await api.run.start({
					taskId: confirmState.taskId,
					forceDirtyGit: true,
				});
				return;
			}
			if (confirmState.type === "quickRunRaw") {
				await handleQuickRunRawStory(
					confirmState.columnId,
					confirmState.prompt,
					{
						...confirmState.options,
						forceDirtyGit: true,
					},
				);
				return;
			}
			await handleStartReadyTasks({ forceDirtyGit: true });
		} catch (forceError) {
			if (
				forceError instanceof Error &&
				(forceError as Error & { isActiveExecutionSessionRisk?: boolean })
					.isActiveExecutionSessionRisk
			) {
				setActiveExecutionSessionConfirm({
					message: forceError.message,
					forceDirtyGit: true,
				});
				return;
			}

			const message =
				forceError instanceof Error
					? forceError.message
					: "Failed to start the next Ready task";
			setSignalErrorConfirm({ isOpen: true, message });
			// Error toast handled by ApiClient.onError.
		}
	};

	const handleContextActionWithDirtyGitCheck = async (
		taskId: string,
		systemKey: string,
	) => {
		try {
			await handleContextAction(taskId, systemKey);
		} catch (actionError) {
			if (
				actionError instanceof Error &&
				(actionError as Error & { isDirtyGit?: boolean }).isDirtyGit
			) {
				setDirtyGitConfirm({ type: "individualRun", taskId });
				return;
			}
			console.error("Context action failed:", actionError);
		}
	};

	const handleActiveExecutionConfirmStart = async () => {
		const confirmation = activeExecutionSessionConfirm;
		const requestOptions = buildConfirmedReadyStartOptions(confirmation);
		if (!requestOptions) {
			return;
		}

		try {
			await handleStartReadyTasks(requestOptions);
		} catch (forceError) {
			const message =
				forceError instanceof Error
					? forceError.message
					: "Failed to start the next Ready task";
			setSignalErrorConfirm({ isOpen: true, message });
			// Error toast handled by ApiClient.onError.
		}
	};

	return (
		<div
			className="flex flex-col h-full overflow-hidden"
			data-testid="project-board"
		>
			<div className="relative z-10 flex items-center gap-3 px-8 py-2 border-b border-slate-800/50 bg-slate-900/20 backdrop-blur-md shrink-0">
				<div className="flex items-center gap-2 shrink-0">
					{projectColor && (
						<div
							className="w-3 h-3 rounded-full shrink-0"
							style={{ backgroundColor: projectColor }}
						/>
					)}
					<h2 className="text-lg font-bold text-slate-200">{projectName}</h2>
				</div>

				<div className="flex-1" />

				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => {
							if (firstColumnId) void handleAddTask(firstColumnId);
						}}
						data-testid="create-task-button"
						className="flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-semibold transition-all bg-violet-600 text-white hover:bg-violet-500 shadow-lg shadow-violet-900/20 cursor-pointer"
						title="Create a new task"
					>
						<Plus className="w-4 h-4" />
						New Task
					</button>
					<button
						type="button"
						onClick={() => setIsQuickCreateModalOpen(true)}
						className="flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-semibold transition-all bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20 cursor-pointer"
						title="Quick Create Task"
					>
						<Zap className="w-4 h-4" />
						Instant Task
					</button>
					<button
						type="button"
						onClick={() => {
							void handleReadyStartRequest();
						}}
						disabled={startReadyDisabled}
						className={cn(
							"flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-semibold transition-all cursor-pointer",
							startReadyDisabled
								? "bg-slate-800 text-slate-500 cursor-not-allowed"
								: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20",
						)}
						title={
							isQueueingSignalRuns
								? "Starting..."
								: !hasReadyTasks
									? "No tasks in Ready column"
									: "Start the next Ready task"
						}
					>
						<Play className="w-4 h-4" />
						{isQueueingSignalRuns ? "Starting..." : "Start Ready"}
					</button>
					<button
						type="button"
						onClick={() => {
							setIsPushing(true);
							api.git
								.push({ projectId })
								.then(() => {
									addToast("Pushed successfully", "success");
								})
								.catch(() => {
									// Error toast handled by ApiClient.onError.
								})
								.finally(() => {
									setIsPushing(false);
									refreshGitStatus();
								});
						}}
						disabled={pushDisabled}
						className={cn(
							"flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-semibold transition-all cursor-pointer",
							pushDisabled
								? "bg-slate-800 text-slate-500 cursor-not-allowed"
								: "bg-slate-700 text-slate-200 hover:bg-slate-600",
						)}
						title={
							isPushing
								? "Pushing..."
								: !hasUnpushedCommits
									? "Nothing to push"
									: "Push current branch to origin"
						}
					>
						<Upload className="w-4 h-4" />
						{isPushing ? "Pushing..." : "Push"}
					</button>
				</div>
			</div>

			<main className="flex-1 overflow-hidden relative">
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
				>
					<div className="h-full overflow-x-auto custom-scrollbar">
						<div className="inline-flex h-full items-stretch gap-0 pl-5 pr-5 pt-5 pb-0">
							<SortableContext
								items={columns.map((c) => c.id)}
								strategy={horizontalListSortingStrategy}
							>
								{columns.map((column) => (
									<SortableColumn
										key={column.id}
										id={column.id}
										name={column.name}
										color={column.color || ""}
										systemKey={column.systemKey}
										globalTags={globalTags}
										tasks={tasks
											.filter((t) => t.columnId === column.id)
											.sort((a, b) =>
												column.systemKey === "review" ||
												column.systemKey === "closed"
													? b.updatedAt.localeCompare(a.updatedAt)
													: a.orderInColumn - b.orderInColumn,
											)}
										onTaskClick={handleTaskClick}
										onDeleteTask={handleDeleteTask}
										onBulkDelete={handleBulkDelete}
										onContextAction={handleContextActionWithDirtyGitCheck}
										onUpdateTask={handleTaskUpdate}
										onRejectAction={handleOpenRejectModal}
										deletingTaskId={deletingTaskId}
									/>
								))}
							</SortableContext>
						</div>
					</div>

					<DragOverlay>
						{activeTask ? (
							<div className="w-80 rotate-3 scale-105 pointer-events-none">
								<SortableTask task={activeTask} globalTags={globalTags} />
							</div>
						) : activeColumn ? (
							<div className="bg-[#11151C]/80 border-2 border-blue-500 rounded-2xl w-80 shadow-2xl rotate-2 opacity-90 p-4 pointer-events-none backdrop-blur-md h-[calc(100vh-180px)] flex flex-col">
								<div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800/50">
									<h3 className="text-sm font-bold text-white">
										{columns.find((c) => c.id === activeColumn)?.name}
									</h3>
									<span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-full shrink-0">
										{tasks.filter((t) => t.columnId === activeColumn).length}
									</span>
								</div>
								<div className="flex-1 space-y-3">
									{[1, 2, 3].map((i) => (
										<div
											key={i}
											className="w-full h-24 bg-slate-800/20 rounded-xl border border-slate-700/50 animate-pulse"
										/>
									))}
								</div>
							</div>
						) : null}
					</DragOverlay>
				</DndContext>

				<QuickCreateModal
					projectId={projectId}
					isOpen={isQuickCreateModalOpen}
					onClose={() => setIsQuickCreateModalOpen(false)}
					onGenerateStory={async (
						prompt,
						selectedAttachments,
						modelName,
						runAfterGenerate,
					) => {
						if (firstColumnId) {
							await handleQuickGenerateStory(
								firstColumnId,
								prompt,
								selectedAttachments,
								modelName,
								runAfterGenerate,
							);
						}
					}}
					onStartStoryChat={async (prompt, modelName, selectedAttachments) => {
						if (!firstColumnId) {
							throw new Error("Backlog column is not available");
						}
						return handleStartStoryChat(
							firstColumnId,
							prompt,
							selectedAttachments,
							modelName,
						);
					}}
					onRunRawStory={async (prompt, modelName, selectedAttachments) => {
						if (!firstColumnId) {
							return;
						}
						try {
							await handleQuickRunRawStory(firstColumnId, prompt, {
								modelName,
								selectedAttachments,
							});
						} catch (runError) {
							if (
								runError instanceof Error &&
								(runError as Error & { isDirtyGit?: boolean }).isDirtyGit
							) {
								setDirtyGitConfirm({
									type: "quickRunRaw",
									columnId: firstColumnId,
									prompt,
									options: {
										modelName,
										selectedAttachments,
									},
								});
								return;
							}
							throw runError;
						}
					}}
					onSaveDraft={async (prompt, selectedAttachments) => {
						if (firstColumnId) {
							await handleQuickSaveDraft(
								firstColumnId,
								prompt,
								selectedAttachments,
							);
						}
					}}
				/>

				<ConfirmationModal
					isOpen={deleteTaskConfirm.isOpen}
					onClose={() => setDeleteTaskConfirm({ isOpen: false, taskId: null })}
					onConfirm={confirmDeleteTask}
					title="Delete Task"
					description="Are you sure you want to delete this task? This action cannot be undone."
					confirmLabel="Delete Task"
				/>

				<ConfirmationModal
					isOpen={deleteColumnConfirm.isOpen}
					onClose={() =>
						setDeleteColumnConfirm({ isOpen: false, columnId: null })
					}
					onConfirm={confirmDeleteColumn}
					title="Delete Column"
					description="Are you sure you want to delete this column? All tasks must be moved out of the column first."
					confirmLabel="Delete Column"
				/>

				<ConfirmationModal
					isOpen={columnHasTasksConfirm.isOpen}
					onClose={() => setColumnHasTasksConfirm({ isOpen: false })}
					onConfirm={() => {}}
					title="Cannot Delete Column"
					description="Cannot delete a column that contains tasks. Please move all tasks to another column first."
					confirmLabel="Understand"
					variant="warning"
				/>

				<ConfirmationModal
					isOpen={signalErrorConfirm.isOpen}
					onClose={() =>
						setSignalErrorConfirm({ isOpen: false, message: null })
					}
					onConfirm={() => {}}
					title="Workflow Engine Error"
					description={
						signalErrorConfirm.message ||
						"An error occurred while starting the next Ready task."
					}
					confirmLabel="Close"
					variant="danger"
				/>

				<ConfirmationModal
					isOpen={dirtyGitConfirm !== false}
					onClose={() => setDirtyGitConfirm(false)}
					onConfirm={handleDirtyGitConfirmStart}
					title="Uncommitted Changes Detected"
					description="The working tree has uncommitted changes. Running tasks with a dirty git state may cause conflicts or data loss. Proceed at your own risk."
					confirmLabel="Run Anyway"
					cancelLabel="Cancel"
					variant="warning"
				/>

				<ConfirmationModal
					isOpen={activeExecutionSessionConfirm !== null}
					onClose={() => setActiveExecutionSessionConfirm(null)}
					onConfirm={handleActiveExecutionConfirmStart}
					title="Execution Session Already Running"
					description={
						activeExecutionSessionConfirm?.message ||
						"This project already has a working execution session. Starting another Ready task can create conflicts."
					}
					confirmLabel="Start Anyway"
					cancelLabel="Cancel"
					variant="warning"
				/>

				<ConfirmationModal
					isOpen={bulkDeleteConfirm.isOpen}
					onClose={() =>
						setBulkDeleteConfirm({
							isOpen: false,
							columnId: null,
							taskCount: 0,
						})
					}
					onConfirm={confirmBulkDelete}
					title="Delete all tasks?"
					description={`Are you sure you want to delete all tasks (${bulkDeleteConfirm.taskCount}) from the "Closed" column? This action cannot be undone.`}
					confirmLabel="Delete all"
					variant="danger"
				/>

				<RejectModal
					isOpen={isRejectModalOpen}
					onClose={() => {
						setIsRejectModalOpen(false);
						setRejectTaskId(null);
					}}
					onSubmit={handleRejectSubmit}
					onRejectAndRerun={handleRejectAndRerun}
					taskTitle={rejectTaskTitle}
				/>
			</main>
		</div>
	);
}
