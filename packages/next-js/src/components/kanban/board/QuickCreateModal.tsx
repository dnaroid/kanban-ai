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
	MessageSquare,
	Paperclip,
	Save,
	Play,
	Sparkles,
	X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/common/Modal";
import { ModelPicker } from "@/components/common/ModelPicker";
import { FileSystemPicker } from "@/components/common/FileSystemPicker";
import { api, uploadClipboardFiles } from "@/lib/api-client";

import { useSTTLanguage } from "@/components/voice/useSTTLanguage";
import { useEnabledModels } from "@/components/common/useEnabledModels";

const RUN_AFTER_GENERATE_KEY = "quick-create-run-after-generate";

function isRunAfterGenerateDefault(): boolean {
	if (typeof window === "undefined") return false;
	return localStorage.getItem(RUN_AFTER_GENERATE_KEY) === "true";
}

function persistRunAfterGenerate(value: boolean): void {
	localStorage.setItem(RUN_AFTER_GENERATE_KEY, String(value));
}

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
		modelName?: string | null,
		runAfterGenerate?: boolean,
	) => Promise<void>;
	onStartStoryChat: (
		prompt: string,
		modelName: string | null,
		selectedAttachments: QuickCreateAttachment[],
	) => Promise<{ taskId: string; runId: string }>;
	onRunRawStory: (
		prompt: string,
		modelName: string | null,
		selectedAttachments: QuickCreateAttachment[],
	) => Promise<void>;
	onSaveDraft: (
		prompt: string,
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
	onStartStoryChat,
	onRunRawStory,
	onSaveDraft,
}: QuickCreateModalProps) {
	const [prompt, setPrompt] = useState("");
	const [liveTranscript, setLiveTranscript] = useState("");
	const [isListening, setIsListening] = useState(false);
	const [submittingAction, setSubmittingAction] = useState<
		"generate" | "chatGenerate" | "runRaw" | "draft" | null
	>(null);
	const [selectedModel, setSelectedModel] = useState<string | null>(null);
	const [selectedAttachments, setSelectedAttachments] = useState<
		QuickCreateAttachment[]
	>([]);
	const [projectPath, setProjectPath] = useState<string | undefined>(undefined);
	const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [runAfterGenerate, setRunAfterGenerate] = useState(false);
	const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
	const { language, toggleLanguage } = useSTTLanguage();
	const { models } = useEnabledModels();

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
		setRunAfterGenerate(isRunAfterGenerateDefault());
	}, []);

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
			await onGenerateStory(
				fullPrompt,
				selectedAttachments,
				selectedModel,
				runAfterGenerate,
			);
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

	const handleStartStoryChat = async () => {
		const fullPrompt = `${prompt.trim()} ${liveTranscript.trim()}`.trim();
		if (!fullPrompt) {
			setError("Enter or dictate task details first.");
			return;
		}

		setError(null);
		setSubmittingAction("chatGenerate");

		try {
			await onStartStoryChat(fullPrompt, selectedModel, selectedAttachments);
			onClose();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to start story chat.",
			);
		} finally {
			setSubmittingAction(null);
		}
	};

	const handleSaveDraft = async () => {
		const fullPrompt = `${prompt.trim()} ${liveTranscript.trim()}`.trim();
		if (!fullPrompt) {
			setError("Enter or dictate task details first.");
			return;
		}

		setError(null);
		setSubmittingAction("draft");

		try {
			await onSaveDraft(fullPrompt, selectedAttachments);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save draft.");
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
			const key = `${file.name}:${file.size}:${file.type}`;
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

		const textPath = event.clipboardData.getData("text/plain")?.trim();

		if (textPath) {
			const pastedAttachments: QuickCreateAttachment[] = files.map((f) => {
				const normalized = textPath.replace(/\\/g, "/");
				return {
					name: f.name || normalized.split("/").pop() || textPath,
					path: textPath,
				};
			});
			setSelectedAttachments((prev) =>
				mergeAttachments(prev, pastedAttachments),
			);
			return;
		}

		setError(null);
		const uploadedFiles = await uploadClipboardFiles(files);

		if (uploadedFiles.length === 0) {
			setError("Failed to upload clipboard file");
			return;
		}

		const pastedAttachments: QuickCreateAttachment[] = uploadedFiles.map(
			(u) => ({
				name: u.name,
				path: u.path,
			}),
		);

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
			onPointerDownOutside={(e) => e.preventDefault()}
			size="lg"
			title={
				<div className="flex items-center justify-between w-full pr-8">
					<div className="flex items-center gap-4">
						<div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center shadow-inner shadow-emerald-500/5 ring-1 ring-emerald-500/20">
							<Sparkles className="w-6 h-6 text-emerald-400" />
						</div>
						<div className="space-y-0.5">
							<div className="flex items-center gap-3">
								<h3 className="text-xl font-bold text-white tracking-tight">
									Quick Create Story
								</h3>
								<ModelPicker
									value={selectedModel}
									models={models}
									onChange={setSelectedModel}
									allowAuto
									showVariantSelector
									borderless
								/>
							</div>
							<p className="text-sm text-slate-400 font-medium opacity-80">
								Describe your task and let the agent generate a story
							</p>
						</div>
					</div>
				</div>
			}
			footer={
				<div className="flex items-center justify-between w-full pt-2">
					<label className="flex items-center gap-2 cursor-pointer select-none">
						<input
							type="checkbox"
							checked={runAfterGenerate}
							onChange={(e) => {
								const checked = e.target.checked;
								setRunAfterGenerate(checked);
								persistRunAfterGenerate(checked);
							}}
							disabled={isSubmitting}
							className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500/30 focus:ring-offset-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 accent-emerald-500"
						/>
						<span className="text-sm text-slate-400 font-medium">
							Run after generate
						</span>
					</label>
					<div className="flex items-center gap-2.5">
						<button
							type="button"
							onClick={handleSaveDraft}
							disabled={isSubmitting}
							className={cn(
								"inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all border shadow-sm",
								isSubmitting
									? "cursor-not-allowed opacity-50 bg-slate-800/50 text-slate-500 border-slate-700/50"
									: "bg-slate-900/40 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200 hover:border-slate-700",
							)}
						>
							{submittingAction === "draft" ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Save className="w-4 h-4" />
							)}
							Draft
						</button>

						<button
							type="button"
							onClick={handleRunRawStory}
							disabled={isSubmitting}
							className={cn(
								"inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all border shadow-sm",
								isSubmitting
									? "cursor-not-allowed opacity-50 bg-slate-800 text-slate-500 border-slate-700"
									: "bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white hover:border-slate-600",
							)}
						>
							{submittingAction === "runRaw" ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								<Play className="w-4 h-4 fill-current" />
							)}
							Run
						</button>

						<div className="h-6 w-px bg-slate-800/60 mx-1" />

						<button
							type="button"
							onClick={handleStartStoryChat}
							disabled={isSubmitting || !prompt.trim()}
							className={cn(
								"inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all border shadow-sm",
								isSubmitting || !prompt.trim()
									? "cursor-not-allowed opacity-50 bg-cyan-500/10 text-cyan-300/80 border-cyan-500/30"
									: "bg-cyan-500/5 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/15 hover:text-cyan-300 hover:border-cyan-500/40",
							)}
						>
							{submittingAction === "chatGenerate" ? (
								<>
									<Loader2 className="w-4 h-4 animate-spin" />
									Starting chat...
								</>
							) : (
								<>
									<MessageSquare className="w-4 h-4" />
									Chat
								</>
							)}
						</button>

						<button
							type="button"
							onClick={handleGenerateStory}
							disabled={isSubmitting}
							data-testid="create-task-submit"
							className={cn(
								"inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-bold transition-all border shadow-lg relative group overflow-hidden",
								isSubmitting
									? "cursor-not-allowed bg-emerald-500/10 text-emerald-300/80 border-emerald-500/30"
									: "bg-emerald-500 text-white border-emerald-400 hover:bg-emerald-400 hover:scale-[1.02] active:scale-[0.98] shadow-emerald-500/20",
							)}
						>
							{!isSubmitting && (
								<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
							)}
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
			<div className="space-y-4" data-testid="create-task-modal">
				<div className="relative group">
					<div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 focus-within:border-emerald-500/40 focus-within:ring-4 focus-within:ring-emerald-500/5 transition-all duration-300 shadow-inner">
						<textarea
							data-testid="create-task-prompt"
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							onPaste={handlePromptPaste}
							placeholder="What needs to be done? Type or dictate story details..."
							rows={6}
							disabled={isSubmitting}
							className="w-full resize-none bg-transparent border-none text-slate-100 placeholder:text-slate-600 outline-none focus:ring-0 text-base leading-relaxed p-0 selection:bg-emerald-500/30 rounded-none"
						/>

						{liveTranscript && (
							<div className="mt-4 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 animate-in fade-in slide-in-from-bottom-2">
								<p className="text-sm text-emerald-300/80 italic leading-relaxed">
									{liveTranscript}
								</p>
							</div>
						)}

						<div className="flex items-center justify-end gap-2.5 mt-4">
							<button
								type="button"
								onClick={() => setIsFilePickerOpen(true)}
								disabled={isSubmitting}
								className={cn(
									"w-10 h-10 rounded-xl border transition-all flex items-center justify-center shadow-sm",
									selectedAttachments.length > 0
										? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20"
										: "text-slate-500 border-slate-800 bg-slate-800/40 hover:bg-slate-800 hover:text-slate-300 hover:border-slate-700",
								)}
								title="Add context files"
							>
								<Paperclip className="w-4 h-4" />
							</button>

							<button
								type="button"
								onClick={toggleLanguage}
								disabled={isSubmitting}
								className="w-10 h-10 rounded-xl border border-slate-800 bg-slate-800/40 hover:bg-slate-800 text-slate-500 flex items-center justify-center transition-all hover:text-slate-300 hover:border-slate-700 shadow-sm"
								title={
									language === "ru-RU"
										? "Switch to English"
										: "Switch to Russian"
								}
							>
								<span className="text-[11px] font-black tracking-tighter">
									{language === "ru-RU" ? "RU" : "EN"}
								</span>
							</button>

							<button
								type="button"
								onClick={handleToggleDictation}
								disabled={isSubmitting}
								className={cn(
									"w-10 h-10 rounded-xl border transition-all flex items-center justify-center shadow-sm relative overflow-hidden",
									isListening
										? "text-white border-red-500 bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/20"
										: "text-slate-500 border-slate-800 bg-slate-800/40 hover:bg-slate-800 hover:text-slate-300 hover:border-slate-700",
								)}
								title={isListening ? "Stop dictation" : "Start dictation"}
							>
								{isListening ? (
									<>
										<div className="absolute inset-0 bg-white/20 animate-pulse" />
										<MicOff className="w-4 h-4 relative z-10" />
									</>
								) : (
									<Mic className="w-4 h-4" />
								)}
							</button>

							<div className="w-px h-6 bg-slate-800 mx-0.5" />

							<button
								type="button"
								onClick={() => {
									setPrompt("");
									setLiveTranscript("");
									setError(null);
									if (isListening) stopDictation();
								}}
								disabled={isSubmitting}
								className="w-10 h-10 rounded-xl border border-slate-800 bg-slate-800/40 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 text-slate-500 flex items-center justify-center transition-all shadow-sm"
								title="Clear"
							>
								<X className="w-4 h-4" />
							</button>
						</div>
					</div>
				</div>

				{selectedAttachments.length > 0 && (
					<div className="rounded-2xl border border-slate-800/40 bg-slate-900/20 p-3 shadow-inner">
						<div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">
							Attached Context
						</div>
						<ul className="flex flex-wrap gap-2 max-h-32 overflow-y-auto no-scrollbar">
							{selectedAttachments.map((attachment) => {
								return (
									<li
										key={attachment.path ?? attachment.name}
										className="group inline-flex items-center gap-2 rounded-xl bg-slate-800/40 px-3 py-1.5 text-xs text-slate-300 border border-slate-800 hover:border-slate-700 transition-colors shadow-sm"
									>
										<div className="p-1 rounded-md bg-slate-900/60">
											<FileText className="w-3 h-3 text-emerald-500/70" />
										</div>
										<span
											className="truncate max-w-[180px] font-medium"
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
											className="opacity-40 group-hover:opacity-100 hover:text-red-400 transition-all ml-1 p-0.5 rounded-full hover:bg-red-500/10"
											title="Remove"
										>
											<X className="w-3 h-3" />
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
