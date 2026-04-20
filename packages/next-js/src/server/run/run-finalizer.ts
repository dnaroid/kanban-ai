import { createLogger } from "@/lib/logger";
import {
	resolveTransitionTrigger,
	type TaskTransitionTrigger,
} from "@/server/run/task-state-machine";
import type { Run, RunLastExecutionStatus, RunStatus } from "@/types/ipc";
import type { RunOutcomeMarker } from "@/server/run/run-session-interpreter";

const log = createLogger("runs-queue");

const lateCompletionRecoveryWindowMs = 15 * 60 * 1000;

export type RunOutcome = {
	marker: RunOutcomeMarker;
	content: string;
};

interface RunUpdatePatch {
	status?: RunStatus;
	finishedAt?: string | null;
	errorText?: string;
	durationSec?: number;
	metadata?: Run["metadata"];
}

export interface RunFinalizerDeps {
	getRunById: (runId: string) => Run | null;
	updateRun: (runId: string, patch: RunUpdatePatch) => Run;
	createStatusEvent: (
		runId: string,
		status: RunStatus,
		message: string,
	) => void;
	publishRunUpdate: (run: Run) => void;
	syncRunWorkspaceState: (run: Run) => Promise<Run>;
	applyTaskTransition: (
		run: Run,
		trigger: TaskTransitionTrigger,
		outcomeContent: string,
	) => void;
	shouldAutoExecuteAfterGeneration: () => boolean;
	tryAutomaticMerge: (run: Run) => Promise<Run>;
	startNextReadyTaskAfterMerge: (taskId: string) => Promise<void>;
	isGenerationRun: (run: Run) => boolean;
	hydrateGenerationOutcomeContent: (
		run: Run,
		content: string,
	) => Promise<string>;
	getDurationSec: (startedAt: string, finishedAt: string) => number;
	clearSessionTracking: (runId: string) => void;
	clearRunInput: (runId: string) => void;
	getRunErrorText: (run: Run) => string;
	unsubscribeLiveSubscription: (runId: string) => void;
}

export class RunFinalizer {
	private readonly deps: RunFinalizerDeps;
	private readonly pendingGeneratedExecutionTaskIds = new Map<string, string>();

	public constructor(deps: RunFinalizerDeps) {
		this.deps = deps;
	}

	public consumePendingGeneratedExecutionTaskId(runId: string): string | null {
		const taskId = this.pendingGeneratedExecutionTaskIds.get(runId);
		if (!taskId) {
			return null;
		}

		this.pendingGeneratedExecutionTaskIds.delete(runId);
		return taskId;
	}

	public resolveTriggerFromOutcome(
		run: Run,
		runStatus: RunStatus,
		outcome: RunOutcome,
	): TaskTransitionTrigger | null {
		return resolveTriggerFromOutcome(run, runStatus, outcome, {
			isGenerationRun: (input) => this.deps.isGenerationRun(input),
		});
	}

	public staleRunFallbackMarker(run: Run): RunOutcomeMarker {
		if (this.deps.isGenerationRun(run)) {
			return "generated";
		}
		return "done";
	}

	public canRecoverLateCompletion(run: Run, targetStatus: RunStatus): boolean {
		return canRecoverLateCompletion(run, targetStatus, (input) =>
			this.deps.getRunErrorText(input),
		);
	}

	public async hydrateOutcomeContent(
		run: Run,
		content: string,
	): Promise<string> {
		return this.deps.hydrateGenerationOutcomeContent(run, content);
	}

	public async syncRunWorkspaceState(run: Run): Promise<Run> {
		return this.deps.syncRunWorkspaceState(run);
	}

	public async tryAutomaticMerge(run: Run): Promise<Run> {
		return this.deps.tryAutomaticMerge(run);
	}

