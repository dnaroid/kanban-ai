import { useCallback, useEffect, useRef, useState } from "react";
import { ListTodo, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { todoStatusConfig } from "../TaskPropertyConfigs";
import { api } from "@/lib/api";

interface Todo {
	id: string;
	content: string;
	status: "pending" | "in_progress" | "completed" | "cancelled";
	priority: "high" | "medium" | "low";
}

export function RunTodosPanel({
	sessionId,
	isActive = true,
}: {
	sessionId: string;
	isActive?: boolean;
}) {
	const [todos, setTodos] = useState<Todo[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isReconnecting, setIsReconnecting] = useState(false);
	const isActiveRef = useRef(isActive);
	const retryAttemptRef = useRef(0);
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const unsubscribeRef = useRef<null | (() => void)>(null);

	const completedCount = todos.filter((t) => t.status === "completed").length;
	const totalCount = todos.length;

	const clearRetry = useCallback(() => {
		if (retryTimerRef.current) {
			clearTimeout(retryTimerRef.current);
			retryTimerRef.current = null;
		}
	}, []);

	useEffect(() => {
		isActiveRef.current = isActive;
		if (!isActive) {
			clearRetry();
			unsubscribeRef.current?.();
			unsubscribeRef.current = null;
			setIsLoading(false);
			setIsReconnecting(false);
		}
	}, [clearRetry, isActive]);

	const fetchTodos = useCallback(async () => {
		if (!isActive || !sessionId) {
			setIsLoading(false);
			return;
		}
		setIsLoading(true);
		try {
			const response = await api.opencode.getSessionTodos({ sessionId });
			if (!isActiveRef.current) return;
			setTodos(response.todos);
			setErrorMessage(null);
		} catch (error) {
			if (!isActiveRef.current) return;
			console.error("Failed to fetch todos:", error);
			setErrorMessage("Failed to fetch todos");
		} finally {
			if (isActiveRef.current) {
				setIsLoading(false);
			}
		}
	}, [isActive, sessionId]);

	useEffect(() => {
		if (isActive) {
			fetchTodos();
		}
	}, [fetchTodos, isActive]);

	useEffect(() => {
		if (!isActive || !sessionId) return;

		let isSubscribed = true;

		const scheduleRetry = () => {
			if (!isSubscribed || retryTimerRef.current) return;
			retryAttemptRef.current = Math.min(retryAttemptRef.current + 1, 6);
			const delay = Math.min(1000 * 2 ** (retryAttemptRef.current - 1), 15000);
			setIsReconnecting(true);
			retryTimerRef.current = setTimeout(() => {
				retryTimerRef.current = null;
				if (isSubscribed) {
					subscribe();
				}
			}, delay);
		};

		const handleError = (message: string) => {
			setErrorMessage(message);
			if (message.includes("Session not found")) {
				unsubscribeRef.current?.();
				unsubscribeRef.current = null;
				setIsReconnecting(false);
				return;
			}
			void fetchTodos();
			scheduleRetry();
		};

		const subscribe = () => {
			unsubscribeRef.current?.();
			const token = localStorage.getItem("token");
			const params = new URLSearchParams();
			if (token) {
				params.set("token", token);
			}
			params.set("sessionId", sessionId);
			const eventSource = new EventSource(`/events?${params.toString()}`);

			eventSource.addEventListener("opencode:event", (sseEvent) => {
				const { sessionId: eventSessionId, event } = JSON.parse(sseEvent.data);
				if (eventSessionId !== sessionId) return;
				if (event.type === "todo.updated") {
					setTodos(event.todos);
					setErrorMessage(null);
					setIsReconnecting(false);
					retryAttemptRef.current = 0;
					clearRetry();
					return;
				}
				if (event.type === "error") {
					const message =
						typeof event.error === "string" ? event.error : "Stream error";
					handleError(message);
				}
			});

			eventSource.onerror = () => {
				handleError("Connection error");
			};

			unsubscribeRef.current = () => eventSource.close();
		};

		subscribe();

		return () => {
			isSubscribed = false;
			clearRetry();
			unsubscribeRef.current?.();
			unsubscribeRef.current = null;
			setIsReconnecting(false);
		};
	}, [clearRetry, fetchTodos, isActive, sessionId]);

	if (!sessionId) {
		return (
			<div className="flex flex-col items-center justify-center h-full space-y-2 opacity-30 animate-in fade-in duration-500">
				<ListTodo className="w-8 h-8" />
				<p className="text-xs text-slate-400 font-mono">
					No active session found
				</p>
			</div>
		);
	}

	if (isLoading && todos.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full space-y-3 opacity-50 animate-in fade-in duration-300">
				<RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
				<p className="text-xs text-slate-400 font-mono uppercase tracking-widest">
					Loading Todos...
				</p>
			</div>
		);
	}

	if (todos.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full space-y-2 opacity-30 animate-in fade-in duration-500">
				<ListTodo className="w-8 h-8" />
				<p className="text-xs text-slate-400 font-mono">
					No todos for this session
				</p>
				{errorMessage && (
					<p className="text-[10px] text-red-400 uppercase tracking-widest">
						{errorMessage}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-300">
			<div className="px-4 py-2 border-b border-slate-800/40 bg-slate-900/40 backdrop-blur-md flex items-center justify-between shrink-0">
				<div className="flex items-center gap-2">
					<span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
						<ListTodo className="w-3.5 h-3.5 text-amber-500" />
						Todos (
						<span className="text-amber-500/90">
							{completedCount}/{totalCount}
						</span>
						)
					</span>
				</div>
				<button
					type="button"
					onClick={() => fetchTodos()}
					className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 rounded-lg transition-all"
					title="Refresh"
				>
					<RefreshCw
						className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
					/>
				</button>
			</div>

			{errorMessage && (
				<div className="px-4 py-2 border-b border-red-500/20 bg-red-500/5 text-[10px] text-red-400 uppercase tracking-widest">
					{errorMessage}
					{isReconnecting && (
						<span className="ml-2 text-red-300/80">Reconnecting…</span>
					)}
				</div>
			)}

			<div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
				<div className="divide-y divide-slate-800/40">
					{todos.map((todo) => {
						const config =
							todoStatusConfig[todo.status] || todoStatusConfig.pending;
						return (
							<div
								key={todo.id}
								className="group px-4 py-2.5 flex items-center gap-3 transition-all hover:bg-slate-800/20"
							>
								<div className="shrink-0">
									<div
										className={cn(
											"w-4 h-4 rounded border flex items-center justify-center transition-all duration-200",
											config.bg,
											config.border,
											config.color,
										)}
									>
										<config.icon
											className={cn(
												"w-3 h-3 stroke-[3]",
												todo.status === "in_progress" && "animate-spin",
											)}
										/>
									</div>
								</div>

								<div className="flex-1 min-w-0">
									<p
										className={cn(
											"text-[13px] leading-snug transition-all font-semibold break-words pr-2",
											todo.status === "completed"
												? "text-slate-500 line-through decoration-slate-600/50"
												: config.color,
										)}
									>
										{todo.content}
									</p>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
