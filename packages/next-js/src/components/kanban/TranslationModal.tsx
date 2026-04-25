"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
	Languages,
	Loader2,
	AlertTriangle,
	Check,
	Copy,
	Eye,
	X,
} from "lucide-react";
import {
	ModalRoot,
	ModalPortal,
	ModalOverlay,
	ModalContent,
	ModalTitle,
	ModalClose,
} from "@/components/common/Modal";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { OpenCodeMessage } from "@/types/ipc";

interface TranslationModalProps {
	taskId: string;
	storyText: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const LANGUAGES = [
	{ code: "en", name: "English" },
	{ code: "es", name: "Spanish" },
	{ code: "fr", name: "French" },
	{ code: "de", name: "German" },
	{ code: "it", name: "Italian" },
	{ code: "pt", name: "Portuguese" },
	{ code: "ru", name: "Russian" },
	{ code: "ja", name: "Japanese" },
	{ code: "ko", name: "Korean" },
	{ code: "zh", name: "Chinese (Simplified)" },
	{ code: "zh-TW", name: "Chinese (Traditional)" },
	{ code: "ar", name: "Arabic" },
	{ code: "hi", name: "Hindi" },
	{ code: "pl", name: "Polish" },
	{ code: "nl", name: "Dutch" },
	{ code: "sv", name: "Swedish" },
	{ code: "tr", name: "Turkish" },
	{ code: "uk", name: "Ukrainian" },
	{ code: "cs", name: "Czech" },
	{ code: "ro", name: "Romanian" },
];

const LOCAL_STORAGE_KEY = "kanban-ai:translation-language";

function getSavedLanguage(): string | null {
	if (typeof window === "undefined") return null;
	return localStorage.getItem(LOCAL_STORAGE_KEY);
}

function detectBrowserLanguage(): string {
	if (typeof window === "undefined" || !navigator.language) return "";
	const langCode = navigator.language.split("-")[0]?.toLowerCase() ?? "";
	const match = LANGUAGES.find(
		(l) => l.code === langCode || l.code.split("-")[0] === langCode,
	);
	return match ? match.code : "";
}

function saveLanguage(lang: string): void {
	if (typeof window === "undefined") return;
	localStorage.setItem(LOCAL_STORAGE_KEY, lang);
}

export const TranslationModal = ({
	taskId,
	storyText,
	open,
	onOpenChange,
}: TranslationModalProps) => {
	const [selectedLanguage, setSelectedLanguage] = useState<string>("");
	const [translatedText, setTranslatedText] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isCopied, setIsCopied] = useState(false);
	const [showOriginal, setShowOriginal] = useState(false);

	const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

	const clearPolling = useCallback(() => {
		if (pollIntervalRef.current) {
			clearInterval(pollIntervalRef.current);
			pollIntervalRef.current = null;
		}
	}, []);

