import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	RunFinalizer,
	canRecoverLateCompletion,
	resolveTriggerFromOutcome,
	staleRunFallbackMarker,
} from "@/server/run/run-finalizer";
import type { RunFinalizerDeps } from "@/server/run/run-finalizer";
import type { RunOutcomeMarker } from "@/server/run/run-session-interpreter";
import type { TaskTransitionTrigger } from "@/server/run/task-state-machine";
import type { Run, RunMetadata } from "@/types/ipc";

describe("run-finalizer helpers", () => {
	it("maps timeout outcome to generate:fail for generation run", () => {
		const generationRun = {
			id: "run-1",
			taskId: "task-1",
			status: "running",
			roleId: "dev",
			sessionId: "",
			mode: "execute",
			startedAt: null,
			finishedAt: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			metadata: { kind: "task-description-improve" },
		} as Run;

		const trigger = resolveTriggerFromOutcome(
			generationRun,
			"failed",
			{ marker: "timeout", content: "" },
			{ isGenerationRun: () => true },
		);

		expect(trigger).toBe("generate:fail");
	});

	it("returns generated fallback marker for generation runs", () => {
		const generationRun = {
			id: "run-2",
			taskId: "task-2",
			status: "running",
			roleId: "dev",
			sessionId: "",
			mode: "execute",
			startedAt: null,
			finishedAt: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			metadata: { kind: "task-description-improve" },
		} as Run;

		const marker = staleRunFallbackMarker(
			generationRun,
			"task-description-improve",
		);
		expect(marker).toBe("generated");
	});

	it("allows late fetch-failed completion recovery within window", () => {
		const now = new Date().toISOString();
		const failedRun = {
			id: "run-3",
			taskId: "task-3",
			status: "failed",
			roleId: "dev",
			sessionId: "",
			mode: "execute",
			startedAt: null,
			finishedAt: now,
			endedAt: now,
			createdAt: now,
			updatedAt: now,
			metadata: {},
		} as Run;

		const recovered = canRecoverLateCompletion(
			failedRun,
			"completed",
			vi.fn(() => "fetch failed"),
		);

		expect(recovered).toBe(true);
	});
});

function buildRun(overrides: Partial<Run> = {}): Run {
	const now = "2025-01-01T00:00:00.000Z";
	return {
		id: overrides.id ?? "run-1",
		taskId: overrides.taskId ?? "task-1",
		sessionId: overrides.sessionId ?? "session-1",
		roleId: overrides.roleId ?? "dev",
		mode: overrides.mode ?? "execute",
		status: overrides.status ?? "running",
		startedAt: overrides.startedAt ?? now,
		endedAt: overrides.endedAt ?? null,
		createdAt: overrides.createdAt ?? now,
		updatedAt: overrides.updatedAt ?? now,
		metadata: overrides.metadata ?? {},
	};
}

function buildOutcome(marker: RunOutcomeMarker, content = "") {
	return { marker, content };
}

type TestRunFinalizerDeps = RunFinalizerDeps & {
	setStoredRun: (run: Run | null) => void;
	getStoredRun: () => Run | null;
};

function applyRunPatch(
	run: Run,
	patch: Parameters<RunFinalizerDeps["updateRun"]>[1],
): Run {
	const metadata: RunMetadata = patch.metadata ?? run.metadata ?? {};

	return {
		...run,
		status: patch.status ?? run.status,
		endedAt:
			patch.finishedAt === undefined ? (run.endedAt ?? null) : patch.finishedAt,
		metadata,
	};
}

function buildDeps(
	overrides: Partial<RunFinalizerDeps> = {},
): TestRunFinalizerDeps {
	let storedRun: Run | null = buildRun();

	const deps: TestRunFinalizerDeps = {
		getRunById: vi.fn((runId: string) => {
			if (!storedRun || storedRun.id !== runId) {
				return null;
			}

			return storedRun;
		}),
		updateRun: vi.fn((runId: string, patch) => {
			if (!storedRun || storedRun.id !== runId) {
				throw new Error(`Unknown run: ${runId}`);
			}

			storedRun = applyRunPatch(storedRun, patch);
			return storedRun;
		}),
		createStatusEvent: vi.fn(),
		publishRunUpdate: vi.fn(),
		syncRunWorkspaceState: vi.fn(async (run: Run) => run),
		applyTaskTransition: vi.fn(),
		shouldAutoExecuteAfterGeneration: vi.fn(() => false),
		tryAutomaticMerge: vi.fn(async (run: Run) => run),
		startNextReadyTaskAfterMerge: vi.fn(async (_taskId: string) => {}),
		isGenerationRun: vi.fn(() => false),
		hydrateGenerationOutcomeContent: vi.fn(
			async (_run: Run, content: string) => content,
		),
		getDurationSec: vi.fn(() => 42),
		clearSessionTracking: vi.fn(),
		clearRunInput: vi.fn(),
		getRunErrorText: vi.fn(() => ""),
		unsubscribeLiveSubscription: vi.fn(),
		setStoredRun: (run: Run | null) => {
			storedRun = run;
		},
		getStoredRun: () => storedRun,
	};

	return {
		...deps,
		...overrides,
		setStoredRun: deps.setStoredRun,
		getStoredRun: deps.getStoredRun,
	};
}

