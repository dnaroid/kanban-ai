"use client";

import { useCallback, useSyncExternalStore } from "react";

export type STTLanguage = "ru-RU" | "en-US";

const STORAGE_KEY = "stt-language";
const DEFAULT_LANGUAGE: STTLanguage = "ru-RU";

const SUPPORTED_LANGUAGES: STTLanguage[] = ["ru-RU", "en-US"];

function getSnapshot(): STTLanguage {
	if (typeof window === "undefined") return DEFAULT_LANGUAGE;
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored && SUPPORTED_LANGUAGES.includes(stored as STTLanguage)) {
		return stored as STTLanguage;
	}
	return DEFAULT_LANGUAGE;
}

function getServerSnapshot(): STTLanguage {
	return DEFAULT_LANGUAGE;
}

function subscribe(callback: () => void): () => void {
	window.addEventListener("storage", callback);
	return () => window.removeEventListener("storage", callback);
}

export function useSTTLanguage() {
	const language = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
	);

	const setLanguage = useCallback((lang: STTLanguage) => {
		localStorage.setItem(STORAGE_KEY, lang);
		window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
	}, []);

	const toggleLanguage = useCallback(() => {
		setLanguage(language === "ru-RU" ? "en-US" : "ru-RU");
	}, [language, setLanguage]);

	return {
		language,
		setLanguage,
		toggleLanguage,
		supportedLanguages: SUPPORTED_LANGUAGES,
	};
}
