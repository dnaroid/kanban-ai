"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	BookOpen,
	Trash2,
	Loader2,
	XCircle,
	RotateCcw,
	FlaskConical,
	Wrench,
} from "lucide-react";
import type { KanbanTask, Tag } from "@/types/kanban";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { PillSelect } from "@/components/common/PillSelect";
import { priorityConfig, typeConfig } from "../TaskPropertyConfigs";
import {
	getWorkflowStatusVisual,
	toneOverlayStyle,
	toneBadgeStyle,
	createStatusPillOptions,
	createFallbackStatusPillOptions,
} from "../workflow-display";
import { useWorkflowDisplayConfig } from "../useWorkflowDisplayConfig";
import {
	getContextActionConfig,
	INACTIVE_CONTEXT_ACTION_STATUSES,
} from "./contextActions";
import { TaskDetailsModel } from "../drawer/sections/TaskDetailsModel";
import { StatusPillSelect } from "./StatusPillSelect";
import { TranslationModal } from "@/components/kanban/TranslationModal";

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
	const [isQaLoading, setIsQaLoading] = useState(false);
	const [isFixLoading, setIsFixLoading] = useState(false);
	const [isStoryModalOpen, setIsStoryModalOpen] = useState(false);
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

	const statusPillOptions = useMemo(() => {
		if (workflowConfig?.statuses?.length) {
			return createStatusPillOptions(workflowConfig.statuses);
		}
		return createFallbackStatusPillOptions();
	}, [workflowConfig]);

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
	const showRunQaButton =
		systemKey === "review" &&
		task.status === "done" &&
		task.isSessionBusy !== true;
	const showFixQaButton = task.status === "qa_failed";

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

	const handleRunQa = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (isQaLoading) return;
		setIsQaLoading(true);
		try {
			await api.opencode.startQaTesting({ taskId: task.id });
			onUpdate?.(task.id, {});
		} catch (error) {
			console.error("Failed to start QA testing:", error);
		} finally {
			setIsQaLoading(false);
		}
	};

	const handleFixQa = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (isFixLoading) return;
		setIsFixLoading(true);
		try {
			await api.opencode.fixQa({ taskId: task.id });
			onUpdate?.(task.id, {});
		} catch (error) {
			console.error("Failed to fix QA:", error);
		} finally {
			setIsFixLoading(false);
		}
	};

	const handleViewStory = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsStoryModalOpen(true);
	};

	return (
		<div
			ref={setCombinedRef}
			style={style}
			{...(isDeleting ? {} : { ...attributes, ...listeners })}
			data-testid={`task-card-${task.id}`}
			className={cn(
				"bg-slate-900/40 backdrop-blur-md border rounded-xl mb-[17px] group hover:shadow-lg hover:shadow-black/20 cursor-grab active:cursor-grabbing relative z-10 hover:z-20 border-slate-700 hover:border-slate-600",
				!task.isGenerated && "border-dashed",
				!isDeleting && "transition-all overflow-visible",
				isDragging && "opacity-50 shadow-2xl scale-105",
				isDeleting && "pointer-events-none",
				(task.status === "question" || task.status === "chat") &&
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
			{statusVisual && (
				<div
					className="absolute left-0 right-0 flex justify-center pointer-events-none"
					style={{ top: 0, transform: "translateY(-60%)" }}
				>
					{onUpdate ? (
						<div
							className={cn(
								"pointer-events-auto",
								task.isSessionBusy && "animate-text-blink",
							)}
							onPointerDown={(e) => e.stopPropagation()}
						>
							<StatusPillSelect
								value={task.status}
								options={statusPillOptions}
								onChange={(status) =>
									onUpdate(task.id, {
										status: status as KanbanTask["status"],
									})
								}
								tone={statusVisual.tone}
							/>
						</div>
					) : (
						<span
							className={cn(
								"inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider pointer-events-auto",
								task.isSessionBusy && "animate-text-blink",
							)}
							style={{
								color: statusVisual.tone,
								backgroundColor: `color-mix(in srgb, ${statusVisual.tone} 20%, rgb(15, 23, 42))`,
								border: `1px solid ${statusVisual.tone}50`,
							}}
						>
							{task.status}
						</span>
					)}
				</div>
			)}
			{task.wasQaRejected && (
				<div
					className="absolute top-2 right-2 z-10 pointer-events-none"
					title="Reopened after QA rejection"
				>
					<RotateCcw className="h-4 w-4 text-amber-400/80" />
				</div>
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
								borderless
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
					<h4
						data-testid="task-title"
						className="mb-2 text-sm font-semibold leading-snug text-slate-200"
					>
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
				{showContextButton && (
					<button
						type="button"
						onClick={handleContextClick}
						onPointerDown={handleContextPointerDown}
						disabled={isLoading}
						data-testid="run-task-button"
						className={cn(
							"inline-flex items-center gap-0.5 rounded-md text-xs font-semibold transition-colors",
							systemKey === "review" || systemKey === "closed"
								? "text-emerald-400/85 hover:text-emerald-300 hover:bg-emerald-500/10 active:bg-emerald-500/20"
								: systemKey === "in_progress"
									? "text-orange-400/85 hover:text-orange-300 hover:bg-orange-500/10 active:bg-orange-500/20"
									: "text-cyan-400/85 hover:text-cyan-300 hover:bg-cyan-500/10 active:bg-cyan-500/20",
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
				{showRunQaButton && (
					<button
						type="button"
						onClick={handleRunQa}
						onPointerDown={handleContextPointerDown}
						disabled={isQaLoading || isFixLoading}
						className={cn(
							"inline-flex items-center gap-0.5 rounded-md text-xs font-semibold transition-colors",
							"text-violet-400/85 hover:bg-violet-500/10 hover:text-violet-300 active:bg-violet-500/20",
							(isQaLoading || isFixLoading) && "pointer-events-none opacity-80",
						)}
						title="Run QA"
					>
						{isQaLoading ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<FlaskConical className="h-3.5 w-3.5" />
						)}
						<span>{isQaLoading ? "Running QA..." : "Run QA"}</span>
					</button>
				)}
				{showFixQaButton && (
					<button
						type="button"
						onClick={handleFixQa}
						onPointerDown={handleContextPointerDown}
						disabled={isFixLoading || isQaLoading}
						className={cn(
							"inline-flex items-center gap-0.5 rounded-md text-xs font-semibold transition-colors",
							"text-amber-400/85 hover:bg-amber-500/10 hover:text-amber-300 active:bg-amber-500/20",
							(isFixLoading || isQaLoading) && "pointer-events-none opacity-80",
						)}
						title="Fix & Retry"
					>
						{isFixLoading ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<Wrench className="h-3.5 w-3.5" />
						)}
						<span>{isFixLoading ? "Fixing..." : "Fix & Retry"}</span>
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
						className="inline-flex items-center gap-0.5 rounded-md text-xs font-semibold text-orange-400/85 transition-colors hover:bg-orange-500/10 hover:text-orange-300 active:bg-orange-500/20"
						title="Reject Task"
					>
						<XCircle className="h-3.5 w-3.5" />
						<span>Reject</span>
					</button>
				)}
				{systemKey === "ready" && task.description && (
					<button
						type="button"
						onClick={handleViewStory}
						onPointerDown={(e) => e.stopPropagation()}
						className="inline-flex items-center gap-0.5 rounded-md text-xs font-semibold transition-colors text-blue-400/85 hover:text-blue-300 hover:bg-blue-500/10 active:bg-blue-500/20"
						title="View Story"
					>
						<BookOpen className="h-3.5 w-3.5" />
						<span>View Story</span>
					</button>
				)}
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onDelete?.(task.id);
					}}
					onPointerDown={(e) => e.stopPropagation()}
					className="inline-flex items-center gap-0.5 rounded-md text-xs font-semibold text-red-400/85 transition-colors hover:bg-red-500/10 hover:text-red-300 active:bg-red-500/20"
					title="Delete Task"
				>
					<Trash2 className="h-3.5 w-3.5" />
					<span>Delete</span>
				</button>
			</div>
			<TranslationModal
				taskId={task.id}
				storyText={task.description}
				open={isStoryModalOpen}
				onOpenChange={setIsStoryModalOpen}
			/>
		</div>
	);
}
