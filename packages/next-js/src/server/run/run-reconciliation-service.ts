import { createLogger } from "@/lib/logger";
import type { SessionInspectionResult } from "@/server/opencode/session-manager";
import { runEventRepo } from "@/server/repositories/run-event";
import { runRepo } from "@/server/repositories/run";
import { RunInteractionCoordinator } from "@/server/run/run-interaction-coordinator";
import type { RunOutcome } from "@/server/run/run-finalizer";
import {
	deriveMetaStatus,
	toRunLastExecutionStatus,
} from "@/server/run/run-session-interpreter";
import type { ReportTag } from "@/server/run/run-session-interpreter";
import {
	adaptTriggerForQa,
	type TaskTransitionTrigger,
} from "@/server/run/task-state-machine";
import type { QueuedRunInput } from "@/server/run/runs-queue-types";
import type { Run, RunStatus } from "@/types/ipc";
import { publishRunUpdate } from "@/server/run/run-publisher";

const log = createLogger("runs-queue");

interface RunReconciliationServiceDeps {
	sessionManager: {
		inspectSession: (sessionId: string) => Promise<SessionInspectionResult>;
	};
	runInteractionCoordinator: RunInteractionCoordinator;
	runInputs: Map<string, QueuedRunInput>;
	isGenerationRun: (run: Run) => boolean;
	isStoryChatRun: (run: Run) => boolean;
	finalizeRunFromSession: (
		runId: string,
		status: RunStatus,
		outcome: RunOutcome,
	) => Promise<void>;
	runFinalizer: {
		resolveStaleCompletionOutcome: (run: Run) => RunOutcome;
		syncRunWorkspaceState: (run: Run) => Promise<Run>;
	};
	applyTaskTransition: (
		run: Run,
		trigger: TaskTransitionTrigger,
		outcomeContent: string,
	) => void;
	enqueue: (runId: string, input: QueuedRunInput) => void;
	removeFromQueue: (runId: string) => void;
	clearActiveRunSession: (runId: string) => void;
	tryFillTaskModelFromSession: (
		taskId: string,
		inspection: SessionInspectionResult,
	) => void;
	durationSec: (startedAt: string, finishedAt: string) => number;
	staleRunThresholdMs: number;
	getRunErrorText: (run: Run) => string;
	clearLiveSubscription: (runId: string) => void;
	ensureLiveSubscription: (runId: string, sessionId: string) => void;
}

export class RunReconciliationService {
	private readonly deps: RunReconciliationServiceDeps;

	public constructor(deps: RunReconciliationServiceDeps) {
		this.deps = deps;
	}

	public listActiveRunsForReconciliation(): Run[] {
		const listByStatuses = (
			runRepo as { listByStatuses?: (statuses: string[]) => Run[] }
		).listByStatuses;
		if (typeof listByStatuses === "function") {
			return listByStatuses.call(runRepo, ["queued", "running", "paused"]);
		}

		return [
			...runRepo.listByStatus("queued"),
			...runRepo.listByStatus("running"),
			...runRepo.listByStatus("paused"),
		].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
	}

	public async reconcileRun(runId: string): Promise<void> {
		const run = runRepo.getById(runId);
		if (!run) {
			return;
		}

		const isRecoverableFailedRun =
			run.status === "failed" &&
			run.sessionId.trim().length > 0 &&
			this.deps.getRunErrorText(run).toLowerCase() === "fetch failed";

		if (
			run.status !== "queued" &&
			run.status !== "running" &&
			run.status !== "paused" &&
			!isRecoverableFailedRun
		) {
			return;
		}

		const sessionId = run.sessionId.trim();
		if (run.status === "queued" && sessionId.length === 0) {
			const runInput = this.deps.runInputs.get(run.id);
			if (!runInput) {
				log.warn("Failing queued run; input lost during reconciliation", {
					runId: run.id,
				});
				await this.failRunDuringReconciliation(
					run,
					"Run input lost on restart",
					"Run input lost on restart",
				);
				return;
			}

			log.info("Re-enqueueing queued run during reconciliation", {
				runId: run.id,
				projectId: runInput.projectId,
				projectPath: runInput.projectPath,
			});
			this.deps.enqueue(run.id, runInput);
			return;
		}

		if (sessionId.length === 0) {
			log.warn("Skipping reconciliation for active run without session", {
				runId: run.id,
				status: run.status,
			});
			return;
		}

		log.info("Inspecting run session during reconciliation", {
			runId: run.id,
			status: run.status,
			sessionId,
		});
		const inspection = await this.deps.sessionManager.inspectSession(sessionId);
		await this.applyInspectionResult(run, sessionId, inspection);
	}

