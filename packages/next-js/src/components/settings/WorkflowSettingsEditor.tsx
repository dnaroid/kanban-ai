"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import {
	RefreshCw,
	Save,
	Loader2,
	AlertCircle,
	CheckCircle2,
	Undo2,
	LayoutGrid,
	ListTodo,
	GitCompare,
	Map as MapIcon,
	SlidersHorizontal,
	type LucideIcon,
} from "lucide-react";

import { api } from "@/lib/api-client";
import type { WorkflowConfig } from "@/lib/api-client";
import { useSettingsStatus } from "@/components/settings/SettingsStatusContext";
import { cn } from "@/lib/utils";

import { WorkflowColumnsEditor } from "./WorkflowColumnsEditor";
import { WorkflowStatusesEditor } from "./WorkflowStatusesEditor";
import { WorkflowTransitionsEditor } from "./WorkflowTransitionsEditor";
import { WorkflowEngineSignalsEditor } from "./WorkflowEngineSignalsEditor";
import { WorkflowMermaid } from "./WorkflowMermaid";
import {
	validateWorkflowConfig,
	isWorkflowConfigDirty,
} from "./workflow-validation";

type EditorTab = "visual" | "columns" | "statuses" | "transitions" | "engine";

const tabs: { id: EditorTab; label: string; icon: LucideIcon }[] = [
	{ id: "engine", label: "Engine", icon: SlidersHorizontal },
	{ id: "statuses", label: "Statuses", icon: ListTodo },
	{ id: "columns", label: "Columns", icon: LayoutGrid },
	{ id: "transitions", label: "Transitions", icon: GitCompare },
	{ id: "visual", label: "Workflow Map", icon: MapIcon },
];

