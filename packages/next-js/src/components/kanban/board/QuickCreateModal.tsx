"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	FileText,
	FolderOpen,
	Loader2,
	Mic,
	MicOff,
	Play,
	Sparkles,
	X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/common/Modal";
import { ModelPicker } from "@/components/common/ModelPicker";
import { FileSystemPicker } from "@/components/common/FileSystemPicker";
import { api } from "@/lib/api-client";
import type { OpencodeModel } from "@/types/kanban";

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

interface QuickCreateModalProps {
	projectId: string;
	isOpen: boolean;
	onClose: () => void;
	onGenerateStory: (prompt: string, selectedFiles: string[]) => Promise<void>;
	onRunRawStory: (
		prompt: string,
		modelName: string | null,
		selectedFiles: string[],
	) => Promise<void>;
}

export function QuickCreateModal({
	projectId,
	isOpen,
	onClose,
	onGenerateStory,
	onRunRawStory,
}: QuickCreateModalProps) {
	const [prompt, setPrompt] = useState("");
	const [liveTranscript, setLiveTranscript] = useState("");
	const [isListening, setIsListening] = useState(false);
	const [submittingAction, setSubmittingAction] = useState<
		"generate" | "runRaw" | null
	>(null);
	const [models, setModels] = useState<OpencodeModel[]>([]);
	const [selectedModel, setSelectedModel] = useState<string | null>(null);
	const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
	const [projectPath, setProjectPath] = useState<string | undefined>(undefined);
	const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

	const stopDictation = useCallback(() => {
		recognitionRef.current?.stop();
		recognitionRef.current = null;
		setIsListening(false);
		setLiveTranscript("");
	}, []);

	useEffect(() => {
		if (!isOpen) {
			stopDictation();
			setPrompt("");
			setLiveTranscript("");
			setSelectedModel(null);
			setSelectedFiles([]);
			setProjectPath(undefined);
			setIsFilePickerOpen(false);
			setError(null);
		}
	}, [isOpen, stopDictation]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		let isCancelled = false;

		const loadProjectPath = async () => {
			try {
				const project = await api.getProject(projectId);
				if (!isCancelled) {
					setProjectPath(project?.path || undefined);
				}
			} catch (projectError) {
				if (!isCancelled) {
					setProjectPath(undefined);
				}
				console.error("Failed to load project path:", projectError);
			}
		};

		void loadProjectPath();

		return () => {
			isCancelled = true;
		};
	}, [isOpen, projectId]);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		let isCancelled = false;
		const loadEnabledModels = async () => {
			try {
				const response = await api.opencode.listEnabledModels();
				const difficultyOrder = { easy: 0, medium: 1, hard: 2, epic: 3 };
				const sortedModels = [...response.models].sort((a, b) => {
					return (
						difficultyOrder[a.difficulty as keyof typeof difficultyOrder] -
						difficultyOrder[b.difficulty as keyof typeof difficultyOrder]
					);
				});

				if (!isCancelled) {
					setModels(sortedModels);
				}
			} catch (loadError) {
				console.error("Failed to load models:", loadError);
			}
		};

		void loadEnabledModels();

		return () => {
			isCancelled = true;
		};
	}, [isOpen]);

	useEffect(() => {
		return () => {
			stopDictation();
		};
	}, [stopDictation]);

	const handleToggleDictation = () => {
		setError(null);

		if (isListening) {
			stopDictation();
			return;
		}

		if (typeof window === "undefined") {
			setError("Speech input is not available.");
			return;
		}

		const speechWindow = window as Window & {
			SpeechRecognition?: BrowserSpeechRecognitionCtor;
			webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
		};

		const RecognitionCtor =
			speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

		if (!RecognitionCtor) {
			setError("STT is not supported in this browser.");
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
			setError(
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
			setError("Unable to start microphone.");
			setIsListening(false);
			setLiveTranscript("");
		}
	};

	const handleGenerateStory = async () => {
		const fullPrompt = `${prompt.trim()} ${liveTranscript.trim()}`.trim();
		if (!fullPrompt) {
			setError("Enter or dictate task details first.");
			return;
		}

		setError(null);
		setSubmittingAction("generate");

		try {
			await onGenerateStory(fullPrompt, selectedFiles);
			onClose();
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Failed to create and generate story.",
			);
		} finally {
			setSubmittingAction(null);
		}
	};

	const handleRunRawStory = async () => {
		const fullPrompt = `${prompt.trim()} ${liveTranscript.trim()}`.trim();
		if (!fullPrompt) {
			setError("Enter or dictate task details first.");
			return;
		}

		setError(null);
		setSubmittingAction("runRaw");

		try {
			await onRunRawStory(fullPrompt, selectedModel, selectedFiles);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to run raw story.");
		} finally {
			setSubmittingAction(null);
		}
	};

	const handleFilesSelect = (paths: string[]) => {
		setIsFilePickerOpen(false);
		setSelectedFiles(paths);
	};

	const isSubmitting = submittingAction !== null;

	if (!isOpen) return null;

	return (
		<Modal
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			size="md"
			className="max-w-xl"
			title={
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
						<Play className="w-6 h-6 text-emerald-400 fill-current" />
					</div>
					<div>
						<h3 className="text-lg font-bold text-white">Quick Create Story</h3>
						<p className="text-xs text-slate-500 font-medium">
							Generate a story or run raw story immediately
						</p>
					</div>
				</div>
			}
			footer={
				<div className="flex items-center gap-4">
					<button
						type="button"
						onClick={onClose}
						disabled={isSubmitting}
						className="px-6 py-2.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleRunRawStory}
						disabled={isSubmitting}
						className={cn(
							"inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-bold transition-all border shadow-lg",
							isSubmitting
								? "cursor-not-allowed bg-blue-500/10 text-blue-300/80 border-blue-500/30"
								: "bg-blue-600 text-white border-blue-500 hover:bg-blue-500 hover:scale-[1.02] active:scale-[0.98] shadow-blue-500/20",
						)}
					>
						{submittingAction === "runRaw" ? (
							<>
								<Loader2 className="w-4 h-4 animate-spin" />
								Running Raw Story...
							</>
						) : (
							<>
								<Play className="w-4 h-4 fill-current" />
								Run Raw Story
							</>
						)}
					</button>
					<button
						type="button"
						onClick={handleGenerateStory}
						disabled={isSubmitting}
						className={cn(
							"inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-bold transition-all border shadow-lg",
							isSubmitting
								? "cursor-not-allowed bg-emerald-500/10 text-emerald-300/80 border-emerald-500/30"
								: "bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500 hover:scale-[1.02] active:scale-[0.98] shadow-emerald-500/20",
						)}
					>
						{submittingAction === "generate" ? (
							<>
								<Loader2 className="w-4 h-4 animate-spin" />
								Generating Story...
							</>
						) : (
							<>
								<Sparkles className="w-4 h-4" />
								Generate Story
							</>
						)}
					</button>
				</div>
			}
		>
			<div className="space-y-6">
				<div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 space-y-3">
					<div className="flex items-center justify-between gap-3">
						<p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
							Context Files
						</p>
						<button
							type="button"
							onClick={() => setIsFilePickerOpen(true)}
							disabled={isSubmitting}
							className="inline-flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700/70 disabled:cursor-not-allowed disabled:opacity-60"
							aria-label="Select context files"
						>
							<FolderOpen className="w-4 h-4" />
							Select Files
						</button>
					</div>
					{selectedFiles.length > 0 ? (
						<ul
							className="space-y-1.5 max-h-28 overflow-y-auto pr-1"
							aria-live="polite"
						>
							{selectedFiles.map((filePath) => {
								const normalized = filePath.replace(/\\/g, "/");
								const fileName = normalized.split("/").pop() || filePath;
								return (
									<li
										key={filePath}
										className="flex items-center gap-2 rounded-lg bg-slate-800/70 px-2.5 py-1.5"
									>
										<FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
										<span
											className="truncate text-xs text-slate-200"
											title={filePath}
										>
											{fileName}
										</span>
									</li>
								);
							})}
						</ul>
					) : (
						<p className="text-xs text-slate-500">
							No files selected. Add files to give the model repository context.
						</p>
					)}
				</div>

				<div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4">
					<p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
						Model / Variant
					</p>
					<ModelPicker
						value={selectedModel}
						models={models}
						onChange={setSelectedModel}
						allowAuto
						showVariantSelector
					/>
				</div>

				<div className="relative rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all">
					<textarea
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder="Type or dictate story details here..."
						rows={4}
						disabled={isSubmitting}
						className="w-full resize-none bg-transparent border-none text-slate-200 placeholder:text-slate-500 outline-none focus:ring-0 text-base leading-relaxed p-0"
					/>

					{liveTranscript && (
						<div className="mt-4 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
							<p className="text-sm text-emerald-300/90 italic">
								{liveTranscript}
							</p>
						</div>
					)}
				</div>

				<div className="flex items-center gap-3">
					<button
						type="button"
						onClick={handleToggleDictation}
						disabled={isSubmitting}
						className={cn(
							"w-12 h-12 rounded-2xl border transition-all flex items-center justify-center",
							isListening
								? "text-red-300 border-red-500/40 bg-red-500/10 hover:bg-red-500/20 shadow-lg shadow-red-500/10"
								: "text-slate-300 border-slate-700/80 bg-slate-800/60 hover:bg-slate-700/60",
						)}
						title={isListening ? "Stop dictation" : "Start dictation"}
					>
						{isListening ? (
							<MicOff className="w-6 h-6" />
						) : (
							<Mic className="w-6 h-6" />
						)}
					</button>

					<button
						type="button"
						onClick={() => {
							setPrompt("");
							setLiveTranscript("");
							setSelectedFiles([]);
							setError(null);
							if (isListening) stopDictation();
						}}
						disabled={isSubmitting}
						className="w-12 h-12 rounded-2xl border border-slate-700/80 bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 flex items-center justify-center transition-all"
						title="Clear"
					>
						<X className="w-6 h-6" />
					</button>
				</div>

				{error && (
					<p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 animate-in slide-in-from-top-2">
						{error}
					</p>
				)}

				<FileSystemPicker
					isOpen={isFilePickerOpen}
					mode="files"
					initialPath={projectPath}
					title="Select Files for Story Context"
					selectLabel="Attach Files"
					onSelect={handleFilesSelect}
					onClose={() => setIsFilePickerOpen(false)}
				/>
			</div>
		</Modal>
	);
}
