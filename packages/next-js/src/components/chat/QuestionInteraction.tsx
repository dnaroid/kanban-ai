import { useState } from "react";
import { HelpCircle, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuestionData } from "@/types/ipc";

export function QuestionInteraction({
	question,
	onReply,
	onReject,
	onError,
}: {
	question: QuestionData;
	onReply?: (requestId: string, answers: string[][]) => Promise<void>;
	onReject?: (requestId: string) => Promise<void>;
	onError?: (message: string) => void;
}) {
	const firstQuestion = question.questions[0];
	const isMultiple = firstQuestion?.multiple === true;
	const options = firstQuestion?.options ?? [];

	const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
	const [customText, setCustomText] = useState("");
	const [useCustom, setUseCustom] = useState(false);
	const [sending, setSending] = useState(false);

	const toggleOption = (label: string) => {
		if (isMultiple) {
			setSelectedOptions((prev) =>
				prev.includes(label)
					? prev.filter((o) => o !== label)
					: [...prev, label],
			);
		} else {
			setSelectedOptions([label]);
			setUseCustom(false);
		}
	};

	const handleCustomToggle = () => {
		setUseCustom((prev) => !prev);
		if (!isMultiple) {
			setSelectedOptions([]);
		}
	};

	const getAnswers = (): string[] => {
		if (useCustom && customText.trim()) {
			return isMultiple
				? [...selectedOptions, customText.trim()]
				: [customText.trim()];
		}
		return selectedOptions;
	};

	const hasAnswer =
		selectedOptions.length > 0 || (useCustom && customText.trim().length > 0);

	const handleSubmit = async () => {
		if (sending || !onReply) return;
		setSending(true);
		try {
			await onReply(question.id, [getAnswers()]);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to send answer";
			onError?.(message);
			setSending(false);
		}
	};

	const handleDismiss = async () => {
		if (sending || !onReject) return;
		setSending(true);
		try {
			await onReject(question.id);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to dismiss question";
			onError?.(message);
			setSending(false);
		}
	};

	if (!firstQuestion) return null;

	return (
		<div className="flex flex-col gap-3 px-4 py-3 my-1 bg-amber-500/[0.06] border border-amber-500/20 rounded-xl">
			<div className="flex items-start gap-2">
				<div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/10 shrink-0 mt-0.5">
					<HelpCircle className="w-4 h-4 text-amber-400 animate-pulse" />
				</div>
				<div className="flex-1 min-w-0">
					<p className="text-xs font-medium text-amber-200 leading-snug">
						{firstQuestion.question}
					</p>
					<p className="text-[10px] text-amber-400/60 font-mono mt-0.5">
						{isMultiple ? "Select one or more options" : "Select an option"}
					</p>
				</div>
			</div>

			<div className="flex flex-col gap-1.5 pl-9">
				{options.map((opt) => {
					const picked = selectedOptions.includes(opt.label);
					return (
						<button
							key={opt.label}
							type="button"
							disabled={sending}
							onClick={() => toggleOption(opt.label)}
							className={cn(
								"flex items-start gap-2 px-3 py-2 rounded-lg border text-left transition-all cursor-pointer",
								picked
									? "bg-amber-500/15 border-amber-500/40 text-amber-200"
									: "bg-slate-900/50 border-slate-700/40 text-slate-300 hover:border-amber-500/30 hover:bg-amber-500/5",
								sending && "opacity-50 cursor-not-allowed",
							)}
						>
							<span
								className={cn(
									"w-3.5 h-3.5 shrink-0 mt-0.5 rounded-full border-2 flex items-center justify-center",
									isMultiple ? "rounded" : "rounded-full",
									picked ? "border-amber-400 bg-amber-400" : "border-slate-500",
								)}
							>
								{picked && !isMultiple && (
									<span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
								)}
								{picked && isMultiple && (
									<CheckCircle2 className="w-2.5 h-2.5 text-slate-900" />
								)}
							</span>
							<div className="min-w-0">
								<span className="text-xs font-medium">{opt.label}</span>
								{opt.description && (
									<p className="text-[10px] text-slate-500 mt-0.5">
										{opt.description}
									</p>
								)}
							</div>
						</button>
					);
				})}

				<button
					type="button"
					disabled={sending}
					onClick={handleCustomToggle}
					className={cn(
						"flex items-start gap-2 px-3 py-2 rounded-lg border text-left transition-all cursor-pointer",
						useCustom
							? "bg-amber-500/15 border-amber-500/40 text-amber-200"
							: "bg-slate-900/50 border-slate-700/40 text-slate-300 hover:border-amber-500/30 hover:bg-amber-500/5",
						sending && "opacity-50 cursor-not-allowed",
					)}
				>
					<span
						className={cn(
							"w-3.5 h-3.5 shrink-0 mt-0.5 border-2 flex items-center justify-center",
							isMultiple ? "rounded" : "rounded-full",
							useCustom ? "border-amber-400 bg-amber-400" : "border-slate-500",
						)}
					>
						{useCustom && !isMultiple && (
							<span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
						)}
						{useCustom && isMultiple && (
							<CheckCircle2 className="w-2.5 h-2.5 text-slate-900" />
						)}
					</span>
					<div className="flex-1 min-w-0">
						<span className="text-xs font-medium">Type your own answer</span>
						{useCustom && (
							<textarea
								className="mt-1.5 w-full bg-slate-950/50 border border-slate-700/50 rounded-lg px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none focus:border-amber-500/50 custom-scrollbar"
								placeholder="Enter your answer..."
								value={customText}
								rows={2}
								disabled={sending}
								onClick={(e) => e.stopPropagation()}
								onChange={(e) => setCustomText(e.target.value)}
							/>
						)}
					</div>
				</button>
			</div>

			<div className="flex items-center gap-1.5 justify-end pl-9">
				<button
					type="button"
					onClick={handleDismiss}
					disabled={sending || !onReject}
					className={cn(
						"flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
						sending || !onReject
							? "bg-slate-800 text-slate-600 cursor-not-allowed"
							: "bg-transparent border border-slate-600/40 text-slate-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-300 cursor-pointer",
					)}
				>
					Dismiss
				</button>
				<button
					type="button"
					onClick={() => void handleSubmit()}
					disabled={sending || !onReply || !hasAnswer}
					className={cn(
						"flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
						sending || !onReply || !hasAnswer
							? "bg-slate-800 text-slate-600 cursor-not-allowed"
							: "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 hover:border-emerald-500/50 cursor-pointer",
					)}
				>
					{sending ? (
						<Loader2 className="w-3 h-3 animate-spin" />
					) : (
						<CheckCircle2 className="w-3 h-3" />
					)}
					Submit
				</button>
			</div>
		</div>
	);
}