describe("resolveTriggerFromOutcome", () => {
	it.each([
		["cancelled", "run:cancelled"],
		["resumed", "run:answer"],
		["question", "run:question"],
		["dead", "run:dead"],
	] as const)("returns %s -> %s", (marker, expectedTrigger) => {
		const trigger = resolveTriggerFromOutcome(
			buildRun(),
			"completed",
			buildOutcome(marker),
			{ isGenerationRun: () => false },
		);

		expect(trigger).toBe(expectedTrigger);
	});

	it("returns generate:fail for a timeout on generation runs", () => {
		const trigger = resolveTriggerFromOutcome(
			buildRun({ metadata: { kind: "task-description-improve" } }),
			"failed",
			buildOutcome("timeout"),
			{ isGenerationRun: () => true },
		);

		expect(trigger).toBe("generate:fail");
	});

	it("returns run:fail for a timeout on non-generation runs", () => {
		const trigger = resolveTriggerFromOutcome(
			buildRun(),
			"failed",
			buildOutcome("timeout"),
			{ isGenerationRun: () => false },
		);

		expect(trigger).toBe("run:fail");
	});

	it("returns a non-null trigger for done markers on completed runs", () => {
		const trigger = resolveTriggerFromOutcome(
			buildRun(),
			"completed",
			buildOutcome("done"),
			{ isGenerationRun: () => false },
		);

		expect(trigger).not.toBeNull();
	});

	it("returns a non-null trigger for fail markers on failed runs", () => {
		const trigger = resolveTriggerFromOutcome(
			buildRun(),
			"failed",
			buildOutcome("fail"),
			{ isGenerationRun: () => false },
		);

		expect(trigger).not.toBeNull();
	});

	it("returns a non-null trigger for generated markers on completed runs", () => {
		const trigger = resolveTriggerFromOutcome(
			buildRun({ metadata: { kind: "task-description-improve" } }),
			"completed",
			buildOutcome("generated"),
			{ isGenerationRun: () => true },
		);

		expect(trigger).not.toBeNull();
	});

	it("returns a non-null trigger for test_ok markers on completed runs", () => {
		const trigger = resolveTriggerFromOutcome(
			buildRun({ metadata: { kind: "task-qa-testing" } }),
			"completed",
			buildOutcome("test_ok"),
			{ isGenerationRun: () => false },
		);

		expect(trigger).not.toBeNull();
	});

	it("returns a non-null trigger for test_fail markers on failed runs", () => {
		const trigger = resolveTriggerFromOutcome(
			buildRun({ metadata: { kind: "task-qa-testing" } }),
			"failed",
			buildOutcome("test_fail"),
			{ isGenerationRun: () => false },
		);

		expect(trigger).not.toBeNull();
	});

	it("returns null for unknown markers", () => {
		const unknownOutcome = {
			marker: "unknown",
			content: "",
		} as unknown as Parameters<typeof resolveTriggerFromOutcome>[2];

		const trigger = resolveTriggerFromOutcome(
			buildRun(),
			"completed",
			unknownOutcome,
			{ isGenerationRun: () => false },
		);

		expect(trigger).toBeNull();
	});
});

describe("staleRunFallbackMarker", () => {
	it("returns generated for generation runs", () => {
		const marker = staleRunFallbackMarker(
			buildRun({ metadata: { kind: "task-description-improve" } }),
			"task-description-improve",
		);

		expect(marker).toBe("generated");
	});

	it("returns test_ok for QA runs", () => {
		const marker = staleRunFallbackMarker(
			buildRun({ metadata: { kind: "task-qa-testing" } }),
			"task-description-improve",
		);

		expect(marker).toBe("test_ok");
	});

	it("returns done for normal runs", () => {
		const marker = staleRunFallbackMarker(
			buildRun({ metadata: { kind: "task-execution" } }),
			"task-description-improve",
		);

		expect(marker).toBe("done");
	});
});

