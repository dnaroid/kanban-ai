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
	CheckCircle,
	Loader2,
	Mic,
	MicOff,
	Paperclip,
	RotateCcw,
	X,
	XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadClipboardFiles } from "@/lib/api-client";
import { Modal } from "@/components/common/Modal";
import { FileSystemPicker } from "@/components/common/FileSystemPicker";
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

export interface RejectAttachment {
	name: string;
	path?: string;
}

interface RejectModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (
		qaReport: string,
		attachments: RejectAttachment[],
	) => Promise<void>;
	onRejectAndRerun?: (
		qaReport: string,
		attachments: RejectAttachment[],
	) => Promise<void>;
	taskTitle: string;
}

export function RejectModal({
	isOpen,
	onClose,
	onSubmit,
	onRejectAndRerun,
	taskTitle,
}: RejectModalProps) {
	const [reason, setReason] = useState("");
	const [liveTranscript, setLiveTranscript] = useState("");
	const [isListening, setIsListening] = useState(false);
	const [selectedAttachments, setSelectedAttachments] = useState<
		RejectAttachment[]
	>([]);
	const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitMode, setSubmitMode] = useState<"reject" | "rerun" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
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
			setReason("");
			setLiveTranscript("");
			setSelectedAttachments([]);
			setIsFilePickerOpen(false);
			setError(null);
		}
	}, [isOpen, stopDictation]);

	useEffect(() => {
		return () => {
			stopDictation();
		};
	}, [stopDictation]);

	useEffect(() => {
		if (isOpen && textareaRef.current) {
			textareaRef.current.focus();
		}
	}, [isOpen]);

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
				setReason((prev) => {
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

	const mergeAttachments = useCallback(
		(current: RejectAttachment[], incoming: RejectAttachment[]) => {
			const merged = new Map<string, RejectAttachment>();

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
		},
		[],
	);

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

		const pastedAttachments: RejectAttachment[] = [
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

	const handleSubmit = async (mode: "reject" | "rerun") => {
		const trimmedReason = reason.trim();
		if (!trimmedReason) {
			setError("Please describe why the task didn't pass review.");
			return;
		}

		setError(null);
		setIsSubmitting(true);
		setSubmitMode(mode);

		try {
			if (mode === "rerun" && onRejectAndRerun) {
				await onRejectAndRerun(trimmedReason, selectedAttachments);
			} else {
				await onSubmit(trimmedReason, selectedAttachments);
			}
		} catch (submitError) {
			setError(
				submitError instanceof Error
					? submitError.message
					: "Failed to reject task.",
			);
		} finally {
			setIsSubmitting(false);
			setSubmitMode(null);
		}
	};

	if (!isOpen) return null;

	return (
		<>
			<Modal
				open={isOpen}
				onOpenChange={(open) => !open && onClose()}
				size="md"
				title={
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
							<XCircle className="w-6 h-6 text-red-400" />
						</div>
						<div>
							<h3 className="text-lg font-bold text-white">Reject Task</h3>
							<p className="text-xs text-slate-500 font-medium">{taskTitle}</p>
						</div>
					</div>
				}
				footer={
					<div className="flex items-center justify-end w-full gap-2">
						<button
							type="button"
							onClick={onClose}
							disabled={isSubmitting}
							className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all border bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
						>
							Cancel
						</button>
						{onRejectAndRerun && (
							<button
								type="button"
								onClick={() => handleSubmit("rerun")}
								disabled={isSubmitting || !reason.trim()}
								className={cn(
									"inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-bold transition-all border shadow-lg",
									isSubmitting && submitMode === "rerun"
										? "cursor-not-allowed bg-amber-500/10 text-amber-300/80 border-amber-500/30"
										: "bg-amber-600 text-white border-amber-500 hover:bg-amber-500 hover:scale-[1.02] active:scale-[0.98] shadow-amber-500/20",
								)}
							>
								{isSubmitting && submitMode === "rerun" ? (
									<>
										<Loader2 className="w-4 h-4 animate-spin" />
										Rejecting &amp; Re-running...
									</>
								) : (
									<>
										<RotateCcw className="w-4 h-4" />
										Reject &amp; Re-run
									</>
								)}
							</button>
						)}
						<button
							type="button"
							onClick={() => handleSubmit("reject")}
							disabled={isSubmitting || !reason.trim()}
							className={cn(
								"inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-xs font-bold transition-all border shadow-lg",
								isSubmitting && submitMode === "reject"
									? "cursor-not-allowed bg-red-500/10 text-red-300/80 border-red-500/30"
									: isSubmitting
										? "cursor-not-allowed bg-red-500/10 text-red-300/40 border-red-500/20"
										: "bg-red-600 text-white border-red-500 hover:bg-red-500 hover:scale-[1.02] active:scale-[0.98] shadow-red-500/20",
							)}
						>
							{isSubmitting && submitMode === "reject" ? (
								<>
									<Loader2 className="w-4 h-4 animate-spin" />
									Rejecting...
								</>
							) : (
								<>
									<CheckCircle className="w-4 h-4" />
									Reject
								</>
							)}
						</button>
					</div>
				}
			>
				<div className="space-y-4">
					<div className="relative group">
						<div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 focus-within:border-red-500/50 focus-within:ring-1 focus-within:ring-red-500/20 transition-all">
							<textarea
								ref={textareaRef}
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								onPaste={handlePromptPaste}
								placeholder="Describe why the task didn't pass review..."
								rows={6}
								disabled={isSubmitting}
								className="w-full resize-none bg-transparent border-none text-slate-200 placeholder:text-slate-500 outline-none focus:ring-0 text-base leading-relaxed p-0"
							/>

							{liveTranscript && (
								<div className="mt-4 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
									<p className="text-sm text-red-300/90 italic">
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
											? "text-red-400 border-red-500/40 bg-red-500/10 hover:bg-red-500/20"
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
										setReason("");
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
				</div>
			</Modal>

			<FileSystemPicker
				isOpen={isFilePickerOpen}
				mode="files"
				title="Select Files for Rejection Report"
				selectLabel="Attach Files"
				onSelect={handleFilesSelect}
				onClose={() => setIsFilePickerOpen(false)}
			/>
		</>
	);
}
