import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Bot,
	ChevronsDown,
	ChevronsUp,
	RefreshCw,
	Send,
	Terminal,
	User,
} from "lucide-react";
import {
	AgentPart,
	ConfirmationPart,
	FilePart,
	ReasoningPart,
	SubtaskPartView,
	SystemNotificationPart,
	TextPart,
	ToolPart,
} from "@/components/chat/MessageParts";
import { QuestionInteraction } from "@/components/chat/QuestionInteraction";
import { TodoWriteToolView } from "@/components/chat/TodoWriteToolView";
import { cn } from "@/lib/utils";
import type {
	MessageTokens,
	OpenCodeMessage,
	Part,
	PermissionData,
	QuestionData,
	RunEvent,
} from "@/types/ipc";
import { LightMarkdown } from "@/components/LightMarkdown";
import { api } from "@/lib/api";

const getPartId = (part: Part): string | undefined => {
	const maybeId = (part as { id?: unknown }).id;
	return typeof maybeId === "string" ? maybeId : undefined;
};

const mergeUpdatedPart = (existing: Part, incoming: Part): Part => {
	if (existing.type !== incoming.type) {
		return incoming;
	}

	if (existing.type === "tool" && incoming.type === "tool") {
		return {
			...existing,
			...incoming,
			input: incoming.input !== undefined ? incoming.input : existing.input,
			output: incoming.output !== undefined ? incoming.output : existing.output,
		};
	}

	return { ...existing, ...incoming };
};

const isRenderablePart = (part: Part): boolean => {
	switch (part.type) {
		case "reasoning":
		case "tool":
		case "file":
		case "agent":
		case "subtask":
			return true;
		case "text":
			return ("ignored" in part && part.ignored) || part.text.trim().length > 0;
		default:
			return false;
	}
};

const getSessionIdFromValue = (value: unknown): string | undefined => {
	if (!value || typeof value !== "object") return undefined;
	const raw = (value as { sessionId?: unknown; sessionID?: unknown }).sessionId;
	if (typeof raw === "string" && raw.length > 0) {
		return raw;
	}
	const legacyRaw = (value as { sessionID?: unknown }).sessionID;
	if (typeof legacyRaw === "string" && legacyRaw.length > 0) {
		return legacyRaw;
	}
	return undefined;
};

const getEventSessionId = (event: unknown): string | undefined => {
	if (!event || typeof event !== "object") return undefined;
	const typedEvent = event as {
		type?: unknown;
		message?: unknown;
		part?: unknown;
	};

	const directSessionId = getSessionIdFromValue(typedEvent);
	if (directSessionId) {
		return directSessionId;
	}

	const eventType = typeof typedEvent.type === "string" ? typedEvent.type : "";
	if (eventType === "message.updated") {
		return getSessionIdFromValue(typedEvent.message);
	}
	if (eventType === "message.part.updated") {
		return getSessionIdFromValue(typedEvent.part);
	}
	return undefined;
};

const getEventMessageId = (event: unknown): string | undefined => {
	if (!event || typeof event !== "object") return undefined;
	const typedEvent = event as {
		messageId?: unknown;
		messageID?: unknown;
		part?: unknown;
	};

	if (
		typeof typedEvent.messageId === "string" &&
		typedEvent.messageId.length > 0
	) {
		return typedEvent.messageId;
	}
	if (
		typeof typedEvent.messageID === "string" &&
		typedEvent.messageID.length > 0
	) {
		return typedEvent.messageID;
	}

	if (typedEvent.part && typeof typedEvent.part === "object") {
		const partMessageId = (typedEvent.part as { messageID?: unknown })
			.messageID;
		if (typeof partMessageId === "string" && partMessageId.length > 0) {
			return partMessageId;
		}
	}

	return undefined;
};

const parseModelIdentifier = (
	modelID: string | undefined,
): { provider?: string; model?: string } => {
	if (!modelID) {
		return {};
	}

	const normalized = modelID.trim();
	if (normalized.length === 0) {
		return {};
	}

	const segments = normalized
		.split("/")
		.filter((segment) => segment.length > 0);
	if (segments.length === 0) {
		return {};
	}

	if (segments.length === 1) {
		return { model: segments[0] };
	}

	return {
		provider: segments[0],
		model: segments.slice(1).join("/"),
	};
};

const formatAssistantLabel = ({
	modelID,
	parts,
	showFallback,
}: {
	modelID: string | undefined;
	parts: Part[];
	showFallback: boolean;
}): string => {
	if (showFallback) {
		return "Assistant";
	}

	const { provider, model } = parseModelIdentifier(modelID);
	if (!provider && !model) {
		return "Assistant";
	}

	const hasReasoning = parts.some((part) => part.type === "reasoning");
	const baseLabel = provider
		? `${provider.toUpperCase()} / ${(model ?? "").toUpperCase()}`
		: (model ?? "").toUpperCase();

	return hasReasoning ? `${baseLabel} 🧠` : baseLabel;
};