	public async applyInspectionResult(
		run: Run,
		sessionId: string,
		inspection: SessionInspectionResult,
	): Promise<void> {
		const meta = deriveMetaStatus(run, inspection);
		const observedRun = runRepo.update(run.id, {
			metadata: {
				...(run.metadata ?? {}),
				lastExecutionStatus: toRunLastExecutionStatus(meta, sessionId),
			},
		});

		if (!this.deps.isGenerationRun(run)) {
			this.deps.tryFillTaskModelFromSession(run.taskId, inspection);
		}

		const isStoryChat = this.deps.isStoryChatRun(run);
		const shouldSkipAutomaticFinalization = isStoryChat;

		switch (meta.kind) {
			case "completed": {
				if (shouldSkipAutomaticFinalization) {
					log.info("Skipping finalization for interactive specialized run", {
						runId: observedRun.id,
						sessionId,
						metaKind: meta.kind,
						runKind: observedRun.metadata?.kind ?? null,
					});
					break;
				}
				await this.deps.finalizeRunFromSession(observedRun.id, "completed", {
					kind: "completed",
					content: meta.content,
				});
				return;
			}
			case "reported": {
				if (shouldSkipAutomaticFinalization) {
					log.info("Skipping finalization for interactive specialized run", {
						runId: observedRun.id,
						sessionId,
						metaKind: meta.kind,
						reportTag: meta.report,
						runKind: observedRun.metadata?.kind ?? null,
					});
					break;
				}
				const reportStatus = mapReportToStatus(meta.report);
				if (reportStatus === "paused") {
					const nextRun =
						this.deps.runInteractionCoordinator.ensureRunPausedForSyntheticQuestion(
							observedRun,
							meta.content,
						);
					this.deps.runInteractionCoordinator.attachReconciledSession(
						nextRun.id,
						sessionId,
					);
					this.deps.ensureLiveSubscription(nextRun.id, sessionId);
					return;
				}
				await this.deps.finalizeRunFromSession(observedRun.id, reportStatus, {
					kind: reportStatus === "completed" ? "completed" : "failed",
					content: meta.content,
				});
				return;
			}
			case "dead":
				if (observedRun.status === "paused") {
					log.warn(
						"Paused run session missing during reconciliation; keeping paused state",
						{
							runId: observedRun.id,
							sessionId,
						},
					);
					return;
				}
				await this.failRunDuringReconciliation(
					observedRun,
					"Session not found during reconciliation",
					"Session not found",
				);
				return;
			case "running":
				break;
			case "permission": {
				const nextRun =
					this.deps.runInteractionCoordinator.ensureRunPausedForPermission(
						observedRun,
						meta.permission,
					);
				this.deps.runInteractionCoordinator.attachReconciledSession(
					nextRun.id,
					sessionId,
				);
				this.deps.ensureLiveSubscription(nextRun.id, sessionId);
				return;
			}
			case "question": {
				const nextRun =
					this.deps.runInteractionCoordinator.ensureRunPausedForQuestion(
						observedRun,
						meta.questions[0],
					);
				this.deps.runInteractionCoordinator.attachReconciledSession(
					nextRun.id,
					sessionId,
				);
				this.deps.ensureLiveSubscription(nextRun.id, sessionId);
				return;
			}
		}

		if (
			observedRun.status === "running" &&
			this.isRunStale(observedRun) &&
			inspection.probeStatus === "alive"
		) {
			log.info(
				"Skipping stale force-finalization; session alive without REPORT tag",
				{
					runId: observedRun.id,
					sessionId,
					runKind: observedRun.metadata?.kind ?? null,
				},
			);
		}

		if (observedRun.status === "paused") {
			await this.deps.runInteractionCoordinator.reconcilePausedRun(
				observedRun.id,
				sessionId,
			);
			this.deps.runInteractionCoordinator.attachReconciledSession(
				observedRun.id,
				sessionId,
			);
			return;
		}

		if (observedRun.status === "queued") {
			const startedAt = run.startedAt ?? new Date().toISOString();
			const resumedRun = runRepo.update(observedRun.id, {
				status: "running",
				startedAt,
				errorText: "",
				metadata: {
					...(observedRun.metadata ?? {}),
					lastExecutionStatus: {
						kind: "running",
						sessionId,
						updatedAt: startedAt,
					},
				},
			});
			runEventRepo.create({
				runId: observedRun.id,
				eventType: "status",
				payload: {
					status: "running",
					message: "Run resumed during reconciliation",
				},
			});
			publishRunUpdate(resumedRun);
			this.deps.applyTaskTransition(
				resumedRun,
				adaptTriggerForQa("run:answer", resumedRun.metadata?.kind),
				"Run resumed during reconciliation",
			);
			log.info("Reattached queued run as running during reconciliation", {
				runId: observedRun.id,
				sessionId,
			});
			this.deps.runInteractionCoordinator.attachReconciledSession(
				resumedRun.id,
				sessionId,
			);
			this.deps.ensureLiveSubscription(resumedRun.id, sessionId);
			return;
		}

		log.info("Reattached active run during reconciliation", {
			runId: observedRun.id,
			sessionId,
			status: observedRun.status,
		});
		this.deps.runInteractionCoordinator.attachReconciledSession(
			observedRun.id,
			sessionId,
		);
		this.deps.ensureLiveSubscription(observedRun.id, sessionId);
	}

