"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
import type { KanbanTask, Tag } from "@/types/kanban";
import { cn } from "@/lib/utils";
import {
	priorityConfig,
	statusConfig,
	typeConfig,
} from "../TaskPropertyConfigs";

export interface SortableTaskProps {
	task: KanbanTask;
	globalTags: Tag[];
	projectId: string;
	onDelete?: (id: string) => void;
	onClick?: (task: KanbanTask) => void;
}

export function SortableTask({
	task,
	globalTags,
	projectId,
	onDelete,
	onClick,
}: SortableTaskProps) {
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

	const pConfig =
		priorityConfig[task.priority as keyof typeof priorityConfig] ||
		priorityConfig.normal;
	const tConfig =
		typeConfig[task.type as keyof typeof typeConfig] || typeConfig.task;
	const sConfig = task.status
		? statusConfig[task.status as keyof typeof statusConfig]
		: null;

	const getTagColor = (tagName: string) => {
		const normalized = tagName.toLowerCase().trim();
		return (
			globalTags.find((t) => t.name.toLowerCase().trim() === normalized)
				?.color || "#475569"
		);
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			{...listeners}
			onClick={() => onClick?.(task)}
			onKeyDown={(e) => e.key === "Enter" && onClick?.(task)}
			role="button"
			tabIndex={0}
			className={cn(
				"bg-slate-900/40 backdrop-blur-md border rounded-xl mb-3 group hover:shadow-lg hover:shadow-black/20 transition-all cursor-grab active:cursor-grabbing overflow-hidden relative",
				sConfig?.border ?? "border-slate-700",
				!sConfig && "hover:border-slate-600",
				isDragging && "opacity-50 shadow-2xl scale-105",
				task.status === "running" &&
					"animate-card-pulse-blue border-blue-500/50",
				task.status === "generating" &&
					"animate-card-pulse-purple border-purple-500/50",
			)}
		>
			{sConfig && (
				<div
					className={cn(
						"absolute inset-0 pointer-events-none transition-colors",
						sConfig.bg,
					)}
				/>
			)}
			<div className="flex-1 min-w-0 p-4 relative">
				<div className="flex items-start justify-between gap-2 mb-2">
					<h4 className="text-sm font-semibold text-slate-200 leading-snug flex-1">
						{task.title}
					</h4>
					<div className="flex flex-col gap-1">
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onDelete?.(task.id);
							}}
							onKeyDown={(e) => e.key === "Enter" && onDelete?.(task.id)}
							onPointerDown={(e) => e.stopPropagation()}
							className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all p-1 rounded-md hover:bg-red-500/10"
							title="Delete Task"
						>
							<Trash2 className="w-4 h-4" />
						</button>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2 mb-2">
					<span
						className={cn(
							"inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all",
							pConfig.bg,
							pConfig.color,
						)}
					>
						{task.priority}
					</span>
					<span
						className={cn(
							"inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all",
							tConfig.bg,
							tConfig.color,
						)}
					>
						{task.type}
					</span>
				</div>

				{task.tags.length > 0 && (
					<div className="flex flex-wrap gap-1.5 mt-1">
						{task.tags.slice(0, 3).map((tag) => {
							const color = getTagColor(tag);
							return (
								<span
									key={tag}
									className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold transition-all"
									style={{
										backgroundColor: `${color}15`,
										color: color,
									}}
								>
									{tag}
								</span>
							);
						})}
						{task.tags.length > 3 && (
							<span className="text-[10px] text-slate-500 font-medium">
								+{task.tags.length - 3}
							</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
