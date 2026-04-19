"use client";

import { useEffect, useRef } from "react";
import type { SoundId } from "@/lib/sounds";
import { playSoundDebounced } from "@/lib/sounds";
import type { RunStatus, RunLastExecutionStatus } from "@/types/ipc";

type RunMetadata = {
	lastExecutionStatus?: RunLastExecutionStatus;
	[key: string]: unknown;
};

type SseRunEventPayload = {
	runId?: string;
	status?: RunStatus;
	metadata?: RunMetadata;
	[eventKey: string]: unknown;
};

const DONE_MARKERS = new Set(["done", "test_ok"]);

function resolveSound(
	status: RunStatus,
	metadata?: RunMetadata,
): SoundId | null {
	if (status === "completed") {
		const marker = metadata?.lastExecutionStatus?.marker;
		if (marker && DONE_MARKERS.has(marker)) return "done";
		return null;
	}
	if (status === "failed") return "fail";
	return null;
}

const ATTENTION_CHANNELS = new Set(["run:permission", "run:question"]);

export function useRunSoundNotifications(): void {
	const previousStatuses = useRef<Map<string, RunStatus>>(new Map());
	const initialized = useRef(false);

	useEffect(() => {
		const token = localStorage.getItem("token");
		const params = new URLSearchParams();
		if (token) params.set("token", token);
		const query = params.toString();
		const url = query.length > 0 ? `/events?${query}` : "/events";

		const eventSource = new EventSource(url);

		eventSource.addEventListener("run:event", (event) => {
			const payload = JSON.parse(event.data) as SseRunEventPayload;
			const { runId, status, metadata } = payload;
			if (!runId || !status) return;

			const prev = initialized.current
				? previousStatuses.current.get(runId)
				: undefined;

			previousStatuses.current.set(runId, status);
			initialized.current = true;

			if (prev === undefined) return;

			if (prev === status) return;

			const sound = resolveSound(status, metadata);
			if (sound) {
				void playSoundDebounced(sound);
			}
		});

		for (const channel of ATTENTION_CHANNELS) {
			eventSource.addEventListener(channel, () => {
				void playSoundDebounced("question");
			});
		}

		eventSource.onerror = () => {};

		const statuses = previousStatuses.current;

		return () => {
			eventSource.close();
			statuses.clear();
			initialized.current = false;
		};
	}, []);
}
