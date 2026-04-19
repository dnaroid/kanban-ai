import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/run/run-publisher", () => ({
	publishRunUpdate: vi.fn(),
}));

vi.mock("@/server/events/sse-broker", () => ({
	publishSseEvent: vi.fn(),
}));

import { publishSseEvent } from "@/server/events/sse-broker";
import { RunInteractionCoordinator } from "@/server/run/run-interaction-coordinator";
import { publishRunUpdate } from "@/server/run/run-publisher";
import type { TaskTransitionTrigger } from "@/server/run/task-state-machine";
import type { PermissionData, QuestionData, Run } from "@/types/ipc";

type RunEventLike = {
	eventType: string;
	payload: unknown;
};

const NOW = "2026-04-19T00:00:00.000Z";
const CREATED_AT = 1_710_000_000_000;

const mockPublishRunUpdate = vi.mocked(publishRunUpdate);
const mockPublishSseEvent = vi.mocked(publishSseEvent);

function buildRun(overrides: Partial<Run> = {}): Run {
	return {
		id: overrides.id ?? "run-1",
		taskId: overrides.taskId ?? "task-1",
		sessionId: overrides.sessionId ?? "session-1",
		roleId: overrides.roleId ?? "dev",
		mode: overrides.mode ?? "execute",
		status: overrides.status ?? "queued",
		startedAt: overrides.startedAt ?? null,
		endedAt: overrides.endedAt ?? null,
		createdAt: overrides.createdAt ?? NOW,
		updatedAt: overrides.updatedAt ?? NOW,
		metadata: overrides.metadata ?? {},
	};
}

function buildPermission(
	overrides: Partial<PermissionData> = {},
): PermissionData {
	return {
		id: "perm-1",
		permissionType: "tool",
		pattern: "*.ts",
		sessionId: "session-1",
		messageId: "msg-1",
		title: "Run tool",
		metadata: {},
		createdAt: CREATED_AT,
		...overrides,
	};
}

function buildQuestion(overrides: Partial<QuestionData> = {}): QuestionData {
	return {
		id: "q-1",
		sessionId: "session-1",
		questions: [{ question: "Continue?", options: [] }],
		createdAt: CREATED_AT,
		...overrides,
	};
}

function buildRunEvent(overrides: Partial<RunEventLike> = {}): RunEventLike {
	return {
		eventType: overrides.eventType ?? "status",
		payload: overrides.payload ?? { status: "running" },
	};
}

function buildPermissionEvent(
	payload: unknown = { status: "paused", permissionId: "perm-1" },
): RunEventLike {
	return buildRunEvent({ eventType: "permission", payload });
}

function buildQuestionEvent(
	payload: unknown = { status: "paused", questionId: "q-1" },
): RunEventLike {
	return buildRunEvent({ eventType: "question", payload });
}

function createCoordinator() {
	const runs = new Map<string, Run>();
	const events = new Map<string, RunEventLike[]>();

	const deps = {
		getRunById: vi.fn((runId: string) => runs.get(runId) ?? null),
		updateRun: vi.fn((runId: string, patch: Partial<Run>) => {
			const current = runs.get(runId);
			if (!current) {
				throw new Error(`Run not found: ${runId}`);
			}

			const next: Run = { ...current, ...patch };
			runs.set(runId, next);
			return next;
		}),
		createRunEvent: vi.fn(
			(runId: string, eventType: string, payload: Record<string, unknown>) => {
				const current = events.get(runId) ?? [];
				current.push({ eventType, payload });
				events.set(runId, current);
			},
		),
		listRunEvents: vi.fn((runId: string, _limit: number) => {
			return events.get(runId) ?? [];
		}),
		applyTaskTransition: vi.fn(
			(_run: Run, _trigger: TaskTransitionTrigger, _outcomeContent: string) =>
				undefined,
		),
		listPendingPermissions: vi
			.fn<(sessionId: string) => Promise<PermissionData[]>>()
			.mockResolvedValue([]),
		listPendingQuestions: vi
			.fn<(sessionId: string) => Promise<QuestionData[]>>()
			.mockResolvedValue([]),
		setActiveRunSession: vi.fn((runId: string, sessionId: string) => {
			void runId;
			void sessionId;
		}),
	};

	const coordinator = new RunInteractionCoordinator(deps);

	return { coordinator, deps, runs, events };
}

