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
} from "lucide-react";

import {
	WorkflowSettingsProvider,
	useWorkflowSettings,
} from "@/components/settings/WorkflowSettingsContext";
import { cn } from "@/lib/utils";

const tabs: { id: string; label: string; icon: LucideIcon; path: string }[] = [
	{ id: "events", label: "Events", icon: SlidersHorizontal, path: "/settings/workflow/events" },
	{ id: "statuses", label: "Statuses", icon: ListTodo, path: "/settings/workflow/statuses" },
	{ id: "columns", label: "Columns", icon: LayoutGrid, path: "/settings/workflow/columns" },
	{ id: "transitions", label: "Transitions", icon: GitCompare, path: "/settings/workflow/transitions" },
	{ id: "map", label: "Workflow Map", icon: MapIcon, path: "/settings/workflow/map" },
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

	return (
		<div className="space-y-8">
			{/* Top Bar / Actions */}
			<div className="rounded-3xl border border-slate-800/60 bg-[#0B0E14]/40 p-6 shadow-2xl backdrop-blur-md">
				<div className="flex flex-wrap items-center justify-between gap-6">
					<div className="flex items-center gap-5">
						<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_20px_-5px_rgba(59,130,246,0.3)]">
							<RefreshCw
								className={cn("h-7 w-7", isLoading && "animate-spin")}
							/>
						</div>
						<div>
							<h2 className="text-2xl font-bold text-slate-100 tracking-tight">
								Workflow Engine
							</h2>
							<div className="flex items-center gap-3 mt-1">
								{isDirty ? (
									<div className="flex items-center gap-2 text-[10px] font-black text-amber-500 uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
										<AlertCircle className="h-3 w-3" />
										Unsaved Changes
									</div>
								) : (
									<div className="flex items-center gap-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
										<CheckCircle2 className="h-3 w-3" />
										Fully Synced
									</div>
								)}
								<span className="h-1 w-1 rounded-full bg-slate-700" />
								<span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
									v1.0.4-engine
								</span>
							</div>
						</div>
					</div>

					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => void loadConfig(true, isDirty)}
							disabled={isLoading || isSaving}
							className="group inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/20 px-4 py-2.5 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 transition-all active:scale-95"
						>
							<RefreshCw className="h-4 w-4 group-hover:rotate-180 transition-transform duration-700" />
							Reload
						</button>
						{isDirty && (
							<button
								type="button"
								onClick={resetDraft}
								disabled={isLoading || isSaving}
								className="inline-flex items-center gap-2 rounded-xl border border-slate-800/40 px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 transition-all active:scale-95"
							>
								<Undo2 className="h-4 w-4" />
								Discard
							</button>
						)}
						<button
							type="button"
							onClick={() => void saveConfig()}
							disabled={isLoading || isSaving || !isDirty || !isValid}
							className={cn(
								"inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-black uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-30 active:scale-95",
								isValid && isDirty
									? "bg-blue-600 text-white hover:bg-blue-500 shadow-[0_0_25px_-5px_rgba(37,99,235,0.4)]"
									: "bg-slate-800 text-slate-500 border border-slate-700/50",
							)}
						>
							{isSaving ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Save className="h-4 w-4" />
							)}
							Apply Changes
						</button>
					</div>
				</div>

				{/* Global Errors */}
				{!isValid && (
					<div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-5 animate-in slide-in-from-top-2 duration-300">
						<div className="flex gap-4">
							<div className="h-10 w-10 shrink-0 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
								<AlertCircle className="h-5 w-5 text-red-500" />
							</div>
							<div className="space-y-2">
								<p className="text-sm font-black text-red-400 uppercase tracking-tight">
									Workflow Configuration Errors
								</p>
								<ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-xs text-red-500/70 font-medium">
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
		</div>
	);
}

function WorkflowSettingsNav() {
	const pathname = usePathname();
	const router = useRouter();

	return (
		<div className="flex items-center gap-1 border-b border-slate-800/40 px-2">
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
						<Icon
							className={cn("h-4 w-4", isActive ? "animate-pulse" : "")}
						/>
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
		<div className="space-y-8 pb-10">
			<WorkflowSettingsHeader />
			<WorkflowSettingsNav />
			<div className="min-h-[500px] animate-in fade-in duration-500">
				{children}
			</div>
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
			<div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">
				<div className="max-w-[1400px] mx-auto p-8">
					<WorkflowSettingsContent>{children}</WorkflowSettingsContent>
				</div>
			</div>
		</WorkflowSettingsProvider>
	);
}
