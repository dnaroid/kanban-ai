import { createLogger } from "@/lib/logger";
import type { SessionInspectionResult } from "@/server/opencode/session-manager";
import { boardRepo } from "@/server/repositories/board";
import { runRepo } from "@/server/repositories/run";
import { taskRepo } from "@/server/repositories/task";
import {
	getWorkflowColumnSystemKey,
	type TaskTransitionTrigger,
} from "@/server/run/task-state-machine";
import { deriveMetaStatus } from "@/server/run/run-session-interpreter";
import type { RunOutcome } from "@/server/run/run-finalizer";
import type { PollableBoardContext, Task } from "@/server/types";
import type { Run, RunStatus } from "@/types/ipc";

const log = createLogger("runs-queue");

interface TaskStatusProjectionServiceDeps {
	sessionManager: {
		inspectSession: (sessionId: string) => Promise<SessionInspectionResult>;
	};
	runFinalizer: {
		resolveStaleCompletionOutcome: (run: Run) => RunOutcome;
		hydrateOutcomeContent: (run: Run, content: string) => Promise<string>;
		resolveTriggerFromOutcome: (
			run: Run,
			runStatus: RunStatus,
			outcome: RunOutcome,
		) => TaskTransitionTrigger | null;
	};
	runReconciliationService: {
		reconcileStaleRun: (
			run: Run,
			projectId: string,
			taskId: string,
		) => Promise<void>;
	};
	applyTaskTransition: (
		run: Run,
		trigger: TaskTransitionTrigger,
		outcomeContent: string,
	) => void;
	isGenerationRun: (run: Run) => boolean;
	isStoryChatRun: (run: Run) => boolean;
	staleRunThresholdMs: number;
	manualStatusGraceMs: number;
	isNetworkError: (text: string) => boolean;
	getRunErrorText: (run: Run) => string;
}

export class TaskStatusProjectionService {
	private readonly deps: TaskStatusProjectionServiceDeps;

	public constructor(deps: TaskStatusProjectionServiceDeps) {
		this.deps = deps;
	}

	public listRecoverableRunsForProject(taskIds: Set<string>): Run[] {
		return runRepo
			.listByStatus("failed")
			.filter(
				(run) =>
					taskIds.has(run.taskId) &&
					run.sessionId.trim().length > 0 &&
					this.deps.getRunErrorText(run).toLowerCase() === "fetch failed",
			);
	}

	public getPollableBoardContext(
		projectId: string,
	): PollableBoardContext | null {
		const board = boardRepo.getByProjectId(projectId);
		if (!board) {
			log.warn("Skipping task status reconciliation; board not found", {
				projectId,
			});
			return null;
		}

		const allTasks = taskRepo.listByBoard(board.id);
		const tasks = allTasks.filter((task) => {
			const columnKey = getWorkflowColumnSystemKey(board, task.columnId);
			return columnKey !== "deferred" && columnKey !== "closed";
		});

		return {
			board,
			allTaskIds: new Set(allTasks.map((task) => task.id)),
			tasks,
			taskIds: new Set(tasks.map((task) => task.id)),
		};
	}

