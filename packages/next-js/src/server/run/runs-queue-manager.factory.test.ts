import { beforeEach, describe, expect, it, vi } from "vitest";

import { createServices, type RqmContext } from "./runs-queue-manager.factory";

const mockInstances = vi.hoisted(() => {
	const executionBootstrapService = {
		resumeRejectedTaskRun: vi.fn(),
		enqueueExecutionForNextTask: vi.fn(),
	};
	const postRunWorkflowService = { tryAutomaticMerge: vi.fn() };
	const runFinalizer = {
		staleRunFallbackMarker: vi.fn(),
		syncRunWorkspaceState: vi.fn(),
		hydrateOutcomeContent: vi.fn(),
		resolveTriggerFromOutcome: vi.fn(),
	};
	const runInteractionCoordinator = {};
	const runReconciliationService = {
		reconcileStaleRun: vi.fn(),
		listActiveRunsForReconciliation: vi.fn(),
		reconcileRun: vi.fn(),
		tryFinalizeFromSessionSnapshot: vi.fn(),
	};
	const taskStatusProjectionService = {};
	const runReconciler = { pollProjectRuns: vi.fn() };
	const pollingService = {};
	const runExecutor = {};

	return {
		executionBootstrapService,
		postRunWorkflowService,
		runFinalizer,
		runInteractionCoordinator,
		runReconciliationService,
		taskStatusProjectionService,
		runReconciler,
		pollingService,
		runExecutor,
	};
});

const captured = vi.hoisted(() => ({
	executionBootstrapService: [] as unknown[][],
	pollingService: [] as unknown[][],
	postRunWorkflowService: [] as unknown[][],
	runExecutor: [] as unknown[][],
	runFinalizer: [] as unknown[][],
	runInteractionCoordinator: [] as unknown[][],
	runReconciler: [] as unknown[][],
	runReconciliationService: [] as unknown[][],
	taskStatusProjectionService: [] as unknown[][],
}));

vi.mock("@/server/opencode/opencode-service", () => ({
	getOpencodeService: vi.fn(),
}));

vi.mock("@/server/opencode/session-manager", () => ({
	getOpencodeSessionManager: vi.fn(),
}));

vi.mock("@/server/repositories/board", () => ({
	boardRepo: {},
}));

vi.mock("@/server/repositories/run-event", () => ({
	runEventRepo: {},
}));

vi.mock("@/server/repositories/run", () => ({
	runRepo: {},
}));

vi.mock("@/server/repositories/task", () => ({
	taskRepo: {},
}));

vi.mock("@/server/run/execution-bootstrap-service", () => ({
	ExecutionBootstrapService: function MockExecutionBootstrapService(
		this: unknown,
		config: unknown,
	) {
		captured.executionBootstrapService.push([config]);
		return mockInstances.executionBootstrapService;
	},
}));

vi.mock("@/server/run/polling-service", () => ({
	PollingService: function MockPollingService(this: unknown, config: unknown) {
		captured.pollingService.push([config]);
		return mockInstances.pollingService;
	},
}));

vi.mock("@/server/run/post-run-workflow-service", () => ({
	PostRunWorkflowService: function MockPostRunWorkflowService(
		this: unknown,
		config: unknown,
	) {
		captured.postRunWorkflowService.push([config]);
		return mockInstances.postRunWorkflowService;
	},
}));

vi.mock("@/server/run/queue-manager", () => ({
	QueueManager: vi.fn(),
}));

vi.mock("@/server/run/run-executor", () => ({
	RunExecutor: function MockRunExecutor(this: unknown, config: unknown) {
		captured.runExecutor.push([config]);
		return mockInstances.runExecutor;
	},
}));

vi.mock("@/server/run/run-finalizer", () => ({
	RunFinalizer: function MockRunFinalizer(this: unknown, config: unknown) {
		captured.runFinalizer.push([config]);
		return mockInstances.runFinalizer;
	},
}));

vi.mock("@/server/run/run-interaction-coordinator", () => ({
	RunInteractionCoordinator: function MockRunInteractionCoordinator(
		this: unknown,
		config: unknown,
	) {
		captured.runInteractionCoordinator.push([config]);
		return mockInstances.runInteractionCoordinator;
	},
}));

vi.mock("@/server/run/run-publisher", () => ({
	publishRunUpdate: vi.fn(),
}));

vi.mock("@/server/run/run-reconciler", () => ({
	RunReconciler: function MockRunReconciler(this: unknown, config: unknown) {
		captured.runReconciler.push([config]);
		return mockInstances.runReconciler;
	},
}));

vi.mock("@/server/run/run-reconciliation-service", () => ({
	RunReconciliationService: function MockRunReconciliationService(
		this: unknown,
		config: unknown,
	) {
		captured.runReconciliationService.push([config]);
		return mockInstances.runReconciliationService;
	},
}));

vi.mock("@/server/run/run-session-interpreter", () => ({
	isNetworkError: vi.fn(),
	hydrateGenerationOutcomeContent: vi.fn(),
}));

vi.mock("@/server/run/task-status-projection-service", () => ({
	TaskStatusProjectionService: function MockTaskStatusProjectionService(
		this: unknown,
		config: unknown,
	) {
		captured.taskStatusProjectionService.push([config]);
		return mockInstances.taskStatusProjectionService;
	},
}));

vi.mock("@/server/run/task-state-machine", () => ({
	getTaskStateMachine: vi.fn(),
}));

vi.mock("@/server/run/runs-queue-manager", () => ({
	getRunErrorText: vi.fn(),
}));

vi.mock("@/server/run/retry-manager", () => ({
	RetryManager: vi.fn(),
}));

