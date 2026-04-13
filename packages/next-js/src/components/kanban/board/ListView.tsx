"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
	useSortable,
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { KanbanTask, Tag } from "@/types/kanban";
import type { BoardColumn } from "@/server/types";
import { cn } from "@/lib/utils";
import { priorityConfig, typeConfig } from "../TaskPropertyConfigs";
import {
	getWorkflowStatusVisual,
	toneBadgeStyle,
	toneOverlayStyle,
} from "../workflow-display";
import { useWorkflowDisplayConfig } from "../useWorkflowDisplayConfig";

interface ListViewProps {
	columns: BoardColumn[];
	tasks: KanbanTask[];
	globalTags: Tag[];
	onAddTask: (columnId: string) => void;
	onDeleteTask: (taskId: string) => void;
	expandedColumns: Record<string, boolean>;
	onToggleColumn: (columnId: string) => void;
	projectId: string;
}

export function ListView({
	columns,
	tasks,
	globalTags,
	onAddTask,
	onDeleteTask,
	expandedColumns,
	onToggleColumn,
	projectId,
}: ListViewProps) {
	return (
		<div className="flex flex-col gap-4 p-8 w-full overflow-y-auto custom-scrollbar h-full">
			{columns.map((column) => {
				const columnTasks = tasks
					.filter((t) => t.columnId === column.id)
					.sort((a, b) => a.orderInColumn - b.orderInColumn);
				const isExpanded = expandedColumns[column.id];

				return (
					<ListColumn
						key={column.id}
						column={column}
						columnTasks={columnTasks}
						isExpanded={isExpanded}
						onToggle={() => onToggleColumn(column.id)}
						onAddTask={onAddTask}
						globalTags={globalTags}
						onDeleteTask={onDeleteTask}
						projectId={projectId}
					/>
				);
			})}
		</div>
	);
}

interface ListColumnProps {
	column: BoardColumn;
	columnTasks: KanbanTask[];
	isExpanded: boolean;
	onToggle: () => void;
	onAddTask: (columnId: string) => void;
	globalTags: Tag[];
	onDeleteTask: (taskId: string) => void;
	projectId: string;
}

function ListColumn({
	column,
	columnTasks,
	isExpanded,
	onToggle,
	onAddTask,
	globalTags,
	onDeleteTask,
	projectId,
}: ListColumnProps) {
	const { setNodeRef, isOver } = useDroppable({
		id: column.id,
		data: {
			type: "column",
			column,
		},
	});

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"bg-slate-900/40 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-md shadow-lg shadow-black/10 w-full transition-all",
				isOver && "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20",
			)}
		>
			<div className="flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors">
				<button
					type="button"
					onClick={onToggle}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							onToggle();
						}
					}}
					className="flex items-center gap-3 text-left flex-1"
				>
					<div className="text-slate-500">
						{isExpanded ? (
							<ChevronDown className="w-5 h-5" />
						) : (
							<ChevronRight className="w-5 h-5" />
						)}
					</div>
					<div
						className="w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]"
						style={{ backgroundColor: column.color || "#475569" }}
					/>
					<h3 className="font-bold text-slate-200 tracking-tight">
						{column.name}
					</h3>
					<span className="bg-slate-800/80 text-slate-400 text-xs px-2 py-0.5 rounded-full font-bold border border-slate-700/50">
						{columnTasks.length}
					</span>
				</button>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onAddTask(column.id);
					}}
					className="p-2 hover:bg-blue-500/10 rounded-xl text-slate-400 hover:text-blue-400 transition-all group/add"
				>
					<Plus className="w-5 h-5 group-hover/add:scale-110 transition-transform" />
				</button>
			</div>

			{isExpanded && (
				<div className="border-t border-slate-800/50 bg-slate-900/20">
					<SortableContext
						items={columnTasks.map((t) => t.id)}
						strategy={verticalListSortingStrategy}
					>
						{columnTasks.length === 0 ? (
							<div className="p-10 text-center text-slate-500 text-sm italic">
								No tasks in this column
							</div>
						) : (
							<div className="flex flex-col divide-y divide-slate-800/30">
								{columnTasks.map((task) => (
									<ListItem
										key={task.id}
										task={task}
										globalTags={globalTags}
										onDeleteTask={onDeleteTask}
										projectId={projectId}
									/>
								))}
							</div>
						)}
					</SortableContext>
				</div>
			)}
		</div>
	);
}

