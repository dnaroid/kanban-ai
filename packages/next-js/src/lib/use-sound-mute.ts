"use client";

import { useCallback, useEffect, useState } from "react";
import { isMuted, setMuted as persistMuted } from "@/lib/sounds";

export function useSoundMute() {
	const [muted, setMutedState] = useState(true);

	useEffect(() => {
		setMutedState(isMuted());
	}, []);

	const toggleMute = useCallback(() => {
		setMutedState((prev) => {
			const next = !prev;
			persistMuted(next);
			return next;
		});
	}, []);

	return { muted, toggleMute };
}
