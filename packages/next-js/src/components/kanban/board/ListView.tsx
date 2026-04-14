"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
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
import { PillSelect } from "@/components/common/PillSelect";
import { priorityConfig, typeConfig } from "../TaskPropertyConfigs";
import {
	getWorkflowStatusVisual,
	toneBadgeStyle,
	toneOverlayStyle,
} from "../workflow-display";
import { useWorkflowDisplayConfig } from "../useWorkflowDisplayConfig";
import {
	getContextActionConfig,
	INACTIVE_CONTEXT_ACTION_STATUSES,
} from "./contextActions";

interface ListViewProps {
	columns: BoardColumn[];
	tasks: KanbanTask[];
	globalTags: Tag[];
	onAddTask: (columnId: string) => void;
	onDeleteTask: (taskId: string) => void;
	onContextAction?: (taskId: string, systemKey: string) => Promise<void>;
	expandedColumns: Record<string, boolean>;
	onToggleColumn: (columnId: string) => void;
	projectId: string;
	onBulkDeleteColumn?: (columnId: string, taskCount: number) => void;
	onUpdateTask?: (id: string, patch: Partial<KanbanTask>) => void;
}

export function ListView({
	columns,
	tasks,
	globalTags,
	onAddTask,
	onDeleteTask,
	onContextAction,
	expandedColumns,
	onToggleColumn,
	projectId,
	onBulkDeleteColumn,
	onUpdateTask,
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
						onContextAction={onContextAction}
						projectId={projectId}
						onBulkDeleteColumn={onBulkDeleteColumn}
						onUpdateTask={onUpdateTask}
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
	onContextAction?: (taskId: string, systemKey: string) => Promise<void>;
	projectId: string;
	onBulkDeleteColumn?: (columnId: string, taskCount: number) => void;
	onUpdateTask?: (id: string, patch: Partial<KanbanTask>) => void;
}

function ListColumn({
	column,
	columnTasks,
	isExpanded,
	onToggle,
	onAddTask,
	globalTags,
	onDeleteTask,
	onContextAction,
	projectId,
	onBulkDeleteColumn,
	onUpdateTask,
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
				"bg-slate-900/40 border border-slate-800/50 rounded-2xl overflow-hidden backdrop-blur-md shadow-lg shadow-black/10 w-full shrink-0 transition-all",
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
				<div className="flex items-center gap-1">
					{column.systemKey === "closed" && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onBulkDeleteColumn?.(column.id, columnTasks.length);
							}}
							disabled={columnTasks.length === 0}
							className={cn(
								"p-2 rounded-xl transition-all",
								columnTasks.length === 0
									? "text-slate-600 cursor-not-allowed"
									: "text-slate-400 hover:text-red-400 hover:bg-red-500/10",
							)}
							title="Delete all tasks in column"
						>
							<Trash2 className="w-5 h-5" />
						</button>
					)}
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
										onContextAction={onContextAction}
										systemKey={column.systemKey}
										projectId={projectId}
										onUpdateTask={onUpdateTask}
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
	onContextAction?: (taskId: string, systemKey: string) => Promise<void>;
	systemKey?: string;
	projectId: string;
	onUpdateTask?: (id: string, patch: Partial<KanbanTask>) => void;
}

function ListItem({
	task,
	globalTags,
	onDeleteTask,
	onContextAction,
	systemKey,
	projectId,
	onUpdateTask,
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
				onContextAction={onContextAction}
				systemKey={systemKey}
				isDragging={isDragging}
				projectId={projectId}
				dragListeners={listeners}
				onUpdateTask={onUpdateTask}
			/>
		</div>
	);
}

export interface ListItemViewProps {
	task: KanbanTask;
	globalTags: Tag[];
	onDeleteTask?: (taskId: string) => void;
	onContextAction?: (taskId: string, systemKey: string) => Promise<void>;
	systemKey?: string;
	isDragging?: boolean;
	isOverlay?: boolean;
	projectId?: string;
	dragListeners?: Record<string, unknown>;
	onUpdateTask?: (id: string, patch: Partial<KanbanTask>) => void;
}

export function ListItemView({
	task,
	globalTags,
	onDeleteTask,
	onContextAction,
	systemKey,
	isDragging,
	isOverlay,
	projectId,
	dragListeners,
	onUpdateTask,
}: ListItemViewProps) {
	const [isLoading, setIsLoading] = React.useState(false);
	const router = useRouter();
	const workflowConfig = useWorkflowDisplayConfig();
	const tConfig =
		typeConfig[task.type as keyof typeof typeConfig] || typeConfig.chore;
	const pConfig =
		priorityConfig[task.priority as keyof typeof priorityConfig] ||
		priorityConfig.normal;
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

	const actionConfig = getContextActionConfig(systemKey);
	const showContextButton =
		actionConfig && !INACTIVE_CONTEXT_ACTION_STATUSES.has(task.status);

	const handleContextClick = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!systemKey || !onContextAction || isLoading) return;
		setIsLoading(true);
		try {
			await onContextAction(task.id, systemKey);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div
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

			<button
				type="button"
				onClick={handleRowClick}
				className="flex-1 min-w-0 text-left"
			>
				<div className="flex items-center gap-3 mb-1.5">
					<span className="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors">
						{task.title}
					</span>
					<div className="flex items-center gap-1.5 flex-shrink-0">
						{isOverlay && (
							<span
								className={cn(
									"px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
									pConfig.bg,
									pConfig.color,
								)}
							>
								{task.priority}
							</span>
						)}
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
			</button>

			{!isOverlay && (
				<div
					onPointerDown={(e) => e.stopPropagation()}
					className="flex-shrink-0"
				>
					<PillSelect
						value={task.priority}
						options={priorityConfig}
						onChange={(priority) =>
							onUpdateTask?.(task.id, {
								priority: priority as KanbanTask["priority"],
							})
						}
					/>
				</div>
			)}

			{!isOverlay && (
				<div className="flex items-center gap-1.5">
					{showContextButton && (
						<button
							type="button"
							onClick={handleContextClick}
							onPointerDown={(e) => e.stopPropagation()}
							disabled={isLoading}
							className={cn(
								"inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
								"text-blue-500/85 hover:text-blue-400 hover:bg-blue-500/10 active:bg-blue-500/20",
								isLoading ? "pointer-events-none opacity-80" : "opacity-90",
							)}
							title={actionConfig.label}
						>
							{isLoading ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : (
								<actionConfig.icon className="h-3.5 w-3.5" />
							)}
							<span>{actionConfig.label}</span>
						</button>
					)}
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDeleteTask?.(task.id);
						}}
						onPointerDown={(e) => e.stopPropagation()}
						className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-blue-500/80 transition-colors hover:bg-blue-500/10 hover:text-blue-400 active:bg-blue-500/20"
						title="Delete Task"
					>
						<Trash2 className="h-3.5 w-3.5" />
						<span>Delete</span>
					</button>
				</div>
			)}
		</div>
	);
}
