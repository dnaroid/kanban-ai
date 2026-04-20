import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OpenCodeMessage } from "@/types/ipc";
import { OpencodeSessionManager } from "@/server/opencode/session-manager";

type PrivateSessionManager = {
	getSessionClient(sessionId: string): Promise<{
		session: {
			messages(args: { sessionID: string; limit?: number }): Promise<unknown>;
		};
	}>;
	fetchSessionActivityStatus(sessionId: string): Promise<"idle">;
	fetchSessionInfo(sessionId: string): Promise<{
		id: string;
		directory: string;
	} | null>;
	storageReader: {
		getMessagesFromFilesystem(
			sessionId: string,
			limit?: number,
		): Promise<OpenCodeMessage[]>;
	};
};

vi.mock("@opencode-ai/sdk/v2/client", () => ({
	createOpencodeClient: vi.fn(() => ({})),
}));

vi.mock("@/server/opencode/opencode-service", () => ({
	getOpencodeService: vi.fn(() => ({
		getPort: () => 4096,
	})),
}));

function buildGeneratedMessage(): OpenCodeMessage {
	return {
		id: "msg-story",
		role: "assistant",
		content: [
			'<META>{"type":"feature"}</META>',
			"<STORY>",
			"## Title",
			"Recovered story content",
			"</STORY>",
		].join("\n"),
		parts: [],
		timestamp: Date.now(),
	};
}

describe("OpencodeSessionManager storage fallback", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("falls back to filesystem messages when session API returns none", async () => {
		const manager = new OpencodeSessionManager();
		const privateManager = manager as unknown as PrivateSessionManager;
		const storageMessages = [buildGeneratedMessage()];

		vi.spyOn(privateManager, "getSessionClient").mockResolvedValue({
			session: {
				messages: vi.fn(async () => []),
			},
		});
		vi.spyOn(
			privateManager.storageReader,
			"getMessagesFromFilesystem",
		).mockResolvedValue(storageMessages);

		await expect(manager.getMessages("session-1", 50)).resolves.toEqual(
			storageMessages,
		);
	});

	it("returns null completion marker since text markers are no longer parsed", async () => {
		const manager = new OpencodeSessionManager();
		const privateManager = manager as unknown as PrivateSessionManager;
		const storageMessages = [buildGeneratedMessage()];

		vi.spyOn(privateManager, "fetchSessionActivityStatus").mockResolvedValue(
			"idle",
		);
		vi.spyOn(privateManager, "fetchSessionInfo").mockResolvedValue({
			id: "session-1",
			directory: "/tmp/project",
		});
		vi.spyOn(privateManager, "getSessionClient").mockResolvedValue({
			session: {
				messages: vi.fn(async () => []),
			},
		});
		vi.spyOn(manager, "getTodos").mockResolvedValue([]);
		vi.spyOn(manager, "listPendingPermissions").mockResolvedValue([]);
		vi.spyOn(manager, "listPendingQuestions").mockResolvedValue([]);
		vi.spyOn(
			privateManager.storageReader,
			"getMessagesFromFilesystem",
		).mockResolvedValue(storageMessages);

		const inspection = await manager.inspectSession("session-1");

		expect(inspection.messages).toEqual(storageMessages);
		expect(inspection.completionMarker).toBeNull();
	});

	it("ignores stale completion marker after a newer user resume message", async () => {
		const manager = new OpencodeSessionManager();
		const privateManager = manager as unknown as PrivateSessionManager;
		const storageMessages: OpenCodeMessage[] = [
			buildGeneratedMessage(),
			{
				id: "msg-user-resume",
				role: "user",
				content: "Please continue and fix QA issues",
				parts: [],
				timestamp: Date.now() + 1,
			},
		];

		vi.spyOn(privateManager, "fetchSessionActivityStatus").mockResolvedValue(
			"idle",
		);
		vi.spyOn(privateManager, "fetchSessionInfo").mockResolvedValue({
			id: "session-1",
			directory: "/tmp/project",
		});
		vi.spyOn(privateManager, "getSessionClient").mockResolvedValue({
			session: {
				messages: vi.fn(async () => []),
			},
		});
		vi.spyOn(manager, "getTodos").mockResolvedValue([]);
		vi.spyOn(manager, "listPendingPermissions").mockResolvedValue([]);
		vi.spyOn(manager, "listPendingQuestions").mockResolvedValue([]);
		vi.spyOn(
			privateManager.storageReader,
			"getMessagesFromFilesystem",
		).mockResolvedValue(storageMessages);

		const inspection = await manager.inspectSession("session-1");

		expect(inspection.completionMarker).toBeNull();
	});
});
