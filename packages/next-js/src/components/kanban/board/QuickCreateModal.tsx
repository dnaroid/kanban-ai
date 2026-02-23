"use client";

import { useEffect, useRef, useState } from "react";
import {
	Loader2,
	Mic,
	MicOff,
	Sparkles,
	X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/common/Modal";

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
	isOpen: boolean;
	onClose: () => void;
	onGenerate: (prompt: string) => Promise<void>;
}

export function QuickCreateModal({
	isOpen,
	onClose,
	onGenerate,
}: QuickCreateModalProps) {
	const [prompt, setPrompt] = useState("");
	const [liveTranscript, setLiveTranscript] = useState("");
	const [isListening, setIsListening] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

	const stopDictation = () => {
		recognitionRef.current?.stop();
		recognitionRef.current = null;
		setIsListening(false);
		setLiveTranscript("");
	};

	useEffect(() => {
		if (!isOpen) {
			stopDictation();
			setPrompt("");
			setLiveTranscript("");
			setError(null);
		}
	}, [isOpen]);

	useEffect(() => {
		return () => {
			stopDictation();
		};
	}, []);

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
		setIsGenerating(true);

		try {
			await onGenerate(fullPrompt);
			onClose();
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Failed to create and generate story.",
			);
		} finally {
			setIsGenerating(false);
		}
	};

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
						<Sparkles className="w-6 h-6 text-emerald-400" />
					</div>
					<div>
						<h3 className="text-lg font-bold text-white">Quick Create Story</h3>
						<p className="text-xs text-slate-500 font-medium">Describe what should be done</p>
					</div>
				</div>
			}
			footer={
				<div className="flex items-center gap-4">
					<button
						onClick={onClose}
						className="px-6 py-2.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
					>
						Cancel
					</button>
					<button
						onClick={handleGenerateStory}
						disabled={isGenerating}
						className={cn(
							"inline-flex items-center gap-2 rounded-xl px-8 py-2.5 text-xs font-bold transition-all border shadow-lg",
							isGenerating
								? "cursor-not-allowed bg-emerald-500/10 text-emerald-300/80 border-emerald-500/30"
								: "bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500 hover:scale-[1.02] active:scale-[0.98] shadow-emerald-500/20"
						)}
					>
						{isGenerating ? (
							<>
								<Loader2 className="w-4 h-4 animate-spin" />
								Generating...
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
				<div className="relative rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all">
					<textarea
						autoFocus
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder="Type or dictate your idea here..."
						rows={4}
						disabled={isGenerating}
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
						disabled={isGenerating}
						className={cn(
							"w-12 h-12 rounded-2xl border transition-all flex items-center justify-center",
							isListening
								? "text-red-300 border-red-500/40 bg-red-500/10 hover:bg-red-500/20 shadow-lg shadow-red-500/10"
								: "text-slate-300 border-slate-700/80 bg-slate-800/60 hover:bg-slate-700/60"
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
							setError(null);
							if (isListening) stopDictation();
						}}
						disabled={isGenerating}
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
			</div>
		</Modal>
	);
}
