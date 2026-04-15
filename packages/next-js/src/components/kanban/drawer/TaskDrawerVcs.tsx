import { useCallback, useEffect, useMemo, useState } from "react";
import {
	AlertTriangle,
	ArrowRight,
	CheckCircle2,
	GitBranch,
	GitCommitHorizontal,
	GitMerge,
	FolderGit2,
	RefreshCw,
	Sparkles,
	TriangleAlert,
	Workflow,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { KanbanTask } from "@/types/kanban";
import type { Run, RunVcsMetadata } from "@/types/ipc";

interface TaskDrawerVcsProps {
	task: KanbanTask;
	isActive: boolean;
	onOpenRuns: () => void;
}

interface RunEventUpdate {
	runId?: string;
	status?: Run["status"];
	createdAt?: string;
	updatedAt?: string;
	metadata?: Run["metadata"];
	[eventKey: string]: unknown;
}

function formatDateTime(value: string | undefined): string {
	if (!value) {
		return "-";
	}

	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: date.toLocaleString("en-US", {
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
}

function shortCommit(value: string | undefined): string {
	if (!value) {
		return "-";
	}

	return value.slice(0, 8);
}

function vcsRunsFrom(runs: Run[]): Run[] {
	return [...runs]
		.filter((run) => Boolean(run.metadata?.vcs))
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function badgeClassName(tone: "slate" | "blue" | "emerald" | "amber" | "rose") {
	const tones = {
		slate: "text-slate-300 bg-slate-500/10 border-slate-500/20",
		blue: "text-blue-300 bg-blue-500/10 border-blue-500/20",
		emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
		amber: "text-amber-300 bg-amber-500/10 border-amber-500/20",
		rose: "text-rose-300 bg-rose-500/10 border-rose-500/20",
	};

	return tones[tone];
}

function statusTone(
	status:
		| RunVcsMetadata["workspaceStatus"]
		| RunVcsMetadata["cleanupStatus"]
		| RunVcsMetadata["mergeStatus"],
): "slate" | "blue" | "emerald" | "amber" | "rose" {
	switch (status) {
		case "ready":
		case "pending":
			return "blue";
		case "merged":
		case "cleaned":
			return "emerald";
		case "dirty":
			return "amber";
		case "missing":
		case "failed":
			return "rose";
		default:
			return "slate";
	}
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div className="space-y-1">
			<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
				{label}
			</p>
			<p className="text-xs text-slate-200 break-all">{value}</p>
		</div>
	);
}

export function TaskDrawerVcs({
	task,
	isActive,
	onOpenRuns,
}: TaskDrawerVcsProps) {
	const [runs, setRuns] = useState<Run[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	const fetchRuns = useCallback(async () => {
		setIsLoading(true);
		try {
			const response = await api.run.listByTask({ taskId: task.id });
			setRuns(response.runs);
		} catch (error) {
			console.error("Failed to fetch VCS runs:", error);
		} finally {
			setIsLoading(false);
		}
	}, [task.id]);

	useEffect(() => {
		if (isActive) {
			void fetchRuns();
		}
	}, [fetchRuns, isActive]);

	useEffect(() => {
		if (!isActive) {
			return;
		}

		const token = localStorage.getItem("token");
		const params = new URLSearchParams();
		if (token) {
			params.set("token", token);
		}
		const query = params.toString();
		const eventSource = new EventSource(
			query.length > 0 ? `/events?${query}` : "/events",
		);

		eventSource.addEventListener("run:event", (event) => {
			const update = JSON.parse(event.data) as RunEventUpdate;
			const runId = update.runId;
			if (!runId) {
				return;
			}

			setRuns((previous) => {
				const index = previous.findIndex((run) => run.id === runId);
				if (index >= 0) {
					const next = [...previous];
					next[index] = { ...next[index], ...update };
					return next;
				}

				if (update.metadata?.vcs) {
					const insertedRun: Run = {
						id: runId,
						taskId: task.id,
						sessionId: "",
						roleId: "",
						mode: "execute",
						status: update.status ?? "queued",
						createdAt: update.createdAt ?? new Date().toISOString(),
						updatedAt: update.updatedAt ?? new Date().toISOString(),
						metadata: update.metadata,
					};

					return [insertedRun, ...previous];
				}

				return previous;
			});
		});

		eventSource.onerror = (error) => {
			console.error("VCS SSE error:", error);
		};

		return () => {
			eventSource.close();
		};
	}, [isActive, task.id]);

	const vcsRuns = useMemo(() => vcsRunsFrom(runs), [runs]);
	const latestRun = vcsRuns[0] ?? null;
	const latestVcs = latestRun?.metadata?.vcs ?? null;
	const latestError =
		latestVcs?.lastCleanupError ?? latestVcs?.lastMergeError ?? null;

	if (!latestRun || !latestVcs) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4 text-center text-slate-500 px-6">
				<div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50">
					<FolderGit2 className="w-8 h-8 text-slate-600" />
				</div>
				<div className="space-y-1 max-w-sm">
					<p className="text-sm font-semibold text-slate-300">
						No VCS activity yet
					</p>
					<p className="text-xs text-slate-500">
						Start an execution run to create a worktree and track merge state
						here.
					</p>
				</div>
				<button
					type="button"
					onClick={onOpenRuns}
					className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800/60 transition-colors"
				>
					<ArrowRight className="w-3.5 h-3.5" />
					Open Runs
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full bg-[#0B0E14] animate-in fade-in duration-300">
			<div className="p-4 border-b border-slate-800/50 bg-[#11151C]/50 flex items-center justify-between shrink-0">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg border border-slate-700/60 bg-slate-800/60">
						<FolderGit2 className="w-4 h-4 text-blue-300" />
					</div>
					<div>
						<h3 className="text-xs font-bold text-white uppercase tracking-wider">
							VCS State
						</h3>
						<p className="text-[10px] text-slate-500 font-medium">
							{vcsRuns.length} tracked run{vcsRuns.length === 1 ? "" : "s"}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => void fetchRuns()}
						className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
						title="Refresh VCS state"
					>
						<RefreshCw
							className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
						/>
					</button>
					<button
						type="button"
						onClick={onOpenRuns}
						className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors border border-slate-700"
					>
						Open Runs
						<ArrowRight className="w-3.5 h-3.5" />
					</button>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
				<div className="rounded-2xl border border-slate-800 bg-[#161B26] p-4 space-y-4">
					<div className="flex items-start justify-between gap-4">
						<div className="space-y-1">
							<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
								Latest tracked run
							</p>
							<p className="text-sm font-semibold text-white">
								#{latestRun.id.slice(0, 8)}
							</p>
							<p className="text-xs text-slate-500">
								{latestRun.status} · {formatDateTime(latestRun.updatedAt)}
							</p>
						</div>
						<div className="flex flex-wrap items-center justify-end gap-2">
							<div
								className={cn(
									"px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider",
									badgeClassName(statusTone(latestVcs.workspaceStatus)),
								)}
							>
								workspace {latestVcs.workspaceStatus}
							</div>
							<div
								className={cn(
									"px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider",
									badgeClassName(statusTone(latestVcs.mergeStatus)),
								)}
							>
								merge {latestVcs.mergeStatus}
							</div>
							<div
								className={cn(
									"px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider",
									badgeClassName(statusTone(latestVcs.cleanupStatus)),
								)}
							>
								cleanup {latestVcs.cleanupStatus}
							</div>
						</div>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Field label="Branch" value={latestVcs.branchName} />
						<Field label="Base branch" value={latestVcs.baseBranch} />
						<Field label="Worktree path" value={latestVcs.worktreePath} />
						<Field label="Repo root" value={latestVcs.repoRoot} />
					</div>

					<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
						<div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-1">
							<div className="flex items-center gap-2 text-slate-300">
								<GitCommitHorizontal className="w-3.5 h-3.5" />
								<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
									Base commit
								</p>
							</div>
							<p className="text-xs text-white">
								{shortCommit(latestVcs.baseCommit)}
							</p>
						</div>
						<div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-1">
							<div className="flex items-center gap-2 text-slate-300">
								<GitBranch className="w-3.5 h-3.5" />
								<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
									Head commit
								</p>
							</div>
							<p className="text-xs text-white">
								{shortCommit(latestVcs.headCommit)}
							</p>
						</div>
						<div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-1">
							<div className="flex items-center gap-2 text-slate-300">
								<Workflow className="w-3.5 h-3.5" />
								<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
									Changes pending
								</p>
							</div>
							<p className="text-xs text-white">
								{latestVcs.hasChanges ? "Yes" : "No"}
							</p>
						</div>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-4 gap-3">
						<div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-1">
							<div className="flex items-center gap-2 text-slate-300">
								<GitMerge className="w-3.5 h-3.5" />
								<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
									Merged by
								</p>
							</div>
							<p className="text-xs text-white">{latestVcs.mergedBy ?? "-"}</p>
						</div>
						<div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-1">
							<div className="flex items-center gap-2 text-slate-300">
								<CheckCircle2 className="w-3.5 h-3.5" />
								<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
									Merged at
								</p>
							</div>
							<p className="text-xs text-white">
								{formatDateTime(latestVcs.mergedAt)}
							</p>
						</div>
						<div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-1">
							<div className="flex items-center gap-2 text-slate-300">
								<GitCommitHorizontal className="w-3.5 h-3.5" />
								<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
									Merged commit
								</p>
							</div>
							<p className="text-xs text-white">
								{shortCommit(latestVcs.mergedCommit)}
							</p>
						</div>
						<div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-1">
							<div className="flex items-center gap-2 text-slate-300">
								<Sparkles className="w-3.5 h-3.5" />
								<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
									Cleaned at
								</p>
							</div>
							<p className="text-xs text-white">
								{formatDateTime(latestVcs.cleanedAt)}
							</p>
						</div>
					</div>

					{latestError && (
						<div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 flex items-start gap-3">
							<TriangleAlert className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
							<div className="space-y-1 min-w-0">
								<p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
									Latest VCS issue
								</p>
								<p className="text-xs text-amber-100 break-words">
									{latestError}
								</p>
							</div>
						</div>
					)}
				</div>

				<div className="rounded-2xl border border-slate-800 bg-[#161B26] p-4 space-y-3">
					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
								Recent VCS runs
							</p>
							<p className="text-xs text-slate-500">
								Latest runs that created a worktree or merge state
							</p>
						</div>
					</div>

					<div className="space-y-2">
						{vcsRuns.slice(0, 5).map((run) => {
							const vcs = run.metadata?.vcs;
							if (!vcs) {
								return null;
							}

							const rowError =
								vcs.lastCleanupError ?? vcs.lastMergeError ?? null;

							return (
								<div
									key={run.id}
									className="rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-3 space-y-2"
								>
									<div className="flex items-start justify-between gap-3">
										<div>
											<p className="text-xs font-semibold text-white">
												#{run.id.slice(0, 8)}
											</p>
											<p className="text-[10px] text-slate-500">
												{run.status} · {formatDateTime(run.updatedAt)}
											</p>
										</div>
										<div className="flex flex-wrap justify-end gap-2">
											<div
												className={cn(
													"px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider",
													badgeClassName(statusTone(vcs.mergeStatus)),
												)}
											>
												{vcs.mergeStatus}
											</div>
											<div
												className={cn(
													"px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider",
													badgeClassName(statusTone(vcs.cleanupStatus)),
												)}
											>
												{vcs.cleanupStatus}
											</div>
										</div>
									</div>
									<div className="text-[11px] text-slate-400 break-all">
										{vcs.branchName}
									</div>
									{rowError && (
										<div className="flex items-start gap-2 text-[11px] text-amber-300">
											<AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
											<span className="break-words">{rowError}</span>
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
