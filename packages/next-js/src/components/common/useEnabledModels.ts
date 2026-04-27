import { useState, useEffect, useRef, useCallback } from "react";
import type { OpencodeModel } from "@/types/kanban";
import { api } from "@/lib/api-client";

type CacheEntry = {
	models: OpencodeModel[];
	timestamp: number;
};

const STALE_MS = 30_000;

let cache: CacheEntry | null = null;
let pending: Promise<OpencodeModel[]> | null = null;

const DIFFICULTY_ORDER: Record<string, number> = {
	easy: 0,
	medium: 1,
	hard: 2,
	epic: 3,
};

function sortByDifficulty(models: OpencodeModel[]): OpencodeModel[] {
	return [...models].sort((a, b) => {
		return (
			(DIFFICULTY_ORDER[a.difficulty] ?? 99) -
			(DIFFICULTY_ORDER[b.difficulty] ?? 99)
		);
	});
}

async function fetchEnabledModels(): Promise<OpencodeModel[]> {
	const now = Date.now();
	if (cache && now - cache.timestamp < STALE_MS) {
		return cache.models;
	}

	if (pending) {
		return pending;
	}

	pending = api.opencode
		.listEnabledModels()
		.then((response) => {
			const sorted = sortByDifficulty(response.models);
			cache = { models: sorted, timestamp: Date.now() };
			pending = null;
			return sorted;
		})
		.catch((error: unknown) => {
			pending = null;
			throw error;
		});

	return pending;
}

export function invalidateEnabledModelsCache(): void {
	cache = null;
}

export function useEnabledModels() {
	const [models, setModels] = useState<OpencodeModel[]>(() => {
		if (cache) return cache.models;
		return [];
	});
	const [loading, setLoading] = useState(() => !cache);
	const mountedRef = useRef(true);

	const load = useCallback(async () => {
		if (cache && Date.now() - cache.timestamp < STALE_MS) {
			setModels(cache.models);
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const result = await fetchEnabledModels();
			if (mountedRef.current) {
				setModels(result);
			}
		} catch (error) {
			console.error("Failed to load enabled models:", error);
		} finally {
			if (mountedRef.current) {
				setLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		void load();
		return () => {
			mountedRef.current = false;
		};
	}, [load]);

	return { models, loading, reload: load };
}
