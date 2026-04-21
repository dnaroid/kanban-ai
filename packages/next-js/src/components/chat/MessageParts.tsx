import { useState, useEffect } from "react";
import {
	Bell,
	Bot,
	Brain,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Circle,
	FileIcon,
	HelpCircle,
	ImageIcon,
	Loader2,
	Wrench,
	XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
	Part,
	PermissionData,
	QuestionData,
	QuestionItem,
	QuestionOption,
	SubtaskPart,
	ToolState,
} from "@/types/ipc";
import { LightMarkdown } from "@/components/LightMarkdown";
import { EditToolDiffView } from "./EditToolDiffView";
import type { EditToolInput } from "./EditToolDiffView";
import { ApplyPatchDiffView } from "./ApplyPatchDiffView";
import type { ApplyPatchToolInput } from "./ApplyPatchDiffView";
import { WriteToolView } from "./WriteToolView";
import type { WriteToolInput } from "./WriteToolView";
import { QuestionInteraction } from "./QuestionInteraction";
import { TodoWriteToolView } from "./TodoWriteToolView";

function isEditToolInput(input: unknown): input is EditToolInput {
	if (!input || typeof input !== "object") return false;

	const record = input as Record<string, unknown>;
	return (
		typeof record.filePath === "string" &&
		typeof record.oldString === "string" &&
		typeof record.newString === "string"
	);
}

function isApplyPatchToolInput(input: unknown): input is ApplyPatchToolInput {
	if (!input || typeof input !== "object") return false;

	const record = input as Record<string, unknown>;
	return typeof record.patchText === "string";
}

function isWriteToolInput(input: unknown): input is WriteToolInput {
	if (!input || typeof input !== "object") return false;

	const record = input as Record<string, unknown>;
	return (
		typeof record.filePath === "string" && typeof record.content === "string"
	);
}

function hasRenderableApplyPatchSections(patchText: string): boolean {
	return /\*\*\* (Add|Update|Delete) File: /u.test(patchText);
}

function getReadFilePath(input: unknown, projectPath?: string): string | null {
	if (!input || typeof input !== "object") return null;
	const record = input as Record<string, unknown>;
	if (typeof record.filePath !== "string" || !record.filePath) return null;

	const filePath = record.filePath;

	if (projectPath) {
		const normalizedProject = projectPath.replace(/\/+$/, "");
		if (filePath.startsWith(normalizedProject + "/")) {
			return filePath.slice(normalizedProject.length + 1);
		}
	}

	return filePath;
}

function buildQuestionDataFromInput(input: unknown): QuestionData | null {
	if (!input || typeof input !== "object") return null;
	const rec = input as Record<string, unknown>;

	const rawQuestions = Array.isArray(rec.questions) ? rec.questions : [];
	if (rawQuestions.length === 0) return null;

	const questions: QuestionItem[] = rawQuestions
		.map((q): QuestionItem | null => {
			if (typeof q === "string" && q.trim().length > 0) {
				return {
					question: q.trim(),
					options: [
						{ label: "yes", description: "Continue execution" },
						{ label: "no", description: "Stop execution" },
					],
				};
			}

			if (!q || typeof q !== "object") return null;
			const qr = q as Record<string, unknown>;
			const question =
				typeof qr.question === "string"
					? qr.question
					: typeof qr.header === "string"
						? qr.header
						: "";
			if (!question) return null;
			const options: QuestionOption[] = Array.isArray(qr.options)
				? qr.options
						.map((o): QuestionOption | null => {
							if (!o || typeof o !== "object") return null;
							const or2 = o as Record<string, unknown>;
							const label = typeof or2.label === "string" ? or2.label : "";
							if (!label) return null;
							const description =
								typeof or2.description === "string"
									? or2.description
									: undefined;
							return description !== undefined
								? { label, description }
								: { label };
						})
						.filter((o): o is QuestionOption => o !== null)
				: [];
			const normalizedOptions =
				options.length > 0
					? options
					: [
							{ label: "yes", description: "Continue execution" },
							{ label: "no", description: "Stop execution" },
						];

			return qr.multiple === true
				? { question, options, multiple: true }
				: { question, options: normalizedOptions };
		})
		.filter((q): q is QuestionItem => q !== null);

	if (questions.length === 0) return null;

	return {
		id: "",
		sessionId: "",
		questions,
		createdAt: Date.now(),
	};
}

export function TextPart({ part }: { part: { text: string } }) {
	if (!part.text) return null;

	return (
		<LightMarkdown
			text={part.text}
			className="text-sm text-slate-300 leading-relaxed"
		/>
	);
}

