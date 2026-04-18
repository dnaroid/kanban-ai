import { useEffect, useState } from "react";
import {
	ArrowLeft,
	Brain,
	Gauge,
	FileDiff,
	Files,
	GitMerge,
	ListTodo,
	RotateCcw,
	Square,
	Terminal,
	Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OpencodeModel, Run } from "@/types/ipc";
import { ArtifactsPanel } from "./ArtifactsPanel";
import { ExecutionLog } from "./ExecutionLog";
import { RunDiffPanel } from "./RunDiffPanel";
import { RunTodosPanel } from "./RunTodosPanel";
import { api } from "@/lib/api";

export function RunDetailsView({
	runId,
	run,
	onBack,
	onDelete,
	onRestart,
	onCancel,
	onMerge,
	isMerging = false,
	showBack = true,
}: {
	runId: string;
	run: Run | null;
	onBack: () => void;
	onDelete?: (e: React.MouseEvent) => void;
	onRestart?: (e: React.MouseEvent) => void;
	onCancel?: (e: React.MouseEvent) => void;
	onMerge?: (e: React.MouseEvent) => void;
	isMerging?: boolean;
	showBack?: boolean;
}) {
	const [view, setView] = useState<"log" | "artifacts" | "todo" | "diff">(
		"log",
	);
	const [showReasoning, setShowReasoning] = useState(false);
	const [hasTodos, setHasTodos] = useState(false);
	const [contextLimit, setContextLimit] = useState<number | null>(null);
	const [messageContextStats, setMessageContextStats] = useState<{
		tokens: number;
		percent: number | null;
		modelID: string | null;
	}>({ tokens: 0, percent: null, modelID: null });
	const [sessionStack, setSessionStack] = useState<string[]>([]);
	const isViewingSubAgent = sessionStack.length > 1;
	const activeSessionId =
		sessionStack.length > 0 ? sessionStack[0] : run?.sessionId || "";
	const sessionId = run?.sessionId;

	const handleNavigateToSubAgent = (childSessionId: string) => {
		setSessionStack((prev) => [
			childSessionId,
			...(prev.length > 0 ? prev : [run?.sessionId || ""]),
		]);
	};

	const handleNavigateBack = () => {
		setSessionStack((prev) => prev.slice(1));
	};

	useEffect(() => {
		setSessionStack([]);
	}, [runId]);
	const runVcs = run?.metadata?.vcs;
	const canMerge =
		Boolean(onMerge) &&
		Boolean(runVcs) &&
		run?.status === "completed" &&
		runVcs?.mergeStatus !== "merged" &&
		runVcs?.workspaceStatus !== "missing";
	const mergeTitle =
		runVcs?.lastMergeError ??
		runVcs?.lastCleanupError ??
		"Merge run changes into the base branch";
	const mergeLabel = isMerging
		? "Merging"
		: runVcs?.lastMergeError
			? "Retry Merge"
			: "Merge";
	const mergedLabel =
		runVcs?.mergedBy === "automatic" ? "Auto merged" : "Merged";
	const contextPercent =
		contextLimit && contextLimit > 0 && messageContextStats.tokens > 0
			? Math.round((messageContextStats.tokens / contextLimit) * 100)
			: null;
	const shouldShowContextIndicator =
		view === "log" && messageContextStats.tokens > 0 && contextPercent !== null;
	const contextIndicatorClassName =
		contextPercent === null
			? "bg-slate-900/50 text-slate-500 border-slate-800"
			: contextPercent > 80
				? "bg-red-500/10 text-red-300 border-red-500/20"
				: contextPercent >= 50
					? "bg-amber-500/10 text-amber-300 border-amber-500/20"
					: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";

	useEffect(() => {
		if (!sessionId) return;
		const checkTodos = async () => {
			try {
				const response = await api.opencode.getSessionTodos({ sessionId });
				setHasTodos(
					response.todos.some(
						(t: { status: string }) =>
							t.status !== "completed" && t.status !== "cancelled",
					),
				);
			} catch (error) {
				console.error("Failed to check todos:", error);
				setHasTodos(false);
			}
		};
		void checkTodos();
	}, [sessionId]);

	useEffect(() => {
		const modelID = messageContextStats.modelID || run?.model;
		if (!modelID) {
			setContextLimit(null);
			return;
		}

		let isActive = true;

		const fetchContextLimit = async () => {
			try {
				const response = await api.opencode.listModels();
				if (!isActive) {
					return;
				}

				const matchedModel = response.models.find(
					(model: OpencodeModel) =>
						model.name === modelID || model.name.endsWith(`/${modelID}`),
				);
				setContextLimit(matchedModel?.contextLimit ?? null);
			} catch (error) {
				console.error("Failed to fetch model context limit:", error);
				if (isActive) {
					setContextLimit(null);
				}
			}
		};

		void fetchContextLimit();

		return () => {
			isActive = false;
		};
	}, [messageContextStats.modelID, run?.model]);

	return (
		<div className="flex flex-col h-full bg-[#0B0E14] overflow-hidden animate-in fade-in duration-300">
			<div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/50 bg-[#11151C]/25 backdrop-blur-md shrink-0">
				<div className="flex items-center gap-3">
					{showBack && (
						<button
							type="button"
							onClick={onBack}
							className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
						>
							<ArrowLeft className="w-4 h-4" />
						</button>
					)}
					<span className="text-xs font-mono text-blue-400/80">
						{runId.slice(0, 8)}
					</span>

					<div className="flex items-center gap-1.5 ml-2 border-l border-slate-800 pl-3">
						{onRestart &&
							run &&
							!["running", "queued"].includes(run.status) && (
								<button
									type="button"
									onClick={onRestart}
									className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
									title="Restart run"
								>
									<RotateCcw className="w-3.5 h-3.5" />
								</button>
							)}
						{onCancel && run && ["running", "queued"].includes(run.status) && (
							<button
								type="button"
								onClick={onCancel}
								className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
								title="Cancel run"
							>
								<Square className="w-3.5 h-3.5 fill-current" />
							</button>
						)}
						{onDelete && run && !["running", "queued"].includes(run.status) && (
							<button
								type="button"
								onClick={onDelete}
								className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
								title="Delete run"
							>
								<Trash2 className="w-3.5 h-3.5" />
							</button>
						)}
						{canMerge && (
							<button
								type="button"
								onClick={onMerge}
								disabled={isMerging}
								className="flex items-center gap-1.5 px-2.5 py-1.5 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
								title={mergeTitle}
							>
								<GitMerge className="w-3.5 h-3.5" />
								<span className="text-[10px] font-bold uppercase tracking-wider">
									{mergeLabel}
								</span>
							</button>
						)}
						{runVcs?.mergeStatus === "merged" && (
							<div
								className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg"
								title={
									runVcs?.mergedBy === "automatic"
										? "This run was merged automatically after completion"
										: "This run was merged manually"
								}
							>
								<GitMerge className="w-3.5 h-3.5" />
								{mergedLabel}
							</div>
						)}
						{runVcs?.cleanupStatus === "cleaned" && (
							<div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-300 bg-sky-500/10 border border-sky-500/20 rounded-lg">
								Cleaned
							</div>
						)}
						{runVcs?.mergeStatus === "merged" &&
							runVcs.cleanupStatus === "failed" && (
								<div
									className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg"
									title={runVcs.lastCleanupError ?? "Cleanup is still pending"}
								>
									Cleanup pending
								</div>
							)}
					</div>
				</div>

				<div className="flex items-center gap-4">
					{isViewingSubAgent && (
						<button
							type="button"
							onClick={handleNavigateBack}
							className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-cyan-300 uppercase tracking-wider bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all"
						>
							<ArrowLeft className="w-3.5 h-3.5" />
							<span className="hidden sm:inline">Back to parent</span>
						</button>
					)}
					{shouldShowContextIndicator && (
						<div
							className={cn(
								"flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border",
								contextIndicatorClassName,
							)}
							title={`${messageContextStats.tokens.toLocaleString()} tokens used of ${contextLimit?.toLocaleString()} context window`}
						>
							<Gauge className="w-3.5 h-3.5" />
							<span>{contextPercent}%</span>
							<span className="hidden sm:inline opacity-80">Ctx</span>
						</div>
					)}
					{view === "log" && (
						<button
							type="button"
							onClick={() => setShowReasoning(!showReasoning)}
							className={cn(
								"flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 border",
								showReasoning
									? "bg-violet-500/10 text-violet-300 border-violet-500/20 hover:bg-violet-500/20"
									: "bg-slate-900/50 text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700",
							)}
							title={showReasoning ? "Hide reasoning" : "Show reasoning"}
						>
							<Brain className="w-3.5 h-3.5" />
							<span className="hidden sm:inline">Thinking</span>
						</button>
					)}

					<div className="flex bg-slate-900/80 rounded-lg p-0.5 border border-slate-800/50 shadow-inner">
						<button
							type="button"
							onClick={() => setView("log")}
							className={cn(
								"flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
								view === "log"
									? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
									: "text-slate-500 hover:text-slate-300",
							)}
						>
							<Terminal className="w-3 h-3" />
							Log
						</button>
						<button
							type="button"
							onClick={() => setView("todo")}
							className={cn(
								"flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
								view === "todo"
									? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
									: "text-slate-500 hover:text-slate-300",
								sessionId &&
									hasTodos &&
									view !== "todo" &&
									"animate-todo-pulse text-amber-500/80",
							)}
						>
							<ListTodo
								className={cn(
									"w-3 h-3",
									sessionId && hasTodos && view !== "todo" && "text-amber-500",
								)}
							/>
							Todo
						</button>
						<button
							type="button"
							onClick={() => setView("artifacts")}
							className={cn(
								"flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
								view === "artifacts"
									? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
									: "text-slate-500 hover:text-slate-300",
							)}
						>
							<Files className="w-3 h-3" />
							Artifacts
						</button>
						<button
							type="button"
							onClick={() => setView("diff")}
							className={cn(
								"flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
								view === "diff"
									? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
									: "text-slate-500 hover:text-slate-300",
							)}
						>
							<FileDiff className="w-3 h-3" />
							Diff
						</button>
					</div>
				</div>
			</div>

			<style>{`
        @keyframes todo-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .animate-todo-pulse {
          animation: todo-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

			<div className="flex-1 overflow-hidden">
				{view === "log" ? (
					<ExecutionLog
						runId={runId}
						sessionId={activeSessionId}
						onContextStats={setMessageContextStats}
						showReasoning={showReasoning}
						onNavigateToSubAgent={handleNavigateToSubAgent}
						isSubAgent={isViewingSubAgent}
					/>
				) : view === "artifacts" ? (
					<ArtifactsPanel runId={runId} />
				) : view === "diff" ? (
					<RunDiffPanel runId={runId} />
				) : (
					<RunTodosPanel sessionId={activeSessionId} />
				)}
			</div>
		</div>
	);
}
