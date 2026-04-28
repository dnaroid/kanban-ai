import { useCallback, useEffect, useState } from "react";
import {
	FlaskConical,
	Loader2,
	Plus,
	RotateCcw,
	Square,
	Terminal,
	Trash2,
	User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KanbanTask } from "@/types/kanban";
import type { Run } from "@/types/ipc";
import { RunDetailsView } from "./RunDetailsView";
import { runStatusConfig } from "./TaskPropertyConfigs";
import { api } from "@/lib/api";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";

interface TaskDrawerRunsProps {
	task: KanbanTask;
	isActive: boolean;
	onRefreshTask?: () => Promise<void> | void;
}

interface RunEventUpdate {
	runId?: string;
	status?: Run["status"];
	[eventKey: string]: unknown;
}

interface AgentRole {
	id: string;
	name: string;
	description: string;
	quickSelect: boolean;
}

const AGENT_ROLE_TAG_PREFIX = "agent:";
const QA_TESTING_RUN_KIND = "task-qa-testing";

function parseQuickSelectFlag(rawPresetJson: string): boolean {
	try {
		const parsed = JSON.parse(rawPresetJson) as {
			behavior?: { quickSelect?: unknown };
		};
		return parsed.behavior?.quickSelect === true;
	} catch {
		return false;
	}
}

function resolveAssignedRoleId(
	tags: string[] | null | undefined,
): string | null {
	if (!Array.isArray(tags)) {
		return null;
	}

	const roleTag = tags.find((tag) =>
		tag.toLowerCase().startsWith(AGENT_ROLE_TAG_PREFIX),
	);
	if (!roleTag) {
		return null;
	}

	const roleId = roleTag.slice(AGENT_ROLE_TAG_PREFIX.length).trim();
	return roleId.length > 0 ? roleId : null;
}

function selectRunId(
	runs: Run[],
	previousSelectedRunId: string | null,
): string | null {
	if (runs.length === 0) return null;

	if (
		previousSelectedRunId &&
		runs.some((run) => run.id === previousSelectedRunId)
	) {
		return previousSelectedRunId;
	}

	const activeRun = runs.find(
		(run) => run.status === "running" || run.status === "queued",
	);
	if (activeRun) {
		return activeRun.id;
	}

	const sortedRuns = [...runs].sort((a, b) =>
		b.createdAt.localeCompare(a.createdAt),
	);
	return sortedRuns[0].id;
}

function isQaTestingRun(run: Run): boolean {
	return run.metadata?.kind === QA_TESTING_RUN_KIND;
}

