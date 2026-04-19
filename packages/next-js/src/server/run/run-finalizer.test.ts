import { describe, expect, it, vi } from "vitest";

import {
	canRecoverLateCompletion,
	resolveTriggerFromOutcome,
	staleRunFallbackMarker,
} from "@/server/run/run-finalizer";
import type { Run } from "@/types/ipc";

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