vi.mock("@/server/vcs/vcs-manager", () => ({
	getVcsManager: vi.fn(),
}));

function createMockCtx(): RqmContext {
	return {
		activeRunSessions: new Map(),
		runInputs: new Map(),
		queueManager: {} as RqmContext["queueManager"],
		vcsManager: {
			provisionRunWorkspace: vi.fn(),
			mergeRunWorkspace: vi.fn(),
			cleanupRunWorkspace: vi.fn(),
			syncVcsMetadata: vi.fn(),
			syncRunWorkspace: vi.fn(),
		} as RqmContext["vcsManager"],
		sessionManager: {
			sendPrompt: vi.fn(),
			listPendingPermissions: vi.fn(),
			listPendingQuestions: vi.fn(),
		} as RqmContext["sessionManager"],
		stateMachine: {} as RqmContext["stateMachine"],
		retryManager: {} as RqmContext["retryManager"],
		opencodeService: {} as RqmContext["opencodeService"],
		staleRunThresholdMs: 60_000,
		manualStatusGraceMs: 30_000,
		defaultConcurrency: 2,
		generationDefaultConcurrency: 1,
		providerConcurrency: new Map(),
		maxRetryCount: 3,
		retryBaseDelayMs: 1000,
		worktreeEnabled: false,
		projectPollingIntervalMs: 5000,
		projectBoardWatcherTtlMs: 30_000,
		applyTaskTransition: vi.fn(),
		enqueue: vi.fn(),
		removeFromQueue: vi.fn(),
		finalizeRunFromSession: vi.fn(),
		onRunExecutionCompleted: vi.fn(),
		scheduleRetryAfterNetworkError: vi.fn(),
		tryFillTaskModelFromSession: vi.fn(),
		durationSec: vi.fn(),
		isGenerationRun: vi.fn(),
		shouldAutoExecuteAfterGeneration: vi.fn(),
		scheduleDrain: vi.fn(),
		startNextReadyTaskAfterMerge: vi.fn(),
		areDependenciesResolved: vi.fn(),
	};
}

describe("runs-queue-manager factory", () => {
	let ctx: RqmContext;
	let registry: ReturnType<typeof createServices>;

	beforeEach(() => {
		vi.clearAllMocks();
		for (const key of Object.keys(captured) as (keyof typeof captured)[]) {
			captured[key].length = 0;
		}
		ctx = createMockCtx();
		registry = createServices(ctx);
	});

	describe("createServices", () => {
		it("returns all 9 expected service instances", () => {
			expect(registry.executionBootstrapService).toBe(
				mockInstances.executionBootstrapService,
			);
			expect(registry.postRunWorkflowService).toBe(
				mockInstances.postRunWorkflowService,
			);
			expect(registry.runFinalizer).toBe(mockInstances.runFinalizer);
			expect(registry.runInteractionCoordinator).toBe(
				mockInstances.runInteractionCoordinator,
			);
			expect(registry.runReconciliationService).toBe(
				mockInstances.runReconciliationService,
			);
			expect(registry.taskStatusProjectionService).toBe(
				mockInstances.taskStatusProjectionService,
			);
			expect(registry.runReconciler).toBe(mockInstances.runReconciler);
			expect(registry.pollingService).toBe(mockInstances.pollingService);
			expect(registry.runExecutor).toBe(mockInstances.runExecutor);
		});

		it("invokes each service constructor exactly once", () => {
			expect(captured.executionBootstrapService).toHaveLength(1);
			expect(captured.postRunWorkflowService).toHaveLength(1);
			expect(captured.runFinalizer).toHaveLength(1);
			expect(captured.runInteractionCoordinator).toHaveLength(1);
			expect(captured.runReconciliationService).toHaveLength(1);
			expect(captured.taskStatusProjectionService).toHaveLength(1);
			expect(captured.runReconciler).toHaveLength(1);
			expect(captured.pollingService).toHaveLength(1);
			expect(captured.runExecutor).toHaveLength(1);
		});
	});

	describe("runReconciler wiring", () => {
		it("receives taskStatusProjectionService for board context polling", () => {
			const [config] = captured.runReconciler[0];
			expect(config).toHaveProperty("taskStatusProjectionService");
			expect(config.taskStatusProjectionService).toBe(
				mockInstances.taskStatusProjectionService,
			);
		});
	});

	describe("pollingService wiring", () => {
		it("delegates onPollProjectRuns to runReconciler.pollProjectRuns", async () => {
			const [config] = captured.pollingService[0];
			await config.onPollProjectRuns("project-42");
			expect(mockInstances.runReconciler.pollProjectRuns).toHaveBeenCalledWith(
				"project-42",
			);
		});
	});

	describe("runExecutor wiring", () => {
		it("delegates onComplete to ctx.onRunExecutionCompleted", () => {
			const [config] = captured.runExecutor[0];
			config.onComplete("run-99");
			expect(ctx.onRunExecutionCompleted).toHaveBeenCalledWith("run-99");
		});
	});

	describe("postRunWorkflowService wiring", () => {
		it("delegates resumeRejectedTaskRun to executionBootstrapService", async () => {
			const [config] = captured.postRunWorkflowService[0];
			const task = { id: "task-1" };
			await config.resumeRejectedTaskRun(task);
			expect(
				mockInstances.executionBootstrapService.resumeRejectedTaskRun,
			).toHaveBeenCalledWith(task);
		});

		it("delegates enqueueExecutionForNextTask to executionBootstrapService", async () => {
			const [config] = captured.postRunWorkflowService[0];
			await config.enqueueExecutionForNextTask("task-2");
			expect(
				mockInstances.executionBootstrapService.enqueueExecutionForNextTask,
			).toHaveBeenCalledWith("task-2");
		});
	});
});
