"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Loader2, ExternalLink, XCircle } from "lucide-react";
import type { KanbanTask, Tag } from "@/types/kanban";
import { cn } from "@/lib/utils";
import { PillSelect } from "@/components/common/PillSelect";
import { priorityConfig, typeConfig } from "../TaskPropertyConfigs";
import {
	getWorkflowStatusVisual,
	toneOverlayStyle,
	toneBadgeStyle,
} from "../workflow-display";
import { useWorkflowDisplayConfig } from "../useWorkflowDisplayConfig";
import {
	getContextActionConfig,
	INACTIVE_CONTEXT_ACTION_STATUSES,
} from "./contextActions";
import { TaskDetailsModel } from "../drawer/sections/TaskDetailsModel";

export interface SortableTaskProps {
	task: KanbanTask;
	globalTags: Tag[];
	onDelete?: (id: string) => void;
	onClick?: (task: KanbanTask) => void;
	systemKey?: string;
	onContextAction?: (taskId: string, systemKey: string) => Promise<void>;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
	onRejectAction?: (taskId: string) => void;
	isDeleting?: boolean;
}

export function SortableTask({
	task,
	globalTags,
	onDelete,
	onClick,
	systemKey,
	onContextAction,
	onUpdate,
	onRejectAction,
	isDeleting,
}: SortableTaskProps) {
	const [isLoading, setIsLoading] = useState(false);
	const cardRef = useRef<HTMLDivElement | null>(null);
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

	const setCombinedRef = useCallback(
		(node: HTMLDivElement | null) => {
			cardRef.current = node;
			setNodeRef(node);
		},
		[setNodeRef],
	);

	useEffect(() => {
		if (!isDeleting || !cardRef.current) return;

		const el = cardRef.current;
		const { height } = el.getBoundingClientRect();
		const computedStyle = getComputedStyle(el);
		const marginBottom = parseFloat(computedStyle.marginBottom);

		el.style.overflow = "hidden";

		el.animate(
			[
				{
					height: `${height}px`,
					opacity: 1,
					marginBottom: `${marginBottom}px`,
				},
				{
					height: "0px",
					opacity: 0,
					marginBottom: "0px",
				},
			],
			{
				duration: 1000,
				easing: "ease-in-out",
				fill: "forwards",
			},
		);
	}, [isDeleting]);

	const statusVisual = task.status
		? getWorkflowStatusVisual(workflowConfig, task.status)
		: null;
	const statusBadge = statusVisual ? toneBadgeStyle(statusVisual.tone) : null;

	const style: React.CSSProperties = isDeleting
		? { overflow: "hidden" }
		: {
				transform: CSS.Transform.toString(transform),
				transition,
				borderColor: statusBadge?.borderColor,
			};

	const tConfig =
		typeConfig[task.type as keyof typeof typeConfig] || typeConfig.chore;
	const pConfig =
		priorityConfig[task.priority as keyof typeof priorityConfig] ||
		priorityConfig.normal;
	const getTagColor = (tagName: string) => {
		const normalized = tagName.toLowerCase().trim();
		return (
			globalTags.find((t) => t.name.toLowerCase().trim() === normalized)
				?.color || "#475569"
		);
	};

	const actionConfig = getContextActionConfig(systemKey);
	const shouldBypassInactiveStatus = systemKey === "in_progress";

	const showContextButton =
		actionConfig &&
		(shouldBypassInactiveStatus ||
			!INACTIVE_CONTEXT_ACTION_STATUSES.has(task.status));

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

	const handleContextPointerDown = (e: React.PointerEvent) => {
		e.stopPropagation();
	};

	return (
		<div
			ref={setCombinedRef}
			style={style}
			{...(isDeleting ? {} : { ...attributes, ...listeners })}
			className={cn(
				"bg-slate-900/40 backdrop-blur-md border rounded-xl mb-3 group hover:shadow-lg hover:shadow-black/20 cursor-grab active:cursor-grabbing relative z-10 hover:z-20 border-slate-700 hover:border-slate-600",
				!task.isGenerated && "border-dashed",
				!isDeleting && "transition-all overflow-visible",
				isDragging && "opacity-50 shadow-2xl scale-105",
				isDeleting && "pointer-events-none",
				task.status === "running" && !isDeleting && "animate-card-pulse-blue",
				task.status === "generating" &&
					!isDeleting &&
					"animate-card-pulse-purple",
				task.status === "question" &&
					!isDeleting &&
					"animate-card-pulse-yellow",
			)}
		>
			{statusVisual && (
				<div
					className="absolute inset-0 pointer-events-none transition-colors"
					style={toneOverlayStyle(statusVisual.tone)}
				/>
			)}
			<div className="block w-full min-w-0 p-4 text-left">
				<div className="mb-2 flex flex-wrap items-center gap-2">
					{onUpdate ? (
						<div onPointerDown={(e) => e.stopPropagation()}>
							<PillSelect
								value={task.priority}
								options={priorityConfig}
								onChange={(priority) =>
									onUpdate(task.id, {
										priority: priority as KanbanTask["priority"],
									})
								}
							/>
						</div>
					) : (
						<span
							className={cn(
								"inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all",
								pConfig.bg,
								pConfig.color,
							)}
						>
							{task.priority}
						</span>
					)}
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

				<button
					type="button"
					onClick={() => onClick?.(task)}
					className="block w-full min-w-0 text-left"
				>
					<h4 className="mb-2 text-sm font-semibold leading-snug text-slate-200">
						{task.title}
					</h4>

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
			</div>

			{onUpdate && (
				<div className="px-4 pb-3" onPointerDown={(e) => e.stopPropagation()}>
					<TaskDetailsModel task={task} onUpdate={onUpdate} />
				</div>
			)}

			<div className="px-4 pb-4 flex flex-wrap items-center gap-2 border-t border-slate-700/60 pt-3">
				{task.latestSessionId && task.opencodeWebUrl && (
					<a
						href={`${task.opencodeWebUrl}/session/${task.latestSessionId}`}
						target="_blank"
						rel="noopener noreferrer"
						onClick={(e) => e.stopPropagation()}
						onPointerDown={(e) => e.stopPropagation()}
						className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-blue-500/85 transition-colors hover:bg-blue-500/10 hover:text-blue-400 active:bg-blue-500/20"
						title="OpenCode"
					>
						<ExternalLink className="h-3.5 w-3.5" />
						<span>OpenCode</span>
					</a>
				)}
				{showContextButton && (
					<button
						type="button"
						onClick={handleContextClick}
						onPointerDown={handleContextPointerDown}
						disabled={isLoading}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
							systemKey === "review"
								? "text-emerald-400/85 hover:text-emerald-300 hover:bg-emerald-500/10 active:bg-emerald-500/20"
								: "text-blue-500/85 hover:text-blue-400 hover:bg-blue-500/10 active:bg-blue-500/20",
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
				{systemKey === "review" && onRejectAction && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onRejectAction(task.id);
						}}
						onPointerDown={(e) => e.stopPropagation()}
						className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-orange-400/85 transition-colors hover:bg-orange-500/10 hover:text-orange-300 active:bg-orange-500/20"
						title="Reject Task"
					>
						<XCircle className="h-3.5 w-3.5" />
						<span>Reject</span>
					</button>
				)}
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onDelete?.(task.id);
					}}
					onPointerDown={(e) => e.stopPropagation()}
					className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-red-400/85 transition-colors hover:bg-red-500/10 hover:text-red-300 active:bg-red-500/20"
					title="Delete Task"
				>
					<Trash2 className="h-3.5 w-3.5" />
					<span>Delete</span>
				</button>
			</div>
		</div>
	);
}
