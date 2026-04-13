import React, { useState, useCallback, useRef, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/common/toast/ToastContext";

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

interface VoiceInputButtonProps {
	onTranscript?: (text: string) => void;
	onDelta?: (text: string) => void;
	className?: string;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
	onTranscript,
	onDelta,
	className,
}) => {
	const [isRecording, setIsRecording] = useState(false);
	const { addToast } = useToast();
	const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

	const stopDictation = useCallback(() => {
		recognitionRef.current?.stop();
		recognitionRef.current = null;
		setIsRecording(false);
	}, []);

	useEffect(() => {
		return () => {
			stopDictation();
		};
	}, [stopDictation]);

	const handleToggleRecording = useCallback(() => {
		if (isRecording) {
			stopDictation();
			return;
		}

		if (typeof window === "undefined") {
			addToast({ type: "error", message: "Speech input is not available." });
			return;
		}

		const speechWindow = window as Window & {
			SpeechRecognition?: BrowserSpeechRecognitionCtor;
			webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
		};

		const RecognitionCtor =
			speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

		if (!RecognitionCtor) {
			addToast({
				type: "error",
				message: "STT is not supported in this browser.",
			});
			return;
		}

		const recognition = new RecognitionCtor();
		recognition.lang = navigator.language || "ru-RU";
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
				const nextChunk = finalized.join(" ");
				if (onTranscript) onTranscript(nextChunk);
			}

			if (onDelta) onDelta(interimText.trim());
		};

		recognition.onerror = (event) => {
			addToast({
				type: "error",
				message: event.error
					? `Speech recognition error: ${event.error}`
					: "Speech recognition failed.",
			});
			setIsRecording(false);
		};

		recognition.onend = () => {
			setIsRecording(false);
		};

		try {
			recognition.start();
			recognitionRef.current = recognition;
			setIsRecording(true);
		} catch {
			addToast({ type: "error", message: "Unable to start microphone." });
			setIsRecording(false);
		}
	}, [isRecording, stopDictation, addToast, onTranscript, onDelta]);

	const status = isRecording ? "speech" : "idle";

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<div className="relative">
				{status === "speech" && (
					<div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
				)}
				<button
					type="button"
					onClick={handleToggleRecording}
					className={cn(
						"relative w-8 h-8 rounded-full transition-all duration-300 flex items-center justify-center border",
						isRecording
							? "bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20"
							: "bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200",
					)}
					title={isRecording ? "Stop Recording" : "Start Voice Input"}
				>
					{isRecording ? (
						<MicOff className="w-4 h-4" />
					) : (
						<Mic className="w-4 h-4" />
					)}
				</button>
			</div>
		</div>
	);
};
