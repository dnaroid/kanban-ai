"use client";

import { closestCenter, DndContext, DragOverlay } from "@dnd-kit/core";
import {
	horizontalListSortingStrategy,
	SortableContext,
} from "@dnd-kit/sortable";
import {
	AlertCircle,
	Clock,
	LayoutGrid,
	List,
	ChevronDown,
	ChevronUp,
	Plus,
	Play,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { SortableColumn } from "./kanban/board/SortableColumn";
import { SortableTask } from "./kanban/board/SortableTask";
import { ListView, ListItemView } from "./kanban/board/ListView";
import { QuickCreateModal } from "./kanban/board/QuickCreateModal";
import { ProjectSelect } from "./ProjectSelect";
import { useBoardModel } from "@/features/board/model/use-board-model";
import { cn } from "@/lib/utils";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { useToast } from "@/components/common/toast/ToastContext";

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

	const [viewMode, setViewMode] = useState<"board" | "list">(() => {
		if (typeof window !== "undefined") {
			return (
				(localStorage.getItem("boardViewMode") as "board" | "list") || "board"
			);
		}
		return "board";
	});

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
		handleQuickRunRawStory,
		handleDeleteTask,
		handleStartSignalRuns,
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
		bulkDeleteConfirm,
		setBulkDeleteConfirm,
		handleBulkDelete,
		confirmBulkDelete,
	} = useBoardModel({ projectId });

	const [expandedColumns, setExpandedColumns] = useState<
		Record<string, boolean>
	>({});
	const manualTogglesRef = useRef<Record<string, boolean>>({});
	const prevTaskCountsRef = useRef<Record<string, number>>({});

	const [isQuickCreateModalOpen, setIsQuickCreateModalOpen] = useState(false);

	useEffect(() => {
		localStorage.setItem("boardViewMode", viewMode);
	}, [viewMode]);

	useEffect(() => {
		if (viewMode !== "list") return;

		const newTaskCounts: Record<string, number> = {};
		for (const col of columns) {
			newTaskCounts[col.id] = 0;
		}
		for (const t of tasks) {
			if (newTaskCounts[t.columnId] !== undefined) {
				newTaskCounts[t.columnId]++;
			}
		}

		const prevCounts = prevTaskCountsRef.current;
		const manualToggles = manualTogglesRef.current;
		const isFirstLoad =
			Object.keys(prevCounts).length === 0 && columns.length > 0;

		let needUpdate = false;
		for (const col of columns) {
			if (prevCounts[col.id] !== newTaskCounts[col.id] || isFirstLoad) {
				needUpdate = true;
				break;
			}
		}

		if (!needUpdate) return;

		setExpandedColumns((prevExpanded) => {
			let hasChanges = false;
			const nextExpanded = { ...prevExpanded };

			for (const col of columns) {
				const id = col.id;
				const count = newTaskCounts[id];
				const prevCount = prevCounts[id];

				if (prevCount !== count || isFirstLoad) {
					if (manualToggles[id]) {
						manualToggles[id] = false;
					}

					const shouldBeExpanded = count > 0;
					if (nextExpanded[id] !== shouldBeExpanded && !manualToggles[id]) {
						nextExpanded[id] = shouldBeExpanded;
						hasChanges = true;
					}
				}
			}
			return hasChanges ? nextExpanded : prevExpanded;
		});

		prevTaskCountsRef.current = newTaskCounts;
	}, [tasks, columns, viewMode]);

	const expandAll = () => {
		const next: Record<string, boolean> = {};
		for (const col of columns) {
			next[col.id] = true;
			manualTogglesRef.current[col.id] = true;
		}
		setExpandedColumns(next);
	};

	const collapseAll = () => {
		const next: Record<string, boolean> = {};
		for (const col of columns) {
			next[col.id] = false;
			manualTogglesRef.current[col.id] = true;
		}
		setExpandedColumns(next);
	};

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

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="relative z-10 flex items-center justify-between px-8 py-2 border-b border-slate-800/50 bg-slate-900/20 backdrop-blur-md shrink-0">
				<div className="flex items-center gap-4">
					<ProjectSelect
						projectId={projectId}
						projectName={projectName}
						projectColor={projectColor}
					/>
					<div className="bg-slate-800/50 p-1 rounded-xl flex gap-1">
						<button
							type="button"
							onClick={() => setViewMode("board")}
							className={cn(
								"flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-semibold transition-all",
								viewMode === "board"
									? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
									: "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50",
							)}
						>
							<LayoutGrid className="w-4 h-4" />
							Board
						</button>
						<button
							type="button"
							onClick={() => setViewMode("list")}
							className={cn(
								"flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-semibold transition-all",
								viewMode === "list"
									? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
									: "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50",
							)}
						>
							<List className="w-4 h-4" />
							List
						</button>
					</div>

					{viewMode === "list" && (
						<div className="flex items-center gap-2 border-l border-slate-800 pl-4 ml-2">
							<button
								type="button"
								onClick={expandAll}
								className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
								title="Expand All"
							>
								<ChevronDown className="w-3.5 h-3.5" />
								Expand All
							</button>
							<button
								type="button"
								onClick={collapseAll}
								className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
								title="Collapse All"
							>
								<ChevronUp className="w-3.5 h-3.5" />
								Collapse All
							</button>
						</div>
					)}
				</div>

				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => setIsQuickCreateModalOpen(true)}
						className="flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-semibold transition-all bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20"
						title="Quick Create Task"
					>
						<Plus className="w-4 h-4" />
						Add Task
					</button>
					<button
						type="button"
						onClick={() => {
							void handleStartSignalRuns().catch((startError) => {
								const message =
									startError instanceof Error
										? startError.message
										: "Failed to queue tasks by signal";
								setSignalErrorConfirm({ isOpen: true, message });
								addToast(message, "error");
							});
						}}
						disabled={isQueueingSignalRuns}
						className={cn(
							"flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-semibold transition-all",
							isQueueingSignalRuns
								? "bg-slate-800 text-slate-500 cursor-not-allowed"
								: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20",
						)}
						title="Queue tasks by workflow signal selectors"
					>
						<Play className="w-4 h-4" />
						{isQueueingSignalRuns ? "Queueing..." : "Execute Queue"}
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
					{viewMode === "board" ? (
						<div className="h-full overflow-x-auto custom-scrollbar">
							<div className="inline-flex h-full items-stretch gap-0 pl-5 pr-5 pt-8 pb-8">
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
												.sort((a, b) => a.orderInColumn - b.orderInColumn)}
											onTaskClick={handleTaskClick}
											onDeleteTask={handleDeleteTask}
											onBulkDelete={handleBulkDelete}
											onContextAction={handleContextAction}
										/>
									))}
								</SortableContext>
							</div>
						</div>
					) : (
						<ListView
							columns={board.columns}
							tasks={tasks}
							globalTags={globalTags}
							onAddTask={handleAddTask}
							onDeleteTask={handleDeleteTask}
							expandedColumns={expandedColumns}
							onToggleColumn={(columnId) => {
								manualTogglesRef.current[columnId] = true;
								setExpandedColumns((prev) => ({
									...prev,
									[columnId]: !prev[columnId],
								}));
							}}
							projectId={projectId}
							onBulkDeleteColumn={handleBulkDelete}
						/>
					)}

					<DragOverlay>
						{activeTask ? (
							viewMode === "board" ? (
								<div className="w-80 rotate-3 scale-105 pointer-events-none">
									<SortableTask task={activeTask} globalTags={globalTags} />
								</div>
							) : (
								<div className="w-[600px] pointer-events-none">
									<ListItemView
										task={activeTask}
										globalTags={globalTags}
										isOverlay
									/>
								</div>
							)
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
					onGenerateStory={async (prompt, selectedAttachments) => {
						if (firstColumnId) {
							await handleQuickGenerateStory(
								firstColumnId,
								prompt,
								selectedAttachments,
							);
						}
					}}
					onRunRawStory={async (prompt, modelName, selectedAttachments) => {
						if (firstColumnId) {
							await handleQuickRunRawStory(firstColumnId, prompt, {
								modelName,
								selectedAttachments,
							});
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
						"An error occurred while queueing tasks by signal."
					}
					confirmLabel="Close"
					variant="danger"
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
					title="Удалить все задачи?"
					description={`Вы уверены, что хотите удалить все задачи (${bulkDeleteConfirm.taskCount}) из колонки «Closed»? Это действие нельзя отменить.`}
					confirmLabel="Удалить все"
					variant="danger"
				/>
			</main>
		</div>
	);
}