describe("canRecoverLateCompletion", () => {
	it("returns true for a recent fetch-failed completion recovery", () => {
		const nowMs = Date.parse("2025-01-01T12:00:00.000Z");
		const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(nowMs);

		try {
			const recovered = canRecoverLateCompletion(
				buildRun({
					status: "failed",
					endedAt: new Date(nowMs - 5 * 60 * 1000).toISOString(),
				}),
				"completed",
				() => "fetch failed",
			);

			expect(recovered).toBe(true);
		} finally {
			dateNowSpy.mockRestore();
		}
	});

	it("returns false when the source status is not failed", () => {
		const nowMs = Date.parse("2025-01-01T12:00:00.000Z");
		const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(nowMs);

		try {
			const recovered = canRecoverLateCompletion(
				buildRun({
					status: "running",
					endedAt: new Date(nowMs - 5 * 60 * 1000).toISOString(),
				}),
				"completed",
				() => "fetch failed",
			);

			expect(recovered).toBe(false);
		} finally {
			dateNowSpy.mockRestore();
		}
	});

	it("returns false when the target status is not completed", () => {
		const nowMs = Date.parse("2025-01-01T12:00:00.000Z");
		const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(nowMs);

		try {
			const recovered = canRecoverLateCompletion(
				buildRun({
					status: "failed",
					endedAt: new Date(nowMs - 5 * 60 * 1000).toISOString(),
				}),
				"failed",
				() => "fetch failed",
			);

			expect(recovered).toBe(false);
		} finally {
			dateNowSpy.mockRestore();
		}
	});

	it("returns false when the error text is different", () => {
		const nowMs = Date.parse("2025-01-01T12:00:00.000Z");
		const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(nowMs);

		try {
			const recovered = canRecoverLateCompletion(
				buildRun({
					status: "failed",
					endedAt: new Date(nowMs - 5 * 60 * 1000).toISOString(),
				}),
				"completed",
				() => "something else",
			);

			expect(recovered).toBe(false);
		} finally {
			dateNowSpy.mockRestore();
		}
	});

	it("returns false when endedAt is missing", () => {
		const nowMs = Date.parse("2025-01-01T12:00:00.000Z");
		const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(nowMs);

		try {
			const recovered = canRecoverLateCompletion(
				buildRun({ status: "failed", endedAt: undefined }),
				"completed",
				() => "fetch failed",
			);

			expect(recovered).toBe(false);
		} finally {
			dateNowSpy.mockRestore();
		}
	});

	it("returns false when the completion is too old", () => {
		const nowMs = Date.parse("2025-01-01T12:00:00.000Z");
		const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(nowMs);

		try {
			const recovered = canRecoverLateCompletion(
				buildRun({
					status: "failed",
					endedAt: new Date(nowMs - 16 * 60 * 1000).toISOString(),
				}),
				"completed",
				() => "fetch failed",
			);

			expect(recovered).toBe(false);
		} finally {
			dateNowSpy.mockRestore();
		}
	});

	it("returns true when the error text matches case-insensitively", () => {
		const nowMs = Date.parse("2025-01-01T12:00:00.000Z");
		const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(nowMs);

		try {
			const recovered = canRecoverLateCompletion(
				buildRun({
					status: "failed",
					endedAt: new Date(nowMs - 10 * 60 * 1000).toISOString(),
				}),
				"completed",
				() => "Fetch Failed",
			);

			expect(recovered).toBe(true);
		} finally {
			dateNowSpy.mockRestore();
		}
	});
});

