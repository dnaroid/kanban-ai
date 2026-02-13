import React, { useState, useEffect, useCallback, useRef } from "react";
import { Mic, MicOff, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@web/lib/utils";
import { type STTStatus } from "@web/voice/WebSpeechController";
import { getSTTController } from "@web/voice/sttControllerSingleton";

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
	const [status, setStatus] = useState<STTStatus>("idle");
	const [error, setError] = useState<string | null>(null);
	const [isRecording, setIsRecording] = useState(false);
	const [liveText, setLiveText] = useState("");
	const isRecordingRef = useRef(false);
	const liveTextRef = useRef("");
	const onDeltaRef = useRef<((text: string) => void) | undefined>(onDelta);
	const onTranscriptRef = useRef<((text: string) => void) | undefined>(
		onTranscript,
	);

	const sttControllerRef = useRef<ReturnType<typeof getSTTController> | null>(
		null,
	);

	useEffect(() => {
		onDeltaRef.current = onDelta;
		onTranscriptRef.current = onTranscript;
		liveTextRef.current = liveText;
	}, [onDelta, onTranscript, liveText]);

	useEffect(() => {
		const controller = getSTTController();
		sttControllerRef.current = controller;

		const handleStatus = (newStatus: STTStatus) => {
			setStatus(newStatus);
			if (newStatus === "idle" || newStatus === "error") {
				setIsRecording(false);
				isRecordingRef.current = false;
			}
		};

		const handlePartial = (text: string) => {
			setLiveText(text);
			onDeltaRef.current?.(text);
		};

		const handleFinal = (text: string) => {
			onTranscriptRef.current?.(text);
			setLiveText("");
			onDeltaRef.current?.("");
		};

		const handleError = (message: string) => {
			setError(message);
			setStatus("error");
			setIsRecording(false);
			isRecordingRef.current = false;
		};

		controller.on("status", handleStatus);
		controller.on("partial", handlePartial);
		controller.on("final", handleFinal);
		controller.on("error", handleError);

		return () => {
			controller.off("status", handleStatus);
			controller.off("partial", handlePartial);
			controller.off("final", handleFinal);
			controller.off("error", handleError);
		};
	}, []);

	const handleToggleRecording = useCallback(async () => {
		if (!sttControllerRef.current) return;

		if (isRecording) {
			const pendingText = liveTextRef.current.trim();
			if (pendingText) {
				onTranscriptRef.current?.(pendingText);
				setLiveText("");
				onDeltaRef.current?.("");
			}
			sttControllerRef.current.stop();
			setIsRecording(false);
			isRecordingRef.current = false;
		} else {
			setError(null);
			try {
				const controller = sttControllerRef.current;
				const currentStatus = controller.getStatus();

				if (currentStatus === "idle") {
					await controller.init();
				}

				await controller.start();
				setIsRecording(true);
				isRecordingRef.current = true;
			} catch (err) {
				setIsRecording(false);
				isRecordingRef.current = false;
				setStatus("error");
				setError(
					err instanceof Error ? err.message : "Microphone access denied",
				);
			}
		}
	}, [isRecording]);

	const getStatusColor = () => {
		switch (status) {
			case "ready":
				return "text-blue-400";
			case "initializing":
				return "text-slate-300";
			case "speech":
				return "text-green-400";
			case "error":
				return "text-red-400";
			default:
				return "text-slate-400";
		}
	};

	const getStatusText = () => {
		switch (status) {
			case "ready":
				return "Ready";
			case "initializing":
				return "Initializing...";
			case "speech":
				return "Speaking...";
			case "error":
				return "Error";
			default:
				return "Idle";
		}
	};

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
					title={`${isRecording ? "Stop Recording" : "Start Voice Input"} (${getStatusText()})`}
				>
					{isRecording ? (
						<MicOff className="w-4 h-4" />
					) : (
						<Mic className="w-4 h-4" />
					)}
				</button>
			</div>

			<div className="flex flex-col">
				<div
					className={cn(
						"text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5",
						getStatusColor(),
					)}
					title={getStatusText()}
				>
					{status === "initializing" ? (
						<Loader2 className="w-2.5 h-2.5 animate-spin" />
					) : status === "error" ? (
						<AlertCircle className="w-2.5 h-2.5" />
					) : null}
				</div>
				{error && (
					<div
						className="text-[10px] text-red-400/80 max-w-[200px] truncate"
						title={error}
					>
						{error}
					</div>
				)}
			</div>
		</div>
	);
};
