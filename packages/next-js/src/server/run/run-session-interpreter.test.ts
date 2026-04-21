import { describe, expect, it } from "vitest";

import {
	deriveMetaStatus,
	toRunLastExecutionStatus,
} from "@/server/run/run-session-interpreter";

describe("run-session-interpreter", () => {
	it("derives completed status from idle session with assistant message", () => {
		const meta = deriveMetaStatus({
			probeStatus: "alive",
			sessionStatus: "idle",
			messages: [
				{
					id: "m1",
					role: "assistant",
					content: "Final answer",
					parts: [],
					timestamp: Date.now(),
				},
			],
			todos: [],
			pendingPermissions: [],
			pendingQuestions: [],
		});

		expect(meta).toMatchObject({ kind: "completed" });
	});

	it("derives completed status from unknown session status with probe alive and assistant message", () => {
		const meta = deriveMetaStatus({
			probeStatus: "alive",
			sessionStatus: "unknown",
			messages: [
				{
					id: "m1",
					role: "assistant",
					content: "Final answer",
					parts: [],
					timestamp: Date.now(),
				},
			],
			todos: [],
			pendingPermissions: [],
			pendingQuestions: [],
		});

		expect(meta).toMatchObject({ kind: "completed" });
	});

	it("maps meta status to run last execution status", () => {
		const status = toRunLastExecutionStatus(
			{ kind: "completed", content: "ok" },
			"session-1",
		);

		expect(status).toMatchObject({
			kind: "completed",
			content: "ok",
			sessionId: "session-1",
		});
	});
});
