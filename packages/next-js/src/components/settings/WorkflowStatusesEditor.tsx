"use client";

import {
	ChevronDown,
	ChevronUp,
	Clock,
	ShieldAlert,
	Archive,
} from "lucide-react";
import type {
	WorkflowColumnConfig,
	WorkflowStatusConfig,
	WorkflowTaskStatus,
	WorkflowColumnSystemKey,
	WorkflowBlockedReason,
	WorkflowClosedReason,
} from "@/lib/api-client";
import {
	blockedReasonConfig,
	closedReasonConfig,
} from "@/components/kanban/TaskPropertyConfigs";
import { PillSelect } from "@/components/common/PillSelect";
import {
	createColumnPillOptions,
	createStatusPillOptions,
} from "@/components/kanban/workflow-display";
import { ColorPalettePicker } from "@/components/settings/ColorPalettePicker";
import { IconPicker } from "@/components/settings/IconPicker";

interface WorkflowStatusesEditorProps {
	statuses: WorkflowStatusConfig[];
	columns: WorkflowColumnConfig[];
	onChange: (statuses: WorkflowStatusConfig[]) => void;
}

export function WorkflowStatusesEditor({
	statuses,
	columns,
	onChange,
}: WorkflowStatusesEditorProps) {
	const sortedStatuses = [...statuses].sort(
		(a, b) => a.orderIndex - b.orderIndex,
	);
	const statusOptions = createStatusPillOptions(statuses);
	const columnOptions = createColumnPillOptions(columns);

	const updateStatus = (
		statusKey: WorkflowTaskStatus,
		updates: Partial<WorkflowStatusConfig>,
	) => {
		const newStatuses = statuses.map((s) =>
			s.status === statusKey ? { ...s, ...updates } : s,
		);
		onChange(newStatuses);
	};

	const moveStatus = (index: number, direction: "up" | "down") => {
		const newIndex = direction === "up" ? index - 1 : index + 1;
		if (newIndex < 0 || newIndex >= sortedStatuses.length) return;

		const updatedStatuses = [...sortedStatuses];
		const temp = updatedStatuses[index].orderIndex;
		updatedStatuses[index].orderIndex = updatedStatuses[newIndex].orderIndex;
		updatedStatuses[newIndex].orderIndex = temp;

		onChange(updatedStatuses);
	};

	const blockedReasonOptions = {
		none: {
			icon: ShieldAlert,
			color: "text-slate-500",
			bg: "bg-slate-900",
			border: "border-slate-800",
			label: "None",
		},
		...blockedReasonConfig,
	} as const;

	const closedReasonOptions = {
		none: {
			icon: Archive,
			color: "text-slate-500",
			bg: "bg-slate-900",
			border: "border-slate-800",
			label: "None",
		},
		...closedReasonConfig,
	} as const;

	return (
		<div className="space-y-4">
			{sortedStatuses.map((s, idx) => {
				const currentStatusOption = statusOptions[s.status];
				const StatusIcon = currentStatusOption?.icon || Clock;

				return (
					<div
						key={s.status}
						className="group relative overflow-hidden flex flex-col gap-6 rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30 p-6 transition-all hover:border-slate-700/60 hover:bg-[#0B0E14]/50"
					>
						{/* Background accent */}
						<div
							className="absolute left-0 top-0 h-full w-1 opacity-[0.05] group-hover:opacity-[0.1]"
							style={currentStatusOption?.style}
						/>

						<div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
							{/* Left: Identity & Order */}
							<div className="flex items-center gap-5">
								<div className="flex flex-col gap-1.5 p-1 rounded-lg bg-slate-800/20 border border-slate-800/40">
									<button
										type="button"
										onClick={() => moveStatus(idx, "up")}
										disabled={idx === 0}
										className="p-1 rounded text-slate-600 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-20 transition-all"
										title="Move Up"
									>
										<ChevronUp className="h-4 w-4" />
									</button>
									<button
										type="button"
										onClick={() => moveStatus(idx, "down")}
										disabled={idx === sortedStatuses.length - 1}
										className="p-1 rounded text-slate-600 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-20 transition-all"
										title="Move Down"
									>
										<ChevronDown className="h-4 w-4" />
									</button>
								</div>

								<div className="flex items-center gap-4">
									<div
										className="flex h-12 w-12 items-center justify-center rounded-xl border bg-slate-900/40 transition-transform group-hover:scale-110"
										style={currentStatusOption?.style}
									>
										<StatusIcon
											className="h-6 w-6"
											style={currentStatusOption?.iconStyle}
										/>
									</div>
									<div className="space-y-1">
										<h4 className="text-base font-bold text-slate-100 uppercase tracking-tight">
											{s.status.replace(/_/g, " ")}
										</h4>
										<div className="flex items-center gap-2">
											<span className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-800/40 border border-slate-800/40">
												ID: {s.status}
											</span>
											<span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
												Index: {s.orderIndex}
											</span>
										</div>
									</div>
								</div>
							</div>

							{/* Right: Visual Config */}
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:w-[60%]">
								<div className="flex flex-col gap-2">
									<PillSelect
										label="Preferred Column"
										value={s.preferredColumnSystemKey}
										options={columnOptions}
										onChange={(val) =>
											updateStatus(s.status, {
												preferredColumnSystemKey: val as WorkflowColumnSystemKey,
											})
										}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<IconPicker
										label="Icon"
										value={s.icon}
										tone={s.color}
										onChange={(icon) => updateStatus(s.status, { icon })}
									/>
								</div>
								<div className="flex flex-col gap-2">
									<ColorPalettePicker
										label="Status Color"
										value={s.color}
										onChange={(color) => updateStatus(s.status, { color })}
									/>
								</div>
							</div>
						</div>

						{/* Bottom: Mappings */}
						<div className="grid grid-cols-1 gap-4 border-t border-slate-800/60 pt-6 sm:grid-cols-2 lg:grid-cols-3">
							<div className="sm:col-span-1 lg:col-span-1">
								<PillSelect
									label="Blocked Mapping"
									value={s.blockedReason || "none"}
									options={blockedReasonOptions}
									onChange={(val) =>
										updateStatus(s.status, {
											blockedReason:
												val === "none" ? null : (val as WorkflowBlockedReason),
										})
									}
								/>
							</div>
							<div className="sm:col-span-1 lg:col-span-1">
								<PillSelect
									label="Closed Mapping"
									value={s.closedReason || "none"}
									options={closedReasonOptions}
									onChange={(val) =>
										updateStatus(s.status, {
											closedReason:
												val === "none" ? null : (val as WorkflowClosedReason),
										})
									}
								/>
							</div>
							<div className="sm:col-span-2 lg:col-span-1 flex items-end">
								<div className="w-full rounded-xl bg-slate-900/40 border border-slate-800/40 p-3">
									<p className="text-[10px] font-medium text-slate-500 italic">
										Mappings define how this status affects task logic (blocking
										or completion).
									</p>
								</div>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
