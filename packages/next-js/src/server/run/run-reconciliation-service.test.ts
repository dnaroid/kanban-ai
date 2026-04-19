import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Run } from "@/types/ipc";
import type {
	SessionInspectionResult,
	SessionProbeStatus,
} from "@/server/opencode/session-manager";
import type { RunOutcomeMarker } from "@/server/run/run-session-interpreter";
import { RunReconciliationService } from "@/server/run/run-reconciliation-service";

let mockHasListByStatuses = true;

const {
	mockRunRepoGetById,
	mockRunRepoListByStatus,
	mockRunRepoListByStatuses,
	mockRunRepoUpdate,
	mockRunEventRepoCreate,
	mockPublishRunUpdate,
	mockDeriveMetaStatus,
	mockFindStoryContent,
	mockToRunLastExecutionStatus,
} = vi.hoisted(() => ({
	mockRunRepoGetById: vi.fn(),
	mockRunRepoListByStatus: vi.fn(),
	mockRunRepoListByStatuses: vi.fn(),
	mockRunRepoUpdate: vi.fn(),
	mockRunEventRepoCreate: vi.fn(),
	mockPublishRunUpdate: vi.fn(),
	mockDeriveMetaStatus: vi.fn(),
	mockFindStoryContent: vi.fn(() => "story-content"),
	mockToRunLastExecutionStatus: vi.fn(() => ({
		kind: "running",
		sessionId: "session-1",
		updatedAt: new Date().toISOString(),
	})),
}));

