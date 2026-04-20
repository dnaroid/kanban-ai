import { getOpencodeService } from "@/server/opencode/opencode-service";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";
import { boardRepo } from "@/server/repositories/board";
import { runEventRepo } from "@/server/repositories/run-event";
import { runRepo } from "@/server/repositories/run";
import { taskRepo } from "@/server/repositories/task";
import { ExecutionBootstrapService } from "@/server/run/execution-bootstrap-service";
import { PostRunWorkflowService } from "@/server/run/post-run-workflow-service";
import { QueueManager } from "@/server/run/queue-manager";
import { RunExecutor } from "@/server/run/run-executor";
import { RunFinalizer } from "@/server/run/run-finalizer";
import { RunInteractionCoordinator } from "@/server/run/run-interaction-coordinator";
import { publishRunUpdate } from "@/server/run/run-publisher";
import { RunReconciler } from "@/server/run/run-reconciler";
import { RunLiveSubscriptionService } from "@/server/run/run-live-subscription-service";
import { RunReconciliationService } from "@/server/run/run-reconciliation-service";
import { isNetworkError } from "@/server/run/run-session-interpreter";
import { TaskStatusProjectionService } from "@/server/run/task-status-projection-service";
import {
	getTaskStateMachine,
	type TaskTransitionTrigger,
} from "@/server/run/task-state-machine";
import type { QueuedRunInput } from "@/server/run/runs-queue-types";
import { getRunErrorText } from "@/server/run/runs-queue-manager";
import { RetryManager } from "@/server/run/retry-manager";
import type { Run, RunStatus } from "@/types/ipc";
import { getVcsManager } from "@/server/vcs/vcs-manager";
import type { SessionInspectionResult } from "@/server/opencode/session-manager";
import { hydrateGenerationOutcomeContent } from "@/server/run/run-session-interpreter";
import type { RunOutcome } from "@/server/run/run-finalizer";

const generationRunKind = "task-description-improve";

export interface RqmContext {
	readonly activeRunSessions: Map<string, string>;
	readonly runInputs: Map<string, QueuedRunInput>;
	readonly queueManager: QueueManager;
	readonly vcsManager: ReturnType<typeof getVcsManager>;
	readonly sessionManager: ReturnType<typeof getOpencodeSessionManager>;
	readonly stateMachine: ReturnType<typeof getTaskStateMachine>;
	readonly retryManager: RetryManager;
	readonly opencodeService: ReturnType<typeof getOpencodeService>;
	readonly staleRunThresholdMs: number;
	readonly manualStatusGraceMs: number;
	readonly defaultConcurrency: number;
	readonly generationDefaultConcurrency: number;
	readonly providerConcurrency: Map<string, number>;
	readonly maxRetryCount: number;
	readonly retryBaseDelayMs: number;
	readonly worktreeEnabled: boolean;
	applyTaskTransition: (
		run: Run,
		trigger: TaskTransitionTrigger,
		content: string,
	) => void;
	enqueue: (runId: string, input: QueuedRunInput) => void;
	removeFromQueue: (runId: string) => void;
	finalizeRunFromSession: (
		runId: string,
		status: RunStatus,
		outcome: RunOutcome,
	) => Promise<void>;
	onRunExecutionCompleted: (runId: string) => void;
	scheduleRetryAfterNetworkError: (
		runId: string,
		errorMessage: string,
	) => boolean;
	tryFillTaskModelFromSession: (
		taskId: string,
		inspection: SessionInspectionResult,
	) => void;
	durationSec: (startedAt: string, finishedAt: string) => number;
	isGenerationRun: (run: Run) => boolean;
	isStoryChatRun: (run: Run) => boolean;
	shouldAutoExecuteAfterGeneration: () => boolean;
	scheduleDrain: () => void;
	startNextReadyTaskAfterMerge: (taskId: string) => Promise<void>;
	areDependenciesResolved: (taskId: string) => boolean;
}

export interface ServiceRegistry {
	runFinalizer: RunFinalizer;
	runInteractionCoordinator: RunInteractionCoordinator;
	runReconciliationService: RunReconciliationService;
	executionBootstrapService: ExecutionBootstrapService;
	postRunWorkflowService: PostRunWorkflowService;
	taskStatusProjectionService: TaskStatusProjectionService;
	runReconciler: RunReconciler;
	runExecutor: RunExecutor;
	runLiveSubscriptionService: RunLiveSubscriptionService;
}

