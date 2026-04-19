"use client";

import { useEffect, useRef } from "react";
import type { SoundId } from "@/lib/sounds";
import { playSoundDebounced } from "@/lib/sounds";
import type { RunStatus } from "@/types/ipc";

type SseRunEventPayload = {
	runId?: string;
	status?: RunStatus;
	[eventKey: string]: unknown;
};

const STATUS_TO_SOUND: Partial<Record<RunStatus, SoundId>> = {
	completed: "done",
	failed: "fail",
};

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
			const { runId, status } = payload;
			if (!runId || !status) return;

			const prev = initialized.current
				? previousStatuses.current.get(runId)
				: undefined;

			previousStatuses.current.set(runId, status);
			initialized.current = true;

			if (prev === undefined) return;

			if (prev === status) return;

			const sound = STATUS_TO_SOUND[status];
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
