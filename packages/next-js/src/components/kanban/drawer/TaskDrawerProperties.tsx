"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import {
	BarChart3,
	Calendar,
	CalendarClock,
	Circle,
	ClipboardCheck,
	Clock,
	Cpu,
	ExternalLink,
	FileText,
	FolderKanban,
	Hash,
	Link2,
	Play,
	Settings,
	Signal,
	Sparkles,
	Tag,
	Tags,
	Target,
	Timer,
	Type,
	User,
} from "lucide-react";
import { PillSelect } from "@/components/common/PillSelect";
import type { KanbanTask, TaskLink } from "@/types/kanban";
import type { Run } from "@/types/ipc";
import {
	blockedReasonConfig,
	closedReasonConfig,
	difficultyConfig,
	priorityConfig,
	runStatusConfig,
	typeConfig,
} from "../TaskPropertyConfigs";

interface TaskDrawerPropertiesProps {
	task: KanbanTask;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
}

const noneReasonOption = {
	icon: Circle,
	color: "text-slate-400",
	bg: "bg-slate-400/10",
	border: "border-slate-400/20",
	label: "None",
} as const;

const blockedReasonSelectConfig = {
	none: noneReasonOption,
	...blockedReasonConfig,
};

const closedReasonSelectConfig = {
	none: noneReasonOption,
	...closedReasonConfig,
};