export function FilePart({
	part,
}: {
	part: { url: string; mime?: string; filename?: string };
}) {
	const mime = part.mime ?? "application/octet-stream";
	const isImage = mime.startsWith("image/");
	return (
		<div className="flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-800/50 rounded-xl group hover:border-cyan-500/30 transition-all cursor-pointer">
			<div
				className={cn(
					"w-10 h-10 rounded-lg flex items-center justify-center border",
					isImage
						? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
						: "bg-slate-800 border-slate-700 text-slate-400",
				)}
			>
				{isImage ? (
					<ImageIcon className="w-5 h-5" />
				) : (
					<FileIcon className="w-5 h-5" />
				)}
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium text-slate-200 truncate">
					{part.filename || "Attached file"}
				</p>
				<p className="text-[10px] text-slate-500 uppercase">
					{mime.split("/")[1] || mime}
				</p>
			</div>
		</div>
	);
}

export function ToolPart({
	part,
	projectPath,
	pendingQuestion,
	onQuestionReply,
	onQuestionReject,
	onQuestionError,
}: {
	part: {
		tool: string;
		state?: ToolState;
		input?: unknown;
		output?: unknown;
		error?: string;
		metadata?: Record<string, unknown>;
	};
	projectPath?: string;
	pendingQuestion?: QuestionData;
	onQuestionReply?: (requestId: string, answers: string[][]) => Promise<void>;
	onQuestionReject?: (requestId: string) => Promise<void>;
	onQuestionError?: (message: string) => void;
}) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [dismissedFallbackQuestion, setDismissedFallbackQuestion] =
		useState(false);

	const isActiveQuestion =
		part.tool === "question" &&
		(part.state === "pending" || part.state === "running");

	useEffect(() => {
		if (isActiveQuestion) {
			setIsExpanded(true);
		}
	}, [isActiveQuestion]);

	const statusConfig = {
		pending: {
			icon: Circle,
			color: "text-amber-400",
			bg: "bg-amber-400/10",
			border: "border-amber-400/20",
			label: "Pending",
			animate: undefined,
		},
		running: {
			icon: Loader2,
			color: "text-blue-400",
			bg: "bg-blue-400/10",
			border: "border-blue-400/20",
			label: "Running",
			animate: "animate-spin",
		},
		completed: {
			icon: CheckCircle2,
			color: "text-emerald-400",
			bg: "bg-emerald-400/10",
			border: "border-emerald-400/20",
			label: "Completed",
			animate: undefined,
		},
		error: {
			icon: XCircle,
			color: "text-red-400",
			bg: "bg-red-400/10",
			border: "border-red-400/20",
			label: "Error",
			animate: undefined,
		},
	};

	const config = statusConfig[part.state ?? "pending"];
	const editToolInput = isEditToolInput(part.input) ? part.input : null;
	const applyPatchToolInput = isApplyPatchToolInput(part.input)
		? part.input
		: null;
	const writeToolInput = isWriteToolInput(part.input) ? part.input : null;
	const isCompletedEditTool =
		part.tool === "edit" && part.state === "completed" && editToolInput != null;
	const isCompletedApplyPatchTool =
		part.tool === "apply_patch" &&
		part.state === "completed" &&
		applyPatchToolInput != null &&
		hasRenderableApplyPatchSections(applyPatchToolInput.patchText);
	const isCompletedWriteTool =
		part.tool === "write" &&
		part.state === "completed" &&
		writeToolInput != null;
	const shouldShowCustomDiff =
		isCompletedEditTool || isCompletedApplyPatchTool || isCompletedWriteTool;

	const toolFilePath =
		part.tool === "read" || part.tool === "edit" || part.tool === "write"
			? getReadFilePath(part.input, projectPath)
			: null;

	return (
		<div
			className={cn(
				"rounded-xl border transition-all overflow-hidden",
				config.bg,
				config.border,
			)}
		>
			<button
				type="button"
				className="w-full flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors text-left"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<div className="flex items-center gap-2">
					<Wrench className={cn("w-3.5 h-3.5", config.color)} />
					<span className="text-xs font-mono font-medium text-slate-200">
						{part.tool}
					</span>
					{toolFilePath && (
						<span className="text-[10px] font-mono text-slate-400">
							{toolFilePath}
						</span>
					)}
					<config.icon
						className={cn("w-4 h-4", config.color, config.animate)}
					/>
				</div>
				{isExpanded ? (
					<ChevronDown className="w-3.5 h-3.5 text-slate-500" />
				) : (
					<ChevronRight className="w-3.5 h-3.5 text-slate-500" />
				)}
			</button>

			{isExpanded && (
				<div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
					{isCompletedEditTool && editToolInput && (
						<EditToolDiffView input={editToolInput} />
					)}
					{isCompletedApplyPatchTool && applyPatchToolInput && (
						<ApplyPatchDiffView input={applyPatchToolInput} />
					)}
					{isCompletedWriteTool && writeToolInput && (
						<WriteToolView input={writeToolInput} metadata={part.metadata} />
					)}
					{part.tool === "question" &&
						(part.state === "pending" || part.state === "running") &&
						(() => {
							const fromInput = buildQuestionDataFromInput(part.input);
							const fallbackRequestId =
								typeof (part.input as { questionId?: unknown } | null)
									?.questionId === "string"
									? ((part.input as { questionId: string }).questionId ?? "")
									: "";
							const requestId = pendingQuestion?.id ?? fallbackRequestId;
							const merged: QuestionData | null = pendingQuestion ?? fromInput;
							if (!merged || merged.questions.length === 0) return null;
							if (!pendingQuestion && dismissedFallbackQuestion) return null;

							const handleFallbackDismiss = async (): Promise<void> => {
								setDismissedFallbackQuestion(true);
							};

							const replyHandler = requestId
								? onQuestionReply
								: async () => {
										await handleFallbackDismiss();
									};
							const rejectHandler = requestId
								? onQuestionReject
								: async () => {
										await handleFallbackDismiss();
									};
							return (
								<QuestionInteraction
									question={requestId ? { ...merged, id: requestId } : merged}
									onReply={replyHandler}
									onReject={rejectHandler}
									onError={onQuestionError}
								/>
							);
						})()}
					{!shouldShowCustomDiff &&
						part.input != null &&
						part.tool !== "question" && (
							<div className="space-y-1">
								<span className="text-[10px] font-semibold text-slate-500 uppercase px-1">
									Input
								</span>
								<pre className="p-2 bg-slate-950/50 rounded-lg text-[10px] text-slate-400 font-mono overflow-x-auto custom-scrollbar">
									{typeof part.input === "string"
										? part.input
										: JSON.stringify(part.input, null, 2)}
								</pre>
							</div>
						)}
					{!shouldShowCustomDiff && part.output != null && (
						<div className="space-y-1">
							<span className="text-[10px] font-semibold text-slate-500 uppercase px-1">
								Output
							</span>
							<pre className="p-2 bg-slate-950/50 rounded-lg text-[10px] text-emerald-400/80 font-mono overflow-x-auto custom-scrollbar">
								{typeof part.output === "string"
									? part.output
									: JSON.stringify(part.output, null, 2)}
							</pre>
						</div>
					)}
					{part.error && (
						<div className="space-y-1">
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

export function ConfirmationPart({
	permission,
	onDecide,
}: {
	permission: PermissionData;
	onDecide?: (
		permissionId: string,
		response: "once" | "always" | "reject",
	) => void;
}) {
	const [responding, setResponding] = useState(false);

	const handleDecide = (response: "once" | "always" | "reject") => {
		if (responding || !onDecide) return;
		setResponding(true);
		onDecide(permission.id, response);
	};

	return (
		<div className="flex items-center gap-3 px-4 py-2 my-1 bg-amber-500/[0.06] border border-amber-500/20 rounded-xl">
			<div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/10 shrink-0">
				<HelpCircle className="w-4 h-4 text-amber-400 animate-pulse" />
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-xs font-medium text-amber-200 leading-snug truncate">
					{permission.title}
				</p>
				<p className="text-[10px] text-amber-400/60 font-mono mt-0.5">
					{permission.permissionType}
					{permission.pattern
						? ` · ${
								Array.isArray(permission.pattern)
									? permission.pattern.join(", ")
									: permission.pattern
							}`
						: ""}
				</p>
			</div>
			{onDecide ? (
				<div className="flex items-center gap-1.5 shrink-0">
					<button
						type="button"
						onClick={() => handleDecide("reject")}
						disabled={responding}
						className={cn(
							"flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
							responding
								? "bg-slate-800 text-slate-600 cursor-not-allowed"
								: "bg-transparent border border-slate-600/40 text-slate-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-300 cursor-pointer",
						)}
					>
						Deny
					</button>
					<button
						type="button"
						onClick={() => handleDecide("always")}
						disabled={responding}
						className={cn(
							"flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
							responding
								? "bg-slate-800 text-slate-600 cursor-not-allowed"
								: "bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 hover:border-blue-500/50 cursor-pointer",
						)}
					>
						Always allow
					</button>
					<button
						type="button"
						onClick={() => handleDecide("once")}
						disabled={responding}
						className={cn(
							"flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
							responding
								? "bg-slate-800 text-slate-600 cursor-not-allowed"
								: "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 hover:border-emerald-500/50 cursor-pointer",
						)}
					>
						<CheckCircle2 className="w-3 h-3" />
						Allow
					</button>
				</div>
			) : (
				<div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 shrink-0">
					<Circle className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
					<span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
						Awaiting
					</span>
				</div>
			)}
		</div>
	);
}

export function ReasoningPart({
	part,
	expanded,
}: {
	part: { text: string };
	expanded?: boolean;
}) {
	const [localExpanded, setLocalExpanded] = useState(expanded ?? false);

	useEffect(() => {
		if (expanded !== undefined) {
			setLocalExpanded(expanded);
		}
	}, [expanded]);

	const toggleExpanded = () => {
		setLocalExpanded(!localExpanded);
	};

	return (
		<div className="relative group">
			<div className="absolute inset-y-0 -left-2 w-[2px] bg-gradient-to-b from-violet-500/50 via-violet-500/20 to-transparent rounded-full" />
			<div className="space-y-2">
				<button
					type="button"
					onClick={toggleExpanded}
					className="flex items-center gap-2 text-violet-400/80 hover:text-violet-400 transition-colors px-1"
				>
					<Brain className="w-3.5 h-3.5" />
					<span className="text-[10px] font-bold uppercase tracking-wider">
						Reasoning
					</span>
					{localExpanded ? (
						<ChevronDown className="w-3 h-3" />
					) : (
						<ChevronRight className="w-3 h-3" />
					)}
				</button>
				{localExpanded && (
					<LightMarkdown
						text={part.text}
						className="text-xs text-slate-400/60 leading-relaxed font-serif italic border-l border-violet-500/10 pl-3 py-1 bg-violet-500/[0.02] rounded-r-lg"
					/>
				)}
			</div>
		</div>
	);
}

export function AgentPart({ part }: { part: { name: string } }) {
	return (
		<div className="inline-flex items-center gap-1.5 px-2 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg">
			<Bot className="w-3 h-3 text-violet-400" />
			<span className="text-[10px] font-bold text-violet-300 uppercase tracking-tight">
				{part.name}
			</span>
		</div>
	);
}

export function SubtaskPartView({
	part,
	onNavigateToSession,
}: {
	part: SubtaskPart;
	onNavigateToSession?: (sessionId: string) => void;
}) {
	const hasTarget = part.sessionID.length > 0;
	const canNavigate = hasTarget && Boolean(onNavigateToSession);

	return (
		<button
			type="button"
			disabled={!canNavigate}
			onClick={() => canNavigate && onNavigateToSession?.(part.sessionID)}
			className={cn(
				"flex items-center gap-3 w-full p-3 rounded-xl border transition-all text-left",
				canNavigate
					? "bg-cyan-500/[0.06] border-cyan-500/20 hover:bg-cyan-500/10 hover:border-cyan-500/40 cursor-pointer"
					: "bg-slate-800/30 border-slate-700/30 cursor-default",
			)}
		>
			<div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 shrink-0">
				<Bot className="w-4 h-4 text-cyan-400" />
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
						Sub-agent
					</span>
					<span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
						{part.agent}
					</span>
					{part.model && (
						<span className="text-[9px] font-mono text-slate-500">
							{part.model.modelID}
						</span>
					)}
				</div>
				<p className="text-xs text-slate-300 mt-0.5 truncate">
					{part.description || part.prompt.slice(0, 100)}
				</p>
			</div>
			{canNavigate && (
				<ChevronRight className="w-4 h-4 text-cyan-400/60 shrink-0" />
			)}
		</button>
	);
}

export function SystemNotificationPart({ part }: { part: Part }) {
	const textContent =
		"text" in part && typeof part.text === "string" ? part.text : "";

	if (!textContent.trim()) return null;

	return (
		<div className="flex items-start gap-2 px-3 py-2 bg-slate-800/30 border border-slate-700/30 rounded-lg">
			<Bell className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
			<span className="text-xs text-slate-500 leading-relaxed font-mono break-all">
				{textContent}
			</span>
		</div>
	);
}

export function MessagePartRenderer({
	part,
	projectPath,
	onNavigateToSession,
}: {
	part: Part;
	projectPath?: string;
	onNavigateToSession?: (sessionId: string) => void;
}) {
	if ("ignored" in part && part.ignored) {
		return <SystemNotificationPart part={part} />;
	}

	switch (part.type) {
		case "text":
			return <TextPart part={part} />;
		case "file":
			return <FilePart part={part} />;
		case "tool":
			if (part.tool === "todowrite") {
				return <TodoWriteToolView part={part} />;
			}
			return <ToolPart part={part} projectPath={projectPath} />;
		case "reasoning":
			return <ReasoningPart part={part} />;
		case "agent":
			return <AgentPart part={part} />;
		case "subtask":
			return (
				<SubtaskPartView
					part={part}
					onNavigateToSession={onNavigateToSession}
				/>
			);
		default:
			return null;
	}
}