describe("RunFinalizer", () => {
	let deps: TestRunFinalizerDeps;
	let finalizer: RunFinalizer;

	beforeEach(() => {
		vi.clearAllMocks();
		deps = buildDeps();
		finalizer = new RunFinalizer(deps);
	});

	describe("finalizeRunFromSession", () => {
		it("returns early when the run cannot be found", async () => {
			deps.setStoredRun(null);

			await finalizer.finalizeRunFromSession(
				"missing-run",
				"completed",
				buildOutcome("done", "result"),
			);

			expect(deps.updateRun).not.toHaveBeenCalled();
		});

		it("returns early when the run is already in the target status", async () => {
			deps.setStoredRun(buildRun({ status: "completed" }));

			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("done", "result"),
			);

			expect(deps.updateRun).not.toHaveBeenCalled();
		});

		it("returns early when the run is not running or queued and late recovery does not apply", async () => {
			deps.setStoredRun(buildRun({ status: "paused" }));

			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("done", "result"),
			);

			expect(deps.updateRun).not.toHaveBeenCalled();
		});

		it("proceeds with finalization when late completion recovery is allowed", async () => {
			const nowMs = Date.parse("2025-01-01T12:00:00.000Z");
			const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(nowMs);

			try {
				deps.setStoredRun(
					buildRun({
						status: "failed",
						endedAt: new Date(nowMs - 2 * 60 * 1000).toISOString(),
					}),
				);
				vi.mocked(deps.getRunErrorText).mockReturnValue("fetch failed");

				await finalizer.finalizeRunFromSession(
					"run-1",
					"completed",
					buildOutcome("done", "result"),
				);

				expect(deps.updateRun).toHaveBeenCalledTimes(1);
			} finally {
				dateNowSpy.mockRestore();
			}
		});

		it("hydrates outcome content and uses the hydrated value in the run patch", async () => {
			vi.mocked(deps.hydrateGenerationOutcomeContent).mockResolvedValue(
				"hydrated content",
			);

			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("done", "raw content"),
			);

			expect(deps.hydrateGenerationOutcomeContent).toHaveBeenCalledWith(
				expect.objectContaining({ id: "run-1" }),
				"raw content",
			);

			const patch = vi.mocked(deps.updateRun).mock.calls[0]?.[1];
			expect(patch.metadata?.lastExecutionStatus).toMatchObject({
				content: "hydrated content",
			});
		});

		it("updates completed runs with the expected patch fields", async () => {
			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("done", "finished successfully"),
			);

			const patch = vi.mocked(deps.updateRun).mock.calls[0]?.[1];
			expect(patch).toMatchObject({
				status: "completed",
				errorText: "",
				durationSec: 42,
			});
			expect(typeof patch.finishedAt).toBe("string");
			expect(patch.metadata?.lastExecutionStatus).toMatchObject({
				kind: "completed",
				marker: "done",
				content: "finished successfully",
			});
		});

		it("updates failed runs with the expected patch fields", async () => {
			await finalizer.finalizeRunFromSession(
				"run-1",
				"failed",
				buildOutcome("fail"),
			);

			const patch = vi.mocked(deps.updateRun).mock.calls[0]?.[1];
			expect(patch).toMatchObject({
				status: "failed",
				errorText: "Run failed",
				durationSec: 42,
			});
			expect(typeof patch.finishedAt).toBe("string");
			expect(patch.metadata?.lastExecutionStatus).toMatchObject({
				kind: "failed",
				marker: "fail",
			});
			expect(patch.metadata?.lastExecutionStatus).not.toHaveProperty("content");
		});

		it.each([
			["done", "completed"],
			["generated", "completed"],
			["test_ok", "completed"],
			["fail", "failed"],
			["test_fail", "failed"],
		] as const)("stores %s as the last execution marker", async (marker, status) => {
			await finalizer.finalizeRunFromSession(
				"run-1",
				status,
				buildOutcome(marker, "marker content"),
			);

			const patch = vi.mocked(deps.updateRun).mock.calls[0]?.[1];
			expect(patch.metadata?.lastExecutionStatus).toMatchObject({
				marker,
			});
		});

		it("creates a status event with the run id, status, and message", async () => {
			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("done", "result"),
			);

			expect(deps.createStatusEvent).toHaveBeenCalledWith(
				"run-1",
				"completed",
				"Run completed",
			);
		});

		it("applies a task transition when the resolved trigger is not null", async () => {
			const trigger: TaskTransitionTrigger = "run:done";
			vi.spyOn(finalizer, "resolveTriggerFromOutcome").mockReturnValue(trigger);

			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("done", "transition content"),
			);

			expect(deps.applyTaskTransition).toHaveBeenCalledWith(
				expect.objectContaining({ id: "run-1" }),
				trigger,
				"transition content",
			);
		});

		it("does not apply a task transition when no trigger is resolved", async () => {
			vi.spyOn(finalizer, "resolveTriggerFromOutcome").mockReturnValue(null);

			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("done", "transition content"),
			);

			expect(deps.applyTaskTransition).not.toHaveBeenCalled();
		});

		it("catches projection errors and still publishes and clears state", async () => {
			vi.spyOn(finalizer, "resolveTriggerFromOutcome").mockReturnValue(
				"run:done",
			);
			vi.mocked(deps.applyTaskTransition).mockImplementation(() => {
				throw new Error("projection failed");
			});

			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("done", "result"),
			);

			expect(deps.publishRunUpdate).toHaveBeenCalledTimes(1);
			expect(deps.clearSessionTracking).toHaveBeenCalledWith("run-1");
			expect(deps.clearRunInput).toHaveBeenCalledWith("run-1");
		});

		it("stores a pending generated execution task id when auto execute is enabled", async () => {
			vi.mocked(deps.isGenerationRun).mockReturnValue(true);
			vi.mocked(deps.shouldAutoExecuteAfterGeneration).mockReturnValue(true);

			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("generated", "story"),
			);

			expect(finalizer.consumePendingGeneratedExecutionTaskId("run-1")).toBe(
				"task-1",
			);
		});

		it("does not store a pending generated execution task id when auto execute is disabled", async () => {
			vi.mocked(deps.isGenerationRun).mockReturnValue(true);
			vi.mocked(deps.shouldAutoExecuteAfterGeneration).mockReturnValue(false);

			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("generated", "story"),
			);

			expect(
				finalizer.consumePendingGeneratedExecutionTaskId("run-1"),
			).toBeNull();
		});

		it("calls tryAutomaticMerge for completed non-generation runs", async () => {
			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("done", "result"),
			);

			expect(deps.tryAutomaticMerge).toHaveBeenCalledWith(
				expect.objectContaining({ id: "run-1", status: "completed" }),
			);
		});

		it("starts the next ready task after a merged run", async () => {
			vi.mocked(deps.tryAutomaticMerge).mockImplementation(async (run) =>
				buildRun({
					...run,
					status: "completed",
					metadata: {
						...(run.metadata ?? {}),
						vcs: {
							repoRoot: "/repo",
							worktreePath: "/repo",
							branchName: "feature/run-1",
							baseBranch: "main",
							baseCommit: "abc123",
							workspaceStatus: "merged",
							mergeStatus: "merged",
							cleanupStatus: "pending",
						},
					},
				}),
			);

			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("done", "result"),
			);

			expect(deps.startNextReadyTaskAfterMerge).toHaveBeenCalledWith("task-1");
		});

		it("does not start the next ready task when the run is not merged", async () => {
			vi.mocked(deps.tryAutomaticMerge).mockImplementation(async (run) =>
				buildRun({
					...run,
					status: "completed",
					metadata: {
						...(run.metadata ?? {}),
						vcs: {
							repoRoot: "/repo",
							worktreePath: "/repo",
							branchName: "feature/run-1",
							baseBranch: "main",
							baseCommit: "abc123",
							workspaceStatus: "ready",
							mergeStatus: "pending",
							cleanupStatus: "pending",
						},
					},
				}),
			);

			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("done", "result"),
			);

			expect(deps.startNextReadyTaskAfterMerge).not.toHaveBeenCalled();
		});

		it("publishes the latest run after finalization", async () => {
			const initialRun = buildRun({ id: "run-1", status: "running" });
			const latestRun = buildRun({
				id: "run-1",
				status: "completed",
				metadata: {
					lastExecutionStatus: { kind: "completed", updatedAt: "later" },
				},
			});

			const customDeps = buildDeps({
				getRunById: vi
					.fn()
					.mockReturnValueOnce(initialRun)
					.mockReturnValueOnce(latestRun),
				updateRun: vi.fn(() => buildRun({ id: "run-1", status: "completed" })),
			});
			const customFinalizer = new RunFinalizer(customDeps);

			await customFinalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("done", "result"),
			);

			expect(customDeps.publishRunUpdate).toHaveBeenCalledWith(latestRun);
		});

		it("clears session tracking after finalization", async () => {
			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("done", "result"),
			);

			expect(deps.clearSessionTracking).toHaveBeenCalledWith("run-1");
		});

		it("clears run input after finalization", async () => {
			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("done", "result"),
			);

			expect(deps.clearRunInput).toHaveBeenCalledWith("run-1");
		});
	});

	describe("consumePendingGeneratedExecutionTaskId", () => {
		it("returns null when no pending generated execution task id is stored", () => {
			expect(
				finalizer.consumePendingGeneratedExecutionTaskId("run-1"),
			).toBeNull();
		});

		it("returns the stored task id once and then removes it", async () => {
			vi.mocked(deps.isGenerationRun).mockReturnValue(true);
			vi.mocked(deps.shouldAutoExecuteAfterGeneration).mockReturnValue(true);

			await finalizer.finalizeRunFromSession(
				"run-1",
				"completed",
				buildOutcome("generated", "story"),
			);

			expect(finalizer.consumePendingGeneratedExecutionTaskId("run-1")).toBe(
				"task-1",
			);
			expect(
				finalizer.consumePendingGeneratedExecutionTaskId("run-1"),
			).toBeNull();
		});
	});
});
