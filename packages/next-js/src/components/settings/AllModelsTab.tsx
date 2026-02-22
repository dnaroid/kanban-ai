"use client";

import { useState, useMemo } from "react";
import {
	Search,
	Cpu,
	ToggleLeft,
	ToggleRight,
	ChevronDown,
	ChevronRight,
	Maximize2,
	Minimize2,
	Gift,
	RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OpencodeModel } from "@/types/ipc";

type AllModelsTabProps = {
	models: OpencodeModel[];
	handleToggleModelAction: (name: string, enabled: boolean) => Promise<void>;
	handleToggleAllAction: (
		targetModels: OpencodeModel[],
		enabled: boolean,
	) => Promise<void>;
	handleRefreshModelsAction: () => Promise<void>;
	onStatusChangeAction?: (status: {
		message: string;
		type: "success" | "error" | "info";
	}) => void;
};

export function AllModelsTab({
	models,
	handleToggleModelAction,
	handleToggleAllAction,
	handleRefreshModelsAction,
	onStatusChangeAction: _onStatusChangeAction,
}: AllModelsTabProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
		{},
	);
	const [showFreeOnly, setShowFreeOnly] = useState(false);

	const filteredModels = useMemo(() => {
		return models.filter((m) => {
			const matchesSearch = m.name
				.toLowerCase()
				.includes(searchQuery.toLowerCase());
			const matchesFree =
				!showFreeOnly || m.name.toLowerCase().includes("free");
			return matchesSearch && matchesFree;
		});
	}, [models, searchQuery, showFreeOnly]);

	const stats = useMemo(() => {
		const total = filteredModels.length;
		const enabled = filteredModels.filter((m) => m.enabled).length;
		return { total, enabled };
	}, [filteredModels]);

	const groupedModels = useMemo(() => {
		const groups: Record<string, { models: OpencodeModel[]; enabled: number }> =
			{};
		filteredModels.forEach((model) => {
			const chunks = model.name.split("/");
			const providerName = chunks.length > 1 ? chunks[0] : "Other";
			if (!groups[providerName]) {
				groups[providerName] = { models: [], enabled: 0 };
			}
			groups[providerName].models.push(model);
			if (model.enabled) groups[providerName].enabled += 1;
		});
		return groups;
	}, [filteredModels]);

	const allProviders = Object.keys(groupedModels).sort();
	const isAllEnabled = stats.total > 0 && stats.enabled === stats.total;

	const toggleGroup = (provider: string) => {
		setExpandedGroups((prev) => ({
			...prev,
			[provider]: !prev[provider],
		}));
	};

	const setAllExpanded = (expanded: boolean) => {
		const newExpanded: Record<string, boolean> = {};
		allProviders.forEach((provider) => {
			newExpanded[provider] = expanded;
		});
		setExpandedGroups(newExpanded);
	};

	const getProviderColor = (name: string) => {
		let hash = 0;
		for (let i = 0; i < name.length; i += 1) {
			hash = name.charCodeAt(i) + ((hash << 5) - hash);
		}
		const h = Math.abs(hash) % 360;
		return {
			border: `hsla(${h}, 70%, 50%, 0.4)`,
			bg: `hsla(${h}, 70%, 50%, 0.05)`,
			text: `hsl(${h}, 70%, 60%)`,
		};
	};

	const hasSearchOrFilter = searchQuery.trim().length > 0 || showFreeOnly;
	const effectiveExpandedGroups = hasSearchOrFilter
		? Object.fromEntries(allProviders.map((provider) => [provider, true]))
		: expandedGroups;

	return (
		<div className="flex flex-col">
			<div className="flex-none bg-[#0B0E14] border-b border-slate-800/60 pb-6 mb-6 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/10">
						<Cpu className="w-5 h-5" />
					</div>
					<div>
						<div className="flex items-center gap-2">
							<span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] leading-none">
								Enabled Models
							</span>
						</div>
						<p className="text-xl font-black text-white tracking-tight leading-none mt-1">
							{stats.enabled} <span className="text-slate-600">/ {stats.total}</span>
						</p>
					</div>
				</div>

								<div className="flex items-center gap-3 flex-wrap">
									<button
										type="button"
										onClick={() => void handleRefreshModelsAction()}
										className="h-10 w-10 flex items-center justify-center bg-[#161B26] border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white rounded-xl transition-all shadow-sm"
										title="Refresh models"
									>
										<RefreshCw className="w-4 h-4" />
									</button>
									
									<div className="w-px h-8 bg-slate-800/60 mx-1" />
				
									<div className="flex items-center h-10 bg-[#161B26] border border-slate-700 rounded-xl p-1 shadow-sm">
										<button
											type="button"
											onClick={() => setShowFreeOnly(!showFreeOnly)}
											className={cn(
												"h-8 rounded-lg transition-all flex items-center gap-2 px-3",
												showFreeOnly
													? "bg-emerald-500/20 text-emerald-400"
													: "hover:bg-slate-800 text-slate-400 hover:text-slate-200",
											)}
										>
											<Gift className="w-4 h-4" />
											<span className="text-[10px] font-bold uppercase tracking-widest">
												Free Only
											</span>
										</button>
										<div className="w-px h-4 bg-slate-700 mx-1" />
										<button
											type="button"
											onClick={() => setAllExpanded(true)}
											className="w-8 h-8 flex items-center justify-center hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all"
											title="Expand All"
										>
											<Maximize2 className="w-4 h-4" />
										</button>
										<button
											type="button"
											onClick={() => setAllExpanded(false)}
											className="w-8 h-8 flex items-center justify-center hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all"
											title="Collapse All"
										>
											<Minimize2 className="w-4 h-4" />
										</button>
									</div>
					<div className="relative">
						<Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
						<input
							type="text"
							placeholder="Search models..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-10 pr-4 py-2.5 bg-[#161B26] border border-slate-700 rounded-xl text-sm text-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all w-48 placeholder:text-slate-500 shadow-sm"
						/>
					</div>

					<button
						type="button"
						onClick={() =>
							void handleToggleAllAction(filteredModels, !isAllEnabled)
						}
						className={cn(
							"h-10 px-4 text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-lg",
							isAllEnabled
								? "bg-slate-800 text-slate-400"
								: "bg-blue-600 text-white shadow-blue-600/20 hover:bg-blue-500",
						)}
					>
						{isAllEnabled ? (
							<ToggleLeft className="w-4 h-4" />
						) : (
							<ToggleRight className="w-4 h-4" />
						)}
						<span>{isAllEnabled ? "Disable All" : "Enable All"}</span>
					</button>
				</div>
			</div>

			<div className="space-y-4 pb-20">
				{allProviders.length === 0 ? (
						<div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800/60">
							<p className="text-slate-500 text-sm">
								No models found matching your search
							</p>
						</div>
					) : (
						allProviders.map((provider) => {
							const group = groupedModels[provider];
							const isExpanded = effectiveExpandedGroups[provider] || false;
							const isProviderAllEnabled =
								group.enabled === group.models.length;
							const hasEnabledModels = group.enabled > 0;
							const colors = getProviderColor(provider);

							return (
								<div
									key={provider}
									className={cn(
										"border rounded-2xl overflow-hidden shadow-xl transition-all duration-300",
										hasEnabledModels ? "shadow-blue-500/5" : "",
									)}
									style={{
										backgroundColor: colors.bg,
										borderColor: hasEnabledModels
											? colors.border
											: "rgba(30, 41, 59, 0.5)",
									}}
								>
									<div
										className={cn(
											"flex items-center justify-between p-4 transition-all hover:bg-white/5",
										)}
									>
										<div 
											className="flex items-center gap-3 cursor-pointer flex-1"
											onClick={() => toggleGroup(provider)}
										>
											<div
												className="transition-colors"
												style={{
													color: hasEnabledModels
														? colors.text
														: "rgb(100, 116, 139)",
												}}
											>
												{isExpanded ? (
													<ChevronDown className="w-4 h-4" />
												) : (
													<ChevronRight className="w-4 h-4" />
												)}
											</div>
											<h4
												className="text-[10px] font-black uppercase tracking-[0.2em] transition-colors"
												style={{
													color: hasEnabledModels
														? "white"
														: "rgb(148, 163, 184)",
												}}
											>
												{provider}
											</h4>
											<span
												className="px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all"
												style={{
													backgroundColor: hasEnabledModels
														? colors.bg
														: "rgba(30, 41, 59, 1)",
													color: hasEnabledModels
														? colors.text
														: "rgb(100, 116, 139)",
													borderColor: hasEnabledModels
														? colors.border
														: "rgba(51, 65, 85, 0.5)",
												}}
											>
												{group.enabled} / {group.models.length}
											</span>
										</div>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												void handleToggleAllAction(
													group.models,
													!isProviderAllEnabled,
												);
											}}
											className={cn(
												"w-8 h-4.5 rounded-full transition-all relative flex items-center px-1 cursor-pointer",
											)}
											style={{
												backgroundColor: isProviderAllEnabled
													? colors.text
													: "rgb(51, 65, 85)",
											}}
										>
											<div
												className={cn(
													"w-2.5 h-2.5 rounded-full bg-white transition-all shadow-sm",
													isProviderAllEnabled
														? "translate-x-3.5"
														: "translate-x-0",
												)}
											/>
										</button>
									</div>

									{isExpanded && (
										<div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
											{group.models.map((model) => {
												const chunks = model.name.split("/");
												const modelDisplayName = chunks[chunks.length - 1];
												return (
													<button
														type="button"
														key={model.name}
														onClick={() =>
															void handleToggleModelAction(
																model.name,
																!model.enabled,
															)
														}
														className={cn(
															"group relative p-4 rounded-xl border transition-all cursor-pointer",
														)}
														style={{
															backgroundColor: model.enabled
																? "rgba(255, 255, 255, 0.03)"
																: "transparent",
															borderColor: model.enabled
																? colors.border
																: "rgba(30, 41, 59, 0.6)",
														}}
													>
														<div className="flex items-center justify-between gap-3">
															<div className="flex-1 min-w-0">
																<div className="text-sm font-bold text-slate-200 truncate group-hover:text-white transition-colors">
																	{modelDisplayName}
																</div>
																<div className="text-[10px] text-slate-500 font-medium truncate">
																	{model.name}
																</div>
															</div>
															<div
																className={cn(
																	"w-8 h-4.5 rounded-full transition-all relative flex items-center px-1",
																)}
																style={{
																	backgroundColor: model.enabled
																		? colors.text
																		: "rgb(51, 65, 85)",
																}}
															>
																<div
																	className={cn(
																		"w-2.5 h-2.5 rounded-full bg-white transition-all shadow-sm",
																		model.enabled
																			? "translate-x-3.5"
																			: "translate-x-0",
																	)}
																/>
															</div>
														</div>
													</button>
												);
											})}
										</div>
									)}
								</div>
							);
						})
					)}
				</div>
			</div>
	);
}
