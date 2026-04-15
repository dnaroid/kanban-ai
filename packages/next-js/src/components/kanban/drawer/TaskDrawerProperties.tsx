"use client";

import { useEffect, useState } from "react";
import {
	Circle,
	Clock,
	ExternalLink,
	FolderKanban,
	Hash,
	Settings,
} from "lucide-react";
import { PillSelect } from "@/components/common/PillSelect";
import type { KanbanTask } from "@/types/kanban";
import { api } from "@/lib/api";
import {
	blockedReasonConfig,
	closedReasonConfig,
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
	const [latestSessionId, setLatestSessionId] = useState<string | null>(null);
	const [opencodeWebUrl, setOpencodeWebUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function fetchData() {
			try {
				const result = await api.run.listByTask({ taskId: task.id });

				if (cancelled) return;

				const runs = result.runs;
				if (runs.length > 0) {
					const sorted = [...runs].sort(
						(a, b) =>
							new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
					);
					const latestRun = sorted[0];
					setLatestSessionId(latestRun?.sessionId || null);
				}

				setOpencodeWebUrl(result.opencodeWebUrl);
			} catch {}
		}

		fetchData();
		return () => {
			cancelled = true;
		};
	}, [task.id]);

	const formatDate = (dateString: string | undefined) => {
		if (!dateString) return "—";
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
					{latestSessionId ? (
						<div className="space-y-1.5">
							<span className="block text-xs text-slate-400 font-mono bg-slate-900/50 px-4 py-3 rounded-xl border border-slate-800/50 shadow-inner break-all">
								{latestSessionId}
							</span>
							{opencodeWebUrl && (
								<a
									href={`${opencodeWebUrl}/session/${latestSessionId}`}
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
