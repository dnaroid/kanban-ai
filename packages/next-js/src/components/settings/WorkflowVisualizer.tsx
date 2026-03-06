"use client";

import { useMemo, useState } from "react";
import { WorkflowConfig, WorkflowTaskStatus } from "@/lib/api-client";
import { statusConfig } from "@/components/kanban/TaskPropertyConfigs";
import { cn } from "@/lib/utils";
import { Info, ArrowRight, MousePointer2 } from "lucide-react";

interface WorkflowVisualizerProps {
	config: WorkflowConfig;
}

export function WorkflowVisualizer({ config }: WorkflowVisualizerProps) {
	const [hoveredStatus, setHoveredStatus] = useState<WorkflowTaskStatus | null>(
		null,
	);

	// Group statuses by their preferred column
	const columnsWithStatuses = useMemo(() => {
		return config.columns
			.sort((a, b) => a.orderIndex - b.orderIndex)
			.map((col) => {
				const statusesInCol = config.statuses
					.filter((s) => s.preferredColumnSystemKey === col.systemKey)
					.sort((a, b) => a.orderIndex - b.orderIndex);

				return {
					...col,
					statuses: statusesInCol,
				};
			});
	}, [config]);

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between gap-4 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
				<div className="flex gap-3">
					<Info className="h-5 w-5 shrink-0 text-blue-400" />
					<div className="space-y-1">
						<h4 className="text-sm font-bold text-blue-300">
							Interactive Flow Visualization
						</h4>
						<p className="text-xs text-blue-400/80 leading-relaxed">
							This diagram shows how tasks move through your workflow.
							<strong> Hover over a status </strong> to highlight all possible
							next steps and see which column the task will land in.
						</p>
					</div>
				</div>
				<div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
					<MousePointer2 className="h-3 w-3" />
					Hover to Explore
				</div>
			</div>

			<div className="relative overflow-x-auto pb-12 custom-scrollbar">
				<div className="inline-flex items-start gap-8 min-w-full p-4">
					{columnsWithStatuses.map((col) => (
						<div
							key={col.systemKey}
							className="flex flex-col gap-4 w-64 shrink-0"
						>
							{/* Column Header */}
							<div className="relative group">
								<div
									className="absolute -inset-1 rounded-2xl blur opacity-20 transition-opacity group-hover:opacity-40"
									style={{ backgroundColor: col.color }}
								/>
								<div className="relative flex flex-col gap-1 rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
									<div className="flex items-center gap-2">
										<div
											className="h-2 w-2 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)]"
											style={{ backgroundColor: col.color }}
										/>
										<span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
											{col.name}
										</span>
									</div>
									<span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
										{col.systemKey}
									</span>
								</div>
							</div>

							{/* Status Nodes */}
							<div className="flex flex-col gap-3">
								{col.statuses.length === 0 ? (
									<div className="flex items-center justify-center h-20 rounded-2xl border border-dashed border-slate-800/60 text-[10px] font-bold text-slate-600 uppercase tracking-widest">
										No Statuses
									</div>
								) : (
									col.statuses.map((s) => {
										const sInfo =
											statusConfig[s.status as keyof typeof statusConfig];
										const isHovered = hoveredStatus === s.status;
										const isTarget =
											hoveredStatus &&
											config.statusTransitions[hoveredStatus]?.includes(
												s.status,
											);
										const isSource =
											hoveredStatus &&
											config.statusTransitions[s.status]?.includes(
												hoveredStatus,
											);

										const Icon = sInfo?.icon || Info;
										const isDefault = col.defaultStatus === s.status;

										return (
											<button
												type="button"
												key={s.status}
												onMouseEnter={() => setHoveredStatus(s.status)}
												onMouseLeave={() => setHoveredStatus(null)}
												className={cn(
													"relative group flex w-full flex-col gap-2 rounded-2xl border p-4 text-left transition-all duration-300",
													isHovered
														? "border-blue-500 bg-blue-500/10 scale-[1.02] z-10 shadow-[0_0_20px_rgba(59,130,246,0.2)]"
														: isTarget
															? "border-emerald-500/50 bg-emerald-500/5 scale-[1.01] z-10 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
															: isSource
																? "border-slate-700 bg-slate-800/20 opacity-60"
																: hoveredStatus
																	? "border-slate-800 bg-slate-900/20 opacity-30 grayscale"
																	: "border-slate-800/60 bg-slate-900/60",
												)}
											>
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-2.5">
														<div
															className={cn(
																"p-1.5 rounded-lg",
																sInfo?.bg || "bg-slate-800",
															)}
														>
															<Icon
																className={cn(
																	"h-3.5 w-3.5",
																	sInfo?.color || "text-slate-400",
																)}
															/>
														</div>
														<div className="flex flex-col">
															<span
																className={cn(
																	"text-xs font-bold uppercase tracking-tight",
																	isHovered
																		? "text-blue-400"
																		: isTarget
																			? "text-emerald-400"
																			: "text-slate-200",
																)}
															>
																{s.status}
															</span>
															{isDefault && (
																<span className="text-[9px] font-bold text-blue-500/80 uppercase tracking-widest">
																	Default
																</span>
															)}
														</div>
													</div>

													{isTarget && (
														<div className="animate-in fade-in slide-in-from-left-2 duration-300">
															<ArrowRight className="h-3.5 w-3.5 text-emerald-500" />
														</div>
													)}
												</div>

												{isHovered && (
													<div className="mt-2 space-y-2 animate-in fade-in zoom-in-95 duration-200">
														<div className="h-px bg-blue-500/20" />
														<div className="flex flex-col gap-1">
															<span className="text-[9px] font-bold text-blue-400/60 uppercase tracking-widest">
																Transitions To:
															</span>
															<div className="flex flex-wrap gap-1.5">
																{config.statusTransitions[s.status]?.length >
																0 ? (
																	config.statusTransitions[s.status].map(
																		(target) => (
																			<span
																				key={target}
																				className="text-[9px] font-bold bg-slate-800/80 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700/50"
																			>
																				{target}
																			</span>
																		),
																	)
																) : (
																	<span className="text-[9px] font-bold text-slate-600 uppercase">
																		No outgoing flow
																	</span>
																)}
															</div>
														</div>
													</div>
												)}
											</button>
										);
									})
								)}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
