import { describe, expect, it, vi } from "vitest";

import { RunInteractionCoordinator } from "@/server/run/run-interaction-coordinator";
import type { Run } from "@/types/ipc";

function createCoordinator() {
	const runs = new Map<string, Run>();
	const events = new Map<
		string,
		Array<{ eventType: string; payload: unknown }>
	>();

	const coordinator = new RunInteractionCoordinator({
		getRunById: (runId) => runs.get(runId) ?? null,
		updateRun: (runId, patch) => {
			const current = runs.get(runId);
			if (!current) {
				throw new Error(`Run not found: ${runId}`);
			}
			const next = { ...current, ...patch } as Run;
			runs.set(runId, next);
			return next;
		},
		createRunEvent: (runId, eventType, payload) => {
			const current = events.get(runId) ?? [];
			current.push({ eventType, payload });
			events.set(runId, current);
		},
		listRunEvents: (runId) => events.get(runId) ?? [],
		applyTaskTransition: vi.fn(),
		listPendingPermissions: vi.fn(async () => []),
		listPendingQuestions: vi.fn(async () => []),
		setActiveRunSession: vi.fn(),
	});

	return { coordinator, runs, events };
}

describe("run-interaction-coordinator", () => {
	it("extracts awaiting permission id from latest paused permission event", () => {
		const { coordinator, events } = createCoordinator();
		events.set("run-1", [
			{
				eventType: "permission",
				payload: { status: "paused", permissionId: "p-1" },
			},
		]);

		expect(coordinator.getAwaitingPermissionId("run-1")).toBe("p-1");
	});

	it("resumes paused run after answered question is no longer pending", async () => {
		const { coordinator, runs, events } = createCoordinator();
		runs.set("run-1", {
			id: "run-1",
			taskId: "task-1",
			roleId: "dev",
			sessionId: "session-1",
			mode: "execute",
			status: "paused",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			startedAt: null,
			endedAt: null,
			metadata: {},
		});
		events.set("run-1", [
			{
				eventType: "question",
				payload: { status: "paused", questionId: "q-1" },
			},
		]);

		await coordinator.reconcilePausedRun("run-1", "session-1");

		expect(runs.get("run-1")?.status).toBe("running");
	});
});
