"use client";

import { useMemo, useState } from "react";
import {
	AlertCircle,
	ChevronDown,
	ChevronRight,
	Cpu,
	Maximize2,
	Minimize2,
	Star,
	Trash2,
} from "lucide-react";
import { ModelPicker } from "@/components/common/ModelPicker";
import { cn } from "@/lib/utils";
import type { OpencodeModel } from "@/types/kanban";

type Difficulty = "easy" | "medium" | "hard" | "epic";

type MyModelsTabProps = {
	models: OpencodeModel[];
	defaultModels: Record<string, string>;
	onStatusChangeAction: (status: {
		message: string;
		type: "info" | "error" | "success";
	}) => void;
	handleToggleModelAction: (name: string, enabled: boolean) => Promise<void>;
	handleUpdateDifficultyAction: (
		name: string,
		difficulty: Difficulty,
	) => Promise<void>;
	handleSetDefaultModelAction: (
		difficulty: Difficulty,
		modelName: string,
		variant?: string,
	) => Promise<void>;
};

const difficulties = [
	{
		value: "easy",
		label: "Easy",
		color: "text-emerald-400",
		bg: "bg-emerald-500/10",
	},
	{
		value: "medium",
		label: "Medium",
		color: "text-blue-400",
		bg: "bg-blue-500/10",
	},
	{
		value: "hard",
		label: "Hard",
		color: "text-orange-400",
		bg: "bg-orange-500/10",
	},
	{
		value: "epic",
		label: "Epic",
		color: "text-purple-400",
		bg: "bg-purple-500/10",
	},
] as const;

