import { useCallback, useEffect, useState } from "react";
import { Plus, RotateCcw, Square, Terminal, Trash2, User } from "lucide-react";
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

export function TaskDrawerRuns({
	task,
	isActive,
	onRefreshTask,
}: TaskDrawerRunsProps) {
	const [runs, setRuns] = useState<Run[]>([]);
	const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
	const [isLoadingRuns, setIsLoadingRuns] = useState(false);
	const [isStartingRun, setIsStartingRun] = useState(false);
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
			const retryRoleId = run.roleId || selectedRoleId || visibleRoles[0]?.id;
			if (!retryRoleId) {
				console.error("Failed to retry run: no role available");
				return;
			}
			const response = await api.run.start({
				taskId: task.id,
				roleId: retryRoleId,
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
					<div className="p-4 space-y-3">
						{runs.length === 0 && !isLoadingRuns ? (
							<div className="flex flex-col items-center justify-center h-full space-y-4 opacity-50 py-12">
								<div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center border border-slate-700/50">
									<Terminal className="w-8 h-8 text-slate-600" />
								</div>
								<div className="text-center space-y-1">
									<p className="text-sm font-medium text-slate-400">
										No runs yet
									</p>
									<p className="text-xs text-slate-600 max-w-[200px]">
										Start a new run to execute this task
									</p>
								</div>
								<button
									type="button"
									onClick={() => void handleStartRun()}
									className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors border border-slate-700"
								>
									<Plus className="w-3.5 h-3.5" />
									Start First Run
								</button>
							</div>
						) : (
							runs.map((run) => {
								const statusStyle =
									runStatusConfig[run.status as keyof typeof runStatusConfig] ||
									runStatusConfig.queued;

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
													className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-700 hover:border-slate-600 transition-colors shadow-lg"
													title="Retry run"
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
													<div className="flex items-center gap-2">
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
													</div>
													<div className="flex items-center gap-2 mt-1">
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