export function ExecutionLog({
	runId,
	sessionId,
	runStatus,
	onContextStats,
	showReasoning,
	onNavigateToSubAgent,
	isSubAgent = false,
	hideFirstUserMessage = true,
}: {
	runId: string;
	sessionId: string;
	runStatus?:
		| "queued"
		| "running"
		| "completed"
		| "failed"
		| "cancelled"
		| "timeout"
		| "paused"
		| null;
	onContextStats?: (stats: {
		tokens: number;
		percent: number | null;
		modelID: string | null;
	}) => void;
	showReasoning?: boolean;
	onNavigateToSubAgent?: (sessionId: string) => void;
	isSubAgent?: boolean;
	hideFirstUserMessage?: boolean;
}) {
	const [events, setEvents] = useState<RunEvent[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [autoScroll, setAutoScroll] = useState(true);
	const [scrolledFromTop, setScrolledFromTop] = useState(false);
	const [streamingMessageIds, setStreamingMessageIds] = useState<Set<string>>(
		new Set(),
	);
	const [effectiveSessionId, setEffectiveSessionId] = useState(sessionId);
	const [inputMessage, setInputMessage] = useState("");
	const [isSending, setIsSending] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);
	const seenMessageIdsRef = useRef<Set<string>>(new Set());
	const refreshMessagesRef = useRef<(() => Promise<void>) | null>(null);
	const streamingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
	const hiddenUserMessageIdRef = useRef<string | null>(null);
	const [pendingPermissions, setPendingPermissions] = useState<
		Map<string, PermissionData>
	>(new Map());
	const [pendingQuestions, setPendingQuestions] = useState<
		Map<string, QuestionData>
	>(new Map());
	const [dismissedSyntheticQuestion, setDismissedSyntheticQuestion] =
		useState(false);

	const coerceText = (value: unknown): string => {
		if (typeof value === "string") return value;
		if (typeof value === "number") return value.toString();
		if (value === null || value === undefined) return "";
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	};

	const handleNavigateToSubAgent = (childSessionId: string) => {
		onNavigateToSubAgent?.(childSessionId);
	};

	const extractStatusLineFromMessage = useCallback(
		(_message: { content?: string; parts?: Part[] }): string | null => {
			return null;
		},
		[],
	);

	const upsertStatusEvent = useCallback(
		(statusLine: string, ts: string = new Date().toISOString()) => {
			setEvents((prev) => {
				const id = "status-stream";
				const existingIndex = prev.findIndex((item) => item.id === id);
				const statusEvent: RunEvent = {
					id,
					runId,
					ts,
					eventType: "status",
					payload: { message: statusLine },
				};
				if (existingIndex === -1) {
					return [...prev, statusEvent].slice(-500);
				}

				const next = [...prev];
				next[existingIndex] = statusEvent;
				return next;
			});
		},
		[runId],
	);

	const handleScroll = () => {
		if (scrollRef.current) {
			const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
			const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;

			setAutoScroll(isAtBottom);
			setScrolledFromTop(scrollTop > 200);
		}
	};

	const handleJumpToEnd = () => {
		if (scrollRef.current) {
			scrollRef.current.scrollTo({
				top: scrollRef.current.scrollHeight,
				behavior: "smooth",
			});
		}
	};

	const handleJumpToTop = () => {
		if (scrollRef.current) {
			scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
		}
	};

	const handleSendMessage = async () => {
		const message = inputMessage.trim();
		if (!message || isSending || !effectiveSessionId) return;

		setIsSending(true);
		setInputMessage("");

		try {
			await api.opencode.sendMessage({
				sessionId: effectiveSessionId,
				message,
			});
			// Message received via event
		} catch {
			setInputMessage(message);
		} finally {
			setIsSending(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSendMessage();
		}
	};

	const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setInputMessage(e.target.value);
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
		}
	};

	const buildMessageEvent = useCallback(
		(
			messageId: string,
			message: {
				role?: string;
				content?: string;
				parts?: Part[];
				modelID?: string;
				tokens?: MessageTokens;
			},
			ts: string = new Date().toISOString(),
		): RunEvent => ({
			id: `msg-${messageId}`,
			runId: effectiveSessionId,
			ts,
			eventType: "message",
			payload: {
				role: message.role,
				content: message.content ?? "",
				parts: message.parts ?? [],
				modelID: message.modelID,
				tokens: message.tokens,
			},
		}),
		[effectiveSessionId],
	);

	const contextStats = useMemo(() => {
		for (let index = events.length - 1; index >= 0; index -= 1) {
			const event = events[index];
			if (event.eventType !== "message") {
				continue;
			}

			const payload = event.payload as {
				role?: string;
				tokens?: MessageTokens;
				modelID?: string;
			};
			if (payload.role !== "assistant" || !payload.tokens) {
				continue;
			}

			const totalTokens =
				payload.tokens.input +
				payload.tokens.output +
				payload.tokens.reasoning +
				payload.tokens.cache.read +
				payload.tokens.cache.write;

			if (totalTokens > 0) {
				return {
					tokens: totalTokens,
					percent: null,
					modelID: payload.modelID ?? null,
				};
			}
		}

		return { tokens: 0, percent: null, modelID: null };
	}, [events]);

	useEffect(() => {
		onContextStats?.(contextStats);
	}, [contextStats, onContextStats]);

	useEffect(() => {
		setEffectiveSessionId(sessionId);
	}, [sessionId]);

	useEffect(() => {
		if (!runId) return;
		setDismissedSyntheticQuestion(false);
		setEvents([]);
		setStreamingMessageIds(new Set());
		setIsLoading(true);
		setAutoScroll(true);
		setPendingPermissions(new Map());
		setPendingQuestions(new Map());
		seenMessageIdsRef.current.clear();
		hiddenUserMessageIdRef.current = null;
		for (const timeout of streamingTimeoutsRef.current.values()) {
			clearTimeout(timeout);
		}
		streamingTimeoutsRef.current.clear();
	}, [runId]);

	useEffect(() => {
		if (effectiveSessionId) return;
		let isActive = true;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const pollSessionId = async () => {
			try {
				const response = await api.run.get({ runId });
				if (!isActive) return;
				if (response.run?.sessionId) {
					setEffectiveSessionId(response.run.sessionId);
					return;
				}
			} catch {
				// retry via setTimeout
			}
			if (isActive) {
				timeoutId = setTimeout(pollSessionId, 1000);
			}
		};
		pollSessionId();
		return () => {
			isActive = false;
			if (timeoutId !== null) {
				clearTimeout(timeoutId);
			}
		};
	}, [effectiveSessionId, runId]);

	useEffect(() => {
		const upsertMessageEvent = (payload: {
			id?: string;
			role?: string;
			content?: string;
			parts?: Part[];
			modelID?: string;
			tokens?: MessageTokens;
		}) => {
			const payloadId = payload?.id;
			if (!payloadId) return;

			const statusLine = extractStatusLineFromMessage(payload);
			if (statusLine) {
				upsertStatusEvent(statusLine);
			}

			if (!isSubAgent) {
				if (payload.role === "user" && !hiddenUserMessageIdRef.current) {
					hiddenUserMessageIdRef.current = payloadId;
				}

				if (hiddenUserMessageIdRef.current === payloadId) {
					setEvents((prev) =>
						prev.filter((item) => item.id !== `msg-${payloadId}`),
					);
					return;
				}
			}
			const id = `msg-${payloadId}`;
			setEvents((prev) => {
				const existingIndex = prev.findIndex((item) => item.id === id);
				if (existingIndex === -1) {
					seenMessageIdsRef.current.add(id);
					const newEvent = buildMessageEvent(payloadId, payload);
					const next = [...prev, newEvent];
					return next.slice(-500);
				}
				const updated = [...prev];
				const existing = updated[existingIndex];
				const existingPayload = existing.payload as {
					parts?: Part[];
					role?: string;
					tokens?: MessageTokens;
				};

				const mergedPayload = {
					...payload,
					parts:
						payload.parts && payload.parts.length > 0
							? payload.parts
							: existingPayload.parts || [],
					role: payload.role || existingPayload.role || "assistant",
					tokens: payload.tokens ?? existingPayload.tokens,
				};

				const updatedEvent = buildMessageEvent(
					payloadId,
					mergedPayload,
					existing.ts,
				);
				updated[existingIndex] = updatedEvent;
				return updated;
			});
		};

		const updateMessagePart = (messageId: string, part: Part) => {
			const id = `msg-${messageId}`;
			const partId = getPartId(part);
			console.log("[ExecutionLog] updateMessagePart called:", {
				messageId,
				partId,
				partType: part.type,
			});

			// Mark message as streaming
			setStreamingMessageIds((prev) => new Set(prev).add(messageId));

			// Clear existing timeout for this message
			const existingTimeout = streamingTimeoutsRef.current.get(messageId);
			if (existingTimeout) {
				clearTimeout(existingTimeout);
			}

			// Set new timeout to mark message as not streaming after 2 seconds of inactivity
			const timeout = setTimeout(() => {
				setStreamingMessageIds((prev) => {
					const next = new Set(prev);
					next.delete(messageId);
					return next;
				});
				streamingTimeoutsRef.current.delete(messageId);
			}, 2000);
			streamingTimeoutsRef.current.set(messageId, timeout);

			setEvents((prev) => {
				const existingIndex = prev.findIndex((item) => item.id === id);
				if (existingIndex === -1) {
					seenMessageIdsRef.current.add(id);
					const newEvent = buildMessageEvent(messageId, {
						role: "assistant",
						parts: [part],
					});
					return [...prev, newEvent].slice(-500);
				}

				// Update existing message with new/updated part
				const updated = [...prev];
				const existing = updated[existingIndex];
				const existingPayload = existing.payload as { parts?: Part[] };
				const existingParts = existingPayload.parts || [];

				// Find if part already exists
				const partIndex = partId
					? existingParts.findIndex((p) => getPartId(p) === partId)
					: -1;
				let newParts: Part[];
				if (partIndex === -1) {
					newParts = [...existingParts, part];
				} else {
					newParts = [...existingParts];
					newParts[partIndex] = mergeUpdatedPart(
						existingParts[partIndex],
						part,
					);
				}

				const updatedEvent = buildMessageEvent(
					messageId,
					{ ...existingPayload, parts: newParts },
					existing.ts,
				);
				updated[existingIndex] = updatedEvent;
				return updated;
			});
		};

		const removeMessageEvent = (messageId: string) => {
			const id = `msg-${messageId}`;
			seenMessageIdsRef.current.delete(id);
			setEvents((prev) => prev.filter((item) => item.id !== id));
		};

		if (!effectiveSessionId) return;

		const token = localStorage.getItem("token");
		const params = new URLSearchParams();
		if (token) {
			params.set("token", token);
		}
		params.set("sessionId", effectiveSessionId);
		const eventSource = new EventSource(`/events?${params.toString()}`);

		eventSource.addEventListener("opencode:event", (sseEvent) => {
			const payload = JSON.parse(sseEvent.data) as {
				event?: unknown;
				sessionId?: unknown;
				sessionID?: unknown;
			};
			const event = payload.event;
			if (!event || typeof event !== "object") {
				return;
			}
			const typedEvent = event as {
				type?: unknown;
				part?: unknown;
				message?: unknown;
				error?: unknown;
			};
			const eventType =
				typeof typedEvent.type === "string" ? typedEvent.type : "";
			const eventSessionId =
				getEventSessionId(typedEvent) ?? getSessionIdFromValue(payload);
			console.log("[ExecutionLog] Received event:", eventType, typedEvent);
			if (eventSessionId && eventSessionId !== effectiveSessionId) {
				console.log("[ExecutionLog] Event sessionId mismatch, ignoring");
				return;
			}

			if (eventType === "message.part.updated") {
				const part = typedEvent.part;
				if (!part || typeof part !== "object") {
					return;
				}
				const messageId = getEventMessageId(typedEvent);
				if (!messageId) {
					return;
				}
				console.log(
					"[ExecutionLog] Processing message.part.updated:",
					messageId,
					part,
				);
				updateMessagePart(messageId, part as Part);
				setIsLoading(false);
				return;
			}

			if (eventType === "message.updated") {
				console.log(
					"[ExecutionLog] Processing message.updated:",
					typedEvent.message,
				);
				if (typedEvent.message && typeof typedEvent.message === "object") {
					const message = typedEvent.message as {
						id?: string;
						messageID?: string;
						role?: string;
						content?: string;
						parts?: Part[];
						modelId?: string;
						modelID?: string;
						tokens?: MessageTokens;
					};
					const messageId =
						typeof message.id === "string" && message.id.length > 0
							? message.id
							: message.messageID;
					if (!messageId) {
						return;
					}
					upsertMessageEvent({
						...message,
						id: messageId,
						modelID:
							typeof message.modelID === "string" && message.modelID.length > 0
								? message.modelID
								: message.modelId,
						tokens: message.tokens,
					});
					setIsLoading(false);
				}
				return;
			}

			if (eventType === "message.removed") {
				const messageId = getEventMessageId(typedEvent);
				if (!messageId) {
					return;
				}
				console.log("[ExecutionLog] Processing message.removed:", messageId);
				removeMessageEvent(messageId);
				return;
			}

			if (eventType === "error") {
				console.log("[ExecutionLog] Processing error:", typedEvent.error);
				void refreshMessagesRef.current?.();
				if (
					typeof typedEvent.error === "string" &&
					typedEvent.error.includes("Session not found")
				) {
					eventSource.close();
				}
				return;
			}

			if (eventType === "permission.updated") {
				const permRaw = typedEvent as unknown as {
					permission?: unknown;
				};
				if (!permRaw.permission || typeof permRaw.permission !== "object") {
					return;
				}
				const perm = permRaw.permission as PermissionData;
				const permSessionId =
					perm.sessionId ?? getSessionIdFromValue(typedEvent);
				if (permSessionId && permSessionId !== effectiveSessionId) {
					return;
				}
				console.log("[ExecutionLog] Processing permission.updated:", perm);
				setPendingPermissions((prev) => {
					const next = new Map(prev);
					next.set(perm.id, perm);
					return next;
				});
				setIsLoading(false);
				return;
			}

			if (eventType === "permission.replied") {
				const permReply = typedEvent as unknown as {
					permissionId?: unknown;
					permissionID?: unknown;
					response?: unknown;
				};
				const replyPermId =
					typeof permReply.permissionId === "string"
						? permReply.permissionId
						: typeof permReply.permissionID === "string"
							? permReply.permissionID
							: undefined;
				if (!replyPermId) return;
				console.log(
					"[ExecutionLog] Processing permission.replied:",
					replyPermId,
				);
				setPendingPermissions((prev) => {
					const next = new Map(prev);
					next.delete(replyPermId);
					return next;
				});
				return;
			}

			if (eventType === "question.asked") {
				const qRaw = typedEvent as unknown as { question?: unknown };
				if (!qRaw.question || typeof qRaw.question !== "object") return;
				const q = qRaw.question as QuestionData;
				const qSessionId = q.sessionId ?? getSessionIdFromValue(typedEvent);
				if (qSessionId && qSessionId !== effectiveSessionId) return;
				setPendingQuestions((prev) => {
					const next = new Map(prev);
					next.set(q.id, q);
					return next;
				});
				setIsLoading(false);
				return;
			}

			if (
				eventType === "question.replied" ||
				eventType === "question.rejected"
			) {
				const qReply = typedEvent as unknown as {
					requestId?: unknown;
					requestID?: unknown;
				};
				const replyRequestId =
					typeof qReply.requestId === "string"
						? qReply.requestId
						: typeof qReply.requestID === "string"
							? qReply.requestID
							: undefined;
				if (!replyRequestId) return;
				setPendingQuestions((prev) => {
					const next = new Map(prev);
					next.delete(replyRequestId);
					return next;
				});
				return;
			}

			console.warn(
				`[ExecutionLog] Unhandled SSE event type: ${eventType}`,
				typedEvent,
			);
		});

		eventSource.onerror = (err) => {
			console.error("[ExecutionLog] SSE error:", err);
		};

		return () => {
			eventSource.close();
		};
	}, [
		effectiveSessionId,
		buildMessageEvent,
		extractStatusLineFromMessage,
		upsertStatusEvent,
		isSubAgent,
	]);

	useEffect(() => {
		let isActive = true;

		const fetchSessionMessages = async () => {
			if (!effectiveSessionId || !isActive) return;
			try {
				const [messagesResponse, pendingPerms, pendingQs] = await Promise.all([
					api.opencode.getSessionMessages({
						sessionId: effectiveSessionId,
						limit: 200,
					}),
					api.opencode.getPendingPermissions({
						sessionId: effectiveSessionId,
					}),
					api.opencode.getPendingQuestions({
						sessionId: effectiveSessionId,
					}),
				]);
				if (!isActive) return;

				if (pendingPerms.length > 0) {
					setPendingPermissions((prev) => {
						const next = new Map(prev);
						for (const perm of pendingPerms) {
							next.set(perm.id, perm);
						}
						return next;
					});
				}

				if (pendingQs.length > 0) {
					setPendingQuestions((prev) => {
						const next = new Map(prev);
						for (const q of pendingQs) {
							next.set(q.id, q);
						}
						return next;
					});
				}

				if (messagesResponse.messages.length > 0) {
					const latestStatusMessage = [...messagesResponse.messages]
						.reverse()
						.find((msg: OpenCodeMessage) => {
							if (msg.role !== "assistant") return false;
							return Boolean(extractStatusLineFromMessage(msg));
						});

					if (latestStatusMessage) {
						const statusLine =
							extractStatusLineFromMessage(latestStatusMessage);
						if (statusLine) {
							upsertStatusEvent(
								statusLine,
								new Date(latestStatusMessage.timestamp).toISOString(),
							);
						}
					}

					if (
						!isSubAgent &&
						hideFirstUserMessage &&
						!hiddenUserMessageIdRef.current
					) {
						let firstUserMessage: OpenCodeMessage | null = null;
						for (const message of messagesResponse.messages) {
							if (message.role !== "user") continue;
							if (
								!firstUserMessage ||
								message.timestamp < firstUserMessage.timestamp
							) {
								firstUserMessage = message;
							}
						}
						if (firstUserMessage) {
							hiddenUserMessageIdRef.current = firstUserMessage.id;
						}
					}
					setEvents((prev) => {
						const updated = [...prev];
						const indexById = new Map<string, number>();

						updated.forEach((event, index) => {
							indexById.set(event.id, index);
						});

						messagesResponse.messages.forEach((msg: OpenCodeMessage) => {
							if (!isSubAgent && hiddenUserMessageIdRef.current === msg.id) {
								return;
							}
							const id = `msg-${msg.id}`;
							const event: RunEvent = {
								id,
								runId: effectiveSessionId,
								ts: new Date(msg.timestamp).toISOString(),
								eventType: "message",
								payload: {
									role: msg.role,
									content: msg.content,
									parts: msg.parts,
									modelID: msg.modelID,
									tokens: msg.tokens,
								},
							};

							seenMessageIdsRef.current.add(id);

							const existingIndex = indexById.get(id);
							if (existingIndex === undefined) {
								updated.push(event);
								indexById.set(id, updated.length - 1);
								return;
							}

							updated[existingIndex] = {
								...updated[existingIndex],
								ts: event.ts,
								payload: event.payload,
							};
						});

						const hiddenId = hiddenUserMessageIdRef.current;
						const filtered = hiddenId
							? updated.filter((event) => event.id !== `msg-${hiddenId}`)
							: updated;
						return filtered.slice(-500);
					});
				}
			} catch (error) {
				console.error("Failed to fetch session messages:", error);
			} finally {
				if (isActive) {
					setIsLoading(false);
				}
			}
		};

		const loadInitial = async () => {
			if (effectiveSessionId) {
				await fetchSessionMessages();
			} else if (isActive) {
				setIsLoading(false);
			}
		};

		refreshMessagesRef.current = fetchSessionMessages;
		setIsLoading(true);
		void loadInitial();
		return () => {
			isActive = false;
			refreshMessagesRef.current = null;
		};
	}, [
		effectiveSessionId,
		extractStatusLineFromMessage,
		upsertStatusEvent,
		isSubAgent,
		hideFirstUserMessage,
	]);

	useEffect(() => {
		if (events.length === 0) return;
		if (autoScroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [events, autoScroll]);

	const handlePermissionReply = async (
		permissionId: string,
		response: "once" | "always" | "reject",
	) => {
		if (!runId) return;
		try {
			await api.run.replyPermission({ runId, permissionId, response });
			setPendingPermissions((prev) => {
				const next = new Map(prev);
				next.delete(permissionId);
				return next;
			});
		} catch (error) {
			console.error("Failed to reply to permission:", error);
		}
	};

	const handleQuestionReply = async (
		requestId: string,
		answers: string[][],
	): Promise<void> => {
		await api.opencode.replyQuestion({
			sessionId: effectiveSessionId,
			requestId,
			answers,
		});
		setPendingQuestions((prev) => {
			const next = new Map(prev);
			next.delete(requestId);
			return next;
		});
	};

	const handleQuestionReject = async (requestId: string): Promise<void> => {
		await api.opencode.rejectQuestion({
			sessionId: effectiveSessionId,
			requestId,
		});
		setPendingQuestions((prev) => {
			const next = new Map(prev);
			next.delete(requestId);
			return next;
		});
	};

	const handleQuestionError = (message: string) => {
		console.error("[ExecutionLog] Question error:", message);
	};

	const renderPermissions = () => {
		if (pendingPermissions.size === 0) return null;
		const elements: React.ReactNode[] = [];
		for (const [permId, perm] of pendingPermissions) {
			elements.push(
				<ConfirmationPart
					key={`perm-${permId}`}
					permission={perm}
					onDecide={handlePermissionReply}
				/>,
			);
		}
		return elements;
	};

	const renderEvent = (event: RunEvent) => {
		const time = new Date(event.ts).toLocaleTimeString("en-US", {
			hour12: false,
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});

		if (event.eventType === "stdout") {
			return (
				<div
					key={event.id}
					className="flex gap-3 py-0.5 px-4 group justify-between items-start"
				>
					<span className="text-xs font-mono text-slate-300 break-all whitespace-pre-wrap flex-1">
						{coerceText(event.payload)}
					</span>
					<span className="text-[10px] font-mono text-slate-600 mt-1 shrink-0 select-none">
						{time}
					</span>
				</div>
			);
		}

		if (event.eventType === "stderr") {
			return (
				<div
					key={event.id}
					className="flex gap-3 py-0.5 px-4 group bg-red-500/5 justify-between items-start"
				>
					<span className="text-xs font-mono text-red-400 break-all whitespace-pre-wrap flex-1">
						{coerceText(event.payload)}
					</span>
					<span className="text-[10px] font-mono text-red-900/50 mt-1 shrink-0 select-none">
						{time}
					</span>
				</div>
			);
		}

		if (event.eventType === "message") {
			const messagePayload = event.payload as
				| {
						role?: string;
						content?: string;
						parts?: Part[];
						modelID?: string;
						tokens?: MessageTokens;
				  }
				| string;

			if (typeof messagePayload === "string") {
				return (
					<div
						key={event.id}
						className="flex gap-3 py-2 px-3 my-1 bg-slate-800/40 border-l-2 border-slate-700/40 rounded-r-lg justify-between items-start"
					>
						<div className="flex-1 min-w-0">
							<LightMarkdown
								text={messagePayload}
								className="text-xs text-slate-300 leading-relaxed"
							/>
						</div>
						<span className="text-[10px] font-mono text-slate-600 mt-1 shrink-0 select-none">
							{time}
						</span>
					</div>
				);
			}

			const {
				role = "assistant",
				content,
				parts: messageParts,
				modelID,
			} = messagePayload;

			const parts =
				messageParts && messageParts.length > 0
					? messageParts
					: content
						? [{ type: "text" as const, text: content }]
						: [];
			const renderableParts = parts.filter(isRenderablePart);

			const isUser = role === "user";
			const assistantLabel = isUser
				? "User"
				: formatAssistantLabel({
						modelID,
						parts,
						showFallback: renderableParts.length === 0,
					});

			// Extract messageId from event.id (format: "msg-<messageId>")
			const messageId = event.id.replace(/^msg-/, "");
			const isStreaming = streamingMessageIds.has(messageId);

			return (
				<div
					key={event.id}
					className={cn(
						"flex gap-4 p-4 my-3 rounded-xl border transition-all duration-200 group",
						isUser
							? "bg-gradient-to-br from-blue-500/[0.01] to-transparent border-blue-500/5 hover:border-blue-500/15"
							: "bg-gradient-to-br from-slate-500/[0.01] to-transparent border-slate-800/30 hover:border-slate-700/40",
					)}
				>
					<div className="shrink-0 pt-0.5">
						<div
							className={cn(
								"w-8 h-8 rounded-xl flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-3",
								isUser
									? "bg-gradient-to-br from-violet-500 to-indigo-600 shadow-indigo-500/20"
									: cn(
											"bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/20",
											(isStreaming || parts.length === 0) && "animate-pulse",
										),
							)}
						>
							{isUser ? (
								<User className="w-4 h-4 text-white" />
							) : (
								<Bot className="w-4 h-4 text-white" />
							)}
						</div>
					</div>

					<div className="flex-1 min-w-0">
						<div className="flex items-center justify-between mb-1.5">
							<span
								className={cn(
									"text-[10px] font-bold uppercase tracking-widest select-none",
									isUser ? "text-indigo-400/80" : "text-blue-500/80",
								)}
							>
								{assistantLabel}
							</span>
							<span className="text-[10px] font-mono text-slate-600/60 select-none">
								{time}
							</span>
						</div>
						<div className="space-y-3 text-[13px] leading-relaxed text-slate-200">
							{!isUser && renderableParts.length === 0 ? (
								<div className="text-xs text-slate-500 italic">Thinking...</div>
							) : (
								renderableParts.map((part, idx) => {
									const key = `${part.type}-${idx}`;
									switch (part.type) {
										case "reasoning":
											return (
												<ReasoningPart
													key={key}
													part={part}
													expanded={showReasoning}
												/>
											);
										case "tool":
											if (part.tool === "todowrite") {
												return <TodoWriteToolView key={key} part={part} />;
											}
											if (part.tool === "task") {
												const taskMeta = (
													part as { metadata?: Record<string, unknown> }
												).metadata;
												const taskInput = part.input as Record<
													string,
													unknown
												> | null;
												return (
													<SubtaskPartView
														key={key}
														part={{
															type: "subtask" as const,
															sessionID: (taskMeta?.sessionId as string) ?? "",
															description:
																(taskInput?.description as string) ?? "",
															prompt: (taskInput?.prompt as string) ?? "",
															agent: (taskInput?.subagent_type as string) ?? "",
														}}
														onNavigateToSession={handleNavigateToSubAgent}
													/>
												);
											}
											return (
												<ToolPart
													key={key}
													part={part}
													pendingQuestion={
														part.tool === "question"
															? [...pendingQuestions.values()][0]
															: undefined
													}
													onQuestionReply={handleQuestionReply}
													onQuestionReject={handleQuestionReject}
													onQuestionError={handleQuestionError}
												/>
											);
										case "file":
											return <FilePart key={key} part={part} />;
										case "agent":
											return <AgentPart key={key} part={part} />;
										case "subtask":
											return (
												<SubtaskPartView
													key={key}
													part={part}
													onNavigateToSession={handleNavigateToSubAgent}
												/>
											);
										case "text":
											if ("ignored" in part && part.ignored) {
												return <SystemNotificationPart key={key} part={part} />;
											}
											return <TextPart key={key} part={part} />;
										default:
											return null;
									}
								})
							)}
						</div>
					</div>
				</div>
			);
		}

		if (event.eventType === "status") {
			return null;
		}

		return (
			<div
				key={event.id}
				className="flex gap-3 py-0.5 px-4 justify-between items-start"
			>
				<span className="text-xs font-mono text-slate-400 break-all whitespace-pre-wrap flex-1">
					{coerceText(event.payload)}
				</span>
				<span className="text-[10px] font-mono text-slate-600 mt-1 shrink-0 select-none">
					{time}
				</span>
			</div>
		);
	};

	return (
		<div className="flex flex-col h-full bg-[#0B0E14] overflow-hidden">
			<div className="relative flex-1 min-h-0">
				<div
					ref={scrollRef}
					onScroll={handleScroll}
					className="absolute inset-0 overflow-y-auto p-4 custom-scrollbar selection:bg-blue-500/30"
				>
					{isLoading && events.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full space-y-3 opacity-50">
							<RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
							<p className="text-xs text-slate-400 font-medium font-mono uppercase tracking-widest text-center">
								Initializing Stream...
							</p>
						</div>
					) : events.length === 0 ? (
						<div className="flex flex-col justify-center h-full space-y-3">
							{runStatus === "paused" && !dismissedSyntheticQuestion ? (
								<QuestionInteraction
									question={{
										id: `synthetic-${runId}`,
										sessionId,
										createdAt: Date.now(),
										questions: [
											{
												question: "Should the run continue?",
												options: [
													{ label: "yes", description: "Continue execution" },
													{ label: "no", description: "Stop execution" },
												],
											},
										],
									}}
									onReply={async () => {
										setDismissedSyntheticQuestion(true);
									}}
									onReject={async () => {
										setDismissedSyntheticQuestion(true);
									}}
								/>
							) : null}
							<div className="flex flex-col items-center justify-center space-y-2 opacity-30">
								<Terminal className="w-8 h-8" />
								<p className="text-xs text-slate-400 font-mono">
									No events captured yet
								</p>
							</div>
						</div>
					) : (
						<div className="space-y-0.5">
							{events.map(renderEvent)}
							{renderPermissions()}
						</div>
					)}
				</div>

				{scrolledFromTop && (
					<button
						type="button"
						onClick={handleJumpToTop}
						className="absolute top-6 right-6 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-xl shadow-blue-500/20 animate-in fade-in slide-in-from-top-2 duration-300 z-10 transition-colors"
					>
						<ChevronsUp className="w-4 h-4" />
					</button>
				)}

				{!autoScroll && (
					<button
						type="button"
						onClick={handleJumpToEnd}
						className="absolute bottom-6 right-6 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-xl shadow-blue-500/20 animate-in fade-in slide-in-from-bottom-2 duration-300 z-10 transition-colors"
					>
						<ChevronsDown className="w-4 h-4" />
					</button>
				)}
			</div>

			<div className="border-t border-slate-800/40 bg-[#11151C]/40 backdrop-blur-xl px-4 py-3 shrink-0 relative">
				<div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/10 to-transparent" />

				<div className="relative flex items-end w-full bg-[#161B26] border border-slate-700 rounded-2xl focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/50 shadow-xl shadow-black/20 overflow-hidden transition-all duration-200">
					<textarea
						ref={textareaRef}
						value={inputMessage}
						onChange={handleInput}
						onKeyDown={handleKeyDown}
						placeholder="Type a message to send to the assistant..."
						disabled={isSending || !effectiveSessionId}
						className="w-full min-h-[52px] max-h-[200px] pl-4 pr-14 py-4 bg-transparent border-none focus:outline-none focus:ring-0 text-sm text-slate-200 placeholder:text-slate-600 font-medium resize-none custom-scrollbar disabled:opacity-50 disabled:cursor-not-allowed"
						rows={1}
						style={{ height: "52px" }}
					/>

					<div className="absolute right-2 bottom-2">
						<button
							type="button"
							onClick={handleSendMessage}
							disabled={
								isSending || !inputMessage.trim() || !effectiveSessionId
							}
							className={cn(
								"flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200",
								isSending || !inputMessage.trim() || !effectiveSessionId
									? "bg-slate-800 text-slate-600 cursor-not-allowed"
									: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 hover:scale-105 active:scale-95",
							)}
							title={isSending ? "Sending..." : "Send message"}
						>
							{isSending ? (
								<RefreshCw className="w-4 h-4 animate-spin" />
							) : (
								<Send className="w-4 h-4 ml-0.5" />
							)}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