	public async failRunDuringReconciliation(
		run: Run,
		errorText: string,
		assistantContent: string,
	): Promise<void> {
		const finishedAt = new Date().toISOString();
		let failedRun = runRepo.update(run.id, {
			status: "failed",
			finishedAt,
			errorText,
			durationSec: this.deps.durationSec(
				run.startedAt ?? finishedAt,
				finishedAt,
			),
			metadata: {
				...(run.metadata ?? {}),
				lastExecutionStatus: {
					kind: "failed",
					content: assistantContent,
					sessionId: run.sessionId.trim() || undefined,
					updatedAt: finishedAt,
				},
			},
		});
		failedRun = await this.deps.runFinalizer.syncRunWorkspaceState(failedRun);

		runEventRepo.create({
			runId: run.id,
			eventType: "status",
			payload: {
				status: "failed",
				message: errorText,
			},
		});
		publishRunUpdate(failedRun);
		this.deps.applyTaskTransition(
			failedRun,
			adaptTriggerForQa(
				this.deps.isGenerationRun(failedRun) ? "generate:fail" : "run:fail",
				failedRun.metadata?.kind,
			),
			assistantContent,
		);

		this.deps.clearActiveRunSession(run.id);
		this.deps.removeFromQueue(run.id);
		this.deps.clearLiveSubscription(run.id);
	}

	public async reconcileStaleRun(
		run: Run,
		projectId: string,
		taskId: string,
	): Promise<void> {
		const sessionId = run.sessionId.trim();
		if (sessionId.length === 0) {
			log.warn("Cannot reconcile stale run; no session ID", {
				projectId,
				taskId,
				runId: run.id,
			});
			return;
		}

		try {
			const inspection =
				await this.deps.sessionManager.inspectSession(sessionId);
			if (inspection.probeStatus !== "alive") {
				log.warn(
					"Skipping stale run finalization; session probe is not confirmed alive",
					{
						projectId,
						taskId,
						runId: run.id,
						probeStatus: inspection.probeStatus,
					},
				);
				return;
			}
			const meta = deriveMetaStatus(run, inspection);

			if (meta.kind === "completed") {
				const runStatus = "completed" as RunStatus;
				await this.deps.finalizeRunFromSession(run.id, runStatus, {
					kind: meta.kind,
					content: meta.content,
				});
				log.info("Finalized stale run during task reconciliation", {
					projectId,
					taskId,
					runId: run.id,
					runStatus,
					outcomeKind: meta.kind,
				});
				return;
			}

			if (meta.kind === "reported") {
				const reportStatus = mapReportToStatus(meta.report);
				if (reportStatus === "paused") {
					log.info("Stale run has report=question; pausing for user input", {
						projectId,
						taskId,
						runId: run.id,
					});
					return;
				}
				await this.deps.finalizeRunFromSession(run.id, reportStatus, {
					kind: reportStatus === "completed" ? "completed" : "failed",
					content: meta.content,
				});
				log.info(
					"Finalized stale run from REPORT tag during task reconciliation",
					{
						projectId,
						taskId,
						runId: run.id,
						reportTag: meta.report,
					},
				);
				return;
			}

			if (meta.kind === "dead") {
				await this.failRunDuringReconciliation(
					run,
					"Session not found for stale run",
					"Session expired",
				);
				log.info("Failed stale run (session dead) during task reconciliation", {
					projectId,
					taskId,
					runId: run.id,
				});
				return;
			}

			log.info(
				"Skipping stale force-finalization; session alive without REPORT tag",
				{
					projectId,
					taskId,
					runId: run.id,
					inspectionKind: meta.kind,
					runKind: run.metadata?.kind ?? null,
				},
			);
		} catch (error) {
			log.error("Failed to reconcile stale run", {
				projectId,
				taskId,
				runId: run.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	public async tryFinalizeFromSessionSnapshot(
		runId: string,
		sessionId: string,
	): Promise<void> {
		const run = runRepo.getById(runId);
		if (!run || (run.status !== "running" && run.status !== "queued")) {
			return;
		}

		const inspection = await this.deps.sessionManager.inspectSession(sessionId);
		const meta = deriveMetaStatus(run, inspection);

		if (meta.kind === "completed") {
			await this.deps.finalizeRunFromSession(runId, "completed", {
				kind: meta.kind,
				content: meta.content,
			});
		}
		if (meta.kind === "reported") {
			const reportStatus = mapReportToStatus(meta.report);
			if (reportStatus !== "paused") {
				await this.deps.finalizeRunFromSession(runId, reportStatus, {
					kind: reportStatus === "completed" ? "completed" : "failed",
					content: meta.content,
				});
			}
		}
	}

	private isRunStale(run: Run): boolean {
		if (run.status !== "running") {
			return false;
		}

		const startedAt = run.startedAt ?? run.updatedAt ?? run.createdAt;
		const elapsedMs = Date.now() - Date.parse(startedAt);
		return elapsedMs > this.deps.staleRunThresholdMs;
	}
}

function mapReportToStatus(
	report: ReportTag,
): "completed" | "failed" | "paused" {
	switch (report) {
		case "done":
		case "test_ok":
			return "completed";
		case "fail":
		case "test_fail":
			return "failed";
		case "question":
			return "paused";
	}
}