	const handleTranslate = useCallback(
		async (lang: string) => {
			if (!storyText || !lang) return;

			setIsLoading(true);
			setError(null);
			setShowOriginal(false);
			clearPolling();

			try {
				const { sessionId } = await api.opencode.translate({
					taskId,
					language: lang,
				});

				pollIntervalRef.current = setInterval(async () => {
					try {
						const { messages } = await api.opencode.getSessionMessages({
							sessionId,
						});

						const lastAssistantMessage = [...messages]
							.reverse()
							.find((m: OpenCodeMessage) => m.role === "assistant");

						if (lastAssistantMessage) {
							setTranslatedText(lastAssistantMessage.content);
							setIsLoading(false);
							clearPolling();
						}
					} catch (err) {
						console.error("Polling error:", err);
						setError("Error while checking translation status.");
						setIsLoading(false);
						clearPolling();
					}
				}, 2000);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to start translation.",
				);
				setIsLoading(false);
			}
		},
		[taskId, storyText, clearPolling],
	);

	useEffect(() => {
		if (open) {
			const saved = getSavedLanguage() || detectBrowserLanguage();
			setSelectedLanguage(saved);
		} else {
			clearPolling();
			setIsLoading(false);
			setError(null);
			setTranslatedText(null);
			setShowOriginal(false);
		}

		return () => clearPolling();
	}, [open, clearPolling]);

	const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newLang = e.target.value;
		setSelectedLanguage(newLang);
		saveLanguage(newLang);
		handleTranslate(newLang);
	};

	const handleCopy = () => {
		const textToCopy = showOriginal ? storyText : translatedText;
		if (textToCopy) {
			navigator.clipboard.writeText(textToCopy);
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), 2000);
		}
	};

	const displayText = showOriginal ? storyText : (translatedText ?? storyText);

	return (
		<ModalRoot open={open} onOpenChange={onOpenChange}>
			<ModalPortal>
				<ModalOverlay className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-[10px] animate-in fade-in duration-200" />
				<ModalContent
					size="none"
					className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[51] w-full max-w-4xl bg-[#0B0E14] border border-slate-800/60 rounded-2xl shadow-2xl animate-in zoom-in-95 fade-in duration-200 focus:outline-none focus-visible:ring-0 flex flex-col"
					style={{ height: "calc(100vh - 20px)" }}
				>
					<div className="flex items-center gap-3 px-5 py-3 border-b border-slate-800/60 shrink-0">
						<ModalTitle className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
							<Languages className="w-5 h-5 text-blue-400" />
							<span>Story</span>
						</ModalTitle>

						<div className="h-5 w-px bg-slate-700/60 mx-1" />

						<div className="relative w-40">
							<select
								aria-label="Target language"
								value={selectedLanguage}
								onChange={handleLanguageChange}
								className="w-full bg-slate-900 border border-slate-700/60 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
								disabled={isLoading || !storyText}
							>
								{LANGUAGES.map((lang) => (
									<option key={lang.code} value={lang.code}>
										{lang.name}
									</option>
								))}
							</select>
							<div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
								<svg
									className="w-3 h-3 fill-current"
									viewBox="0 0 20 20"
									aria-hidden="true"
								>
									<path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
								</svg>
							</div>
						</div>

						<button
							type="button"
							onClick={() => handleTranslate(selectedLanguage)}
							disabled={isLoading || !storyText || !selectedLanguage}
							className={cn(
								"px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0",
								isLoading || !storyText || !selectedLanguage
									? "bg-slate-800 text-slate-500 cursor-not-allowed"
									: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 active:scale-[0.97]",
							)}
						>
							{isLoading ? (
								<>
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
									<span>...</span>
								</>
							) : (
								<>
									<Languages className="w-3.5 h-3.5" />
									<span>Translate</span>
								</>
							)}
						</button>

						{translatedText && !showOriginal && (
							<button
								type="button"
								onClick={() => setShowOriginal(true)}
								className="px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-slate-300 bg-slate-800/50 border border-slate-700/50 hover:border-slate-600 transition-all flex items-center gap-1 shrink-0"
							>
								<Eye className="w-3 h-3" />
								<span>Original</span>
							</button>
						)}

						{showOriginal && (
							<button
								type="button"
								onClick={() => setShowOriginal(false)}
								className="px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-300 bg-slate-700/50 border border-slate-600 transition-all flex items-center gap-1 shrink-0"
							>
								<Languages className="w-3 h-3" />
								<span>Translation</span>
							</button>
						)}

						{displayText && (
							<button
								type="button"
								onClick={handleCopy}
								className="ml-auto px-2 py-1.5 rounded-md text-xs text-cyan-400/80 hover:text-cyan-300 transition-colors flex items-center gap-1 shrink-0"
							>
								{isCopied ? (
									<>
										<Check className="w-3 h-3" />
										<span>Copied</span>
									</>
								) : (
									<>
										<Copy className="w-3 h-3" />
										<span>Copy</span>
									</>
								)}
							</button>
						)}

						<ModalClose asChild>
							<button
								type="button"
								className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-all focus:outline-none shrink-0"
							>
								<X className="w-4 h-4" />
							</button>
						</ModalClose>
					</div>

					{error && (
						<div className="mx-5 mt-3 bg-red-400/10 border border-red-400/20 rounded-lg p-2.5 flex items-center justify-between gap-2 text-red-400 text-xs shrink-0">
							<div className="flex items-center gap-2">
								<AlertTriangle className="w-3.5 h-3.5" />
								<span>{error}</span>
							</div>
							<button
								type="button"
								onClick={() => handleTranslate(selectedLanguage)}
								className="text-xs font-bold hover:underline"
							>
								Retry
							</button>
						</div>
					)}

					<div className="flex-1 min-h-0 overflow-y-auto p-5">
						{isLoading ? (
							<div className="flex flex-col items-center justify-center h-full gap-3">
								<Loader2 className="w-8 h-8 animate-spin text-blue-400" />
								<span className="text-sm text-slate-400">
									Translating to{" "}
									{LANGUAGES.find((l) => l.code === selectedLanguage)?.name}...
								</span>
							</div>
						) : displayText ? (
							<pre
								className={cn(
									"whitespace-pre-wrap text-sm leading-relaxed font-sans",
									showOriginal ? "text-slate-300" : "text-slate-300",
								)}
							>
								{displayText}
							</pre>
						) : (
							!error && (
								<p className="text-sm text-slate-600 italic">
									No story text available
								</p>
							)
						)}
					</div>
				</ModalContent>
			</ModalPortal>
		</ModalRoot>
	);
};
