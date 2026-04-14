"use client";

import { useEffect, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Loader2, ExternalLink } from "lucide-react";
import type { KanbanTask, Tag } from "@/types/kanban";
import { api } from "@/lib/api";
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

export interface SortableTaskProps {
	task: KanbanTask;
	globalTags: Tag[];
	onDelete?: (id: string) => void;
	onClick?: (task: KanbanTask) => void;
	systemKey?: string;
	onContextAction?: (taskId: string, systemKey: string) => Promise<void>;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
}

export function SortableTask({
	task,
	globalTags,
	onDelete,
	onClick,
	systemKey,
	onContextAction,
	onUpdate,
}: SortableTaskProps) {
	const [isLoading, setIsLoading] = useState(false);
	const [latestSessionId, setLatestSessionId] = useState<string | null>(null);
	const [opencodeWebUrl, setOpencodeWebUrl] = useState<string | null>(null);
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

	useEffect(() => {
		let cancelled = false;

		async function fetchData() {
			try {
				const [runsResult, urlResult] = await Promise.allSettled([
					api.run.listByTask({ taskId: task.id }),
					api.opencode.getWebUrl({ projectId: task.projectId }),
				]);

				if (cancelled) return;

				if (runsResult.status === "fulfilled") {
					const runs = runsResult.value.runs;
					if (runs.length > 0) {
						const sorted = [...runs].sort(
							(a, b) =>
								new Date(b.createdAt).getTime() -
								new Date(a.createdAt).getTime(),
						);
						const latestRun = sorted[0];
						setLatestSessionId(latestRun?.sessionId || null);
					} else {
						setLatestSessionId(null);
					}
				} else {
					setLatestSessionId(null);
				}

				if (urlResult.status === "fulfilled") {
					setOpencodeWebUrl(urlResult.value.url);
				} else {
					setOpencodeWebUrl(null);
				}
			} catch {
				if (cancelled) return;
				setLatestSessionId(null);
				setOpencodeWebUrl(null);
			}
		}

		fetchData();
		return () => {
			cancelled = true;
		};
	}, [task.id, task.projectId]);

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
			<div className="block w-full min-w-0 p-4 text-left">
				<div className="mb-2 flex flex-wrap items-center gap-2">
					{onUpdate ? (
						<div onPointerDown={(e) => e.stopPropagation()}>
							<PillSelect
								label="Priority"
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

			<div className="px-4 pb-4 flex flex-wrap items-center gap-2 border-t border-slate-700/60 pt-3">
				{latestSessionId && opencodeWebUrl && (
					<a
						href={`${opencodeWebUrl}/session/${latestSessionId}`}
						target="_blank"
						rel="noopener noreferrer"
						onClick={(e) => e.stopPropagation()}
						onPointerDown={(e) => e.stopPropagation()}
						className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-blue-500/85 transition-colors hover:bg-blue-500/10 hover:text-blue-400 active:bg-blue-500/20"
						title="Open in OpenCode"
					>
						<ExternalLink className="h-3.5 w-3.5" />
						<span>Open in OpenCode</span>
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
						onDelete?.(task.id);
					}}
					onPointerDown={(e) => e.stopPropagation()}
					className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-blue-500/80 transition-colors hover:bg-blue-500/10 hover:text-blue-400 active:bg-blue-500/20"
					title="Delete Task"
				>
					<Trash2 className="h-3.5 w-3.5" />
					<span>Delete</span>
				</button>
			</div>
		</div>
	);
}
