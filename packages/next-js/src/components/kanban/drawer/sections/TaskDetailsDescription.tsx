import { useState } from "react";
import {
	AlertTriangle,
	FlaskConical,
	Loader2,
	Play,
	RotateCcw,
	Wand2,
	X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KanbanTask } from "@/types/kanban";
import { RichMarkdownEditor } from "@/components/common/RichMarkdownEditor";
import { api } from "@/lib/api-client";

interface TaskDetailsDescriptionProps {
	task: KanbanTask;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
	onStartRun?: () => void;
	onFilesSelected?: (files: File[]) => void;
	columnName?: string;
	isActive?: boolean;
	headerLeft?: React.ReactNode;
}
export function TaskDetailsDescription({
	task,
	onUpdate,
	onStartRun,
	onFilesSelected,
	columnName,
	headerLeft,
}: TaskDetailsDescriptionProps) {
	const [isGeneratingStory, setIsGeneratingStory] = useState(false);
	const [isStartingQaTesting, setIsStartingQaTesting] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);

	const handleImproveDescription = async () => {
		setIsGeneratingStory(true);
		setActionError(null);

		try {
			await api.opencode.generateUserStory({ taskId: task.id });
		} catch (error) {
			console.error("Failed to generate user story:", error);
			setActionError("Failed to generate user story. Please try again.");
		} finally {
			setIsGeneratingStory(false);
		}
	};

	const handleStartQaTesting = async () => {
		setIsStartingQaTesting(true);
		setActionError(null);

		try {
			await api.opencode.startQaTesting({ taskId: task.id });
			onStartRun?.();
		} catch (error) {
			console.error("Failed to start QA testing:", error);
			setActionError("Failed to start QA testing. Please try again.");
		} finally {
			setIsStartingQaTesting(false);
		}
	};

	const [isFixingQa, setIsFixingQa] = useState(false);
	const handleFixQa = async () => {
		setIsFixingQa(true);
		setActionError(null);

		try {
			await api.opencode.fixQa({ taskId: task.id });
			onStartRun?.();
		} catch (error) {
			console.error("Failed to fix QA:", error);
			setActionError("Failed to fix QA. Please try again.");
		} finally {
			setIsFixingQa(false);
		}
	};

	return (
		<section
			className="flex flex-col flex-1 min-h-0 space-y-3 px-6"
			aria-label="Task description"
		>
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					{headerLeft || <div />}
					{columnName ? (
						<span className="px-2 py-1 text-[10px] font-semibold tracking-wider uppercase rounded-md bg-slate-800/70 border border-slate-700/60 text-slate-300">
							{columnName}
						</span>
					) : null}
				</div>
			</div>

			{actionError && (
				<div className="text-[10px] text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
					<AlertTriangle className="w-3 h-3 shrink-0" />
					<span className="flex-1">{actionError}</span>
					<button
						type="button"
						onClick={() => setActionError(null)}
						className="p-0.5 hover:bg-red-400/20 rounded-lg transition-colors"
					>
						<X className="w-3 h-3" />
					</button>
				</div>
			)}

			<RichMarkdownEditor
				value={task.description}
				onSave={(value) => onUpdate?.(task.id, { description: value })}
				onFilesSelected={onFilesSelected}
				projectId={task.projectId}
				placeholder="Add a description..."
				emptyText="No description provided. Click to add..."
				autoEditWhenEmpty={true}
				saveOnBlur={true}
				toolbarExtra={
					<>
						{task.description && task.description.trim().length > 0 && (
							<>
								<button
									type="button"
									onClick={handleStartQaTesting}
									disabled={isStartingQaTesting || isGeneratingStory}
									className={cn(
										"h-8 inline-flex items-center gap-1.5 px-2.5 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-lg transition-all border border-emerald-500/20 hover:border-emerald-500 shadow-lg shadow-emerald-500/5 mr-1 text-[11px] font-semibold",
										(isStartingQaTesting ||
											isGeneratingStory ||
											task.status !== "done") &&
											"hidden",
									)}
									title="Start QA testing"
								>
									{isStartingQaTesting ? (
										<>
											<Loader2 className="w-3.5 h-3.5 animate-spin" />
											<span>QA Testing...</span>
										</>
									) : (
										<>
											<FlaskConical className="w-3.5 h-3.5" />
											<span>QA Testing</span>
										</>
									)}
								</button>
								<button
									type="button"
									onClick={handleFixQa}
									disabled={isFixingQa || isGeneratingStory}
									className={cn(
										"h-8 inline-flex items-center gap-1.5 px-2.5 bg-orange-600/10 hover:bg-orange-600 text-orange-400 hover:text-white rounded-lg transition-all border border-orange-500/20 hover:border-orange-500 shadow-lg shadow-orange-500/5 mr-1 text-[11px] font-semibold",
										(isFixingQa ||
											isGeneratingStory ||
											task.status !== "qa_failed") &&
											"hidden",
									)}
									title="Fix & Retry QA"
								>
									{isFixingQa ? (
										<>
											<Loader2 className="w-3.5 h-3.5 animate-spin" />
											<span>Fixing...</span>
										</>
									) : (
										<>
											<RotateCcw className="w-3.5 h-3.5" />
											<span>Fix & Retry</span>
										</>
									)}
								</button>
								<button
									type="button"
									onClick={onStartRun}
									className="w-8 h-8 flex items-center justify-center bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white rounded-lg transition-all border border-blue-500/20 hover:border-blue-500 shadow-lg shadow-blue-500/5 animate-pulse-subtle mr-1"
									title="Open runs"
								>
									<Play className="w-3.5 h-3.5 fill-current" />
								</button>
							</>
						)}
						<button
							type="button"
							onClick={handleImproveDescription}
							disabled={isGeneratingStory || isStartingQaTesting}
							className={cn(
								"w-8 h-8 flex items-center justify-center bg-violet-600/10 hover:bg-violet-600 text-violet-400 hover:text-white rounded-lg transition-all border border-violet-500/20 hover:border-violet-500",
								(isGeneratingStory || isStartingQaTesting) &&
									"opacity-50 cursor-not-allowed",
							)}
							title="Improve with AI"
						>
							{isGeneratingStory ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Wand2 className="w-4 h-4" />
							)}
						</button>
					</>
				}
			/>
		</section>
	);
}
