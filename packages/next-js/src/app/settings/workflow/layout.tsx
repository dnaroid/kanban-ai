"use client";

import { usePathname, useRouter } from "next/navigation";
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
	GitBranch,
} from "lucide-react";

import {
	WorkflowSettingsProvider,
	useWorkflowSettings,
} from "@/components/settings/WorkflowSettingsContext";
import { cn } from "@/lib/utils";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { useState } from "react";

const tabs: { id: string; label: string; icon: LucideIcon; path: string }[] = [
	{
		id: "events",
		label: "Events",
		icon: SlidersHorizontal,
		path: "/settings/workflow/events",
	},
	{
		id: "statuses",
		label: "Statuses",
		icon: ListTodo,
		path: "/settings/workflow/statuses",
	},
	{
		id: "columns",
		label: "Columns",
		icon: LayoutGrid,
		path: "/settings/workflow/columns",
	},
	{
		id: "transitions",
		label: "Transitions",
		icon: GitCompare,
		path: "/settings/workflow/transitions",
	},
	{
		id: "map",
		label: "Workflow Map",
		icon: MapIcon,
		path: "/settings/workflow/map",
	},
];

function WorkflowSettingsHeader() {
	const {
		isLoading,
		isSaving,
		isDirty,
		isValid,
		loadConfig,
		saveConfig,
		resetDraft,
		validationErrors,
		jsonError,
	} = useWorkflowSettings();

	const [showReloadConfirm, setShowReloadConfirm] = useState(false);
	const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

	const handleReloadClick = () => {
		if (isDirty) {
			setShowReloadConfirm(true);
		} else {
			void loadConfig();
		}
	};

	const handleDiscardClick = () => {
		setShowDiscardConfirm(true);
	};

	return (
		<div className="space-y-6">
			{/* Top Bar / Actions */}
			<div className="flex-none bg-[#0B0E14] border-b border-slate-800/60 pb-6 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div className="flex items-center gap-4">
					<div className="w-10 h-10 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center shadow-lg shadow-blue-500/10">
						<GitBranch className="w-5 h-5 text-blue-400" />
					</div>
					<div>
						<div className="flex items-center gap-2">
							<p className="text-xl font-black text-white tracking-tight leading-none">
								Workflow Engine
							</p>
							{isDirty ? (
								<div className="flex items-center gap-1.5 text-[8px] font-black text-amber-500 uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
									<AlertCircle className="h-2.5 w-2.5" />
									Unsaved
								</div>
							) : (
								<div className="flex items-center gap-1.5 text-[8px] font-black text-emerald-500 uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
									<CheckCircle2 className="h-2.5 w-2.5" />
									Synced
								</div>
							)}
						</div>
						<p className="text-[10px] text-slate-500 font-medium mt-1">
							Configure board columns, task statuses, and lifecycle transitions.
						</p>
					</div>
				</div>

				<div className="flex items-center gap-3">
					<button
						type="button"
						onClick={handleReloadClick}
						disabled={isLoading || isSaving}
						className="flex items-center gap-2 h-9 px-4 bg-slate-900/50 hover:bg-slate-800/70 disabled:opacity-30 text-slate-300 border border-slate-700/70 rounded-xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95"
					>
						<RefreshCw
							className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
						/>
						Reload
					</button>
					{isDirty && (
						<button
							type="button"
							onClick={handleDiscardClick}
							disabled={isLoading || isSaving}
							className="flex items-center gap-2 h-9 px-4 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl font-bold text-xs uppercase tracking-widest transition-all active:scale-95"
						>
							<Undo2 className="h-3.5 w-3.5" />
							Discard
						</button>
					)}
					<button
						type="button"
						onClick={() => void saveConfig()}
						disabled={isLoading || isSaving || !isDirty || !isValid}
						className={cn(
							"flex items-center gap-2 h-9 px-6 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-30 disabled:shadow-none",
							isValid && isDirty
								? "bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/20"
								: "bg-slate-800 text-slate-500 border border-slate-700/50",
						)}
					>
						{isSaving ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<Save className="h-3.5 w-3.5" />
						)}
						Apply
					</button>
				</div>
			</div>

			<ConfirmationModal
				isOpen={showReloadConfirm}
				onClose={() => setShowReloadConfirm(false)}
				onConfirm={() => void loadConfig()}
				title="Discard Changes & Reload"
				description="You have unsaved changes in your workflow configuration. Are you sure you want to reload? All local edits will be lost."
				confirmLabel="Reload & Discard"
				variant="warning"
			/>

			<ConfirmationModal
				isOpen={showDiscardConfirm}
				onClose={() => setShowDiscardConfirm(false)}
				onConfirm={resetDraft}
				title="Discard All Changes"
				description="Are you sure you want to reset all changes to the last saved state? This action cannot be undone."
				confirmLabel="Discard Changes"
				variant="danger"
			/>

			{/* Global Errors */}
			{!isValid && (
				<div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 animate-in slide-in-from-top-2 duration-300">
					<div className="flex gap-4">
						<div className="h-9 w-9 shrink-0 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
							<AlertCircle className="h-4 w-4 text-red-500" />
						</div>
						<div className="space-y-1">
							<p className="text-[10px] font-black text-red-400 uppercase tracking-widest">
								Configuration Errors
							</p>
							<ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0.5 text-[10px] text-red-500/70 font-medium">
								{jsonError && (
									<li className="flex items-center gap-2">
										<span className="h-1 w-1 rounded-full bg-red-500" />
										JSON: {jsonError}
									</li>
								)}
								{validationErrors.map((err) => (
									<li
										key={`${err.path}:${err.message}`}
										className="flex items-center gap-2"
									>
										<span className="h-1 w-1 rounded-full bg-red-500" />
										<span className="font-bold opacity-60 uppercase mr-1">
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
	);
}

function WorkflowSettingsNav() {
	const pathname = usePathname();
	const router = useRouter();

	return (
		<div className="flex items-center gap-1 border-b border-slate-800/40 px-2 mb-6">
			{tabs.map((tab) => {
				const Icon = tab.icon;
				const isActive = pathname === tab.path;
				return (
					<button
						key={tab.id}
						type="button"
						onClick={() => router.push(tab.path)}
						className={cn(
							"flex items-center gap-2 px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 -mb-[1px] relative",
							isActive
								? "border-blue-500 text-blue-400"
								: "border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-800",
						)}
					>
						<Icon className={cn("h-4 w-4", isActive ? "animate-pulse" : "")} />
						{tab.label}
						{isActive && (
							<div className="absolute inset-0 bg-blue-500/5 blur-xl -z-10 rounded-full" />
						)}
					</button>
				);
			})}
		</div>
	);
}

function WorkflowSettingsContent({ children }: { children: React.ReactNode }) {
	const { isLoading, draftConfig } = useWorkflowSettings();

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
		<div className="flex flex-col w-full h-full">
			<WorkflowSettingsHeader />
			<WorkflowSettingsNav />
			<div className="flex-1 animate-in fade-in duration-500">{children}</div>
		</div>
	);
}

export default function WorkflowSettingsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<WorkflowSettingsProvider>
			<div className="flex flex-col w-full h-full">
				<WorkflowSettingsContent>{children}</WorkflowSettingsContent>
			</div>
		</WorkflowSettingsProvider>
	);
}