export function createServices(ctx: RqmContext): ServiceRegistry {
	const executionBootstrapService = new ExecutionBootstrapService({
		worktreeEnabled: ctx.worktreeEnabled,
		enqueue: (runId, input) => ctx.enqueue(runId, input),
		provisionRunWorkspace: async (input) =>
			ctx.vcsManager.provisionRunWorkspace(input),
		sendPrompt: async (sessionId, prompt) =>
			ctx.sessionManager.sendPrompt(sessionId, prompt),
	});

	const postRunWorkflowService = new PostRunWorkflowService({
		mergeRunWorkspace: async (run, mode) =>
			ctx.vcsManager.mergeRunWorkspace(run, mode),
		cleanupRunWorkspace: async (vcsMetadata) =>
			ctx.vcsManager.cleanupRunWorkspace(vcsMetadata),
		syncVcsMetadata: async (vcsMetadata) =>
			ctx.vcsManager.syncVcsMetadata(vcsMetadata),
		syncRunWorkspace: async (run) => ctx.vcsManager.syncRunWorkspace(run),
		updateRun: (runId, patch) => runRepo.update(runId, patch),
		createRunStatusEvent: (runId, payload) => {
			runEventRepo.create({ runId, eventType: "status", payload });
		},
		getTaskById: (taskId) => taskRepo.getById(taskId),
		getBoardById: (boardId) => boardRepo.getById(boardId),
		listTasksByBoard: (boardId) => taskRepo.listByBoard(boardId),
		listRunsByTask: (taskId) => runRepo.listByTask(taskId),
		isGenerationRun: (run) => ctx.isGenerationRun(run),
		areDependenciesResolved: (taskId) => ctx.areDependenciesResolved(taskId),
		resumeRejectedTaskRun: async (task) =>
			executionBootstrapService.resumeRejectedTaskRun(task),
		enqueueExecutionForNextTask: async (taskId) =>
			executionBootstrapService.enqueueExecutionForNextTask(taskId),
	});

	const runFinalizer = new RunFinalizer({
		getRunById: (runId) => runRepo.getById(runId),
		updateRun: (runId, patch) => runRepo.update(runId, patch),
		createStatusEvent: (runId, status, message) => {
			runEventRepo.create({
				runId,
				eventType: "status",
				payload: { status, message },
			});
		},
		publishRunUpdate: (run) => {
			publishRunUpdate(run);
		},
		syncRunWorkspaceState: async (run) => {
			const vcsMetadata = await ctx.vcsManager.syncRunWorkspace(run);
			if (!vcsMetadata) {
				return run;
			}

			return runRepo.update(run.id, {
				metadata: {
					...(run.metadata ?? {}),
					vcs: vcsMetadata,
				},
			});
		},
		applyTaskTransition: (run, trigger, outcomeContent) => {
			ctx.applyTaskTransition(run, trigger, outcomeContent);
		},
		shouldAutoExecuteAfterGeneration: () =>
			ctx.shouldAutoExecuteAfterGeneration(),
		tryAutomaticMerge: async (run) =>
			postRunWorkflowService.tryAutomaticMerge(run),
		startNextReadyTaskAfterMerge: async (taskId) =>
			ctx.startNextReadyTaskAfterMerge(taskId),
		isGenerationRun: (run) => ctx.isGenerationRun(run),
		hydrateGenerationOutcomeContent: async (run, content) =>
			hydrateGenerationOutcomeContent(
				run,
				content,
				ctx.sessionManager,
				generationRunKind,
			),
		getDurationSec: (startedAt, finishedAt) =>
			ctx.durationSec(startedAt, finishedAt),
		clearSessionTracking: (runId) => {
			ctx.activeRunSessions.delete(runId);
		},
		clearRunInput: (runId) => {
			ctx.runInputs.delete(runId);
		},
		unsubscribeLiveSubscription: (runId) => {
			void runLiveSubscriptionService.unsubscribe(runId);
		},
		getRunErrorText,
	});

	const runInteractionCoordinator = new RunInteractionCoordinator({
		getRunById: (runId) => runRepo.getById(runId),
		updateRun: (runId, patch) => runRepo.update(runId, patch),
		createRunEvent: (runId, eventType, payload) => {
			runEventRepo.create({ runId, eventType, payload });
		},
		listRunEvents: (runId, limit) => runEventRepo.listByRun(runId, limit),
		applyTaskTransition: (run, trigger, outcomeContent) => {
			ctx.applyTaskTransition(run, trigger, outcomeContent);
		},
		listPendingPermissions: async (sessionId) =>
			ctx.sessionManager.listPendingPermissions(sessionId),
		listPendingQuestions: async (sessionId) =>
			ctx.sessionManager.listPendingQuestions(sessionId),
		setActiveRunSession: (runId, sessionId) => {
			ctx.activeRunSessions.set(runId, sessionId);
		},
	});

	const runReconciliationService = new RunReconciliationService({
		sessionManager: ctx.sessionManager,
		runInteractionCoordinator,
		runInputs: ctx.runInputs,
		isGenerationRun: (run) => ctx.isGenerationRun(run),
		isStoryChatRun: (run) => ctx.isStoryChatRun(run),
		finalizeRunFromSession: async (runId, status, outcome) =>
			ctx.finalizeRunFromSession(runId, status, outcome),
		runFinalizer: {
			resolveStaleCompletionOutcome: (run) =>
				runFinalizer.resolveStaleCompletionOutcome(run),
			syncRunWorkspaceState: async (run) =>
				runFinalizer.syncRunWorkspaceState(run),
		},
		applyTaskTransition: (run, trigger, outcomeContent) =>
			ctx.applyTaskTransition(run, trigger, outcomeContent),
		enqueue: (runId, input) => ctx.enqueue(runId, input),
		removeFromQueue: (runId) => ctx.removeFromQueue(runId),
		clearActiveRunSession: (runId) => {
			ctx.activeRunSessions.delete(runId);
		},
		tryFillTaskModelFromSession: (taskId, inspection) =>
			ctx.tryFillTaskModelFromSession(taskId, inspection),
		durationSec: (startedAt, finishedAt) =>
			ctx.durationSec(startedAt, finishedAt),
		staleRunThresholdMs: ctx.staleRunThresholdMs,
		getRunErrorText,
		clearLiveSubscription: (runId) => {
			void runLiveSubscriptionService.unsubscribe(runId);
		},
		ensureLiveSubscription: (runId, sessionId) => {
			void runLiveSubscriptionService.ensureSubscribed(runId, sessionId);
		},
	});

	const runLiveSubscriptionService = new RunLiveSubscriptionService({
		reconcileRun: async (runId) => {
			await runReconciliationService.reconcileRun(runId);
		},
		listActiveRunsWithSessions: () => {
			return runReconciliationService
				.listActiveRunsForReconciliation()
				.filter((run) => run.sessionId.trim().length > 0)
				.map((run) => ({ id: run.id, sessionId: run.sessionId.trim() }));
		},
	});

	const taskStatusProjectionService = new TaskStatusProjectionService({
		sessionManager: ctx.sessionManager,
		runFinalizer: {
			resolveStaleCompletionOutcome: (run) =>
				runFinalizer.resolveStaleCompletionOutcome(run),
			hydrateOutcomeContent: async (run, content) =>
				runFinalizer.hydrateOutcomeContent(run, content),
			resolveTriggerFromOutcome: (run, runStatus, outcome) =>
				runFinalizer.resolveTriggerFromOutcome(run, runStatus, outcome),
		},
		runReconciliationService: {
			reconcileStaleRun: async (run, projectId, taskId) =>
				runReconciliationService.reconcileStaleRun(run, projectId, taskId),
		},
		applyTaskTransition: (run, trigger, outcomeContent) =>
			ctx.applyTaskTransition(run, trigger, outcomeContent),
		isGenerationRun: (run) => ctx.isGenerationRun(run),
		isStoryChatRun: (run) => ctx.isStoryChatRun(run),
		staleRunThresholdMs: ctx.staleRunThresholdMs,
		manualStatusGraceMs: ctx.manualStatusGraceMs,
		isNetworkError,
		getRunErrorText,
	});

	const runReconciler = new RunReconciler({
		taskStatusProjectionService,
		runReconciliationService: {
			listActiveRunsForReconciliation: () =>
				runReconciliationService.listActiveRunsForReconciliation(),
			reconcileRun: async (runId) => {
				await runReconciliationService.reconcileRun(runId);
			},
		},
	});

	const runExecutor = new RunExecutor({
		opencodeService: ctx.opencodeService,
		sessionManager: ctx.sessionManager,
		runInputs: ctx.runInputs,
		activeRunSessions: ctx.activeRunSessions,
		isGenerationRun: (run) => ctx.isGenerationRun(run),
		isStoryChatRun: (run) => ctx.isStoryChatRun(run),
		applyTaskTransition: (run, trigger, outcomeContent) => {
			ctx.applyTaskTransition(run, trigger, outcomeContent);
		},
		tryFinalizeFromSessionSnapshot: async (runId, sessionId) => {
			await runReconciliationService.tryFinalizeFromSessionSnapshot(
				runId,
				sessionId,
			);
		},
		scheduleRetryAfterNetworkError: (runId, errorMessage) =>
			ctx.scheduleRetryAfterNetworkError(runId, errorMessage),
		syncRunWorkspaceState: async (run) =>
			runFinalizer.syncRunWorkspaceState(run),
		isNetworkError,
		durationSec: (startedAt, finishedAt) =>
			ctx.durationSec(startedAt, finishedAt),
		onComplete: (runId) => ctx.onRunExecutionCompleted(runId),
		runLiveSubscriptionService: {
			ensureSubscribed: async (runId, sessionId) => {
				await runLiveSubscriptionService.ensureSubscribed(runId, sessionId);
			},
		},
	});

	return {
		runFinalizer,
		runInteractionCoordinator,
		runReconciliationService,
		executionBootstrapService,
		postRunWorkflowService,
		taskStatusProjectionService,
		runReconciler,
		runExecutor,
		runLiveSubscriptionService,
	};
}