describe("RunInteractionCoordinator", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("resumeRunAfterPermissionApproval", () => {
		it("does nothing when the run is missing", async () => {
			const { coordinator, deps } = createCoordinator();

			await coordinator.resumeRunAfterPermissionApproval(
				"run-missing",
				"perm-1",
			);

			expect(deps.updateRun).not.toHaveBeenCalled();
			expect(deps.createRunEvent).not.toHaveBeenCalled();
			expect(deps.applyTaskTransition).not.toHaveBeenCalled();
			expect(mockPublishRunUpdate).not.toHaveBeenCalled();
		});

		it("does nothing when the run is not paused", async () => {
			const { coordinator, deps } = createCoordinator();
			deps.getRunById.mockReturnValue(buildRun({ status: "running" }));

			await coordinator.resumeRunAfterPermissionApproval("run-1", "perm-1");

			expect(deps.updateRun).not.toHaveBeenCalled();
			expect(deps.createRunEvent).not.toHaveBeenCalled();
			expect(deps.applyTaskTransition).not.toHaveBeenCalled();
			expect(mockPublishRunUpdate).not.toHaveBeenCalled();
		});

		it("resumes a paused run after permission approval", async () => {
			const { coordinator, deps, runs } = createCoordinator();
			const run = buildRun({ status: "paused" });
			runs.set(run.id, run);

			await coordinator.resumeRunAfterPermissionApproval(run.id, "perm-9");

			expect(deps.updateRun).toHaveBeenCalledWith(run.id, {
				status: "running",
			});
			expect(deps.createRunEvent).toHaveBeenCalledWith(run.id, "permission", {
				status: "approved",
				permissionId: "perm-9",
				response: "approved",
				message: "Permission approved: perm-9",
			});
			expect(mockPublishRunUpdate).toHaveBeenCalledWith(
				expect.objectContaining({ id: run.id, status: "running" }),
			);
			expect(deps.applyTaskTransition).toHaveBeenCalledWith(
				expect.objectContaining({ id: run.id, status: "running" }),
				"run:answer",
				"Permission approved: perm-9",
			);
		});
	});

	describe("resumeRunAfterQuestionAnswered", () => {
		it("does nothing when the run is missing", async () => {
			const { coordinator, deps } = createCoordinator();

			await coordinator.resumeRunAfterQuestionAnswered("run-missing", "q-1");

			expect(deps.updateRun).not.toHaveBeenCalled();
			expect(deps.createRunEvent).not.toHaveBeenCalled();
			expect(deps.applyTaskTransition).not.toHaveBeenCalled();
			expect(mockPublishRunUpdate).not.toHaveBeenCalled();
		});

		it("does nothing when the run is not paused", async () => {
			const { coordinator, deps } = createCoordinator();
			deps.getRunById.mockReturnValue(buildRun({ status: "running" }));

			await coordinator.resumeRunAfterQuestionAnswered("run-1", "q-1");

			expect(deps.updateRun).not.toHaveBeenCalled();
			expect(deps.createRunEvent).not.toHaveBeenCalled();
			expect(deps.applyTaskTransition).not.toHaveBeenCalled();
			expect(mockPublishRunUpdate).not.toHaveBeenCalled();
		});

		it("resumes a paused run after a question is answered", async () => {
			const { coordinator, deps, runs } = createCoordinator();
			const run = buildRun({ status: "paused" });
			runs.set(run.id, run);

			await coordinator.resumeRunAfterQuestionAnswered(run.id, "q-7");

			expect(deps.updateRun).toHaveBeenCalledWith(run.id, {
				status: "running",
			});
			expect(deps.createRunEvent).toHaveBeenCalledWith(run.id, "question", {
				status: "answered",
				questionId: "q-7",
				response: "answered",
				message: "Question answered",
			});
			expect(mockPublishRunUpdate).toHaveBeenCalledWith(
				expect.objectContaining({ id: run.id, status: "running" }),
			);
			expect(deps.applyTaskTransition).toHaveBeenCalledWith(
				expect.objectContaining({ id: run.id, status: "running" }),
				"run:answer",
				"Question answered",
			);
		});
	});

	describe("resumeOrphanedPausedRun", () => {
		it("does nothing when the run is missing", async () => {
			const { coordinator, deps } = createCoordinator();

			await coordinator.resumeOrphanedPausedRun("run-missing");

			expect(deps.updateRun).not.toHaveBeenCalled();
			expect(deps.createRunEvent).not.toHaveBeenCalled();
			expect(deps.applyTaskTransition).not.toHaveBeenCalled();
			expect(mockPublishRunUpdate).not.toHaveBeenCalled();
		});

		it("does nothing when the run is not paused", async () => {
			const { coordinator, deps } = createCoordinator();
			deps.getRunById.mockReturnValue(buildRun({ status: "running" }));

			await coordinator.resumeOrphanedPausedRun("run-1");

			expect(deps.updateRun).not.toHaveBeenCalled();
			expect(deps.createRunEvent).not.toHaveBeenCalled();
			expect(deps.applyTaskTransition).not.toHaveBeenCalled();
			expect(mockPublishRunUpdate).not.toHaveBeenCalled();
		});

		it("resumes a paused run with an orphaned paused status", async () => {
			const { coordinator, deps, runs } = createCoordinator();
			const run = buildRun({ status: "paused" });
			runs.set(run.id, run);

			await coordinator.resumeOrphanedPausedRun(run.id);

			expect(deps.updateRun).toHaveBeenCalledWith(run.id, {
				status: "running",
			});
			expect(deps.createRunEvent).toHaveBeenCalledWith(run.id, "status", {
				status: "running",
				message: "Auto-resumed: no pending user interaction",
			});
			expect(mockPublishRunUpdate).toHaveBeenCalledWith(
				expect.objectContaining({ id: run.id, status: "running" }),
			);
			expect(deps.applyTaskTransition).toHaveBeenCalledWith(
				expect.objectContaining({ id: run.id, status: "running" }),
				"run:answer",
				"Resumed orphaned paused run",
			);
		});
	});

	describe("getAwaitingPermissionId", () => {
		it("returns the latest paused permission id when scanning events backwards", () => {
			const { coordinator, events } = createCoordinator();
			events.set("run-1", [
				buildPermissionEvent({ status: "paused", permissionId: "perm-1" }),
				buildRunEvent({ eventType: "status", payload: { status: "running" } }),
				buildPermissionEvent({ status: "paused", permissionId: "perm-2" }),
			]);

			expect(coordinator.getAwaitingPermissionId("run-1")).toBe("perm-2");
		});

		it("returns null when the latest permission event is approved", () => {
			const { coordinator, events } = createCoordinator();
			events.set("run-1", [
				buildPermissionEvent({ status: "paused", permissionId: "perm-1" }),
				buildPermissionEvent({ status: "approved", permissionId: "perm-1" }),
			]);

			expect(coordinator.getAwaitingPermissionId("run-1")).toBeNull();
		});

		it("returns null when the latest permission event is denied", () => {
			const { coordinator, events } = createCoordinator();
			events.set("run-1", [
				buildPermissionEvent({ status: "paused", permissionId: "perm-1" }),
				buildPermissionEvent({ status: "denied", permissionId: "perm-1" }),
			]);

			expect(coordinator.getAwaitingPermissionId("run-1")).toBeNull();
		});

		it("returns null when a permission payload is null", () => {
			const { coordinator, events } = createCoordinator();
			events.set("run-1", [buildPermissionEvent(null)]);

			expect(coordinator.getAwaitingPermissionId("run-1")).toBeNull();
		});

		it("returns null when a permission payload has no status", () => {
			const { coordinator, events } = createCoordinator();
			events.set("run-1", [buildPermissionEvent({ permissionId: "perm-1" })]);

			expect(coordinator.getAwaitingPermissionId("run-1")).toBeNull();
		});

		it("returns null when a paused permission payload has a non-string permission id", () => {
			const { coordinator, events } = createCoordinator();
			events.set("run-1", [
				buildPermissionEvent({ status: "paused", permissionId: 123 }),
			]);

			expect(coordinator.getAwaitingPermissionId("run-1")).toBeNull();
		});

		it("returns null when no permission events exist", () => {
			const { coordinator, events } = createCoordinator();
			events.set("run-1", [buildQuestionEvent()]);

			expect(coordinator.getAwaitingPermissionId("run-1")).toBeNull();
		});
	});

	describe("getAwaitingQuestionId", () => {
		it("returns the latest paused question id when scanning events backwards", () => {
			const { coordinator, events } = createCoordinator();
			events.set("run-1", [
				buildQuestionEvent({ status: "paused", questionId: "q-1" }),
				buildRunEvent({ eventType: "status", payload: { status: "running" } }),
				buildQuestionEvent({ status: "paused", questionId: "q-2" }),
			]);

			expect(coordinator.getAwaitingQuestionId("run-1")).toBe("q-2");
		});

		it("returns null when the latest question event is answered", () => {
			const { coordinator, events } = createCoordinator();
			events.set("run-1", [
				buildQuestionEvent({ status: "paused", questionId: "q-1" }),
				buildQuestionEvent({ status: "answered", questionId: "q-1" }),
			]);

			expect(coordinator.getAwaitingQuestionId("run-1")).toBeNull();
		});

		it("returns null when the latest question event is rejected", () => {
			const { coordinator, events } = createCoordinator();
			events.set("run-1", [
				buildQuestionEvent({ status: "paused", questionId: "q-1" }),
				buildQuestionEvent({ status: "rejected", questionId: "q-1" }),
			]);

			expect(coordinator.getAwaitingQuestionId("run-1")).toBeNull();
		});

		it("returns null when a question payload is null", () => {
			const { coordinator, events } = createCoordinator();
			events.set("run-1", [buildQuestionEvent(null)]);

			expect(coordinator.getAwaitingQuestionId("run-1")).toBeNull();
		});

		it("returns null when a question payload has no status", () => {
			const { coordinator, events } = createCoordinator();
			events.set("run-1", [buildQuestionEvent({ questionId: "q-1" })]);

			expect(coordinator.getAwaitingQuestionId("run-1")).toBeNull();
		});

		it("returns null when a paused question payload has a non-string question id", () => {
			const { coordinator, events } = createCoordinator();
			events.set("run-1", [
				buildQuestionEvent({ status: "paused", questionId: 123 }),
			]);

			expect(coordinator.getAwaitingQuestionId("run-1")).toBeNull();
		});

		it("returns null when no question events exist", () => {
			const { coordinator, events } = createCoordinator();
			events.set("run-1", [buildPermissionEvent()]);

			expect(coordinator.getAwaitingQuestionId("run-1")).toBeNull();
		});
	});

	describe("reconcilePausedRun", () => {
		it("does not resume when an awaiting permission is still pending", async () => {
			const { coordinator, deps, runs, events } = createCoordinator();
			const run = buildRun({ status: "paused" });
			runs.set(run.id, run);
			events.set(run.id, [
				buildPermissionEvent({ status: "paused", permissionId: "perm-1" }),
			]);
			deps.listPendingPermissions.mockResolvedValue([
				buildPermission({ id: "perm-1", sessionId: run.sessionId }),
			]);

			await coordinator.reconcilePausedRun(run.id, run.sessionId);

			expect(deps.listPendingPermissions).toHaveBeenCalledWith(run.sessionId);
			expect(deps.listPendingQuestions).not.toHaveBeenCalled();
			expect(deps.updateRun).not.toHaveBeenCalled();
		});

		it("resumes the permission flow when the awaiting permission is no longer pending", async () => {
			const { coordinator, deps, runs, events } = createCoordinator();
			const run = buildRun({ status: "paused" });
			runs.set(run.id, run);
			events.set(run.id, [
				buildPermissionEvent({ status: "paused", permissionId: "perm-1" }),
			]);
			deps.listPendingPermissions.mockResolvedValue([
				buildPermission({ id: "perm-2", sessionId: run.sessionId }),
			]);

			await coordinator.reconcilePausedRun(run.id, run.sessionId);

			expect(deps.updateRun).toHaveBeenCalledWith(run.id, {
				status: "running",
			});
			expect(deps.createRunEvent).toHaveBeenCalledWith(run.id, "permission", {
				status: "approved",
				permissionId: "perm-1",
				response: "approved",
				message: "Permission approved: perm-1",
			});
		});

		it("does not resume when an awaiting question is still pending", async () => {
			const { coordinator, deps, runs, events } = createCoordinator();
			const run = buildRun({ status: "paused" });
			runs.set(run.id, run);
			events.set(run.id, [
				buildQuestionEvent({ status: "paused", questionId: "q-1" }),
			]);
			deps.listPendingQuestions.mockResolvedValue([
				buildQuestion({ id: "q-1", sessionId: run.sessionId }),
			]);

			await coordinator.reconcilePausedRun(run.id, run.sessionId);

			expect(deps.listPendingQuestions).toHaveBeenCalledWith(run.sessionId);
			expect(deps.listPendingPermissions).not.toHaveBeenCalled();
			expect(deps.updateRun).not.toHaveBeenCalled();
		});

		it("resumes the question flow when the awaiting question is no longer pending", async () => {
			const { coordinator, deps, runs, events } = createCoordinator();
			const run = buildRun({ status: "paused" });
			runs.set(run.id, run);
			events.set(run.id, [
				buildQuestionEvent({ status: "paused", questionId: "q-1" }),
			]);
			deps.listPendingQuestions.mockResolvedValue([
				buildQuestion({ id: "q-2", sessionId: run.sessionId }),
			]);

			await coordinator.reconcilePausedRun(run.id, run.sessionId);

			expect(deps.updateRun).toHaveBeenCalledWith(run.id, {
				status: "running",
			});
			expect(deps.createRunEvent).toHaveBeenCalledWith(run.id, "question", {
				status: "answered",
				questionId: "q-1",
				response: "answered",
				message: "Question answered",
			});
		});

		it("resumes an orphaned paused run when nothing is awaiting and nothing is pending", async () => {
			const { coordinator, deps, runs } = createCoordinator();
			const run = buildRun({ status: "paused" });
			runs.set(run.id, run);

			await coordinator.reconcilePausedRun(run.id, run.sessionId);

			expect(deps.listPendingPermissions).toHaveBeenCalledWith(run.sessionId);
			expect(deps.listPendingQuestions).toHaveBeenCalledWith(run.sessionId);
			expect(deps.updateRun).toHaveBeenCalledWith(run.id, {
				status: "running",
			});
			expect(deps.createRunEvent).toHaveBeenCalledWith(run.id, "status", {
				status: "running",
				message: "Auto-resumed: no pending user interaction",
			});
		});

		it("does not resume when no awaiting ids exist but an orphan pending permission remains", async () => {
			const { coordinator, deps, runs } = createCoordinator();
			const run = buildRun({ status: "paused" });
			runs.set(run.id, run);
			deps.listPendingPermissions.mockResolvedValue([
				buildPermission({ sessionId: run.sessionId }),
			]);

			await coordinator.reconcilePausedRun(run.id, run.sessionId);

			expect(deps.listPendingPermissions).toHaveBeenCalledWith(run.sessionId);
			expect(deps.listPendingQuestions).toHaveBeenCalledWith(run.sessionId);
			expect(deps.updateRun).not.toHaveBeenCalled();
		});

		it("does not resume when no awaiting ids exist but an orphan pending question remains", async () => {
			const { coordinator, deps, runs } = createCoordinator();
			const run = buildRun({ status: "paused" });
			runs.set(run.id, run);
			deps.listPendingQuestions.mockResolvedValue([
				buildQuestion({ sessionId: run.sessionId }),
			]);

			await coordinator.reconcilePausedRun(run.id, run.sessionId);

			expect(deps.listPendingPermissions).toHaveBeenCalledWith(run.sessionId);
			expect(deps.listPendingQuestions).toHaveBeenCalledWith(run.sessionId);
			expect(deps.updateRun).not.toHaveBeenCalled();
		});
	});

	describe("ensureRunPausedForPermission", () => {
		it("returns the existing run when it is already paused", () => {
			const { coordinator, deps } = createCoordinator();
			const run = buildRun({ status: "paused" });

			const result = coordinator.ensureRunPausedForPermission(
				run,
				buildPermission(),
			);

			expect(result).toBe(run);
			expect(deps.updateRun).not.toHaveBeenCalled();
			expect(deps.createRunEvent).not.toHaveBeenCalled();
			expect(deps.applyTaskTransition).not.toHaveBeenCalled();
			expect(mockPublishRunUpdate).not.toHaveBeenCalled();
			expect(mockPublishSseEvent).not.toHaveBeenCalled();
		});

		it("pauses the run for a permission request and publishes the permission state", () => {
			const { coordinator, deps, runs } = createCoordinator();
			const run = buildRun({ status: "running" });
			const permission = buildPermission();
			runs.set(run.id, run);

			const result = coordinator.ensureRunPausedForPermission(run, permission);

			expect(result).toEqual(
				expect.objectContaining({ id: run.id, status: "paused" }),
			);
			expect(deps.updateRun).toHaveBeenCalledWith(run.id, { status: "paused" });
			expect(deps.createRunEvent).toHaveBeenCalledWith(run.id, "permission", {
				status: "paused",
				permissionId: permission.id,
				permissionType: permission.permissionType,
				pattern: permission.pattern,
				title: permission.title,
				sessionId: permission.sessionId,
				messageId: permission.messageId,
				message: `Permission requested: ${permission.title}`,
			});
			expect(mockPublishSseEvent).toHaveBeenCalledWith("run:permission", {
				runId: run.id,
				taskId: run.taskId,
				permissionId: permission.id,
				permissionType: permission.permissionType,
				pattern: permission.pattern,
				title: permission.title,
				sessionId: permission.sessionId,
				messageId: permission.messageId,
				createdAt: permission.createdAt,
			});
			expect(mockPublishRunUpdate).toHaveBeenCalledWith(
				expect.objectContaining({ id: run.id, status: "paused" }),
			);
			expect(deps.applyTaskTransition).toHaveBeenCalledWith(
				expect.objectContaining({ id: run.id, status: "paused" }),
				"run:question",
				`Permission requested: ${permission.title}`,
			);
		});
	});

	describe("ensureRunPausedForQuestion", () => {
		it("returns the existing run when it is already paused", () => {
			const { coordinator, deps } = createCoordinator();
			const run = buildRun({ status: "paused" });

			const result = coordinator.ensureRunPausedForQuestion(
				run,
				buildQuestion(),
			);

			expect(result).toBe(run);
			expect(deps.updateRun).not.toHaveBeenCalled();
			expect(deps.createRunEvent).not.toHaveBeenCalled();
			expect(deps.applyTaskTransition).not.toHaveBeenCalled();
			expect(mockPublishRunUpdate).not.toHaveBeenCalled();
			expect(mockPublishSseEvent).not.toHaveBeenCalled();
		});

		it("pauses the run for a question and publishes the question state", () => {
			const { coordinator, deps, runs } = createCoordinator();
			const run = buildRun({ status: "running" });
			const question = buildQuestion();
			runs.set(run.id, run);

			const result = coordinator.ensureRunPausedForQuestion(run, question);

			expect(result).toEqual(
				expect.objectContaining({ id: run.id, status: "paused" }),
			);
			expect(deps.updateRun).toHaveBeenCalledWith(run.id, { status: "paused" });
			expect(deps.createRunEvent).toHaveBeenCalledWith(run.id, "question", {
				status: "paused",
				questionId: question.id,
				questions: question.questions.map((item) => item.question),
				sessionId: question.sessionId,
				message: "Question asked",
			});
			expect(mockPublishSseEvent).toHaveBeenCalledWith("run:question", {
				runId: run.id,
				taskId: run.taskId,
				questionId: question.id,
				questions: question.questions,
				sessionId: question.sessionId,
				createdAt: question.createdAt,
			});
			expect(mockPublishRunUpdate).toHaveBeenCalledWith(
				expect.objectContaining({ id: run.id, status: "paused" }),
			);
			expect(deps.applyTaskTransition).toHaveBeenCalledWith(
				expect.objectContaining({ id: run.id, status: "paused" }),
				"run:question",
				"Question asked",
			);
		});
	});

	describe("attachReconciledSession", () => {
		it("delegates to setActiveRunSession", () => {
			const { coordinator, deps } = createCoordinator();

			coordinator.attachReconciledSession("run-1", "session-9");

			expect(deps.setActiveRunSession).toHaveBeenCalledWith(
				"run-1",
				"session-9",
			);
		});
	});
});
