"use client";

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ClipboardEvent,
} from "react";
import {
	FileText,
	Loader2,
	Mic,
	MicOff,
	Paperclip,
	Play,
	Sparkles,
	X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/common/Modal";
import { ModelPicker } from "@/components/common/ModelPicker";
import { FileSystemPicker } from "@/components/common/FileSystemPicker";
import { api, uploadClipboardFiles } from "@/lib/api-client";
import type { OpencodeModel } from "@/types/kanban";
import { useSTTLanguage } from "@/components/voice/useSTTLanguage";

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
	onGenerateStory: (
		prompt: string,
		selectedAttachments: QuickCreateAttachment[],
	) => Promise<void>;
	onRunRawStory: (
		prompt: string,
		modelName: string | null,
		selectedAttachments: QuickCreateAttachment[],
	) => Promise<void>;
}

export interface QuickCreateAttachment {
	name: string;
	path?: string;
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
	const [selectedAttachments, setSelectedAttachments] = useState<
		QuickCreateAttachment[]
	>([]);
	const [projectPath, setProjectPath] = useState<string | undefined>(undefined);
	const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
	const { language, toggleLanguage } = useSTTLanguage();

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
			setSelectedAttachments([]);
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
		recognition.lang = language;
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
			await onGenerateStory(fullPrompt, selectedAttachments);
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
			await onRunRawStory(fullPrompt, selectedModel, selectedAttachments);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to run raw story.");
		} finally {
			setSubmittingAction(null);
		}
	};

	const extractClipboardFiles = (clipboardData: DataTransfer): File[] => {
		const directFiles = Array.from(clipboardData.files ?? []);
		const itemFiles = Array.from(clipboardData.items ?? [])
			.filter((item) => item.kind === "file")
			.map((item) => item.getAsFile())
			.filter((file): file is File => file !== null);

		const uniqueFiles = new Map<string, File>();
		for (const file of [...directFiles, ...itemFiles]) {
			const key = `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
			uniqueFiles.set(key, file);
		}

		return Array.from(uniqueFiles.values());
	};

	const mergeAttachments = (
		current: QuickCreateAttachment[],
		incoming: QuickCreateAttachment[],
	) => {
		const merged = new Map<string, QuickCreateAttachment>();

		for (const attachment of current) {
			const key = attachment.path
				? `path:${attachment.path}`
				: `name:${attachment.name}`;
			merged.set(key, attachment);
		}

		for (const attachment of incoming) {
			const key = attachment.path
				? `path:${attachment.path}`
				: `name:${attachment.name}`;
			merged.set(key, attachment);
		}

		return Array.from(merged.values());
	};

	const handlePromptPaste = async (
		event: ClipboardEvent<HTMLTextAreaElement>,
	) => {
		const files = extractClipboardFiles(event.clipboardData);
		if (files.length === 0) {
			return;
		}

		event.preventDefault();
		setError(null);

		const filesWithPath: Array<{ file: File; path: string }> = [];
		const filesWithoutPath: File[] = [];

		for (const file of files) {
			const filePath = (file as File & { path?: string }).path;
			if (filePath) {
				filesWithPath.push({ file, path: filePath });
			} else {
				filesWithoutPath.push(file);
			}
		}

		const uploadedFiles =
			filesWithoutPath.length > 0
				? await uploadClipboardFiles(filesWithoutPath)
				: [];

		if (filesWithoutPath.length > 0 && uploadedFiles.length === 0) {
			setError("Failed to upload clipboard image");
			return;
		}

		const pastedAttachments: QuickCreateAttachment[] = [
			...filesWithPath.map(({ file, path }) => ({
				name: file.name || "file",
				path,
			})),
			...uploadedFiles.map((u) => ({
				name: u.name,
				path: u.path,
			})),
		];

		setSelectedAttachments((prev) => mergeAttachments(prev, pastedAttachments));
	};

	const handleFilesSelect = (paths: string[]) => {
		setIsFilePickerOpen(false);
		setSelectedAttachments(
			paths.map((path) => {
				const normalized = path.replace(/\\/g, "/");
				return {
					name: normalized.split("/").pop() || path,
					path,
				};
			}),
		);
	};

	const isSubmitting = submittingAction !== null;

	if (!isOpen) return null;

	return (
		<Modal
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			size="lg"
			title={
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
						<Sparkles className="w-6 h-6 text-emerald-400" />
					</div>
					<div>
						<h3 className="text-lg font-bold text-white">Quick Create Story</h3>
						<p className="text-xs text-slate-500 font-medium">
							Describe your task and let the agent generate a story
						</p>
					</div>
				</div>
			}
			footer={
				<div className="flex items-center justify-between w-full">
					<div className="flex items-center gap-2">
						<ModelPicker
							value={selectedModel}
							models={models}
							onChange={setSelectedModel}
							allowAuto
							showVariantSelector
						/>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={handleRunRawStory}
							disabled={isSubmitting}
							className={cn(
								"inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all border",
								isSubmitting
									? "cursor-not-allowed opacity-50 bg-slate-800 text-slate-500 border-slate-700"
									: "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white",
							)}
						>
							{submittingAction === "runRaw" ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Play className="w-4 h-4 fill-current" />
							)}
							Run Raw
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
									Generating...
								</>
							) : (
								<>
									<Sparkles className="w-4 h-4" />
									Generate
								</>
							)}
						</button>
					</div>
				</div>
			}
		>
			<div className="space-y-4">
				<div className="relative group">
					<div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all">
						<textarea
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							onPaste={handlePromptPaste}
							placeholder="What needs to be done? Type or dictate story details..."
							rows={6}
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

						<div className="flex items-center justify-end gap-2 mt-2">
							<button
								type="button"
								onClick={() => setIsFilePickerOpen(true)}
								disabled={isSubmitting}
								className={cn(
									"w-9 h-9 rounded-lg border transition-all flex items-center justify-center",
									selectedAttachments.length > 0
										? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"
										: "text-slate-400 border-slate-700/80 bg-slate-800/60 hover:bg-slate-700/60 hover:text-slate-200",
								)}
								title="Add context files"
							>
								<Paperclip className="w-4 h-4" />
							</button>

							<button
								type="button"
								onClick={toggleLanguage}
								disabled={isSubmitting}
								className="w-9 h-9 rounded-lg border border-slate-700/80 bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 flex items-center justify-center transition-all hover:text-slate-200"
								title={
									language === "ru-RU"
										? "Switch to English"
										: "Switch to Russian"
								}
							>
								<span className="text-[10px] font-bold">
									{language === "ru-RU" ? "RU" : "EN"}
								</span>
							</button>

							<button
								type="button"
								onClick={handleToggleDictation}
								disabled={isSubmitting}
								className={cn(
									"w-9 h-9 rounded-lg border transition-all flex items-center justify-center",
									isListening
										? "text-red-300 border-red-500/40 bg-red-500/10 hover:bg-red-500/20 shadow-lg shadow-red-500/10"
										: "text-slate-400 border-slate-700/80 bg-slate-800/60 hover:bg-slate-700/60 hover:text-slate-200",
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
									setError(null);
									if (isListening) stopDictation();
								}}
								disabled={isSubmitting}
								className="w-9 h-9 rounded-lg border border-slate-700/80 bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 flex items-center justify-center transition-all hover:text-slate-200"
								title="Clear"
							>
								<X className="w-4 h-4" />
							</button>
						</div>
					</div>
				</div>

				{selectedAttachments.length > 0 && (
					<div className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-2">
						<ul className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto no-scrollbar">
							{selectedAttachments.map((attachment) => {
								return (
									<li
										key={attachment.path ?? attachment.name}
										className="group inline-flex items-center gap-1.5 rounded-md bg-slate-800/60 px-2 py-1 text-[10px] text-slate-300 border border-slate-700/50"
									>
										<FileText className="w-3 h-3 text-slate-500" />
										<span
											className="truncate max-w-[150px]"
											title={attachment.path ?? attachment.name}
										>
											{attachment.name}
										</span>
										<button
											type="button"
											onClick={() =>
												setSelectedAttachments((prev) =>
													prev.filter((item) => {
														if (attachment.path) {
															return item.path !== attachment.path;
														}
														return item.name !== attachment.name;
													}),
												)
											}
											className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all ml-1"
											title="Remove"
										>
											<X className="w-2.5 h-2.5" />
										</button>
									</li>
								);
							})}
						</ul>
					</div>
				)}

				{error && (
					<p className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 animate-in slide-in-from-top-2">
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