vi.mock("@/lib/logger", () => ({
	createLogger: () => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));

vi.mock("@/server/repositories/run", () => ({
	get runRepo() {
		return {
			getById: mockRunRepoGetById,
			listByStatus: mockRunRepoListByStatus,
			...(mockHasListByStatuses
				? { listByStatuses: mockRunRepoListByStatuses }
				: {}),
			update: mockRunRepoUpdate,
		};
	},
}));

vi.mock("@/server/repositories/run-event", () => ({
	get runEventRepo() {
		return { create: mockRunEventRepoCreate };
	},
}));

vi.mock("@/server/run/run-publisher", () => ({
	publishRunUpdate: (...args: unknown[]) => mockPublishRunUpdate(...args),
}));

vi.mock("@/server/run/run-session-interpreter", async (importActual) => {
	const actual =
		await importActual<typeof import("@/server/run/run-session-interpreter")>();
	return {
		...actual,
		deriveMetaStatus: mockDeriveMetaStatus,
		findStoryContent: mockFindStoryContent,
		toRunLastExecutionStatus: mockToRunLastExecutionStatus,
	};
});

function makeRun(
	overrides: Partial<Run> & Pick<Run, "id" | "status" | "sessionId">,
): Run {
	const now = new Date().toISOString();
	return {
		taskId: "task-1",
		roleId: "dev",
		mode: "execute",
		createdAt: now,
		updatedAt: now,
		startedAt: now,
		endedAt: null,
		metadata: {},
		...overrides,
	};
}

function buildInspection(
	overrides: Partial<SessionInspectionResult> = {},
): SessionInspectionResult {
	return {
		probeStatus: "alive" as SessionProbeStatus,
		sessionStatus: "busy",
		messages: [],
		todos: [],
		pendingPermissions: [],
		pendingQuestions: [],
		completionMarker: null,
		...overrides,
	};
}

interface TestDeps {
	sessionManager: {
		inspectSession: ReturnType<typeof vi.fn>;
	};
	runInteractionCoordinator: {
		ensureRunPausedForPermission: ReturnType<typeof vi.fn>;
		ensureRunPausedForQuestion: ReturnType<typeof vi.fn>;
		attachReconciledSession: ReturnType<typeof vi.fn>;
		reconcilePausedRun: ReturnType<typeof vi.fn>;
	};
	runInputs: Map<
		string,
		{
			projectPath: string;
			projectId?: string;
			sessionTitle: string;
			prompt: string;
		}
	>;
	isGenerationRun: ReturnType<typeof vi.fn>;
	finalizeRunFromSession: ReturnType<typeof vi.fn>;
	runFinalizer: {
		staleRunFallbackMarker: ReturnType<typeof vi.fn>;
		syncRunWorkspaceState: ReturnType<typeof vi.fn>;
	};
	applyTaskTransition: ReturnType<typeof vi.fn>;
	enqueue: ReturnType<typeof vi.fn>;
	removeFromQueue: ReturnType<typeof vi.fn>;
	clearActiveRunSession: ReturnType<typeof vi.fn>;
	tryFillTaskModelFromSession: ReturnType<typeof vi.fn>;
	durationSec: ReturnType<typeof vi.fn>;
	staleRunThresholdMs: number;
	getRunErrorText: ReturnType<typeof vi.fn>;
}

function setupDeps(): TestDeps {
	return {
		sessionManager: {
			inspectSession: vi.fn(async () => buildInspection()),
		},
		runInteractionCoordinator: {
			ensureRunPausedForPermission: vi.fn((run: Run) => run),
			ensureRunPausedForQuestion: vi.fn((run: Run) => run),
			attachReconciledSession: vi.fn(),
			reconcilePausedRun: vi.fn(async () => {}),
		},
		runInputs: new Map(),
		isGenerationRun: vi.fn(() => false),
		finalizeRunFromSession: vi.fn(async () => {}),
		runFinalizer: {
			staleRunFallbackMarker: vi.fn(() => "done" as RunOutcomeMarker),
			syncRunWorkspaceState: vi.fn(async (run: Run) => run),
		},
		applyTaskTransition: vi.fn(),
		enqueue: vi.fn(),
		removeFromQueue: vi.fn(),
		clearActiveRunSession: vi.fn(),
		tryFillTaskModelFromSession: vi.fn(),
		durationSec: vi.fn(() => 10),
		staleRunThresholdMs: 60000,
		getRunErrorText: vi.fn(() => ""),
	};
}

describe("RunReconciliationService", () => {
	let service: RunReconciliationService;
	let deps: TestDeps;

	beforeEach(() => {
		vi.clearAllMocks();
		deps = setupDeps();
		service = new RunReconciliationService(
			deps as unknown as ConstructorParameters<
				typeof RunReconciliationService
			>[0],
		);
	});

	describe("listActiveRunsForReconciliation", () => {
		it("uses listByStatuses when available on runRepo", () => {
			const runs = [makeRun({ id: "r1", status: "queued", sessionId: "" })];
			mockRunRepoListByStatuses.mockReturnValue(runs);
			mockRunRepoListByStatus.mockReturnValue([]);

			const result = service.listActiveRunsForReconciliation();

			expect(result).toBe(runs);
			expect(mockRunRepoListByStatuses).toHaveBeenCalledWith([
				"queued",
				"running",
				"paused",
			]);
			expect(mockRunRepoListByStatus).not.toHaveBeenCalled();
		});

		it("falls back to listByStatus for each status and sorts by createdAt", () => {
			mockHasListByStatuses = false;
			const runA = makeRun({
				id: "rA",
				status: "running",
				sessionId: "s1",
				createdAt: "2025-01-03T00:00:00Z",
			});
			const runB = makeRun({
				id: "rB",
				status: "queued",
				sessionId: "s2",
				createdAt: "2025-01-01T00:00:00Z",
			});
			const runC = makeRun({
				id: "rC",
				status: "paused",
				sessionId: "s3",
				createdAt: "2025-01-02T00:00:00Z",
			});
			mockRunRepoListByStatus.mockImplementation((status: string) => {
				if (status === "queued") return [runB];
				if (status === "running") return [runA];
				if (status === "paused") return [runC];
				return [];
			});

			const result = service.listActiveRunsForReconciliation();

			expect(result).toEqual([runB, runC, runA]);
			expect(mockRunRepoListByStatus).toHaveBeenCalledWith("queued");
			expect(mockRunRepoListByStatus).toHaveBeenCalledWith("running");
			expect(mockRunRepoListByStatus).toHaveBeenCalledWith("paused");
		});
	});

	describe("reconcileRun", () => {
		it("returns early when run not found", async () => {
			mockRunRepoGetById.mockReturnValue(null);

			await service.reconcileRun("nonexistent");

			expect(deps.sessionManager.inspectSession).not.toHaveBeenCalled();
		});

		it("returns early for completed runs", async () => {
			mockRunRepoGetById.mockReturnValue(
				makeRun({ id: "r1", status: "completed", sessionId: "s1" }),
			);

			await service.reconcileRun("r1");

			expect(deps.sessionManager.inspectSession).not.toHaveBeenCalled();
		});

		it("queued run without sessionId and no runInput calls failRunDuringReconciliation", async () => {
			const run = makeRun({
				id: "r1",
				status: "queued",
				sessionId: "",
			});
			mockRunRepoGetById.mockReturnValue(run);
			mockRunRepoUpdate.mockReturnValue({
				...run,
				status: "failed",
			});

			await service.reconcileRun("r1");

			expect(deps.finalizeRunFromSession).not.toHaveBeenCalled();
			expect(deps.enqueue).not.toHaveBeenCalled();
			expect(deps.clearActiveRunSession).toHaveBeenCalledWith("r1");
			expect(deps.removeFromQueue).toHaveBeenCalledWith("r1");
		});

		it("queued run without sessionId but WITH runInput calls enqueue", async () => {
			const run = makeRun({
				id: "r1",
				status: "queued",
				sessionId: "",
			});
			mockRunRepoGetById.mockReturnValue(run);
			const runInput = {
				projectPath: "/project",
				projectId: "proj-1",
				sessionTitle: "Test",
				prompt: "do stuff",
			};
			deps.runInputs.set("r1", runInput);

			await service.reconcileRun("r1");

			expect(deps.enqueue).toHaveBeenCalledWith("r1", runInput);
			expect(deps.sessionManager.inspectSession).not.toHaveBeenCalled();
		});

		it("active run (running) without sessionId skips and returns early", async () => {
			mockRunRepoGetById.mockReturnValue(
				makeRun({ id: "r1", status: "running", sessionId: "" }),
			);

			await service.reconcileRun("r1");

			expect(deps.sessionManager.inspectSession).not.toHaveBeenCalled();
			expect(deps.enqueue).not.toHaveBeenCalled();
		});

		it("active run with sessionId inspects session and applies result", async () => {
			const run = makeRun({
				id: "r1",
				status: "running",
				sessionId: "session-1",
			});
			mockRunRepoGetById.mockReturnValue(run);
			mockRunRepoUpdate.mockReturnValue(run);
			mockDeriveMetaStatus.mockReturnValue({ kind: "running" });

			await service.reconcileRun("r1");

			expect(deps.sessionManager.inspectSession).toHaveBeenCalledWith(
				"session-1",
			);
		});

		it("recovers failed run with fetch failed error text and sessionId", async () => {
			const run = makeRun({
				id: "r1",
				status: "failed",
				sessionId: "session-1",
			});
			mockRunRepoGetById.mockReturnValue(run);
			mockRunRepoUpdate.mockReturnValue(run);
			deps.getRunErrorText.mockReturnValue("fetch failed");
			mockDeriveMetaStatus.mockReturnValue({ kind: "running" });

			await service.reconcileRun("r1");

			expect(deps.sessionManager.inspectSession).toHaveBeenCalledWith(
				"session-1",
			);
		});
	});

	describe("applyInspectionResult", () => {
		let run: Run;

		beforeEach(() => {
			run = makeRun({
				id: "r1",
				status: "running",
				sessionId: "session-1",
			});
		});

		it("meta.kind completed calls finalizeRunFromSession with completed", async () => {
			mockRunRepoUpdate.mockReturnValue(run);
			mockDeriveMetaStatus.mockReturnValue({
				kind: "completed",
				marker: "done",
				content: "done-content",
			});

			await service.applyInspectionResult(run, "session-1", buildInspection());

			expect(deps.finalizeRunFromSession).toHaveBeenCalledWith(
				"r1",
				"completed",
				{ marker: "done", content: "done-content" },
			);
		});

		it("meta.kind failed calls finalizeRunFromSession with failed", async () => {
			mockRunRepoUpdate.mockReturnValue(run);
			mockDeriveMetaStatus.mockReturnValue({
				kind: "failed",
				marker: "fail",
				content: "fail-content",
			});

			await service.applyInspectionResult(run, "session-1", buildInspection());

			expect(deps.finalizeRunFromSession).toHaveBeenCalledWith("r1", "failed", {
				marker: "fail",
				content: "fail-content",
			});
		});

		it("meta.kind dead calls failRunDuringReconciliation", async () => {
			mockRunRepoUpdate.mockReturnValue(run);
			mockDeriveMetaStatus.mockReturnValue({ kind: "dead" });

			await service.applyInspectionResult(run, "session-1", buildInspection());

			expect(deps.clearActiveRunSession).toHaveBeenCalledWith("r1");
			expect(deps.removeFromQueue).toHaveBeenCalledWith("r1");
		});

		it("meta.kind permission calls ensureRunPausedForPermission and attachReconciledSession", async () => {
			const pausedRun = { ...run, status: "paused" as const };
			mockRunRepoUpdate.mockReturnValue(pausedRun);
			const permission = {
				id: "perm-1",
				permissionType: "file_write",
				sessionId: "session-1",
				messageId: "msg-1",
				title: "Allow write?",
				metadata: {},
				createdAt: Date.now(),
			};
			mockDeriveMetaStatus.mockReturnValue({
				kind: "permission",
				permission,
			});

			await service.applyInspectionResult(run, "session-1", buildInspection());

			expect(
				deps.runInteractionCoordinator.ensureRunPausedForPermission,
			).toHaveBeenCalledWith(pausedRun, permission);
			expect(
				deps.runInteractionCoordinator.attachReconciledSession,
			).toHaveBeenCalledWith("r1", "session-1");
		});

		it("meta.kind question calls ensureRunPausedForQuestion and attachReconciledSession", async () => {
			const pausedRun = { ...run, status: "paused" as const };
			mockRunRepoUpdate.mockReturnValue(pausedRun);
			const question = {
				id: "q-1",
				sessionId: "session-1",
				questions: [{ question: "Proceed?", options: [{ label: "Yes" }] }],
				createdAt: Date.now(),
			};
			mockDeriveMetaStatus.mockReturnValue({
				kind: "question",
				questions: [question],
			});

			await service.applyInspectionResult(run, "session-1", buildInspection());

			expect(
				deps.runInteractionCoordinator.ensureRunPausedForQuestion,
			).toHaveBeenCalledWith(pausedRun, question);
			expect(
				deps.runInteractionCoordinator.attachReconciledSession,
			).toHaveBeenCalledWith("r1", "session-1");
		});

		it("paused observedRun calls reconcilePausedRun and attachReconciledSession", async () => {
			const pausedRun = makeRun({
				id: "r1",
				status: "paused",
				sessionId: "session-1",
			});
			mockRunRepoUpdate.mockReturnValue(pausedRun);
			mockDeriveMetaStatus.mockReturnValue({ kind: "running" });

			await service.applyInspectionResult(
				pausedRun,
				"session-1",
				buildInspection(),
			);

			expect(
				deps.runInteractionCoordinator.reconcilePausedRun,
			).toHaveBeenCalledWith("r1", "session-1");
			expect(
				deps.runInteractionCoordinator.attachReconciledSession,
			).toHaveBeenCalledWith("r1", "session-1");
		});

		it("queued observedRun updates to running, creates event, publishes, applies transition, attaches session", async () => {
			const queuedRun = makeRun({
				id: "r1",
				status: "queued",
				sessionId: "session-1",
				startedAt: "2025-01-01T00:00:00Z",
			});
			mockRunRepoUpdate.mockImplementation(
				(_id: string, patch: Record<string, unknown>) => ({
					...queuedRun,
					...patch,
				}),
			);
			mockDeriveMetaStatus.mockReturnValue({ kind: "running" });

			await service.applyInspectionResult(
				queuedRun,
				"session-1",
				buildInspection(),
			);

			expect(mockRunRepoUpdate).toHaveBeenCalledWith(
				"r1",
				expect.objectContaining({ status: "running" }),
			);
			expect(mockRunEventRepoCreate).toHaveBeenCalledWith({
				runId: "r1",
				eventType: "status",
				payload: {
					status: "running",
					message: "Run resumed during reconciliation",
				},
			});
			expect(mockPublishRunUpdate).toHaveBeenCalled();
			expect(deps.applyTaskTransition).toHaveBeenCalledWith(
				expect.objectContaining({ id: "r1" }),
				"run:answer",
				"Run resumed during reconciliation",
			);
			expect(
				deps.runInteractionCoordinator.attachReconciledSession,
			).toHaveBeenCalledWith("r1", "session-1");
		});

		it("stale running run with alive probe and non-terminal meta force-finalizes via staleRunFallbackMarker", async () => {
			const oldDate = new Date(Date.now() - 120000).toISOString();
			const staleRun = makeRun({
				id: "r1",
				status: "running",
				sessionId: "session-1",
				startedAt: oldDate,
			});
			mockRunRepoUpdate.mockReturnValue(staleRun);
			mockDeriveMetaStatus.mockReturnValue({ kind: "running" });
			deps.runFinalizer.staleRunFallbackMarker.mockReturnValue(
				"done" as RunOutcomeMarker,
			);

			await service.applyInspectionResult(
				staleRun,
				"session-1",
				buildInspection({ probeStatus: "alive" }),
			);

			expect(deps.runFinalizer.staleRunFallbackMarker).toHaveBeenCalledWith(
				staleRun,
			);
			expect(deps.finalizeRunFromSession).toHaveBeenCalledWith(
				"r1",
				"completed",
				{ marker: "done", content: "" },
			);
		});
	});

	describe("failRunDuringReconciliation", () => {
		it("updates run to failed, creates event, publishes, transitions, cleans up", async () => {
			const run = makeRun({
				id: "r1",
				status: "running",
				sessionId: "session-1",
				startedAt: new Date().toISOString(),
			});
			const failedRun = { ...run, status: "failed" as const };
			mockRunRepoUpdate.mockReturnValue(failedRun);

			await service.failRunDuringReconciliation(
				run,
				"Something went wrong",
				"Error content",
			);

			expect(mockRunRepoUpdate).toHaveBeenCalledWith(
				"r1",
				expect.objectContaining({
					status: "failed",
					errorText: "Something went wrong",
				}),
			);

			expect(deps.runFinalizer.syncRunWorkspaceState).toHaveBeenCalledWith(
				failedRun,
			);

			expect(mockRunEventRepoCreate).toHaveBeenCalledWith({
				runId: "r1",
				eventType: "status",
				payload: {
					status: "failed",
					message: "Something went wrong",
				},
			});

			expect(mockPublishRunUpdate).toHaveBeenCalledWith(failedRun);

			expect(deps.applyTaskTransition).toHaveBeenCalledWith(
				failedRun,
				"run:fail",
				"Error content",
			);

			expect(deps.clearActiveRunSession).toHaveBeenCalledWith("r1");
			expect(deps.removeFromQueue).toHaveBeenCalledWith("r1");
		});

		it("uses generate:fail transition when isGenerationRun returns true", async () => {
			const run = makeRun({
				id: "r1",
				status: "running",
				sessionId: "session-1",
				startedAt: new Date().toISOString(),
			});
			const failedRun = { ...run, status: "failed" as const };
			mockRunRepoUpdate.mockReturnValue(failedRun);
			deps.isGenerationRun.mockReturnValue(true);

			await service.failRunDuringReconciliation(
				run,
				"Failed generation",
				"Generation error",
			);

			expect(deps.applyTaskTransition).toHaveBeenCalledWith(
				failedRun,
				"generate:fail",
				"Generation error",
			);
		});
	});

	describe("reconcileStaleRun", () => {
		it("returns early when sessionId is empty", async () => {
			const run = makeRun({
				id: "r1",
				status: "running",
				sessionId: "  ",
			});

			await service.reconcileStaleRun(run, "proj-1", "task-1");

			expect(deps.sessionManager.inspectSession).not.toHaveBeenCalled();
		});

		it("returns early when probe status is not alive", async () => {
			const run = makeRun({
				id: "r1",
				status: "running",
				sessionId: "session-1",
			});
			deps.sessionManager.inspectSession.mockResolvedValue(
				buildInspection({ probeStatus: "not_found" }),
			);

			await service.reconcileStaleRun(run, "proj-1", "task-1");

			expect(deps.finalizeRunFromSession).not.toHaveBeenCalled();
		});

		it("terminal session (completed) finalizes run", async () => {
			const run = makeRun({
				id: "r1",
				status: "running",
				sessionId: "session-1",
			});
			deps.sessionManager.inspectSession.mockResolvedValue(buildInspection());
			mockDeriveMetaStatus.mockReturnValue({
				kind: "completed",
				marker: "done",
				content: "done-content",
			});

			await service.reconcileStaleRun(run, "proj-1", "task-1");

			expect(deps.finalizeRunFromSession).toHaveBeenCalledWith(
				"r1",
				"completed",
				{ marker: "done", content: "done-content" },
			);
		});

		it("terminal session (failed) finalizes run", async () => {
			const run = makeRun({
				id: "r1",
				status: "running",
				sessionId: "session-1",
			});
			deps.sessionManager.inspectSession.mockResolvedValue(buildInspection());
			mockDeriveMetaStatus.mockReturnValue({
				kind: "failed",
				marker: "fail",
				content: "fail-msg",
			});

			await service.reconcileStaleRun(run, "proj-1", "task-1");

			expect(deps.finalizeRunFromSession).toHaveBeenCalledWith("r1", "failed", {
				marker: "fail",
				content: "fail-msg",
			});
		});

		it("dead session calls failRunDuringReconciliation", async () => {
			const run = makeRun({
				id: "r1",
				status: "running",
				sessionId: "session-1",
			});
			deps.sessionManager.inspectSession.mockResolvedValue(buildInspection());
			mockRunRepoUpdate.mockReturnValue({ ...run, status: "failed" });
			mockDeriveMetaStatus.mockReturnValue({ kind: "dead" });

			await service.reconcileStaleRun(run, "proj-1", "task-1");

			expect(deps.clearActiveRunSession).toHaveBeenCalledWith("r1");
			expect(deps.removeFromQueue).toHaveBeenCalledWith("r1");
		});

		it("alive non-terminal session uses fallback finalize via staleRunFallbackMarker", async () => {
			const run = makeRun({
				id: "r1",
				status: "running",
				sessionId: "session-1",
			});
			deps.sessionManager.inspectSession.mockResolvedValue(buildInspection());
			mockDeriveMetaStatus.mockReturnValue({ kind: "running" });
			mockFindStoryContent.mockReturnValue("fallback-story");

			await service.reconcileStaleRun(run, "proj-1", "task-1");

			expect(deps.runFinalizer.staleRunFallbackMarker).toHaveBeenCalledWith(
				run,
			);
			expect(deps.finalizeRunFromSession).toHaveBeenCalledWith(
				"r1",
				"completed",
				{ marker: "done", content: "fallback-story" },
			);
		});

		it("catches exceptions and does not throw", async () => {
			const run = makeRun({
				id: "r1",
				status: "running",
				sessionId: "session-1",
			});
			deps.sessionManager.inspectSession.mockRejectedValue(
				new Error("network failure"),
			);

			await expect(
				service.reconcileStaleRun(run, "proj-1", "task-1"),
			).resolves.toBeUndefined();
		});
	});

	describe("tryFinalizeFromSessionSnapshot", () => {
		it("running run with terminal completed inspection calls finalizeRunFromSession", async () => {
			const run = makeRun({
				id: "r1",
				status: "running",
				sessionId: "session-1",
			});
			mockRunRepoGetById.mockReturnValue(run);
			deps.sessionManager.inspectSession.mockResolvedValue(buildInspection());
			mockDeriveMetaStatus.mockReturnValue({
				kind: "completed",
				marker: "done",
				content: "snapshot-content",
			});

			await service.tryFinalizeFromSessionSnapshot("r1", "session-1");

			expect(deps.finalizeRunFromSession).toHaveBeenCalledWith(
				"r1",
				"completed",
				{ marker: "done", content: "snapshot-content" },
			);
		});

		it("queued run with terminal failed inspection calls finalizeRunFromSession", async () => {
			const run = makeRun({
				id: "r1",
				status: "queued",
				sessionId: "session-1",
			});
			mockRunRepoGetById.mockReturnValue(run);
			deps.sessionManager.inspectSession.mockResolvedValue(buildInspection());
			mockDeriveMetaStatus.mockReturnValue({
				kind: "failed",
				marker: "fail",
				content: "fail-snapshot",
			});

			await service.tryFinalizeFromSessionSnapshot("r1", "session-1");

			expect(deps.finalizeRunFromSession).toHaveBeenCalledWith("r1", "failed", {
				marker: "fail",
				content: "fail-snapshot",
			});
		});

		it("non-terminal inspection is a no-op", async () => {
			const run = makeRun({
				id: "r1",
				status: "running",
				sessionId: "session-1",
			});
			mockRunRepoGetById.mockReturnValue(run);
			deps.sessionManager.inspectSession.mockResolvedValue(buildInspection());
			mockDeriveMetaStatus.mockReturnValue({ kind: "running" });

			await service.tryFinalizeFromSessionSnapshot("r1", "session-1");

			expect(deps.finalizeRunFromSession).not.toHaveBeenCalled();
		});

		it("missing run is a no-op", async () => {
			mockRunRepoGetById.mockReturnValue(null);

			await service.tryFinalizeFromSessionSnapshot("nonexistent", "session-1");

			expect(deps.finalizeRunFromSession).not.toHaveBeenCalled();
			expect(deps.sessionManager.inspectSession).not.toHaveBeenCalled();
		});

		it("non-active status (completed) is a no-op", async () => {
			mockRunRepoGetById.mockReturnValue(
				makeRun({ id: "r1", status: "completed", sessionId: "s1" }),
			);

			await service.tryFinalizeFromSessionSnapshot("r1", "session-1");

			expect(deps.finalizeRunFromSession).not.toHaveBeenCalled();
			expect(deps.sessionManager.inspectSession).not.toHaveBeenCalled();
		});
	});
});