export function MyModelsTab({
	models,
	defaultModels,
	onStatusChangeAction: _onStatusChangeAction,
	handleToggleModelAction,
	handleUpdateDifficultyAction,
	handleSetDefaultModelAction,
}: MyModelsTabProps) {
	const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
		{},
	);

	const enabledModels = useMemo(
		() => models.filter((m) => m.enabled),
		[models],
	);

	const enabledModelsByDifficulty = useMemo(() => {
		const groups: Record<Difficulty, OpencodeModel[]> = {
			easy: [],
			medium: [],
			hard: [],
			epic: [],
		};

		enabledModels.forEach((m) => {
			groups[m.difficulty].push(m);
		});

		return groups;
	}, [enabledModels]);

	const toggleGroup = (id: string) => {
		setExpandedGroups((prev) => ({
			...prev,
			[id]: !prev[id],
		}));
	};

	const setAllExpanded = (expanded: boolean) => {
		const newExpanded: Record<string, boolean> = {};
		difficulties.forEach((d) => {
			newExpanded[`diff:${d.value}`] = expanded;
		});
		setExpandedGroups(newExpanded);
	};

	const getDifficultyStyles = (diff: Difficulty) => {
		switch (diff) {
			case "easy":
				return {
					border: "rgba(16, 185, 129, 0.4)",
					bg: "rgba(16, 185, 129, 0.05)",
					text: "rgb(52, 211, 153)",
				};
			case "medium":
				return {
					border: "rgba(59, 130, 246, 0.4)",
					bg: "rgba(59, 130, 246, 0.05)",
					text: "rgb(96, 165, 250)",
				};
			case "hard":
				return {
					border: "rgba(249, 115, 22, 0.4)",
					bg: "rgba(249, 115, 22, 0.05)",
					text: "rgb(251, 146, 60)",
				};
			case "epic":
				return {
					border: "rgba(168, 85, 247, 0.4)",
					bg: "rgba(168, 85, 247, 0.05)",
					text: "rgb(192, 132, 252)",
				};
			default:
				return {
					border: "rgba(100, 116, 139, 0.4)",
					bg: "rgba(100, 116, 139, 0.05)",
					text: "rgb(148, 163, 184)",
				};
		}
	};

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="flex-none bg-slate-950/80 backdrop-blur-md pb-3 px-0 flex items-center justify-between border-b border-slate-800/60 mb-4">
				<div className="flex items-center gap-2">
					<div className="w-7 h-7 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center text-blue-400">
						<Cpu className="w-3.5 h-3.5" />
					</div>
					<div>
						<h3 className="text-sm font-bold text-white tracking-tight leading-none">
							My Models
						</h3>
					</div>
				</div>

				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={() => setAllExpanded(true)}
						title="Expand All"
						className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-200 transition-all bg-slate-900/40 border border-slate-800/60 focus:outline-none"
					>
						<Maximize2 className="w-3.5 h-3.5" />
					</button>
					<button
						type="button"
						onClick={() => setAllExpanded(false)}
						title="Collapse All"
						className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-200 transition-all bg-slate-900/40 border border-slate-800/60 focus:outline-none"
					>
						<Minimize2 className="w-3.5 h-3.5" />
					</button>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-10">
				<div className="space-y-4">
					{difficulties.some((d) => !defaultModels[d.value]) && (
						<div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400 mb-4">
							<AlertCircle className="w-4 h-4 flex-shrink-0" />
							<div className="text-[10px] font-semibold">
								Missing default models for:{" "}
								{difficulties
									.filter((d) => !defaultModels[d.value])
									.map((d) => d.label)
									.join(", ")}
							</div>
						</div>
					)}

					{enabledModels.length === 0 ? (
						<div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800/60">
							<p className="text-slate-500 text-sm">
								You haven&apos;t selected any models yet. Go to "All Models" to
								enable some.
							</p>
						</div>
					) : (
						<div className="space-y-4">
							{difficulties.map((diff) => {
								const groupModels = enabledModelsByDifficulty[diff.value];
								if (groupModels.length === 0) return null;

								const isExpanded =
									expandedGroups[`diff:${diff.value}`] ?? false;
								const styles = getDifficultyStyles(diff.value);
								const isDefaultSet = Boolean(defaultModels[diff.value]);

								return (
									<div
										key={diff.value}
										className="border rounded-2xl overflow-hidden shadow-xl transition-all duration-300"
										style={{
											backgroundColor: styles.bg,
											borderColor: isDefaultSet
												? styles.border
												: "rgba(239, 68, 68, 0.3)",
										}}
									>
										<button
											type="button"
											onClick={() => toggleGroup(`diff:${diff.value}`)}
											className="w-full flex items-center justify-between p-3 cursor-pointer transition-all hover:bg-white/5"
										>
											<div className="flex items-center gap-2 min-w-0 flex-1">
												<div
													className="transition-colors flex-shrink-0"
													style={{ color: styles.text }}
												>
													{isExpanded ? (
														<ChevronDown className="w-3.5 h-3.5" />
													) : (
														<ChevronRight className="w-3.5 h-3.5" />
													)}
												</div>
												<h4
													className="text-[9px] font-black uppercase tracking-[0.2em] transition-colors flex-shrink-0"
													style={{ color: "white" }}
												>
													{diff.label}
												</h4>
												<div className="flex items-center gap-2 min-w-0">
													<ModelPicker
														value={defaultModels[diff.value] || null}
														models={groupModels}
														onChange={(val) => {
															if (!val) return;
															const [name, variant] = val.split("#");
															void handleSetDefaultModelAction(
																diff.value,
																name,
																variant,
															);
														}}
														difficulty={diff.value}
														placeholder="Select Default"
													/>
													<span
														className="px-2 py-0.5 rounded-full text-[8px] font-bold border transition-all flex-shrink-0"
														style={{
															backgroundColor: styles.bg,
															color: styles.text,
															borderColor: styles.border,
														}}
													>
														{groupModels.length} models
													</span>
												</div>
											</div>
										</button>

										{isExpanded && (
											<div className="p-3 pt-0 grid grid-cols-1 md:grid-cols-2 gap-3">
												{groupModels.map((model) => {
													const modelDisplayName =
														model.name.split("/").pop() || model.name;
													const fullDefaultName =
														defaultModels[diff.value] || "";
													const [defaultBaseName, defaultVariant] =
														fullDefaultName.split("#");
													const isDefault = defaultBaseName === model.name;
													const variantsList = model.variants
														? model.variants.split(",").map((v) => v.trim())
														: [];

													return (
														<div
															key={model.name}
															className={cn(
																"group relative p-4 rounded-xl border transition-all duration-300",
																isDefault
																	? "bg-blue-500/[0.03] border-blue-500/50 shadow-xl shadow-blue-500/10"
																	: "bg-[#11151C] border-slate-800/60 hover:border-slate-800",
															)}
														>
															<div className="flex items-start justify-between gap-3 mb-4">
																<div className="flex-1 min-w-0">
																	<div className="flex items-center gap-2">
																		<div
																			className={cn(
																				"text-sm font-bold truncate transition-colors",
																				isDefault
																					? "text-blue-400"
																					: "text-white group-hover:text-blue-400",
																			)}
																		>
																			{modelDisplayName}
																		</div>
																		{isDefault && (
																			<div className="px-1 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[8px] font-black uppercase tracking-tighter text-blue-400">
																				Default
																			</div>
																		)}
																	</div>
																	<div className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
																		{model.name}
																	</div>
																</div>
																<div className="flex items-center gap-1.5">
																	<button
																		type="button"
																		onClick={() =>
																			void handleSetDefaultModelAction(
																				diff.value,
																				model.name,
																				variantsList.length > 0
																					? defaultVariant || variantsList[0]
																					: undefined,
																			)
																		}
																		className={cn(
																			"p-1.5 rounded-lg transition-all focus:outline-none",
																			isDefault
																				? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30"
																				: "bg-slate-800/40 text-slate-500 hover:bg-blue-500/10 hover:text-blue-400",
																		)}
																		title={
																			isDefault
																				? "Default model"
																				: "Set as default model"
																		}
																	>
																		<Star
																			className={cn(
																				"w-3.5 h-3.5",
																				isDefault && "fill-current",
																			)}
																		/>
																	</button>
																	<button
																		type="button"
																		onClick={() =>
																			void handleToggleModelAction(
																				model.name,
																				false,
																			)
																		}
																		className="p-1.5 rounded-lg bg-slate-800/40 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all focus:outline-none"
																		title="Remove model from my list"
																	>
																		<Trash2 className="w-3.5 h-3.5" />
																	</button>
																</div>
															</div>

															<div className="space-y-3">
																{variantsList.length > 0 && (
																	<div className="flex items-center justify-between">
																		<span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
																			Variant
																		</span>
																		<div className="flex p-0.5 bg-[#0B0E14] border border-slate-800/60 rounded-lg gap-0.5 overflow-x-auto no-scrollbar">
																			{variantsList.map((v) => {
																				const isVariantActive =
																					isDefault && defaultVariant === v;
																				return (
																					<button
																						key={v}
																						type="button"
																						onClick={() =>
																							void handleSetDefaultModelAction(
																								diff.value,
																								model.name,
																								v,
																							)
																						}
																						className={cn(
																							"px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all whitespace-nowrap focus:outline-none",
																							isVariantActive
																								? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/40"
																								: "text-slate-500 hover:text-slate-300 hover:bg-slate-800",
																						)}
																					>
																						{v}
																					</button>
																				);
																			})}
																		</div>
																	</div>
																)}

																<div className="flex items-center justify-between">
																	<span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
																		Complexity
																	</span>
																	<div className="flex p-0.5 bg-[#0B0E14] border border-slate-800/60 rounded-lg gap-0.5">
																		{difficulties.map((d) => (
																			<button
																				key={d.value}
																				type="button"
																				onClick={() =>
																					void handleUpdateDifficultyAction(
																						model.name,
																						d.value,
																					)
																				}
																				className={cn(
																					"px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all focus:outline-none",
																					model.difficulty === d.value
																						? cn(
																								d.bg,
																								d.color,
																								"ring-1 ring-inset",
																								d.color
																									.replace("text-", "ring-")
																									.replace("-400", "/40"),
																							)
																						: "text-slate-500 hover:text-slate-300 hover:bg-slate-800",
																				)}
																			>
																				{d.label}
																			</button>
																		))}
																	</div>
																</div>
															</div>
														</div>
													);
												})}
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