	public async finalizeRunFromSession(
		runId: string,
		status: RunStatus,
		outcome: RunOutcome,
	): Promise<void> {
		log.info("Finalizing run", { runId, status });
		const run = this.deps.getRunById(runId);
		if (!run || run.status === status) {
			log.debug("Run already in target status or not found", {
				runId,
				currentStatus: run?.status,
				targetStatus: status,
			});
			return;
		}

		const canRecover = this.canRecoverLateCompletion(run, status);
		if (run.status !== "running" && run.status !== "queued" && !canRecover) {
			log.warn("Run not in running/queued state, cannot finalize", {
				runId,
				currentStatus: run.status,
			});
			return;
		}

		if (canRecover) {
			log.info("Recovering failed run from late completion marker", {
				runId,
				errorText: this.deps.getRunErrorText(run),
			});
		}

		const hydratedOutcome = {
			...outcome,
			content: await this.hydrateOutcomeContent(run, outcome.content),
		};

		const finishedAt = new Date().toISOString();
		const nextExecutionStatus: RunLastExecutionStatus = {
			kind: status === "completed" ? "completed" : "failed",
			sessionId: run.sessionId.trim() || undefined,
			updatedAt: finishedAt,
		};
		if (
			hydratedOutcome.marker === "done" ||
			hydratedOutcome.marker === "generated" ||
			hydratedOutcome.marker === "test_ok" ||
			hydratedOutcome.marker === "fail" ||
			hydratedOutcome.marker === "test_fail"
		) {
			nextExecutionStatus.marker = hydratedOutcome.marker;
		}
		if (hydratedOutcome.content.trim().length > 0) {
			nextExecutionStatus.content = hydratedOutcome.content;
		}

		let nextRun = this.deps.updateRun(runId, {
			status,
			finishedAt,
			errorText: status === "failed" ? "Run failed" : "",
			durationSec: this.deps.getDurationSec(
				run.startedAt ?? finishedAt,
				finishedAt,
			),
			metadata: {
				...(run.metadata ?? {}),
				lastExecutionStatus: nextExecutionStatus,
			},
		});
		nextRun = await this.syncRunWorkspaceState(nextRun);

		log.info("Run finalized", {
			runId,
			status,
			durationSec: this.deps.getDurationSec(
				run.startedAt ?? finishedAt,
				finishedAt,
			),
			taskId: run.taskId,
		});
		this.deps.createStatusEvent(runId, status, `Run ${status}`);

		try {
			const trigger = this.resolveTriggerFromOutcome(
				nextRun,
				status,
				hydratedOutcome,
			);
			if (trigger) {
				this.deps.applyTaskTransition(
					nextRun,
					trigger,
					hydratedOutcome.content,
				);
			}

			if (
				status === "completed" &&
				this.deps.isGenerationRun(nextRun) &&
				this.deps.shouldAutoExecuteAfterGeneration()
			) {
				this.pendingGeneratedExecutionTaskIds.set(runId, nextRun.taskId);
			}

			if (status === "completed" && !this.deps.isGenerationRun(nextRun)) {
				const mergedRun = await this.tryAutomaticMerge(nextRun);
				const mergeStatus = mergedRun.metadata?.vcs?.mergeStatus;
				if (mergeStatus === "merged") {
					await this.deps.startNextReadyTaskAfterMerge(nextRun.taskId);
				}
			}
		} catch (error) {
			log.error("Failed to project run outcome", {
				runId,
				status,
				error: error instanceof Error ? error.message : String(error),
			});
		}

		const latestRun = this.deps.getRunById(runId) ?? nextRun;
		this.deps.publishRunUpdate(latestRun);
		this.deps.clearSessionTracking(runId);
		this.deps.clearRunInput(runId);
		this.deps.unsubscribeLiveSubscription(runId);
	}
}

export function resolveTriggerFromOutcome(
	run: Run,
	runStatus: RunStatus,
	outcome: RunOutcome,
	deps: { isGenerationRun: (run: Run) => boolean },
): TaskTransitionTrigger | null {
	if (outcome.marker === "cancelled") {
		return "run:cancelled";
	}

	if (outcome.marker === "resumed") {
		return "run:answer";
	}

	if (outcome.marker === "question") {
		return "run:question";
	}

	if (outcome.marker === "dead") {
		return "run:dead";
	}

	if (outcome.marker === "timeout") {
		return deps.isGenerationRun(run) ? "generate:fail" : "run:fail";
	}

	const sessionMetaKind =
		outcome.marker === "done" ||
		outcome.marker === "generated" ||
		outcome.marker === "test_ok"
			? "completed"
			: outcome.marker === "fail" || outcome.marker === "test_fail"
				? "failed"
				: null;

	if (!sessionMetaKind) {
		return null;
	}

	return resolveTransitionTrigger({
		runStatus,
		sessionMetaKind,
		completionMarker: outcome.marker,
		runKind: run.metadata?.kind ?? null,
	});
}

export function staleRunFallbackMarker(
	run: Run,
	generationRunKind: string,
): RunOutcomeMarker {
	const kind = run.metadata?.kind;
	if (kind === generationRunKind) {
		return "generated";
	}
	return "done";
}

export function canRecoverLateCompletion(
	run: Run,
	targetStatus: RunStatus,
	getRunErrorText: (run: Run) => string,
): boolean {
	if (run.status !== "failed" || targetStatus !== "completed") {
		return false;
	}

	if (getRunErrorText(run).toLowerCase() !== "fetch failed") {
		return false;
	}

	const endedAt = run.endedAt;
	if (!endedAt) {
		return false;
	}

	const finishedMs = Date.parse(endedAt);
	if (!Number.isFinite(finishedMs)) {
		return false;
	}

	const ageMs = Date.now() - finishedMs;
	return ageMs >= 0 && ageMs <= lateCompletionRecoveryWindowMs;
}
