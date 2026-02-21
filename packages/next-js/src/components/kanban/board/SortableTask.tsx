"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
import type { KanbanTask, Tag } from "@/types/kanban";
import { cn } from "@/lib/utils";
import { priorityConfig, typeConfig } from "../TaskPropertyConfigs";
import {
	getWorkflowStatusVisual,
	toneOverlayStyle,
	toneBadgeStyle,
} from "../workflow-display";
import { useWorkflowDisplayConfig } from "../useWorkflowDisplayConfig";

export interface SortableTaskProps {
	task: KanbanTask;
	globalTags: Tag[];
	onDelete?: (id: string) => void;
	onClick?: (task: KanbanTask) => void;
}

export function SortableTask({
	task,
	globalTags,
	onDelete,
	onClick,
}: SortableTaskProps) {
	const workflowConfig = useWorkflowDisplayConfig();
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

	const statusVisual = task.status
		? getWorkflowStatusVisual(workflowConfig, task.status)
		: null;
	const statusBadge = statusVisual ? toneBadgeStyle(statusVisual.tone) : null;

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		borderColor: statusBadge?.borderColor,
	};

	const pConfig =
		priorityConfig[task.priority as keyof typeof priorityConfig] ||
		priorityConfig.normal;
	const tConfig =
		typeConfig[task.type as keyof typeof typeConfig] || typeConfig.chore;
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
			className={cn(
				"bg-slate-900/40 backdrop-blur-md border rounded-xl mb-3 group hover:shadow-lg hover:shadow-black/20 transition-all cursor-grab active:cursor-grabbing overflow-hidden relative",
				"border-slate-700 hover:border-slate-600",
				isDragging && "opacity-50 shadow-2xl scale-105",
				task.status === "running" && "animate-card-pulse-blue",
				task.status === "generating" && "animate-card-pulse-purple",
			)}
		>
			{statusVisual && (
				<div
					className="absolute inset-0 pointer-events-none transition-colors"
					style={toneOverlayStyle(statusVisual.tone)}
				/>
			)}
			<button
				type="button"
				onClick={() => onClick?.(task)}
				className="block w-full min-w-0 p-4 text-left"
			>
				<h4 className="mb-2 text-sm font-semibold leading-snug text-slate-200">
					{task.title}
				</h4>

				<div className="mb-2 flex flex-wrap items-center gap-2">
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
					<div className="mt-1 flex flex-wrap gap-1.5">
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
			</button>
			<div className="absolute right-2 top-2 z-10">
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onDelete?.(task.id);
					}}
					onPointerDown={(e) => e.stopPropagation()}
					className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all p-1 rounded-md hover:bg-red-500/10"
					title="Delete Task"
				>
					<Trash2 className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}
