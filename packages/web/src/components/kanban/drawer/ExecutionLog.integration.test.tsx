import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExecutionLog } from "./ExecutionLog";

type Listener = EventListenerOrEventListenerObject;

class MockEventSource {
	static instances: MockEventSource[] = [];

	readonly url: string;
	private listeners = new Map<string, Set<Listener>>();
	isClosed = false;

	constructor(url: string) {
		this.url = url;
		MockEventSource.instances.push(this);
	}

	addEventListener(type: string, listener: Listener): void {
		const listenersForType = this.listeners.get(type) ?? new Set<Listener>();
		listenersForType.add(listener);
		this.listeners.set(type, listenersForType);
	}

	removeEventListener(type: string, listener: Listener): void {
		this.listeners.get(type)?.delete(listener);
	}

	close(): void {
		this.isClosed = true;
	}

	emit(type: string, payload: unknown): void {
		const event = new MessageEvent(type, { data: JSON.stringify(payload) });
		const listenersForType = this.listeners.get(type);

		if (!listenersForType) {
			return;
		}

		for (const listener of listenersForType) {
			if (typeof listener === "function") {
				listener(event);
			} else {
				listener.handleEvent(event);
			}
		}
	}
}

describe("ExecutionLog SSE integration", () => {
	const originalEventSource = globalThis.EventSource;

	const getRunMock = vi.fn();
	const getSessionMessagesMock = vi.fn();
	const sendMessageMock = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();

		MockEventSource.instances = [];

		Object.defineProperty(globalThis, "EventSource", {
			value: MockEventSource,
			configurable: true,
			writable: true,
		});

		Object.defineProperty(window, "api", {
			value: {
				run: {
					get: getRunMock,
				},
				opencode: {
					getSessionMessages: getSessionMessagesMock,
					sendMessage: sendMessageMock,
				},
			},
			configurable: true,
			writable: true,
		});

		localStorage.setItem("token", "test-token");
	});

	afterEach(() => {
		Object.defineProperty(globalThis, "EventSource", {
			value: originalEventSource,
			configurable: true,
			writable: true,
		});

		localStorage.clear();
	});

	it("only applies matching SSE session events and ignores other sessions", async () => {
		getSessionMessagesMock.mockResolvedValue({ messages: [] });

		render(<ExecutionLog runId="run-1" sessionId="session-1" />);

		await waitFor(() => {
			expect(getRunMock).not.toHaveBeenCalled();
			expect(getSessionMessagesMock).toHaveBeenCalledWith({
				sessionId: "session-1",
				limit: 200,
			});
			expect(MockEventSource.instances).toHaveLength(1);
		});

		const stream = MockEventSource.instances[0];
		expect(stream.url).toBe("http://localhost:3000/events?token=test-token");

		await waitFor(() => {
			expect(screen.getByText("No events captured yet")).toBeInTheDocument();
		});

		act(() => {
			stream.emit("opencode:event", {
				sessionId: "other-session",
				event: {
					type: "message.updated",
					message: {
						id: "msg-other",
						role: "assistant",
						modelID: "test-model",
						parts: [{ id: "part-1", type: "text", text: "Should be ignored" }],
						content: "Should be ignored",
					},
				},
			});
		});

		expect(screen.getByText("No events captured yet")).toBeInTheDocument();
		expect(screen.queryByText("Should be ignored")).not.toBeInTheDocument();

		act(() => {
			stream.emit("opencode:event", {
				sessionId: "session-1",
				event: {
					type: "message.updated",
					message: {
						id: "msg-match",
						role: "assistant",
						modelID: "test-model",
						parts: [{ id: "part-2", type: "text", text: "Visible event" }],
						content: "Visible event",
					},
				},
			});
		});

		expect(await screen.findByText("Visible event")).toBeInTheDocument();
		expect(
			screen.queryByText("No events captured yet"),
		).not.toBeInTheDocument();
	});

	it("keeps unknown-only part updates and shows placeholder until text arrives", async () => {
		getSessionMessagesMock.mockResolvedValue({ messages: [] });

		render(<ExecutionLog runId="run-1" sessionId="session-1" />);

		await waitFor(() => {
			expect(MockEventSource.instances).toHaveLength(1);
		});

		const stream = MockEventSource.instances[0];

		await waitFor(() => {
			expect(screen.getByText("No events captured yet")).toBeInTheDocument();
		});

		act(() => {
			stream.emit("opencode:event", {
				event: {
					type: "message.part.updated",
					messageID: "msg-unknown",
					part: {
						id: "part-unknown",
						type: "status",
						status: "starting",
						sessionID: "session-1",
					},
				},
			});
		});

		expect(await screen.findByText("Thinking...")).toBeInTheDocument();
		expect(screen.getByText("Assistant")).toBeInTheDocument();
		expect(
			screen.queryByText("No events captured yet"),
		).not.toBeInTheDocument();

		act(() => {
			stream.emit("opencode:event", {
				event: {
					type: "message.part.updated",
					messageID: "msg-unknown",
					part: {
						id: "part-text",
						type: "text",
						text: "Now visible",
						sessionID: "session-1",
					},
				},
			});
		});

		expect(await screen.findByText("Now visible")).toBeInTheDocument();
	});

	it("applies legacy message payloads without envelope sessionId", async () => {
		getSessionMessagesMock.mockResolvedValue({ messages: [] });

		render(<ExecutionLog runId="run-1" sessionId="session-1" />);

		await waitFor(() => {
			expect(MockEventSource.instances).toHaveLength(1);
		});

		const stream = MockEventSource.instances[0];

		act(() => {
			stream.emit("opencode:event", {
				event: {
					type: "message.updated",
					message: {
						messageID: "msg-legacy",
						sessionID: "session-1",
						role: "assistant",
						modelId: "legacy-model",
						parts: [
							{ id: "part-legacy", type: "text", text: "Legacy payload" },
						],
						content: "Legacy payload",
					},
				},
			});
		});

		expect(await screen.findByText("Legacy payload")).toBeInTheDocument();
		expect(screen.getByText("legacy-model")).toBeInTheDocument();
	});

	it("shows assistant placeholder when message arrives without renderable parts", async () => {
		getSessionMessagesMock.mockResolvedValue({ messages: [] });

		render(<ExecutionLog runId="run-1" sessionId="session-1" />);

		await waitFor(() => {
			expect(MockEventSource.instances).toHaveLength(1);
		});

		const stream = MockEventSource.instances[0];

		await waitFor(() => {
			expect(screen.getByText("No events captured yet")).toBeInTheDocument();
		});

		act(() => {
			stream.emit("opencode:event", {
				sessionId: "session-1",
				event: {
					type: "message.updated",
					message: {
						id: "msg-empty-assistant",
						role: "assistant",
						parts: [],
						content: "",
					},
				},
			});
		});

		expect(await screen.findByText("Thinking...")).toBeInTheDocument();
		expect(screen.getByText("Assistant")).toBeInTheDocument();
		expect(
			screen.queryByText("No events captured yet"),
		).not.toBeInTheDocument();
	});

	it("clears previous run messages when selected run changes", async () => {
		getSessionMessagesMock.mockResolvedValue({ messages: [] });

		const { rerender } = render(
			<ExecutionLog runId="run-1" sessionId="session-1" />,
		);

		await waitFor(() => {
			expect(MockEventSource.instances).toHaveLength(1);
		});

		const firstRunStream = MockEventSource.instances[0];

		act(() => {
			firstRunStream.emit("opencode:event", {
				sessionId: "session-1",
				event: {
					type: "message.updated",
					message: {
						id: "msg-first-run",
						role: "assistant",
						parts: [
							{ id: "part-first", type: "text", text: "First run output" },
						],
						content: "First run output",
					},
				},
			});
		});

		expect(await screen.findByText("First run output")).toBeInTheDocument();

		rerender(<ExecutionLog runId="run-2" sessionId="session-2" />);

		await waitFor(() => {
			expect(firstRunStream.isClosed).toBe(true);
			expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(2);
			expect(getSessionMessagesMock).toHaveBeenCalledWith({
				sessionId: "session-2",
				limit: 200,
			});
		});

		await waitFor(() => {
			expect(screen.queryByText("First run output")).not.toBeInTheDocument();
			expect(screen.getByText("No events captured yet")).toBeInTheDocument();
		});

		const secondRunStream =
			MockEventSource.instances[MockEventSource.instances.length - 1];
		act(() => {
			secondRunStream.emit("opencode:event", {
				sessionId: "session-2",
				event: {
					type: "message.updated",
					message: {
						id: "msg-second-run",
						role: "assistant",
						parts: [
							{ id: "part-second", type: "text", text: "Second run output" },
						],
						content: "Second run output",
					},
				},
			});
		});

		expect(await screen.findByText("Second run output")).toBeInTheDocument();
	});
});
