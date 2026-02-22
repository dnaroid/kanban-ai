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
} from "lucide-react";
import { useState, useEffect } from "react";
import { SortableColumn } from "./kanban/board/SortableColumn";
import { SortableTask } from "./kanban/board/SortableTask";
import { ListView, ListItemView } from "./kanban/board/ListView";
import { useBoardModel } from "@/features/board/model/use-board-model";
import { cn } from "@/lib/utils";

interface BoardScreenProps {
	projectId: string;
	projectName: string;
}

export function BoardScreen({ projectId, projectName }: BoardScreenProps) {
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
		handleDeleteTask,
	} = useBoardModel({ projectId });

	const [expandedColumns, setExpandedColumns] = useState<
		Record<string, boolean>
	>({});

	useEffect(() => {
		localStorage.setItem("boardViewMode", viewMode);
	}, [viewMode]);

	const expandAll = () => {
		const next: Record<string, boolean> = {};
		for (const col of columns) {
			next[col.id] = true;
		}
		setExpandedColumns(next);
	};

	const collapseAll = () => {
		const next: Record<string, boolean> = {};
		for (const col of columns) {
			next[col.id] = false;
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

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="flex items-center justify-between px-8 py-2 border-b border-slate-800/50 bg-slate-900/20 backdrop-blur-md shrink-0">
				<div className="flex items-center gap-4">
					<h2 className="text-lg font-bold text-slate-200">{projectName}</h2>
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
							<div className="inline-flex h-full items-stretch gap-6 pl-8 pt-8 pb-8">
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
											globalTags={globalTags}
											tasks={tasks
												.filter((t) => t.columnId === column.id)
												.sort((a, b) => a.orderInColumn - b.orderInColumn)}
											onTaskClick={handleTaskClick}
											onAddTask={() => handleAddTask(column.id)}
											onQuickGenerateStory={handleQuickGenerateStory}
											onDeleteTask={handleDeleteTask}
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
							setExpandedColumns={setExpandedColumns}
							projectId={projectId}
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
			</main>
		</div>
	);
}