	public async reconcileTaskStatuses(
		projectId: string,
		board: PollableBoardContext["board"],
		tasks: PollableBoardContext["tasks"],
	): Promise<void> {
		for (const task of tasks) {
			const timeSinceUpdate = Date.now() - Date.parse(task.updatedAt);
			if (timeSinceUpdate < this.deps.manualStatusGraceMs) {
				continue;
			}

			const runs = [...runRepo.listByTask(task.id)].sort(
				(a, b) =>
					Date.parse(b.updatedAt ?? b.createdAt) -
					Date.parse(a.updatedAt ?? a.createdAt),
			);
			const activeRuns = runs.filter(
				(run) =>
					run.status === "queued" ||
					run.status === "running" ||
					run.status === "paused",
			);

			if (activeRuns.length > 0) {
				const nonStaleActiveRunExists = activeRuns.some(
					(run) => !this.isRunStale(run),
				);
				if (nonStaleActiveRunExists) {
					this.reconcileTaskWithActiveRuns(
						task,
						activeRuns.filter((run) => !this.isRunStale(run)),
					);
					continue;
				}

				for (const activeRun of activeRuns) {
					if (!this.isRunStale(activeRun)) {
						continue;
					}

					log.info(
						"Attempting to finalize stale run during task reconciliation",
						{
							projectId,
							taskId: task.id,
							runId: activeRun.id,
							runStatus: activeRun.status,
							startedAt: activeRun.startedAt,
						},
					);

					await this.reconcileStaleRun(activeRun, projectId, task.id);
				}
				continue;
			}

			const latestSettledRun = runs.find(
				(run) => run.status === "completed" || run.status === "failed",
			);
			if (!latestSettledRun) {
				if (
					task.status !== "running" &&
					task.status !== "generating" &&
					task.status !== "paused" &&
					task.status !== "question" &&
					task.status !== "chat"
				) {
					continue;
				}

				log.info("Skipping stale task reconciliation without settled run", {
					projectId,
					taskId: task.id,
					status: task.status,
					columnId: task.columnId,
					columnKey: getWorkflowColumnSystemKey(board, task.columnId),
				});
				continue;
			}

			let derivedOutcome: RunOutcome | null = null;
			let derivedContent = "";
			let source: "session" | "fallback" = "fallback";

			if (latestSettledRun.status === "completed") {
				const sessionId = latestSettledRun.sessionId.trim();
				if (sessionId.length > 0) {
					try {
						const inspection =
							await this.deps.sessionManager.inspectSession(sessionId);
						const meta = deriveMetaStatus(inspection);

						if (meta.kind === "completed") {
							derivedContent =
								await this.deps.runFinalizer.hydrateOutcomeContent(
									latestSettledRun,
									meta.content,
								);
							derivedOutcome = {
								kind: meta.kind,
								content: derivedContent,
							};
							source = "session";
						} else {
							log.warn(
								"Task status reconciliation inspection did not yield a terminal outcome",
								{
									projectId,
									taskId: task.id,
									runId: latestSettledRun.id,
									sessionId,
									inspectionKind: meta.kind,
								},
							);
						}
					} catch (error) {
						log.warn(
							"Failed to inspect session during task status reconciliation",
							{
								projectId,
								taskId: task.id,
								runId: latestSettledRun.id,
								sessionId,
								error: error instanceof Error ? error.message : String(error),
							},
						);
					}
				}

				if (!derivedOutcome) {
					derivedOutcome =
						this.deps.runFinalizer.resolveStaleCompletionOutcome(
							latestSettledRun,
						);
				}
			} else if (latestSettledRun.status === "failed") {
				const sessionId = latestSettledRun.sessionId.trim();
				const errorIsRecoverable =
					this.deps.isNetworkError(
						this.deps.getRunErrorText(latestSettledRun),
					) && sessionId.length > 0;

				if (errorIsRecoverable) {
					try {
						const inspection =
							await this.deps.sessionManager.inspectSession(sessionId);
						const meta = deriveMetaStatus(inspection);

						if (meta.kind === "completed") {
							derivedContent = meta.content;
							derivedOutcome = {
								kind: meta.kind,
								content: derivedContent,
							};
							source = "session";
						} else {
							log.info(
								"Skipping task failure projection; recoverable failed run is still non-terminal",
								{
									projectId,
									taskId: task.id,
									runId: latestSettledRun.id,
									sessionId,
									inspectionKind: meta.kind,
								},
							);
							continue;
						}
					} catch (error) {
						log.warn(
							"Failed to inspect session for recoverable failed run during task reconciliation",
							{
								projectId,
								taskId: task.id,
								runId: latestSettledRun.id,
								sessionId,
								error: error instanceof Error ? error.message : String(error),
							},
						);
						continue;
					}
				} else {
					derivedOutcome = { kind: "failed", content: "" };
				}
			}

			if (!derivedOutcome) {
				continue;
			}
			derivedContent = derivedOutcome.content ?? derivedContent;

			try {
				const trigger = this.deps.runFinalizer.resolveTriggerFromOutcome(
					latestSettledRun,
					latestSettledRun.status,
					derivedOutcome,
				);
				if (!trigger) {
					continue;
				}
				this.deps.applyTaskTransition(
					latestSettledRun,
					trigger,
					derivedContent,
				);
				log.info("Reconciled task status from latest settled run", {
					projectId,
					taskId: task.id,
					fromStatus: task.status,
					runId: latestSettledRun.id,
					runStatus: latestSettledRun.status,
					runKind: latestSettledRun.metadata?.kind ?? null,
					outcomeKind: derivedOutcome.kind,
					source,
				});
			} catch (error) {
				log.error("Failed to reconcile task status from latest settled run", {
					projectId,
					taskId: task.id,
					runId: latestSettledRun.id,
					outcomeKind: derivedOutcome.kind,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	}

	public reconcileTaskWithActiveRuns(task: Task, activeRuns: Run[]): void {
		const runningRun = activeRuns.find((run) => run.status === "running");
		if (runningRun) {
			let nextStatus: "generating" | "running" | "chat";
			let trigger: "generate:start" | "run:start" | "chat:start";
			if (this.deps.isGenerationRun(runningRun)) {
				nextStatus = "generating";
				trigger = "generate:start";
			} else if (this.deps.isStoryChatRun(runningRun)) {
				nextStatus = "chat";
				trigger = "chat:start";
			} else {
				nextStatus = "running";
				trigger = "run:start";
			}
			if (task.status !== nextStatus) {
				this.deps.applyTaskTransition(runningRun, trigger, "");
			}
			return;
		}

		const pausedRun = activeRuns.find((run) => run.status === "paused");
		if (pausedRun && task.status !== "question") {
			this.deps.applyTaskTransition(
				pausedRun,
				"run:question",
				"Run paused awaiting input",
			);
		}
	}

	public isRunStale(run: Run): boolean {
		if (run.status !== "running") {
			return false;
		}

		const startedAt = run.startedAt ?? run.updatedAt ?? run.createdAt;
		const elapsedMs = Date.now() - Date.parse(startedAt);
		return elapsedMs > this.deps.staleRunThresholdMs;
	}

	public async reconcileStaleRun(
		run: Run,
		projectId: string,
		taskId: string,
	): Promise<void> {
		await this.deps.runReconciliationService.reconcileStaleRun(
			run,
			projectId,
			taskId,
		);
	}
}
