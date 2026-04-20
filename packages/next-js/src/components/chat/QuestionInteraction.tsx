import { useState, useCallback } from "react";
import {
	HelpCircle,
	Loader2,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuestionData, QuestionItem } from "@/types/ipc";

interface QuestionAnswerState {
	selectedOptions: string[];
	customText: string;
	useCustom: boolean;
}

function createInitialAnswers(count: number): QuestionAnswerState[] {
	return Array.from({ length: count }, () => ({
		selectedOptions: [],
		customText: "",
		useCustom: false,
	}));
}

function getAnswersForQuestion(
	state: QuestionAnswerState,
	q: QuestionItem,
): string[] {
	if (state.useCustom && state.customText.trim()) {
		return q.multiple
			? [...state.selectedOptions, state.customText.trim()]
			: [state.customText.trim()];
	}
	return state.selectedOptions;
}

function isAnswered(state: QuestionAnswerState, q: QuestionItem): boolean {
	return getAnswersForQuestion(state, q).length > 0;
}

function SingleQuestionForm({
	question,
	state,
	sending,
	onChange,
}: {
	question: QuestionItem;
	state: QuestionAnswerState;
	sending: boolean;
	onChange: (
		updater: (prev: QuestionAnswerState) => QuestionAnswerState,
	) => void;
}) {
	const isMultiple = question.multiple === true;
	const options = question.options ?? [];

	const toggleOption = (label: string) => {
		onChange((prev) => {
			if (isMultiple) {
				const selected = prev.selectedOptions.includes(label)
					? prev.selectedOptions.filter((o) => o !== label)
					: [...prev.selectedOptions, label];
				return { ...prev, selectedOptions: selected };
			}
			return { ...prev, selectedOptions: [label], useCustom: false };
		});
	};

	const handleCustomToggle = () => {
		onChange((prev) => ({
			...prev,
			useCustom: !prev.useCustom,
			selectedOptions: isMultiple ? prev.selectedOptions : [],
		}));
	};

	return (
		<div className="flex flex-col gap-1.5 pl-9">
			{options.map((opt) => {
				const picked = state.selectedOptions.includes(opt.label);
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
								"w-3.5 h-3.5 shrink-0 mt-0.5 border-2 flex items-center justify-center",
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
					state.useCustom
						? "bg-amber-500/15 border-amber-500/40 text-amber-200"
						: "bg-slate-900/50 border-slate-700/40 text-slate-300 hover:border-amber-500/30 hover:bg-amber-500/5",
					sending && "opacity-50 cursor-not-allowed",
				)}
			>
				<span
					className={cn(
						"w-3.5 h-3.5 shrink-0 mt-0.5 border-2 flex items-center justify-center",
						isMultiple ? "rounded" : "rounded-full",
						state.useCustom
							? "border-amber-400 bg-amber-400"
							: "border-slate-500",
					)}
				>
					{state.useCustom && !isMultiple && (
						<span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
					)}
					{state.useCustom && isMultiple && (
						<CheckCircle2 className="w-2.5 h-2.5 text-slate-900" />
					)}
				</span>
				<div className="flex-1 min-w-0">
					<span className="text-xs font-medium">Type your own answer</span>
					{state.useCustom && (
						<textarea
							className="mt-1.5 w-full bg-slate-950/50 border border-slate-700/50 rounded-lg px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none focus:border-amber-500/50 custom-scrollbar"
							placeholder="Enter your answer..."
							value={state.customText}
							rows={2}
							disabled={sending}
							onClick={(e) => e.stopPropagation()}
							onChange={(e) =>
								onChange((prev) => ({ ...prev, customText: e.target.value }))
							}
						/>
					)}
				</div>
			</button>
		</div>
	);
}

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
	const questions = question.questions;
	const totalQuestions = questions.length;
	const isSingleMode = totalQuestions === 1 && questions[0].multiple !== true;

	const [answerStates, setAnswerStates] = useState<QuestionAnswerState[]>(() =>
		createInitialAnswers(totalQuestions),
	);
	const [sending, setSending] = useState(false);

	const [currentTab, setCurrentTab] = useState(0);
	const reviewTabIndex = totalQuestions;
	const isReviewTab = !isSingleMode && currentTab === reviewTabIndex;

	const updateAnswer = useCallback(
		(
			index: number,
			updater: (prev: QuestionAnswerState) => QuestionAnswerState,
		) => {
			setAnswerStates((prev) => {
				const next = [...prev];
				next[index] = updater(next[index]);
				return next;
			});
		},
		[],
	);

	const buildAnswers = (): string[][] =>
		questions.map((q, i) => getAnswersForQuestion(answerStates[i], q));

	const handleSubmit = async () => {
		if (sending || !onReply) return;
		setSending(true);
		try {
			await onReply(question.id, buildAnswers());
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

	if (totalQuestions === 0) return null;

	if (isSingleMode) {
		const q = questions[0];
		const state = answerStates[0];
		const hasAnswer = isAnswered(state, q);

		return (
			<div className="flex flex-col gap-3 px-4 py-3 my-1 bg-amber-500/[0.06] border border-amber-500/20 rounded-xl">
				<div className="flex items-start gap-2">
					<div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/10 shrink-0 mt-0.5">
						<HelpCircle className="w-4 h-4 text-amber-400 animate-pulse" />
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-xs font-medium text-amber-200 leading-snug">
							{q.question}
						</p>
						<p className="text-[10px] text-amber-400/60 font-mono mt-0.5">
							{q.multiple ? "Select one or more options" : "Select an option"}
						</p>
					</div>
				</div>

				<SingleQuestionForm
					question={q}
					state={state}
					sending={sending}
					onChange={(updater) => updateAnswer(0, updater)}
				/>

				<div className="flex items-center gap-1.5 justify-end pl-9">
					<button
						type="button"
						onClick={() => void handleDismiss()}
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

	const currentQuestion = questions[currentTab] ?? null;
	const currentAnswerState = answerStates[currentTab] ?? null;

	return (
		<div className="flex flex-col gap-3 px-4 py-3 my-1 bg-amber-500/[0.06] border border-amber-500/20 rounded-xl">
			<div className="flex items-start gap-2">
				<div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/10 shrink-0 mt-0.5">
					<HelpCircle className="w-4 h-4 text-amber-400 animate-pulse" />
				</div>
				<div className="flex-1 min-w-0">
					<p className="text-xs font-medium text-amber-200 leading-snug">
						{isReviewTab ? "Review your answers" : currentQuestion?.question}
					</p>
					{!isReviewTab && currentQuestion && (
						<p className="text-[10px] text-amber-400/60 font-mono mt-0.5">
							{currentQuestion.multiple
								? "Select one or more options"
								: "Select an option"}
						</p>
					)}
				</div>
			</div>

			<div className="flex items-center gap-1 pl-9 overflow-x-auto custom-scrollbar">
				{questions.map((q, i) => {
					const isActive = i === currentTab;
					const answered = isAnswered(answerStates[i], q);
					const shortLabel =
						q.question.length > 20 ? q.question.slice(0, 18) + "…" : q.question;
					return (
						<button
							key={`tab-${i}-${shortLabel}`}
							type="button"
							onClick={() => setCurrentTab(i)}
							className={cn(
								"flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 cursor-pointer",
								isActive
									? "bg-amber-500/20 border border-amber-500/40 text-amber-200"
									: answered
										? "bg-slate-800/50 border border-slate-700/40 text-slate-300 hover:border-amber-500/30"
										: "bg-slate-800/50 border border-slate-700/30 text-slate-500 hover:border-amber-500/30",
							)}
						>
							{answered && !isActive && (
								<CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
							)}
							<span className="truncate max-w-28">{shortLabel}</span>
						</button>
					);
				})}
				<button
					type="button"
					onClick={() => setCurrentTab(reviewTabIndex)}
					className={cn(
						"flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 cursor-pointer",
						isReviewTab
							? "bg-amber-500/20 border border-amber-500/40 text-amber-200"
							: "bg-slate-800/50 border border-slate-700/30 text-slate-500 hover:border-amber-500/30",
					)}
				>
					Review
				</button>
			</div>

			{isReviewTab ? (
				<div className="flex flex-col gap-2 pl-9">
					{questions.map((q, i) => {
						const answers = getAnswersForQuestion(answerStates[i], q);
						const answered = answers.length > 0;
						return (
							<div
								key={`review-${i}-${q.question.slice(0, 16)}`}
								className="flex items-start gap-2 px-3 py-2 rounded-lg border bg-slate-900/50 border-slate-700/40"
							>
								{answered ? (
									<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
								) : (
									<AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
								)}
								<div className="min-w-0 flex-1">
									<p className="text-xs font-medium text-slate-300 leading-snug">
										{q.question}
									</p>
									<p
										className={cn(
											"text-[10px] font-mono mt-0.5",
											answered ? "text-emerald-400/70" : "text-amber-400/60",
										)}
									>
										{answered ? answers.join(", ") : "(not answered)"}
									</p>
								</div>
								{!answered && (
									<button
										type="button"
										onClick={() => setCurrentTab(i)}
										className="shrink-0 text-[10px] font-bold text-amber-300 hover:text-amber-200 cursor-pointer"
									>
										Answer →
									</button>
								)}
							</div>
						);
					})}
				</div>
			) : (
				currentQuestion &&
				currentAnswerState && (
					<SingleQuestionForm
						question={currentQuestion}
						state={currentAnswerState}
						sending={sending}
						onChange={(updater) => updateAnswer(currentTab, updater)}
					/>
				)
			)}

			<div className="flex items-center gap-1.5 justify-between pl-9">
				<div className="flex items-center gap-1">
					{!isReviewTab && (
						<button
							type="button"
							onClick={() =>
								setCurrentTab((t) => Math.min(t + 1, reviewTabIndex))
							}
							disabled={sending}
							className={cn(
								"flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all cursor-pointer",
								"bg-transparent border border-slate-600/40 text-slate-400 hover:border-amber-500/30 hover:text-amber-300",
								sending && "opacity-50 cursor-not-allowed",
							)}
						>
							Next
							<ChevronRight className="w-3 h-3" />
						</button>
					)}
					{isReviewTab && (
						<button
							type="button"
							onClick={() => setCurrentTab((t) => Math.max(0, t - 1))}
							disabled={sending}
							className={cn(
								"flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all cursor-pointer",
								"bg-transparent border border-slate-600/40 text-slate-400 hover:border-amber-500/30 hover:text-amber-300",
								sending && "opacity-50 cursor-not-allowed",
							)}
						>
							<ChevronLeft className="w-3 h-3" />
							Back
						</button>
					)}
				</div>

				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={() => void handleDismiss()}
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
					{isReviewTab && (
						<button
							type="button"
							onClick={() => void handleSubmit()}
							disabled={sending || !onReply}
							className={cn(
								"flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all",
								sending || !onReply
									? "bg-slate-800 text-slate-600 cursor-not-allowed"
									: "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 hover:border-emerald-500/50 cursor-pointer",
							)}
						>
							{sending ? (
								<Loader2 className="w-3 h-3 animate-spin" />
							) : (
								<CheckCircle2 className="w-3 h-3" />
							)}
							Submit All
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
