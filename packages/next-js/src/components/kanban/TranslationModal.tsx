"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Languages, Loader2, AlertTriangle, Check, Copy } from "lucide-react";
import { Modal } from "@/components/common/Modal";
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
			setTranslatedText(null);
			clearPolling();

			try {
				const { sessionId } = await api.opencode.translate({
					taskId,
					language: lang,
				});

				// Poll session messages until we get an assistant response
				pollIntervalRef.current = setInterval(async () => {
					try {
						const { messages } = await api.opencode.getSessionMessages({
							sessionId,
						});

						// Find the last assistant message
						const lastAssistantMessage = [...messages]
							.reverse()
							.find((m: OpenCodeMessage) => m.role === "assistant");

						if (lastAssistantMessage) {
							setTranslatedText(lastAssistantMessage.content);
							setIsLoading(false);
							clearPolling();
						}
						// If no assistant message yet, keep polling
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
		if (translatedText) {
			navigator.clipboard.writeText(translatedText);
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), 2000);
		}
	};

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={
				<div className="flex items-center gap-2">
					<Languages className="w-5 h-5 text-blue-400" />
					<span>Translate Story</span>
				</div>
			}
			size="lg"
		>
			<div className="space-y-6">
				<div className="space-y-2">
					<h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
						Original Story
					</h3>
					<div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800/60 max-h-[200px] overflow-y-auto">
						{storyText ? (
							<pre className="whitespace-pre-wrap text-sm text-slate-300 leading-relaxed font-sans">
								{storyText}
							</pre>
						) : (
							<p className="text-sm text-slate-500 italic">
								No story text available
							</p>
						)}
					</div>
				</div>

				<div className="flex items-center gap-4">
					<div className="flex-1 relative">
						<select
							aria-label="Target language"
							value={selectedLanguage}
							onChange={handleLanguageChange}
							className="w-full bg-slate-900 border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
							disabled={isLoading || !storyText}
						>
							{LANGUAGES.map((lang) => (
								<option key={lang.code} value={lang.code}>
									{lang.name}
								</option>
							))}
						</select>
						<div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
							<svg
								className="w-4 h-4 fill-current"
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
							"px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2",
							isLoading || !storyText || !selectedLanguage
								? "bg-slate-800 text-slate-500 cursor-not-allowed"
								: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 active:scale-[0.98]",
						)}
					>
						{isLoading ? (
							<>
								<Loader2 className="w-4 h-4 animate-spin" />
								<span>Translating...</span>
							</>
						) : (
							<>
								<Languages className="w-4 h-4" />
								<span>Translate</span>
							</>
						)}
					</button>
				</div>

				{error && (
					<div className="bg-red-400/10 border border-red-400/20 rounded-lg p-3 flex items-center justify-between gap-2 text-red-400 text-sm">
						<div className="flex items-center gap-2">
							<AlertTriangle className="w-4 h-4" />
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

				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
							Translated Story
						</h3>
						{translatedText && (
							<button
								type="button"
								onClick={handleCopy}
								className="inline-flex items-center gap-1.5 text-xs text-cyan-400/80 hover:text-cyan-300 transition-colors"
							>
								{isCopied ? (
									<>
										<Check className="w-3.5 h-3.5" />
										<span>Copied!</span>
									</>
								) : (
									<>
										<Copy className="w-3.5 h-3.5" />
										<span>Copy Result</span>
									</>
								)}
							</button>
						)}
					</div>

					<div
						className={cn(
							"bg-slate-900/50 rounded-lg p-4 border border-slate-800/60 min-h-[120px] max-h-[300px] overflow-y-auto relative transition-all",
							translatedText && "border-l-2 border-emerald-500/50",
						)}
					>
						{isLoading ? (
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/40 backdrop-blur-[1px] rounded-lg">
								<Loader2 className="w-6 h-6 animate-spin text-blue-400" />
								<span className="text-sm text-slate-400">
									Translating to{" "}
									{LANGUAGES.find((l) => l.code === selectedLanguage)?.name}...
								</span>
							</div>
						) : translatedText ? (
							<pre className="whitespace-pre-wrap text-sm text-slate-300 leading-relaxed font-sans animate-in fade-in duration-500">
								{translatedText}
							</pre>
						) : (
							!error && (
								<p className="text-sm text-slate-600 italic">
									Translation will appear here
								</p>
							)
						)}
					</div>
				</div>
			</div>
		</Modal>
	);
};
