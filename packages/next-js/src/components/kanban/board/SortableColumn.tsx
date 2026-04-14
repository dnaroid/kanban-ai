"use client";

import { useState } from "react";
import {
	useSortable,
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDndContext } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, Trash2 } from "lucide-react";
import type { KanbanTask, Tag } from "@/types/kanban";
import { cn } from "@/lib/utils";
import { SortableTask } from "./SortableTask";

export interface SortableColumnProps {
	id: string;
	name: string;
	color: string;
	systemKey?: string;
	tasks: KanbanTask[];
	globalTags: Tag[];
	onDeleteTask: (id: string) => void;
	onTaskClick?: (task: KanbanTask) => void;
	onBulkDelete?: (columnId: string, taskCount: number) => void;
	onContextAction?: (taskId: string, systemKey: string) => Promise<void>;
}

export function SortableColumn({
	id,
	name,
	color,
	systemKey,
	tasks,
	globalTags,
	onDeleteTask,
	onTaskClick,
	onBulkDelete,
	onContextAction,
}: SortableColumnProps) {
	const { active, over } = useDndContext();
	const isDraggingAnyTask = active?.data.current?.type === "task";

	const isTaskOverThisColumn =
		isDraggingAnyTask &&
		(over?.id === id ||
			over?.data.current?.task?.columnId === id ||
			(over?.data.current?.type === "column" && over.id === id));

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
		isOver: isColumnOver,
	} = useSortable({
		id: id,
		data: {
			type: "column",
		},
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const isEmpty = tasks.length === 0;
	const isOver = isColumnOver || isTaskOverThisColumn;
	const isMinimized = isEmpty;
	const [isHovered, setIsHovered] = useState(false);
	const columnWidthClass = !isMinimized ? "w-[344px]" : "w-[80px]";

	return (
		<div
			ref={setNodeRef}
			style={style}
			title={isMinimized ? name : undefined}
			className={cn(
				"flex-shrink-0 h-full px-3 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
				columnWidthClass,
				isDragging && "opacity-50 scale-95",
			)}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<div
				style={{
					borderColor: color
						? isHovered || isOver
							? color
							: `${color}40`
						: undefined,
					boxShadow: color
						? isHovered || isOver
							? `0 0 30px -5px ${color}40, inset 0 0 10px ${color}10`
							: `0 0 25px -10px ${color}20`
						: undefined,
					backgroundColor: color
						? isHovered || isOver
							? `color-mix(in srgb, ${color} 6%, #0B0E14)`
							: `color-mix(in srgb, ${color} 3%, #0B0E14)`
						: "#0B0E14",
				}}
				className={cn(
					"flex flex-col h-full w-full relative group/column overflow-hidden rounded-2xl border",
					!color &&
						(isHovered || isOver ? "border-slate-600" : "border-slate-800/50"),
					isOver && "ring-4 ring-blue-500/20 scale-[1.02] z-10",
				)}
			>
				<div
					{...attributes}
					{...listeners}
					className="p-4 border-b border-slate-800/50 cursor-grab active:cursor-grabbing select-none shrink-0"
					title={isMinimized ? name : undefined}
				>
					<div className="flex items-center justify-between relative min-h-[32px]">
						<div
							className={cn(
								"flex items-center gap-2 flex-1 min-w-0 transition-all duration-500 ease-in-out",
								isMinimized
									? "opacity-0 translate-x-4 pointer-events-none"
									: "opacity-100 translate-x-0 pointer-events-auto",
							)}
						>
							<span className="text-sm font-bold text-slate-200 truncate px-1">
								{name}
							</span>
							<span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-full shrink-0">
								{tasks.length}
							</span>
							{systemKey === "closed" && (
								<button
									type="button"
									onClick={(e) => {
										e.stopPropagation();
										onBulkDelete?.(id, tasks.length);
									}}
									disabled={tasks.length === 0}
									className="ml-auto p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none shrink-0"
									title="Empty trash"
								>
									<Trash2 className="w-4 h-4" />
								</button>
							)}
						</div>

						<div
							className={cn(
								"absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-500 ease-in-out",
								isMinimized ? "opacity-100 scale-100" : "opacity-0 scale-150",
							)}
						>
							<span className="text-lg font-black text-slate-500/50 uppercase tracking-tighter">
								{name.charAt(0)}
							</span>
						</div>
					</div>
				</div>

				<div
					className={cn(
						"flex-1 overflow-y-auto custom-scrollbar p-3 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
						isMinimized
							? "opacity-0 translate-y-8 pointer-events-none"
							: "opacity-100 translate-y-0",
					)}
				>
					<SortableContext
						items={tasks.map((t) => t.id)}
						strategy={verticalListSortingStrategy}
					>
						{tasks.length === 0 ? (
							<div className="text-center py-12 text-slate-600">
								<div className="w-10 h-10 bg-slate-800/50 rounded-xl flex items-center justify-center mx-auto mb-3">
									<AlertCircle className="w-5 h-5" />
								</div>
								<p className="text-sm">No tasks yet</p>
							</div>
						) : (
							tasks.map((task) => (
								<SortableTask
									key={task.id}
									task={task}
									globalTags={globalTags}
									onDelete={onDeleteTask}
									onClick={onTaskClick}
									systemKey={systemKey}
									onContextAction={onContextAction}
								/>
							))
						)}
					</SortableContext>
				</div>
			</div>
		</div>
	);
}