export function WorkflowSettingsEditor() {
	const { setStatus } = useSettingsStatus();
	const [activeTab, setActiveTab] = useState<EditorTab>("engine");
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);

	const [originalConfig, setOriginalConfig] = useState<WorkflowConfig | null>(
		null,
	);
	const [draftConfig, setDraftConfig] = useState<WorkflowConfig | null>(null);
	const [jsonError, setJsonError] = useState<string | null>(null);

	const isDirty = useMemo(() => {
		if (!originalConfig || !draftConfig) return false;
		return isWorkflowConfigDirty(originalConfig, draftConfig);
	}, [originalConfig, draftConfig]);

	const validationErrors = useMemo(() => {
		if (!draftConfig) return [];
		return validateWorkflowConfig(draftConfig);
	}, [draftConfig]);

	const isValid = validationErrors.length === 0 && !jsonError;

	const loadConfig = useCallback(
		async (confirm = true, hasUnsavedChanges = false) => {
			if (confirm && hasUnsavedChanges) {
				if (
					!window.confirm(
						"You have unsaved changes. Are you sure you want to reload and discard them?",
					)
				) {
					return;
				}
			}

			setIsLoading(true);
			try {
				const config = await api.workflow.getConfig();
				setOriginalConfig(config);
				setDraftConfig(JSON.parse(JSON.stringify(config)));
				setJsonError(null);
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to load workflow configuration";
				setStatus({ type: "error", message });
			} finally {
				setIsLoading(false);
			}
		},
		[setStatus],
	);

	useEffect(() => {
		void loadConfig(false);
	}, [loadConfig]);

	const saveConfig = async () => {
		if (!draftConfig || !isValid) return;

		setIsSaving(true);
		try {
			const saved = await api.workflow.updateConfig(draftConfig);
			setOriginalConfig(saved);
			setDraftConfig(JSON.parse(JSON.stringify(saved)));
			setStatus({
				type: "success",
				message: "Workflow configuration saved successfully",
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

	const resetDraft = () => {
		if (!originalConfig) return;
		if (
			window.confirm(
				"Are you sure you want to reset all changes to the last saved state?",
			)
		) {
			setDraftConfig(JSON.parse(JSON.stringify(originalConfig)));
			setJsonError(null);
		}
	};

	const updateDraft = (updates: Partial<WorkflowConfig>) => {
		setJsonError(null);
		setDraftConfig((prev) => (prev ? { ...prev, ...updates } : null));
	};

	if (isLoading && !draftConfig) {
		return (
			<div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800/40 bg-slate-900/10">
				<div className="flex flex-col items-center gap-4">
					<Loader2 className="h-8 w-8 animate-spin text-blue-500" />
					<p className="text-sm font-medium text-slate-500">
						Loading workflow configuration...
					</p>
				</div>
			</div>
		);
	}

	if (!draftConfig) return null;

	return (
		<div className="space-y-6">
			{/* Top Bar / Actions */}
			<div className="rounded-2xl border border-slate-800/50 bg-slate-900/40 p-5">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div className="flex items-center gap-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
							<RefreshCw
								className={cn("h-6 w-6", isLoading && "animate-spin")}
							/>
						</div>
						<div>
							<h2 className="text-lg font-bold text-slate-100">
								Workflow Engine
							</h2>
							<div className="flex items-center gap-2">
								{isDirty ? (
									<div className="flex items-center gap-1.5 text-xs font-bold text-amber-500 uppercase tracking-tight">
										<AlertCircle className="h-3.5 w-3.5" />
										Unsaved Changes
									</div>
								) : (
									<div className="flex items-center gap-1.5 text-xs font-bold text-emerald-500 uppercase tracking-tight">
										<CheckCircle2 className="h-3.5 w-3.5" />
										Everything Saved
									</div>
								)}
							</div>
						</div>
					</div>

					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => void loadConfig(true, isDirty)}
							disabled={isLoading || isSaving}
							className="group inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 transition-all"
						>
							<RefreshCw className="h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />
							Reload
						</button>
						{isDirty && (
							<button
								type="button"
								onClick={resetDraft}
								disabled={isLoading || isSaving}
								className="inline-flex items-center gap-2 rounded-xl border border-slate-800 px-4 py-2 text-sm font-semibold text-slate-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
							>
								<Undo2 className="h-4 w-4" />
								Reset
							</button>
						)}
						<button
							type="button"
							onClick={() => void saveConfig()}
							disabled={isLoading || isSaving || !isDirty || !isValid}
							className={cn(
								"inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50",
								isValid && isDirty
									? "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20"
									: "bg-slate-800 text-slate-500",
							)}
						>
							{isSaving ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Save className="h-4 w-4" />
							)}
							Save Configuration
						</button>
					</div>
				</div>

				{/* Global Errors */}
				{!isValid && (
					<div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
						<div className="flex gap-3">
							<AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
							<div className="space-y-1">
								<p className="text-sm font-bold text-red-400">
									Configuration is invalid
								</p>
								<ul className="list-inside list-disc space-y-0.5 text-xs text-red-500/80">
									{jsonError && <li>JSON Error: {jsonError}</li>}
									{validationErrors.map((err) => (
										<li key={`${err.path}:${err.message}`}>
											<span className="font-mono text-[10px] bg-red-500/10 px-1 rounded uppercase mr-2">
												{err.path}:
											</span>
											{err.message}
										</li>
									))}
								</ul>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Sub-tabs Navigation */}
			<div className="flex items-center gap-2 border-b border-slate-800/40 px-2">
				{tabs.map((tab) => {
					const Icon = tab.icon;
					const isActive = activeTab === tab.id;
					return (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={cn(
								"flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 -mb-[1px]",
								isActive
									? "border-blue-500 text-blue-400"
									: "border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-800",
							)}
						>
							<Icon className="h-4 w-4" />
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* Tab Content */}
			<div className="min-h-[400px]">
				{activeTab === "visual" && (
					<div className="space-y-8">
						<WorkflowMermaid config={draftConfig} />
					</div>
				)}

				{activeTab === "columns" && (
					<WorkflowColumnsEditor
						columns={draftConfig.columns}
						statuses={draftConfig.statuses}
						onChange={(cols) => updateDraft({ columns: cols })}
					/>
				)}

				{activeTab === "statuses" && (
					<WorkflowStatusesEditor
						statuses={draftConfig.statuses}
						columns={draftConfig.columns}
						onChange={(stats) => updateDraft({ statuses: stats })}
					/>
				)}

				{activeTab === "transitions" && (
					<WorkflowTransitionsEditor
						statusTransitions={draftConfig.statusTransitions}
						columnTransitions={draftConfig.columnTransitions}
						statuses={draftConfig.statuses}
						columns={draftConfig.columns}
						onStatusTransitionsChange={(st) =>
							updateDraft({ statusTransitions: st })
						}
						onColumnTransitionsChange={(ct) =>
							updateDraft({ columnTransitions: ct })
						}
					/>
				)}

				{activeTab === "engine" && (
					<WorkflowEngineSignalsEditor
						signals={draftConfig.signals}
						signalRules={draftConfig.signalRules}
						statuses={draftConfig.statuses}
						onSignalsChange={(signals) => updateDraft({ signals })}
						onSignalRulesChange={(signalRules) => updateDraft({ signalRules })}
						onErrorChange={setJsonError}
					/>
				)}
			</div>
		</div>
	);
}
