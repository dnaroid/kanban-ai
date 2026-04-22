import { useState } from "react";
import {
	CheckCircle2,
	CheckIcon,
	ChevronDown,
	ChevronRight,
	Circle,
	Copy,
	ListTodo,
	Loader2,
	XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolState } from "@/types/ipc";
import { todoStatusConfig } from "@/components/kanban/TaskPropertyConfigs";

const TODO_PRIORITY_CONFIG = {
	high: {
		color: "text-red-400",
		bg: "bg-red-400/10",
		border: "border-red-400/20",
	},
	medium: {
		color: "text-amber-400",
		bg: "bg-amber-400/10",
		border: "border-amber-400/20",
	},
	low: {
		color: "text-slate-400",
		bg: "bg-slate-400/10",
		border: "border-slate-400/20",
	},
} as const;

const TOOL_STATUS_CONFIG = {
	pending: {
		icon: Circle,
		color: "text-amber-400",
		label: "Pending",
		animate: undefined,
	},
	running: {
		icon: Loader2,
		color: "text-blue-400",
		label: "Running",
		animate: "animate-spin" as const,
	},
	completed: {
		icon: CheckCircle2,
		color: "text-emerald-400",
		label: "Completed",
		animate: undefined,
	},
	error: {
		icon: XCircle,
		color: "text-red-400",
		label: "Error",
		animate: undefined,
	},
} as const;

type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";
type TodoPriority = "high" | "medium" | "low";

interface TodoItem {
	id?: string;
	content: string;
	status: TodoStatus;
	priority: TodoPriority;
}

function isTodoArray(value: unknown): value is TodoItem[] {
	if (!Array.isArray(value)) return false;
	return value.every(
		(item) =>
			item != null &&
			typeof item === "object" &&
			typeof (item as Record<string, unknown>).content === "string" &&
			typeof (item as Record<string, unknown>).status === "string",
	);
}

function extractTodos(input: unknown): TodoItem[] {
	if (!input || typeof input !== "object") return [];
	const rec = input as Record<string, unknown>;
	if (isTodoArray(rec.todos)) return rec.todos;
	return [];
}

interface TodoWriteToolPart {
	tool: string;
	state?: ToolState;
	input?: unknown;
	output?: unknown;
	error?: string;
}

export function TodoWriteToolView({ part }: { part: TodoWriteToolPart }) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [copied, setCopied] = useState(false);

	const todos = extractTodos(part.input);
	const completedCount = todos.filter((t) => t.status === "completed").length;
	const totalCount = todos.length;

	const toolStatus =
		TOOL_STATUS_CONFIG[part.state ?? "pending"] ?? TOOL_STATUS_CONFIG.pending;

	return (
		<div
			className={cn(
				"rounded-xl border transition-all overflow-hidden",
				"bg-slate-400/5",
				"border-slate-400/20",
			)}
		>
			<div className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors">
				<button
					type="button"
					className="flex-1 flex items-center gap-2 min-w-0 text-left cursor-pointer"
					onClick={() => setIsExpanded(!isExpanded)}
				>
					<div className="p-1.5 rounded-lg bg-slate-900/50 text-amber-500">
						<ListTodo className="w-3.5 h-3.5" />
					</div>
					<span className="text-xs font-mono font-medium text-slate-200">
						todowrite
					</span>
					<toolStatus.icon
						className={cn("w-4 h-4", toolStatus.color, toolStatus.animate)}
					/>
					{totalCount > 0 && (
						<span className="text-[10px] text-amber-500/90 font-mono font-semibold">
							{completedCount}/{totalCount}
						</span>
					)}
				</button>
				<div className="flex items-center gap-1 shrink-0">
					<button
						type="button"
						className="p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
						title="Copy as JSON"
						onClick={() => {
							const obj: Record<string, unknown> = {
								tool: part.tool,
							};
							if (part.state != null) obj.state = part.state;
							if (part.input != null) obj.input = part.input;
							if (part.output != null) obj.output = part.output;
							if (part.error) obj.error = part.error;
							navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
							setCopied(true);
							setTimeout(() => setCopied(false), 1500);
						}}
					>
						{copied ? (
							<CheckIcon className="w-3 h-3 text-emerald-400" />
						) : (
							<Copy className="w-3 h-3 text-slate-500" />
						)}
					</button>
					<button
						type="button"
						className="p-1 cursor-pointer"
						onClick={() => setIsExpanded(!isExpanded)}
					>
						{isExpanded ? (
							<ChevronDown className="w-3.5 h-3.5 text-slate-500" />
						) : (
							<ChevronRight className="w-3.5 h-3.5 text-slate-500" />
						)}
					</button>
				</div>
			</div>

			{isExpanded && (
				<div className="px-3 pb-3 border-t border-white/5 pt-2">
					{todos.length === 0 ? (
						<p className="text-[11px] text-slate-500 italic py-1">No tasks</p>
					) : (
						<div className="divide-y divide-slate-800/40">
							{todos.map((todo, idx) => {
								const statusCfg =
									todoStatusConfig[todo.status] ?? todoStatusConfig.pending;
								const priorityCfg =
									TODO_PRIORITY_CONFIG[todo.priority] ??
									TODO_PRIORITY_CONFIG.low;
								const StatusIcon = statusCfg.icon;
								return (
									<div
										key={todo.id ?? idx}
										className="flex items-center gap-2.5 py-1.5 first:pt-0.5 last:pb-0.5"
									>
										<div className="shrink-0">
											<div
												className={cn(
													"w-4 h-4 rounded border flex items-center justify-center transition-all duration-200",
													statusCfg.bg,
													statusCfg.border,
													statusCfg.color,
												)}
											>
												<StatusIcon
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
													"text-[12px] leading-snug font-medium",
													todo.status === "completed"
														? "text-slate-500 line-through decoration-slate-600/50"
														: todo.status === "cancelled"
															? "text-slate-600 line-through decoration-slate-600/30"
															: statusCfg.color,
												)}
											>
												{todo.content}
											</p>
										</div>

										<div
											className={cn(
												"px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border shrink-0",
												priorityCfg.bg,
												priorityCfg.border,
												priorityCfg.color,
											)}
										>
											{todo.priority}
										</div>
									</div>
								);
							})}
						</div>
					)}

					{part.error && (
						<div className="mt-2 space-y-1">
							<span className="text-[10px] font-semibold text-slate-500 uppercase px-1">
								Error
							</span>
							<pre className="p-2 bg-red-500/5 rounded-lg text-[10px] text-red-400 font-mono overflow-x-auto custom-scrollbar">
								{part.error}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
