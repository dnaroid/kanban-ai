export type SoundId = "done" | "question" | "fail";

const SOUND_PATHS: Record<SoundId, string> = {
	done: "/sounds/done.wav",
	question: "/sounds/question.wav",
	fail: "/sounds/fail.wav",
};

const MUTE_KEY = "sound-muted";

const audioCache = new Map<string, HTMLAudioElement>();

function getAudio(src: string): HTMLAudioElement {
	const cached = audioCache.get(src);
	if (cached) return cached;

	const audio = new Audio(src);
	audio.preload = "auto";
	audioCache.set(src, audio);
	return audio;
}

export function isMuted(): boolean {
	if (typeof window === "undefined") return false;
	return localStorage.getItem(MUTE_KEY) === "true";
}

export function setMuted(muted: boolean): void {
	localStorage.setItem(MUTE_KEY, String(muted));
}

export async function playSound(id: SoundId): Promise<void> {
	if (typeof window === "undefined") return;
	if (isMuted()) return;

	const src = SOUND_PATHS[id];
	if (!src) return;

	const audio = getAudio(src);

	try {
		audio.currentTime = 0;
		await audio.play();
	} catch {
		// Autoplay policy or other browser restriction — ignore silently.
	}
}

const DEBOUNCE_MS = 500;
const lastPlayedAt = new Map<SoundId, number>();

export async function playSoundDebounced(id: SoundId): Promise<void> {
	const now = Date.now();
	const last = lastPlayedAt.get(id) ?? 0;
	if (now - last < DEBOUNCE_MS) return;
	lastPlayedAt.set(id, now);
	return playSound(id);
}
