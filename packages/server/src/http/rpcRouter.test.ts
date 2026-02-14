import { beforeEach, describe, expect, it, vi } from "vitest";

const subscribeToSessionEventsMock = vi.fn();
const unsubscribeFromSessionEventsMock = vi.fn();
const sendPromptMock = vi.fn();
const getSessionMessagesMock = vi.fn();

vi.mock("../run/opencode-session-manager", () => ({
	sessionManager: {
		subscribeToSessionEvents: subscribeToSessionEventsMock,
		unsubscribeFromSessionEvents: unsubscribeFromSessionEventsMock,
		sendPrompt: sendPromptMock,
		getSessions: vi.fn(),
		getSession: vi.fn(),
		createSession: vi.fn(),
		addTodo: vi.fn(),
		toggleTodo: vi.fn(),
		deleteTodo: vi.fn(),
	},
}));

vi.mock("../run/opencode-session-worker.js", () => ({
	opencodeSessionWorker: {
		getSessionMessages: getSessionMessagesMock,
	},
}));

const loadRpcHandlers = async () => {
	vi.resetModules();
	const { createRpcRouter } = await import("./rpcRouter");
	return createRpcRouter({} as never);
};

describe("createRpcRouter - web SSE bridge", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	it("subscribes once for repeated sendMessage calls on same session", async () => {
		subscribeToSessionEventsMock.mockResolvedValue(undefined);
		sendPromptMock.mockResolvedValue(undefined);

		const handlers = await loadRpcHandlers();
		const sendMessage = handlers.get("opencode:sendMessage");

		expect(sendMessage).toBeDefined();

		await sendMessage!({ sessionId: "session-1", message: "hello" });
		await sendMessage!({ sessionId: "session-1", message: "again" });

		expect(subscribeToSessionEventsMock).toHaveBeenCalledTimes(1);
		expect(subscribeToSessionEventsMock).toHaveBeenCalledWith(
			"session-1",
			"web-sse-bridge:session-1",
			expect.any(Function),
		);
		expect(sendPromptMock).toHaveBeenCalledTimes(2);
		expect(sendPromptMock).toHaveBeenNthCalledWith(1, "session-1", "hello");
		expect(sendPromptMock).toHaveBeenNthCalledWith(2, "session-1", "again");
	});

	it("continues getSessionMessages when bridge subscribe fails", async () => {
		subscribeToSessionEventsMock.mockRejectedValue(new Error("bridge failed"));
		getSessionMessagesMock.mockResolvedValue([
			{ id: "m-1", role: "assistant" },
		]);

		const handlers = await loadRpcHandlers();
		const getSessionMessages = handlers.get("opencode:getSessionMessages");

		expect(getSessionMessages).toBeDefined();

		const result = await getSessionMessages!({
			sessionId: "session-2",
			limit: 25,
		});

		expect(subscribeToSessionEventsMock).toHaveBeenCalledTimes(1);
		expect(subscribeToSessionEventsMock).toHaveBeenCalledWith(
			"session-2",
			"web-sse-bridge:session-2",
			expect.any(Function),
		);
		expect(getSessionMessagesMock).toHaveBeenCalledTimes(1);
		expect(getSessionMessagesMock).toHaveBeenCalledWith("session-2", 25);
		expect(result).toEqual({
			sessionId: "session-2",
			messages: [{ id: "m-1", role: "assistant" }],
		});
	});

	it("fails sendMessage when bridge subscribe fails", async () => {
		subscribeToSessionEventsMock.mockRejectedValue(new Error("bridge failed"));

		const handlers = await loadRpcHandlers();
		const sendMessage = handlers.get("opencode:sendMessage");

		expect(sendMessage).toBeDefined();

		await expect(
			sendMessage!({ sessionId: "session-3", message: "will-fail" }),
		).rejects.toThrow("bridge failed");

		expect(sendPromptMock).not.toHaveBeenCalled();
	});
});