export function TaskDrawerProperties({
	task,
	onUpdate,
}: TaskDrawerPropertiesProps) {
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	const [runs, setRuns] = useState<Run[]>([]);
	const [taskLinks, setTaskLinks] = useState<TaskLink[]>([]);

	useEffect(() => {
		let cancelled = false;
		Promise.all([
			api.run
				.listByTask({ taskId: task.id })
				.catch(() => ({ runs: [] as Run[], opencodeWebUrl: null })),
			api.deps
				.list({ taskId: task.id })
				.catch(() => ({ links: [] as TaskLink[] })),
		]).then(([runsResult, linksResult]) => {
			if (cancelled) return;
			setRuns(runsResult.runs ?? []);
			setTaskLinks(linksResult.links ?? []);
		});
		return () => {
			cancelled = true;
		};
	}, [task.id]);

	const formatDate = (
		dateString: string | undefined | null,
		defaultText = "—",
	) => {
		if (!dateString) return defaultText;
		const date = new Date(dateString);
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	};

	const reasonScope = (() => {
		if (task.closedReason !== null) {
			return "closed" as const;
		}

		if (task.blockedReason !== null) {
			return "blocked" as const;
		}

		if (task.status === "done") {
			return "closed" as const;
		}

		if (
			task.status === "question" ||
			task.status === "paused" ||
			task.status === "failed"
		) {
			return "blocked" as const;
		}

		return "none" as const;
	})();

	const descriptionText = task.descriptionMd || task.description;
	const isDescriptionExpanded = expanded["description"];
	const hasLongDescription = descriptionText && descriptionText.length > 200;

	const qaReportText = task.qaReport;
	const isQaReportExpanded = expanded["qaReport"];
	const hasLongQaReport = qaReportText && qaReportText.length > 200;

	return (
		<div className="p-8 space-y-8 animate-in fade-in duration-300 overflow-y-auto">
			<div className="flex items-center gap-3 mb-6">
				<div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
					<Settings className="w-5 h-5" />
				</div>
				<div>
					<h3 className="text-sm font-bold text-white uppercase tracking-wider">
						Task Properties
					</h3>
					<p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">
						Metadata and system information
					</p>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-8">
				{/* NEW FIELDS */}
				<div className="col-span-2 space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Type className="w-2.5 h-2.5" />
						Title
					</p>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{task.title}
					</span>
				</div>

				<div className="col-span-2 space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<FileText className="w-2.5 h-2.5" />
						Description
					</p>
					{descriptionText ? (
						<>
							<div
								className={cn(
									"text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner whitespace-pre-wrap",
									!isDescriptionExpanded &&
										hasLongDescription &&
										"line-clamp-3",
								)}
							>
								{descriptionText}
							</div>
							{hasLongDescription && (
								<button
									onClick={() =>
										setExpanded((p) => ({ ...p, description: !p.description }))
									}
									className="text-[10px] text-slate-500 hover:text-slate-400 transition-colors mt-1"
								>
									{isDescriptionExpanded ? "Show less" : "Show more"}
								</button>
							)}
						</>
					) : (
						<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
							No description
						</span>
					)}
				</div>

				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Signal className="w-2.5 h-2.5" />
						Priority
					</p>
					<div
						className={cn(
							"inline-flex items-center gap-2 px-3 py-1.5 rounded-full border",
							priorityConfig[task.priority].bg,
							priorityConfig[task.priority].border,
						)}
					>
						{(() => {
							const Icon = priorityConfig[task.priority].icon;
							return (
								<Icon
									className={cn(
										"w-3.5 h-3.5",
										priorityConfig[task.priority].color,
									)}
								/>
							);
						})()}
						<span
							className={cn(
								"text-[11px] font-bold uppercase tracking-wider",
								priorityConfig[task.priority].color,
							)}
						>
							{task.priority}
						</span>
					</div>
				</div>

				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<BarChart3 className="w-2.5 h-2.5" />
						Difficulty
					</p>
					<div
						className={cn(
							"inline-flex items-center gap-2 px-3 py-1.5 rounded-full border",
							difficultyConfig[task.difficulty].bg,
							difficultyConfig[task.difficulty].border,
						)}
					>
						{(() => {
							const Icon = difficultyConfig[task.difficulty].icon;
							return (
								<Icon
									className={cn(
										"w-3.5 h-3.5",
										difficultyConfig[task.difficulty].color,
									)}
								/>
							);
						})()}
						<span
							className={cn(
								"text-[11px] font-bold uppercase tracking-wider",
								difficultyConfig[task.difficulty].color,
							)}
						>
							{task.difficulty}
						</span>
					</div>
				</div>

				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Tag className="w-2.5 h-2.5" />
						Type
					</p>
					<div
						className={cn(
							"inline-flex items-center gap-2 px-3 py-1.5 rounded-full border",
							typeConfig[task.type].bg,
							typeConfig[task.type].border,
						)}
					>
						{(() => {
							const Icon = typeConfig[task.type].icon;
							return (
								<Icon
									className={cn("w-3.5 h-3.5", typeConfig[task.type].color)}
								/>
							);
						})()}
						<span
							className={cn(
								"text-[11px] font-bold uppercase tracking-wider",
								typeConfig[task.type].color,
							)}
						>
							{task.type}
						</span>
					</div>
				</div>

				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<User className="w-2.5 h-2.5" />
						Assignee
					</p>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{task.assignee ?? "Unassigned"}
					</span>
				</div>

				<div className="col-span-2 space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Tags className="w-2.5 h-2.5" />
						Tags
					</p>
					{task.tags && task.tags.length > 0 ? (
						<div className="flex flex-wrap gap-2">
							{task.tags.map((tag) => (
								<span
									key={tag}
									className="px-2.5 py-1 text-[11px] font-medium bg-slate-800/50 text-slate-300 border border-slate-700/50 rounded-full"
								>
									{tag}
								</span>
							))}
						</div>
					) : (
						<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
							No tags
						</span>
					)}
				</div>

				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Calendar className="w-2.5 h-2.5" />
						Start Date
					</p>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{formatDate(task.startDate, "Not set")}
					</span>
				</div>

				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<CalendarClock className="w-2.5 h-2.5" />
						Due Date
					</p>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{formatDate(task.dueDate, "Not set")}
					</span>
				</div>

				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Target className="w-2.5 h-2.5" />
						Estimate Points
					</p>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{task.estimatePoints !== null
							? `${task.estimatePoints} pts`
							: "Not set"}
					</span>
				</div>

				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Timer className="w-2.5 h-2.5" />
						Estimate Hours
					</p>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{task.estimateHours !== null
							? `${task.estimateHours} h`
							: "Not set"}
					</span>
				</div>

				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Cpu className="w-2.5 h-2.5" />
						Model Name
					</p>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{task.modelName ?? "Not set"}
					</span>
				</div>

				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Sparkles className="w-2.5 h-2.5" />
						Generated
					</p>
					<div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						<div
							className={cn(
								"w-2 h-2 rounded-full",
								task.isGenerated ? "bg-green-500" : "bg-slate-500",
							)}
						/>
						{task.isGenerated ? "Yes" : "No"}
					</div>
				</div>

				<div className="col-span-2 space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<ClipboardCheck className="w-2.5 h-2.5" />
						QA Report
					</p>
					{qaReportText ? (
						<>
							<div
								className={cn(
									"text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner whitespace-pre-wrap",
									!isQaReportExpanded && hasLongQaReport && "line-clamp-3",
								)}
							>
								{qaReportText}
							</div>
							{hasLongQaReport && (
								<button
									onClick={() =>
										setExpanded((p) => ({ ...p, qaReport: !p.qaReport }))
									}
									className="text-[10px] text-slate-500 hover:text-slate-400 transition-colors mt-1"
								>
									{isQaReportExpanded ? "Show less" : "Show more"}
								</button>
							)}
						</>
					) : (
						<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
							No report
						</span>
					)}
				</div>

				{/* Task Links */}
				<div className="col-span-2 space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Link2 className="w-2.5 h-2.5" />
						Task Links
					</p>
					{taskLinks.length > 0 ? (
						<div className="space-y-1.5">
							{taskLinks.map((link) => {
								const isOutgoing = link.fromTaskId === task.id;
								const otherTaskId = isOutgoing
									? link.toTaskId
									: link.fromTaskId;
								const direction = isOutgoing ? "→" : "←";
								const typeLabel =
									link.linkType === "blocks" ? "blocks" : "relates to";
								return (
									<div
										key={link.id}
										className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/50 px-4 py-2.5 rounded-xl border border-slate-800/50"
									>
										<span
											className={cn(
												"px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
												link.linkType === "blocks"
													? "bg-amber-400/10 text-amber-400 border-amber-400/20"
													: "bg-blue-400/10 text-blue-400 border-blue-400/20",
											)}
										>
											{link.linkType}
										</span>
										<span className="text-slate-600">{direction}</span>
										<span className="font-mono text-[11px] text-slate-500 truncate">
											{otherTaskId}
										</span>
										<span className="text-slate-600 ml-auto text-[10px]">
											{isOutgoing ? typeLabel : `is ${typeLabel} by`}
										</span>
									</div>
								);
							})}
						</div>
					) : (
						<span className="block text-xs text-slate-500 italic bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
							No linked tasks
						</span>
					)}
				</div>

				{/* Runs */}
				<div className="col-span-2 space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Play className="w-2.5 h-2.5" />
						Runs
						<span className="ml-1 px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 text-[9px]">
							{runs.length}
						</span>
					</p>
					{runs.length > 0 ? (
						<div className="space-y-1.5">
							{runs.map((run) => {
								const statusCfg =
									runStatusConfig[run.status as keyof typeof runStatusConfig];
								const StatusIcon = statusCfg?.icon ?? Circle;
								return (
									<div
										key={run.id}
										className="flex items-center gap-3 text-xs bg-slate-900/50 px-4 py-2.5 rounded-xl border border-slate-800/50"
									>
										<div
											className={cn(
												"flex items-center gap-1.5 px-2 py-0.5 rounded border shrink-0",
												statusCfg?.bg ?? "bg-slate-400/10",
												statusCfg?.border ?? "border-slate-400/20",
											)}
										>
											<StatusIcon
												className={cn(
													"w-3 h-3",
													statusCfg?.color ?? "text-slate-400",
												)}
											/>
											<span
												className={cn(
													"text-[10px] font-bold uppercase tracking-wider",
													statusCfg?.color ?? "text-slate-400",
												)}
											>
												{run.status}
											</span>
										</div>
										{run.model && (
											<span className="text-slate-500 text-[11px] truncate">
												{run.model}
											</span>
										)}
										<span className="text-slate-600 ml-auto text-[10px] shrink-0">
											{formatDate(run.createdAt)}
										</span>
									</div>
								);
							})}
						</div>
					) : (
						<span className="block text-xs text-slate-500 italic bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
							No runs recorded
						</span>
					)}
				</div>

				{/* EXISTING SYSTEM FIELDS */}
				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Hash className="w-2.5 h-2.5" />
						Task ID
					</p>
					<span className="block text-xs text-slate-400 font-mono bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{task.id}
					</span>
				</div>
				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<FolderKanban className="w-2.5 h-2.5" />
						Column ID
					</p>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{task.columnId}
					</span>
				</div>
				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Clock className="w-2.5 h-2.5" />
						Created At
					</p>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{formatDate(task.createdAt)}
					</span>
				</div>
				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<Clock className="w-2.5 h-2.5" />
						Last Updated
					</p>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{formatDate(task.updatedAt)}
					</span>
				</div>
				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
						Position in Column
					</p>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						#{task.orderInColumn + 1}
					</span>
				</div>
				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
						Project ID
					</p>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner font-mono">
						{task.projectId}
					</span>
				</div>
				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
						Board ID
					</p>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner font-mono">
						{task.boardId}
					</span>
				</div>
				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
						Status
					</p>
					<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
						{task.status}
					</span>
				</div>
				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
						Blocked Reason
					</p>
					{reasonScope === "blocked" ? (
						<>
							<PillSelect
								label=""
								value={task.blockedReason ?? "none"}
								options={blockedReasonSelectConfig}
								displayValue={task.blockedReason ?? "None"}
								onChange={(value) =>
									onUpdate?.(task.id, {
										blockedReason:
											value === "none"
												? null
												: (value as KanbanTask["blockedReason"]),
									})
								}
							/>
							<p className="text-[10px] text-slate-500 leading-relaxed">
								Manual value is kept until status or column changes.
							</p>
						</>
					) : (
						<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
							{task.blockedReason ?? "—"}
						</span>
					)}
				</div>
				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
						Closed Reason
					</p>
					{reasonScope === "closed" ? (
						<>
							<PillSelect
								label=""
								value={task.closedReason ?? "none"}
								options={closedReasonSelectConfig}
								displayValue={task.closedReason ?? "None"}
								onChange={(value) =>
									onUpdate?.(task.id, {
										closedReason:
											value === "none"
												? null
												: (value as KanbanTask["closedReason"]),
									})
								}
							/>
							<p className="text-[10px] text-slate-500 leading-relaxed">
								Manual value is kept until status or column changes.
							</p>
						</>
					) : (
						<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
							{task.closedReason ?? "—"}
						</span>
					)}
				</div>
				<div className="space-y-2">
					<p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
						<ExternalLink className="w-2.5 h-2.5" />
						OpenCode Session
					</p>
					{task.latestSessionId ? (
						<div className="space-y-1.5">
							<span className="block text-xs text-slate-400 font-mono bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner break-all">
								{task.latestSessionId}
							</span>
							{task.opencodeWebUrl && (
								<a
									href={`${task.opencodeWebUrl}/session/${task.latestSessionId}`}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
								>
									<ExternalLink className="w-3 h-3" />
									Open in OpenCode
								</a>
							)}
						</div>
					) : (
						<span className="block text-xs text-slate-400 bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner">
							—
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
