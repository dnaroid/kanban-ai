import { describe, expect, it } from "vitest";

import {
	deriveMetaStatus,
	stripOpencodeStatusLine,
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
			completionMarker: null,
		});

		expect(meta).toMatchObject({ kind: "completed", marker: "done" });
	});

	it("maps meta status to run last execution status", () => {
		const status = toRunLastExecutionStatus(
			{ kind: "failed", marker: "fail", content: "boom" },
			"session-1",
		);

		expect(status).toMatchObject({
			kind: "failed",
			marker: "fail",
			content: "boom",
			sessionId: "session-1",
		});
	});

	it("strips legacy __OPENCODE_STATUS__ lines from content", () => {
		const content = stripOpencodeStatusLine(
			"All done\n__OPENCODE_STATUS__::7f2b3b52-2a7f-4f2a-8d2e-9b6c8b0f2e7a::done",
		);
		expect(content).toBe("All done");
	});
});
