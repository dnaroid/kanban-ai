"use client";

import { Loader2, WifiOff } from "lucide-react";
import { useServerStatus } from "@/components/common/ServerStatusContext";

export function ServerStatusOverlay() {
	const { isServerDown } = useServerStatus();

	if (!isServerDown) {
		return null;
	}

	return (
		<div
			className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm pointer-events-auto"
			style={{ animation: "server-overlay-in 200ms ease-out" }}
		>
			<div className="flex h-full items-center justify-center p-6">
				<div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800/60 bg-[#0B0E14]/85 px-8 py-6 shadow-2xl">
					<div className="flex items-center justify-center gap-2 rounded-full bg-slate-900/40 px-4 py-2 text-slate-400 animate-pulse">
						<WifiOff className="h-4 w-4" />
						<Loader2 className="h-4 w-4 animate-spin" />
					</div>
					<p className="text-slate-200 text-lg font-medium">
						Server Unavailable
					</p>
					<p className="text-slate-400 text-sm">Attempting to reconnect...</p>
				</div>
			</div>
			<style>{`
				@keyframes server-overlay-in {
					from { opacity: 0; }
					to { opacity: 1; }
				}
			`}</style>
		</div>
	);
}