interface ListItemProps {
	task: KanbanTask;
	globalTags: Tag[];
	onDeleteTask: (taskId: string) => void;
	projectId: string;
}

function ListItem({
	task,
	globalTags,
	onDeleteTask,
	projectId,
}: ListItemProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: task.id,
		data: {
			type: "task",
			task,
		},
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div ref={setNodeRef} style={style} {...attributes}>
			<ListItemView
				task={task}
				globalTags={globalTags}
				onDeleteTask={onDeleteTask}
				isDragging={isDragging}
				projectId={projectId}
				dragListeners={listeners}
			/>
		</div>
	);
}

export interface ListItemViewProps {
	task: KanbanTask;
	globalTags: Tag[];
	onDeleteTask?: (taskId: string) => void;
	isDragging?: boolean;
	isOverlay?: boolean;
	projectId?: string;
	dragListeners?: Record<string, unknown>;
}

export function ListItemView({
	task,
	globalTags,
	onDeleteTask,
	isDragging,
	isOverlay,
	projectId,
	dragListeners,
}: ListItemViewProps) {
	const router = useRouter();
	const workflowConfig = useWorkflowDisplayConfig();
	const pConfig =
		priorityConfig[task.priority as keyof typeof priorityConfig] ||
		priorityConfig.normal;
	const tConfig =
		typeConfig[task.type as keyof typeof typeConfig] || typeConfig.chore;
	const statusVisual = task.status
		? getWorkflowStatusVisual(workflowConfig, task.status)
		: null;
	const statusBadge = statusVisual ? toneBadgeStyle(statusVisual.tone) : null;

	const getTagColor = (tagName: string) => {
		const normalized = tagName.toLowerCase().trim();
		return (
			globalTags.find((t) => t.name.toLowerCase().trim() === normalized)
				?.color || "#475569"
		);
	};

	const handleRowClick = () => {
		if (projectId) {
			router.push(`/board/${projectId}/task/${task.id}`);
		}
	};

	return (
		<div
			onClick={handleRowClick}
			{...(!isOverlay && dragListeners)}
			className={cn(
				"group flex items-center gap-4 p-4 hover:bg-slate-800/40 transition-all relative overflow-hidden cursor-grab active:cursor-grabbing",
				isDragging && !isOverlay && "opacity-50 bg-slate-800/60",
				isOverlay &&
					"bg-slate-800 shadow-2xl rounded-xl border border-blue-500/50 scale-[1.02]",
			)}
			style={statusVisual ? toneOverlayStyle(statusVisual.tone) : undefined}
		>
			{statusBadge && (
				<div
					className="absolute left-0 top-0 bottom-0 w-1"
					style={{ backgroundColor: statusBadge.backgroundColor }}
				/>
			)}

			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-3 mb-1.5">
					<span className="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors">
						{task.title}
					</span>
					<div className="flex items-center gap-1.5 flex-shrink-0">
						<span
							className={cn(
								"px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
								pConfig.bg,
								pConfig.color,
							)}
						>
							{task.priority}
						</span>
						<span
							className={cn(
								"px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
								tConfig.bg,
								tConfig.color,
							)}
						>
							{task.type}
						</span>
						{task.status && (
							<span
								className={cn(
									"px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-white/5",
								)}
								style={statusBadge ?? undefined}
							>
								{task.status}
							</span>
						)}
					</div>
				</div>

				{task.tags.length > 0 && (
					<div className="flex flex-wrap gap-1.5 ml-0.5">
						{task.tags.map((tag: string, i: number) => {
							const color = getTagColor(tag);
							return (
								<span
									key={`${task.id}-${tag}-${i}`}
									className="px-2 py-0.5 rounded text-[10px] font-bold transition-all border border-transparent hover:border-white/10"
									style={{
										backgroundColor: `${color}15`,
										color: color,
									}}
								>
									{tag}
								</span>
							);
						})}
					</div>
				)}
			</div>

			{!isOverlay && (
				<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDeleteTask?.(task.id);
						}}
						onPointerDown={(e) => e.stopPropagation()}
						className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
						title="Delete Task"
					>
						<Trash2 className="w-4 h-4" />
					</button>
				</div>
			)}
		</div>
	);
}
