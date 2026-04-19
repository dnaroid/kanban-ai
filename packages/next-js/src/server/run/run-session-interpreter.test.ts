import { describe, expect, it } from "vitest";
import { buildOpencodeStatusLine } from "@/lib/opencode-status";

import {
	deriveMetaStatus,
	stripOpencodeStatusLine,
	toRunLastExecutionStatus,
} from "@/server/run/run-session-interpreter";

describe("run-session-interpreter", () => {
	it("derives completed status from completion marker", () => {
		const meta = deriveMetaStatus({
			probeStatus: "alive",
			sessionStatus: "busy",
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
			completionMarker: {
				runStatus: "completed",
				signalKey: "done",
				messageId: "m1",
				messageContent: "Final answer",
			},
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

	it("strips OpenCode status line from content", () => {
		const content = stripOpencodeStatusLine(
			`All done\n${buildOpencodeStatusLine("done")}`,
		);
		expect(content).toBe("All done");
	});
});