export function TaskDrawerRuns({
	task,
	isActive,
	onRefreshTask,
}: TaskDrawerRunsProps) {
	const [runs, setRuns] = useState<Run[]>([]);
	const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
	const [isLoadingRuns, setIsLoadingRuns] = useState(false);
	const [isStartingRun, setIsStartingRun] = useState(false);
	const [isStartingQaTesting, setIsStartingQaTesting] = useState(false);
	const [isFixingQa, setIsFixingQa] = useState(false);
	const [mergingRunId, setMergingRunId] = useState<string | null>(null);
	const [roles, setRoles] = useState<AgentRole[]>([]);
	const [selectedRoleId, setSelectedRoleId] = useState<string>("");
	const [runToDelete, setRunToDelete] = useState<string | null>(null);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [showDirtyGitConfirm, setShowDirtyGitConfirm] = useState(false);

	const quickSelectRoles = roles.filter((role) => role.quickSelect);
	const assignedRoleId = resolveAssignedRoleId(task.tags);
	const assignedRole = assignedRoleId
		? (roles.find((role) => role.id === assignedRoleId) ?? null)
		: null;
	const visibleRoles =
		quickSelectRoles.length > 0
			? assignedRole &&
				!quickSelectRoles.some((role) => role.id === assignedRole.id)
				? [...quickSelectRoles, assignedRole]
				: quickSelectRoles
			: roles;

	const fetchRuns = useCallback(async () => {
		setIsLoadingRuns(true);
		try {
			const response = await api.run.listByTask({ taskId: task.id });
			setRuns(response.runs);

			setSelectedRunId((prev) => selectRunId(response.runs, prev));
		} catch (error) {
			console.error("Failed to fetch runs:", error);
		} finally {
			setIsLoadingRuns(false);
		}
	}, [task.id]);

	useEffect(() => {
		if (isActive) {
			fetchRuns();
		}
	}, [isActive, fetchRuns]);

	// SSE: real-time updates when tab is active
	useEffect(() => {
		if (!isActive) return;

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
			if (!update.runId) return;
			setRuns((prev) => {
				const idx = prev.findIndex((r) => r.id === update.runId);
				if (idx >= 0) {
					const updated = [...prev];
					updated[idx] = { ...updated[idx], ...update };
					return updated;
				}
				return prev;
			});
		});

		eventSource.onerror = (err) => {
			console.error("SSE error:", err);
		};

		return () => {
			eventSource.close();
		};
	}, [isActive]);

	const handleStartRun = async (forceDirtyGit = false) => {
		if (isStartingRun) return;
		setIsStartingRun(true);
		try {
			const response = await api.run.start({
				taskId: task.id,
				roleId: selectedRoleId,
				modelName: task.modelName ?? null,
				forceDirtyGit,
			});
			await onRefreshTask?.();
			await fetchRuns();
			setSelectedRunId(response.runId);
		} catch (error) {
			if (
				!forceDirtyGit &&
				error instanceof Error &&
				error.message.startsWith("DIRTY_GIT:")
			) {
				setShowDirtyGitConfirm(true);
				return;
			}
			console.error("Failed to start run:", error);
			await onRefreshTask?.();
			await fetchRuns();
		} finally {
			setIsStartingRun(false);
		}
	};

	const handleStartQaTesting = async () => {
		if (isStartingQaTesting) return;
		setIsStartingQaTesting(true);
		try {
			const response = await api.opencode.startQaTesting({ taskId: task.id });
			await onRefreshTask?.();
			await fetchRuns();
			setSelectedRunId(response.runId);
		} catch (error) {
			console.error("Failed to start QA testing:", error);
			await onRefreshTask?.();
			await fetchRuns();
		} finally {
			setIsStartingQaTesting(false);
		}
	};

	const handleFixQa = async () => {
		if (isFixingQa) return;
		setIsFixingQa(true);
		try {
			await api.opencode.fixQa({ taskId: task.id });
			await onRefreshTask?.();
			await fetchRuns();
		} catch (error) {
			console.error("Failed to fix QA:", error);
			await onRefreshTask?.();
			await fetchRuns();
		} finally {
			setIsFixingQa(false);
		}
	};

	const handleDirtyGitConfirmStart = () => {
		setShowDirtyGitConfirm(false);
		void handleStartRun(true);
	};

	const handleCancelRun = async (runId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await api.run.cancel({ runId });
			await onRefreshTask?.();
			await fetchRuns();
		} catch (error) {
			console.error("Failed to cancel run:", error);
		}
	};

	const handleDeleteRun = (runId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setRunToDelete(runId);
		setShowDeleteConfirm(true);
	};

	const confirmDeleteRun = async () => {
		if (!runToDelete) return;
		try {
			await api.run.delete({ runId: runToDelete });
			await fetchRuns();
			if (selectedRunId === runToDelete) {
				setSelectedRunId(null);
			}
		} catch (error) {
			console.error("Failed to delete run:", error);
		} finally {
			setShowDeleteConfirm(false);
			setRunToDelete(null);
		}
	};

	const handleRetryRun = async (run: Run, e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			const response = isQaTestingRun(run)
				? await api.opencode.startQaTesting({ taskId: task.id })
				: await api.run.start({
						taskId: task.id,
						roleId: run.roleId || selectedRoleId || visibleRoles[0]?.id,
						mode: run.mode,
						modelName: task.modelName ?? null,
					});
			await onRefreshTask?.();
			await fetchRuns();
			setSelectedRunId(response.runId);
		} catch (error) {
			console.error("Failed to retry run:", error);
			await onRefreshTask?.();
			await fetchRuns();
		}
	};

	const handleMergeRun = async (runId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		if (mergingRunId === runId) {
			return;
		}

		setMergingRunId(runId);
		try {
			await api.run.merge({ runId });
			await onRefreshTask?.();
			await fetchRuns();
			setSelectedRunId(runId);
		} catch (error) {
			console.error("Failed to merge run:", error);
			await onRefreshTask?.();
			await fetchRuns();
		} finally {
			setMergingRunId(null);
		}
	};

	useEffect(() => {
		const fetchRoles = async () => {
			try {
				const response = await api.roles.listFull();
				const fetchedRoles = response.roles.map((role) => ({
					id: role.id,
					name: role.name,
					description: role.description,
					quickSelect: parseQuickSelectFlag(role.preset_json),
				}));
				setRoles(fetchedRoles);
				if (fetchedRoles.length === 0) return;

				const dailyRoles = fetchedRoles.filter((role) => role.quickSelect);
				const assignedRoleFromTask = resolveAssignedRoleId(task.tags);
				const assignedRoleExists = assignedRoleFromTask
					? fetchedRoles.some((role) => role.id === assignedRoleFromTask)
					: false;
				const defaultRole =
					(assignedRoleExists ? assignedRoleFromTask : null) ??
					(dailyRoles.length > 0 ? dailyRoles[0].id : fetchedRoles[0].id);
				setSelectedRoleId(defaultRole);
			} catch (error) {
				console.error("Failed to fetch roles:", error);
			}
		};

		fetchRoles();
	}, [task.tags]);

	const selectedRun = runs.find((r) => r.id === selectedRunId) || null;

	return (
		<div className="flex flex-col h-full bg-[#0B0E14] animate-in fade-in duration-300">
			<div className="flex-1 overflow-y-auto custom-scrollbar">
				{selectedRun ? (
					<RunDetailsView
						runId={selectedRun.id}
						run={selectedRun}
						isActive={isActive}
						onBack={() => setSelectedRunId(null)}
						onDelete={(e) => handleDeleteRun(selectedRun.id, e)}
						onRestart={(e) => selectedRun && handleRetryRun(selectedRun, e)}
						onCancel={(e) => handleCancelRun(selectedRun.id, e)}
						onMerge={(e) => handleMergeRun(selectedRun.id, e)}
						isMerging={mergingRunId === selectedRun.id}
						showBack={runs.length > 1}
						taskStatus={task.status}
					/>
				) : (
					<>
						<div className="sticky top-0 z-10 px-4 pt-4 pb-2 bg-[#0B0E14]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0B0E14]/80">
							<div className="flex items-center justify-end gap-2">
								{task.status === "done" && (
									<button
										type="button"
										onClick={() => void handleStartQaTesting()}
										disabled={isStartingQaTesting || isStartingRun}
										className={cn(
											"inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors border",
											isStartingQaTesting || isStartingRun
												? "cursor-not-allowed border-emerald-500/20 bg-emerald-500/10 text-emerald-300/60"
												: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
										)}
									>
										{isStartingQaTesting ? (
											<>
												<Loader2 className="w-3.5 h-3.5 animate-spin" />
												QA Testing...
											</>
										) : (
											<>
												<FlaskConical className="w-3.5 h-3.5" />
												QA Testing
											</>
										)}
									</button>
								)}
								{task.status === "qa_failed" && (
									<button
										type="button"
										onClick={() => void handleFixQa()}
										disabled={isFixingQa || isStartingRun}
										className={cn(
											"inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors border",
											isFixingQa || isStartingRun
												? "cursor-not-allowed border-orange-500/20 bg-orange-500/10 text-orange-300/60"
												: "border-orange-500/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20",
										)}
									>
										{isFixingQa ? (
											<>
												<Loader2 className="w-3.5 h-3.5 animate-spin" />
												Fixing...
											</>
										) : (
											<>
												<RotateCcw className="w-3.5 h-3.5" />
												Fix & Retry
											</>
										)}
									</button>
								)}
								<button
									type="button"
									onClick={() => void handleStartRun()}
									disabled={isStartingRun || isStartingQaTesting}
									className={cn(
										"inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors border",
										isStartingRun || isStartingQaTesting
											? "cursor-not-allowed border-slate-700 bg-slate-800 text-slate-500"
											: "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700",
									)}
								>
									{isStartingRun ? (
										<>
											<Loader2 className="w-3.5 h-3.5 animate-spin" />
											Starting Run...
										</>
									) : (
										<>
											<Plus className="w-3.5 h-3.5" />
											New Run
										</>
									)}
								</button>
							</div>
						</div>
						<div className="p-4 space-y-3">
							{task.qaReport && (
								<div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-3">
									<div className="flex items-center gap-2 mb-2 text-slate-300">
										<FlaskConical className="w-4 h-4 text-emerald-400" />
										<span className="text-xs font-bold uppercase tracking-wider">
											QA Report
										</span>
									</div>
									<div className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed">
										{task.qaReport}
									</div>
								</div>
							)}
							{runs.length === 0 && !isLoadingRuns ? (
								<div className="flex flex-col items-center justify-center h-full space-y-4 opacity-50 py-12">
									<div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
										<Terminal className="w-8 h-8 text-slate-600" />
									</div>
									<div className="text-center space-y-1">
										<p className="text-sm font-medium text-slate-400">
											No runs yet
										</p>
										<p className="text-xs text-slate-600 max-w-[220px]">
											Start a regular execution run or launch QA testing for
											this task.
										</p>
									</div>
								</div>
							) : (
								runs.map((run) => {
									const statusStyle =
										runStatusConfig[
											run.status as keyof typeof runStatusConfig
										] || runStatusConfig.queued;

									return (
										<button
											key={run.id}
											type="button"
											className={cn(
												"group relative bg-[#161B26] border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 overflow-hidden cursor-pointer text-left w-full",
											)}
											onClick={() => setSelectedRunId(run.id)}
										>
											<div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
												{!["running", "queued"].includes(run.status) && (
													<button
														type="button"
														onClick={(e) => handleRetryRun(run, e)}
														data-testid="run-task-button"
														className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-700 hover:border-slate-600 transition-colors shadow-lg"
														title={
															isQaTestingRun(run)
																? "Retry QA testing"
																: "Retry run"
														}
													>
														<RotateCcw className="w-3.5 h-3.5" />
													</button>
												)}
												{["running", "queued"].includes(run.status) && (
													<button
														type="button"
														onClick={(e) => handleCancelRun(run.id, e)}
														className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg border border-red-500/20 transition-colors shadow-lg"
														title="Cancel run"
													>
														<Square className="w-3.5 h-3.5 fill-current" />
													</button>
												)}
												{!["running", "queued"].includes(run.status) && (
													<button
														type="button"
														onClick={(e) => handleDeleteRun(run.id, e)}
														className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg border border-red-500/20 transition-colors shadow-lg"
														title="Delete run"
													>
														<Trash2 className="w-3.5 h-3.5" />
													</button>
												)}
											</div>

											<div className="flex items-start justify-between mb-3">
												<div className="flex items-center gap-3">
													<div
														className={cn(
															"w-8 h-8 rounded-lg flex items-center justify-center border",
															statusStyle.bg,
															statusStyle.border,
															statusStyle.color,
														)}
													>
														<statusStyle.icon
															className={cn(
																"w-4 h-4",
																run.status === "running" && "animate-spin",
															)}
														/>
													</div>
													<div>
														<div className="flex items-center gap-2 flex-wrap">
															<span className="text-sm font-semibold text-slate-200 font-mono">
																{run.id.slice(0, 8)}
															</span>
															<span
																data-testid="run-status"
																className={cn(
																	"text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border tracking-wider",
																	statusStyle.bg,
																	statusStyle.border,
																	statusStyle.color,
																)}
															>
																{run.status}
															</span>
															{isQaTestingRun(run) && (
																<span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border tracking-wider bg-emerald-500/10 border-emerald-500/20 text-emerald-300">
																	QA
																</span>
															)}
														</div>
														<div className="flex items-center gap-2 mt-1 flex-wrap">
															<span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
																<User className="w-3 h-3" />
																{run.roleId || "default"}
															</span>
															<span className="text-slate-700 text-[10px]">
																•
															</span>
															<span className="text-[10px] text-slate-500 font-medium font-mono">
																{new Date(run.createdAt).toLocaleString()}
															</span>
														</div>
													</div>
												</div>
											</div>
										</button>
									);
								})
							)}
						</div>
					</>
				)}
			</div>

			<ConfirmationModal
				isOpen={showDeleteConfirm}
				onClose={() => {
					setShowDeleteConfirm(false);
					setRunToDelete(null);
				}}
				onConfirm={confirmDeleteRun}
				title="Delete Execution Run"
				description={`Are you sure you want to delete run ${runToDelete?.slice(0, 8)}? All execution logs and results for this run will be permanently removed.`}
				confirmLabel="Delete Run"
			/>

			<ConfirmationModal
				isOpen={showDirtyGitConfirm}
				onClose={() => setShowDirtyGitConfirm(false)}
				onConfirm={handleDirtyGitConfirmStart}
				title="Uncommitted Changes Detected"
				description="The working tree has uncommitted changes. Running tasks with a dirty git state may cause conflicts or data loss. Proceed at your own risk."
				confirmLabel="Run Anyway"
				cancelLabel="Cancel"
				variant="warning"
			/>
		</div>
	);
}
