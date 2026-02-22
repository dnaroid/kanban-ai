"use client";

import { useEffect, useRef, useState } from "react";
import {
	useSortable,
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDndContext } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
	AlertCircle,
	Loader2,
	Mic,
	MicOff,
	Plus,
	Sparkles,
	X,
} from "lucide-react";
import type { KanbanTask, Tag } from "@/types/kanban";
import { cn } from "@/lib/utils";
import { SortableTask } from "./SortableTask";

type SpeechRecognitionResultLike = {
	isFinal: boolean;
	0: {
		transcript: string;
	};
};

type SpeechRecognitionResultListLike = {
	length: number;
	[index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = Event & {
	resultIndex: number;
	results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = Event & {
	error?: string;
};

type BrowserSpeechRecognition = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	onresult: ((event: SpeechRecognitionEventLike) => void) | null;
	onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
	onend: (() => void) | null;
	start: () => void;
	stop: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

export interface SortableColumnProps {
	id: string;
	name: string;
	color: string;
	tasks: KanbanTask[];
	globalTags: Tag[];
	onAddTask: () => void;
	onQuickGenerateStory?: (columnId: string, prompt: string) => Promise<void>;
	onDeleteTask: (id: string) => void;
	onTaskClick?: (task: KanbanTask) => void;
}

export function SortableColumn({
	id,
	name,
	color,
	tasks,
	globalTags,
	onAddTask,
	onQuickGenerateStory,
	onDeleteTask,
	onTaskClick,
}: SortableColumnProps) {
	const { active, over } = useDndContext();
	const isDraggingAnyTask = active?.data.current?.type === "task";

	// Determine if a task is being dragged over this specific column
	const isTaskOverThisColumn =
		isDraggingAnyTask &&
		(over?.id === id ||
			over?.data.current?.task?.columnId === id ||
			(over?.data.current?.type === "column" && over.id === id));

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
		isOver: isColumnOver,
	} = useSortable({
		id: id,
		data: {
			type: "column",
		},
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const isEmpty = tasks.length === 0;
	const isOver = isColumnOver || isTaskOverThisColumn;
	const isCurrentlyExpanded = !isEmpty || isOver;

	const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
	const [prompt, setPrompt] = useState("");
	const [liveTranscript, setLiveTranscript] = useState("");
	const [isListening, setIsListening] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [quickCreateError, setQuickCreateError] = useState<string | null>(null);
	const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

	const stopDictation = () => {
		recognitionRef.current?.stop();
		recognitionRef.current = null;
		setIsListening(false);
		setLiveTranscript("");
	};

	useEffect(() => {
		return () => {
			stopDictation();
		};
	}, []);

	const handleToggleDictation = () => {
		setQuickCreateError(null);

		if (isListening) {
			stopDictation();
			return;
		}

		if (typeof window === "undefined") {
			setQuickCreateError("Speech input is not available.");
			return;
		}

		const speechWindow = window as Window & {
			SpeechRecognition?: BrowserSpeechRecognitionCtor;
			webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
		};

		const RecognitionCtor =
			speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

		if (!RecognitionCtor) {
			setQuickCreateError("STT is not supported in this browser.");
			return;
		}

		const recognition = new RecognitionCtor();
		recognition.lang = navigator.language || "en-US";
		recognition.continuous = true;
		recognition.interimResults = true;

		recognition.onresult = (event) => {
			let interimText = "";
			const finalized: string[] = [];

			for (
				let index = event.resultIndex;
				index < event.results.length;
				index += 1
			) {
				const result = event.results[index];
				const transcript = result?.[0]?.transcript?.trim() ?? "";

				if (!transcript) {
					continue;
				}

				if (result.isFinal) {
					finalized.push(transcript);
				} else {
					interimText += `${transcript} `;
				}
			}

			if (finalized.length > 0) {
				setPrompt((prev) => {
					const nextChunk = finalized.join(" ");
					if (!prev.trim()) {
						return nextChunk;
					}
					return `${prev.trim()} ${nextChunk}`;
				});
			}

			setLiveTranscript(interimText.trim());
		};

		recognition.onerror = (event) => {
			setQuickCreateError(
				event.error
					? `Speech recognition error: ${event.error}`
					: "Speech recognition failed.",
			);
			setIsListening(false);
			setLiveTranscript("");
		};

		recognition.onend = () => {
			setIsListening(false);
			setLiveTranscript("");
		};

		try {
			recognition.start();
			recognitionRef.current = recognition;
			setIsListening(true);
		} catch {
			setQuickCreateError("Unable to start microphone.");
			setIsListening(false);
			setLiveTranscript("");
		}
	};

	const handleGenerateStory = async () => {
		if (!onQuickGenerateStory || isGenerating) {
			return;
		}

		const fullPrompt = `${prompt.trim()} ${liveTranscript.trim()}`.trim();
		if (!fullPrompt) {
			setQuickCreateError("Enter or dictate task details first.");
			return;
		}

		setQuickCreateError(null);
		setIsGenerating(true);

		try {
			await onQuickGenerateStory(id, fullPrompt);
			setPrompt("");
			setLiveTranscript("");
			setIsQuickCreateOpen(false);
			stopDictation();
		} catch (error) {
			setQuickCreateError(
				error instanceof Error
					? error.message
					: "Failed to create and generate story.",
			);
		} finally {
			setIsGenerating(false);
		}
	};

	return (
		<div
			ref={setNodeRef}
			style={{
				...style,
				borderColor: color ? `${color}40` : undefined,
				boxShadow: color ? `0 0 25px -10px ${color}20` : undefined,
				backgroundColor: color
					? `color-mix(in srgb, ${color} 3%, #0B0E14)`
					: "#0B0E14",
			}}
			className={cn(
				"flex-shrink-0 rounded-2xl border flex flex-col h-full transition-all duration-300 group/column relative",
				isEmpty
					? isOver
						? "w-80"
						: isDraggingAnyTask
							? "w-24 bg-blue-500/5 border-blue-500/20"
							: "w-14 hover:w-80"
					: "w-80",
				!color && "border-slate-800/50",
				isDragging && "opacity-50",
				isOver && "border-blue-500/50 ring-2 ring-blue-500/10",
			)}
		>
			<div
				{...attributes}
				{...listeners}
				className="p-4 border-b border-slate-800/50 cursor-grab active:cursor-grabbing select-none"
				title={isEmpty && !isOver ? name : undefined}
			>
				<div className="flex items-center justify-between relative min-h-[32px]">
					<div
						className={cn(
							"flex items-center gap-2 flex-1 min-w-0 transition-opacity duration-300",
							isEmpty &&
								!isOver &&
								!isDraggingAnyTask &&
								"opacity-0 group-hover/column:opacity-100",
						)}
					>
						<span className="text-sm font-bold text-slate-200 truncate px-1">
							{name}
						</span>
						<span className="text-xs text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-full shrink-0">
							{tasks.length}
						</span>
					</div>

					{isEmpty && !isOver && !isDraggingAnyTask && (
						<div className="absolute inset-0 flex items-center justify-center group-hover/column:hidden pointer-events-none">
							<span className="text-lg font-black text-slate-500/50 uppercase">
								{name.charAt(0)}
							</span>
						</div>
					)}

					<div
						className={cn(
							"flex items-center gap-1 shrink-0 transition-all duration-300",
							isEmpty
								? isOver || isDraggingAnyTask
									? "ml-2"
									: "opacity-0 group-hover/column:opacity-100 group-hover/column:ml-2"
								: "ml-2",
						)}
					>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setIsQuickCreateOpen((prev) => !prev);
								setQuickCreateError(null);
								if (isListening) {
									stopDictation();
								}
							}}
							className={cn(
								"text-slate-600 hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors p-1 rounded-md",
								isQuickCreateOpen && "text-emerald-400 bg-emerald-400/10",
							)}
							title="Quick Create Story"
						>
							<Sparkles className="w-4 h-4" />
						</button>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onAddTask();
							}}
							className="text-slate-600 hover:text-blue-400 hover:bg-blue-400/10 transition-colors p-1"
							title="Add Task"
						>
							<Plus className="w-5 h-5" />
						</button>
					</div>
				</div>
			</div>

			{isQuickCreateOpen && (
				<div className="px-4 pb-4 border-b border-slate-800/50 space-y-2">
					<div className="rounded-xl border border-slate-700/70 bg-slate-900/60 p-2">
						<textarea
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							placeholder="Type or dictate what should be done..."
							rows={2}
							disabled={isGenerating}
							className="w-full resize-none bg-transparent text-xs text-slate-200 placeholder:text-slate-500 outline-none"
						/>

						{liveTranscript && (
							<p className="text-[11px] text-emerald-300/90 italic mt-1">
								{liveTranscript}
							</p>
						)}
					</div>

					<div className="flex items-center justify-between gap-2">
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={handleToggleDictation}
								disabled={isGenerating}
								className={cn(
									"w-8 h-8 rounded-lg border transition-colors flex items-center justify-center",
									isListening
										? "text-red-300 border-red-500/40 bg-red-500/10 hover:bg-red-500/20"
										: "text-slate-300 border-slate-700/80 bg-slate-800/60 hover:bg-slate-700/60",
								)}
								title={isListening ? "Stop dictation" : "Start dictation"}
							>
								{isListening ? (
									<MicOff className="w-4 h-4" />
								) : (
									<Mic className="w-4 h-4" />
								)}
							</button>

							<button
								type="button"
								onClick={() => {
									setPrompt("");
									setLiveTranscript("");
									setQuickCreateError(null);
									if (isListening) {
										stopDictation();
									}
								}}
								disabled={isGenerating}
								className="w-8 h-8 rounded-lg border border-slate-700/80 bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 flex items-center justify-center transition-colors"
								title="Clear"
							>
								<X className="w-4 h-4" />
							</button>
						</div>

						<button
							type="button"
							onClick={() => {
								void handleGenerateStory();
							}}
							disabled={isGenerating}
							className={cn(
								"inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors border",
								isGenerating
									? "cursor-not-allowed bg-emerald-500/10 text-emerald-300/80 border-emerald-500/30"
									: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25",
							)}
						>
							{isGenerating ? (
								<Loader2 className="w-3.5 h-3.5 animate-spin" />
							) : (
								<Sparkles className="w-3.5 h-3.5" />
							)}
							Generate Story
						</button>
					</div>

					{quickCreateError && (
						<p className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1">
							{quickCreateError}
						</p>
					)}
				</div>
			)}

			<div
				className={cn(
					"flex-1 overflow-y-auto custom-scrollbar p-3 transition-opacity duration-300",
					isEmpty &&
						!isOver &&
						"opacity-0 group-hover/column:opacity-100",
				)}
			>
				<SortableContext
					items={tasks.map((t) => t.id)}
					strategy={verticalListSortingStrategy}
				>
					{tasks.length === 0 ? (
						<div className="text-center py-12 text-slate-600">
							<div className="w-10 h-10 bg-slate-800/50 rounded-xl flex items-center justify-center mx-auto mb-3">
								<AlertCircle className="w-5 h-5" />
							</div>
							<p className="text-sm">No tasks yet</p>
							<p className="text-xs mt-1">Click + to add a task</p>
						</div>
					) : (
						tasks.map((task) => (
							<SortableTask
								key={task.id}
								task={task}
								globalTags={globalTags}
								onDelete={onDeleteTask}
								onClick={onTaskClick}
							/>
						))
					)}
				</SortableContext>
			</div>
		</div>
	);
}
