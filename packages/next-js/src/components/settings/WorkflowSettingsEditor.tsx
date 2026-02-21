"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save, Loader2 } from "lucide-react";

import { api } from "@/lib/api-client";
import type { WorkflowConfig } from "@/lib/api-client";
import { useSettingsStatus } from "@/components/settings/SettingsStatusContext";

function toPrettyJson(value: WorkflowConfig): string {
	return JSON.stringify(value, null, 2);
}

export function WorkflowSettingsEditor() {
	const { setStatus } = useSettingsStatus();
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [jsonValue, setJsonValue] = useState("");

	const loadConfig = useCallback(async () => {
		setIsLoading(true);
		try {
			const config = await api.workflow.getConfig();
			setJsonValue(toPrettyJson(config));
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to load workflow configuration";
			setStatus({ type: "error", message });
		} finally {
			setIsLoading(false);
		}
	}, [setStatus]);

	useEffect(() => {
		void loadConfig();
	}, [loadConfig]);

	const saveConfig = async () => {
		setIsSaving(true);
		try {
			const parsed = JSON.parse(jsonValue) as WorkflowConfig;
			const saved = await api.workflow.updateConfig(parsed);
			setJsonValue(toPrettyJson(saved));
			setStatus({
				type: "success",
				message: "Workflow configuration saved",
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to save workflow configuration";
			setStatus({ type: "error", message });
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="space-y-5">
			<div className="rounded-2xl border border-slate-800/50 bg-slate-900/40 p-5">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 className="text-lg font-semibold text-slate-100">
							Workflow Config
						</h2>
						<p className="text-sm text-slate-400">
							JSON editor for workflow statuses, columns and transitions.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => void loadConfig()}
							disabled={isLoading || isSaving}
							className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{isLoading ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<RefreshCw className="h-4 w-4" />
							)}
							Reload
						</button>
						<button
							type="button"
							onClick={() => void saveConfig()}
							disabled={isLoading || isSaving}
							className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{isSaving ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Save className="h-4 w-4" />
							)}
							Save
						</button>
					</div>
				</div>
			</div>

			<textarea
				value={jsonValue}
				onChange={(event) => setJsonValue(event.target.value)}
				spellCheck={false}
				className="h-[65vh] w-full rounded-2xl border border-slate-800/60 bg-[#0B0E14] p-4 font-mono text-sm leading-6 text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-blue-500/60"
				placeholder={isLoading ? "Loading workflow configuration..." : "{}"}
			/>
		</div>
	);
}
