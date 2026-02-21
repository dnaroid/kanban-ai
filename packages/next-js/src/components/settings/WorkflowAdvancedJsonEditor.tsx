"use client";

import { useState } from "react";
import type { WorkflowConfig } from "@/lib/api-client";

interface WorkflowAdvancedJsonEditorProps {
	config: WorkflowConfig;
	onChange: (config: WorkflowConfig) => void;
	onError: (error: string | null) => void;
}

export function WorkflowAdvancedJsonEditor({
	config,
	onChange,
	onError,
}: WorkflowAdvancedJsonEditorProps) {
	const [localJson, setLocalJson] = useState(() =>
		JSON.stringify(config, null, 2),
	);

	const handleChange = (val: string) => {
		setLocalJson(val);
		try {
			const parsed = JSON.parse(val) as WorkflowConfig;
			onError(null);
			onChange(parsed);
		} catch (err) {
			onError(err instanceof Error ? err.message : "Invalid JSON");
		}
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-medium text-slate-300">Raw JSON Editor</h3>
				<span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
					Advanced Users Only
				</span>
			</div>
			<textarea
				value={localJson}
				onChange={(e) => handleChange(e.target.value)}
				spellCheck={false}
				className="h-[60vh] w-full rounded-2xl border border-slate-800/60 bg-[#0B0E14] p-4 font-mono text-sm leading-6 text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-blue-500/60"
			/>
		</div>
	);
}
