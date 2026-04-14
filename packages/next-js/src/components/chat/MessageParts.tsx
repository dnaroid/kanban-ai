import { useState, useEffect } from "react";
import {
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
	Terminal,
	XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Part, PermissionData, ToolState } from "@/types/ipc";
import { extractOpencodeStatus } from "@/lib/opencode-status";
import { LightMarkdown } from "@/components/LightMarkdown";

function StatusBadge({ status }: { status: string }) {
	const config = {
		done: {
			icon: CheckCircle2,
			color: "text-emerald-400",
			bg: "bg-emerald-400/10",
			border: "border-emerald-400/20",
			label: "DONE",
		},
		fail: {
			icon: XCircle,
			color: "text-red-400",
			bg: "bg-red-400/10",
			border: "border-red-400/20",
			label: "FAIL",
		},
		question: {
			icon: HelpCircle,
			color: "text-amber-400",
			bg: "bg-amber-400/10",
			border: "border-amber-400/20",
			label: "QUESTION",
		},
	}[status as "done" | "fail" | "question"] || {
		icon: Circle,
		color: "text-slate-400",
		bg: "bg-slate-400/10",
		border: "border-slate-400/20",
		label: status.toUpperCase(),
	};

	return (
		<div
			className={cn(
				"inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-[10px] font-bold tracking-wider",
				config.bg,
				config.border,
				config.color,
			)}
		>
			<config.icon className="w-3 h-3" />
			{config.label}
		</div>
	);
}

export function TextPart({ part }: { part: { text: string } }) {
	if (!part.text) return null;

	const extracted = extractOpencodeStatus(part.text);
	if (extracted) {
		const { status, statusLineIndex } = extracted;
		const lines = part.text.split("\n");
		const otherText = lines
			.filter((_, i) => i !== statusLineIndex)
			.join("\n")
			.trim();

		return (
			<div className="space-y-2">
				{otherText && (
					<LightMarkdown
						text={otherText}
						className="text-sm text-slate-300 leading-relaxed"
					/>
				)}
				<StatusBadge status={status} />
			</div>
		);
	}

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
}: {
	part: {
		tool: string;
		state?: ToolState;
		input?: unknown;
		output?: unknown;
		error?: string;
	};
}) {
	const [isExpanded, setIsExpanded] = useState(false);

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

	const renderQuestionContent = (input: unknown) => {
		if (!input || typeof input !== "object") return null;
		const qInput = input as Record<string, unknown>;
		const questionText =
			typeof qInput.question === "string"
				? qInput.question
				: typeof qInput.header === "string"
					? qInput.header
					: null;
		const options = Array.isArray(qInput.options)
			? qInput.options.filter(
					(o): o is { label: string; description?: string } =>
						typeof o === "object" && o !== null && "label" in o,
				)
			: null;

		return (
			<div className="space-y-2">
				{questionText && (
					<div className="flex items-start gap-2 px-1">
						<HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
						<span className="text-xs text-slate-200 leading-relaxed">
							{questionText}
						</span>
					</div>
				)}
				{options && options.length > 0 && (
					<div className="space-y-1 px-1">
						<span className="text-[10px] font-semibold text-slate-500 uppercase">
							Options
						</span>
						<div className="space-y-1">
							{options.map((opt, idx) => (
								<div
									key={`opt-${idx}-${opt.label}`}
									className="flex items-start gap-2 px-2 py-1.5 bg-slate-950/50 rounded-lg border border-slate-800/30"
								>
									<span className="text-[10px] font-mono text-amber-400/80 shrink-0 mt-0.5">
										{idx + 1}.
									</span>
									<div className="min-w-0">
										<span className="text-xs text-slate-300">{opt.label}</span>
										{opt.description && (
											<p className="text-[10px] text-slate-500 mt-0.5">
												{opt.description}
											</p>
										)}
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		);
	};

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
					<div className={cn("p-1.5 rounded-lg bg-slate-900/50", config.color)}>
						<Terminal className="w-3.5 h-3.5" />
					</div>
					<span className="text-xs font-mono font-medium text-slate-200">
						{part.tool}
					</span>
					<div
						className={cn(
							"flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
							config.color,
							"bg-slate-950/50",
						)}
					>
						<config.icon className={cn("w-2.5 h-2.5", config.animate)} />
						{config.label}
					</div>
				</div>
				{isExpanded ? (
					<ChevronDown className="w-3.5 h-3.5 text-slate-500" />
				) : (
					<ChevronRight className="w-3.5 h-3.5 text-slate-500" />
				)}
			</button>

			{isExpanded && (
				<div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
					{part.tool === "question" &&
						part.state === "pending" &&
						renderQuestionContent(part.input)}
					{part.input != null && part.tool !== "question" && (
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
					{part.output != null && (
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
}: {
	permission: PermissionData;
}) {
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
			<div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 shrink-0">
				<Circle className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
				<span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
					Awaiting
				</span>
			</div>
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

export function MessagePartRenderer({ part }: { part: Part }) {
	if ("ignored" in part && part.ignored) return null;

	switch (part.type) {
		case "text":
			return <TextPart part={part} />;
		case "file":
			return <FilePart part={part} />;
		case "tool":
			return <ToolPart part={part} />;
		case "reasoning":
			return <ReasoningPart part={part} />;
		case "agent":
			return <AgentPart part={part} />;
		default:
			return null;
	}
}
