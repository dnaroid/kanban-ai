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
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
			{sortedStatuses.map((s, idx) => {
				const currentStatusOption = statusOptions[s.status];
				const StatusIcon = currentStatusOption?.icon || Clock;

				return (
					<div
						key={s.status}
						className="group relative flex flex-col rounded-2xl border bg-[#0B0E14]/30 transition-all hover:bg-[#0B0E14]/50 overflow-hidden shadow-lg"
						style={{ borderColor: `${s.color}60` }}
					>
						{/* Card Header */}
						<div className="flex items-center justify-between gap-3 border-b border-slate-800/60 bg-slate-900/20 px-4 py-3">
							<div className="flex items-center gap-3">
								<div
									className="flex h-9 w-9 items-center justify-center rounded-lg border bg-slate-900/40 transition-transform group-hover:scale-105 shadow-inner"
									style={currentStatusOption?.style}
								>
									<StatusIcon
										className="h-4.5 w-4.5"
										style={currentStatusOption?.iconStyle}
									/>
								</div>
								<div className="space-y-0.5 min-w-0">
									<h4 className="text-xs font-black text-slate-100 uppercase tracking-tight truncate">
										{s.status.replace(/_/g, " ")}
									</h4>
									<span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest truncate">
										{s.status}
									</span>
								</div>
							</div>

							<div className="flex items-center gap-1 p-1 rounded-lg bg-slate-800/20 border border-slate-800/40">
								<button
									type="button"
									onClick={() => moveStatus(idx, "up")}
									disabled={idx === 0}
									className="p-1 rounded text-slate-500 hover:text-slate-100 hover:bg-slate-700/60 disabled:opacity-10 transition-all"
									title="Move Up"
								>
									<ChevronUp className="h-3 w-3" />
								</button>
								<button
									type="button"
									onClick={() => moveStatus(idx, "down")}
									disabled={idx === sortedStatuses.length - 1}
									className="p-1 rounded text-slate-500 hover:text-slate-100 hover:bg-slate-700/60 disabled:opacity-10 transition-all"
									title="Move Down"
								>
									<ChevronDown className="h-3 w-3" />
								</button>
							</div>
						</div>

						{/* Card Body */}
						<div className="p-4 space-y-5">
							<div className="grid grid-cols-2 gap-3">
								<IconPicker
									label="Icon"
									value={s.icon}
									tone={s.color}
									onChange={(icon) => updateStatus(s.status, { icon })}
								/>
								<ColorPalettePicker
									label="Color"
									value={s.color}
									onChange={(color) => updateStatus(s.status, { color })}
								/>
							</div>
							
							<PillSelect
								label="Preferred Column"
								value={s.preferredColumnSystemKey}
								options={columnOptions}
								onChange={(val) =>
									updateStatus(s.status, {
										preferredColumnSystemKey: val,
									})
								}
							/>

							<div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800/40">
								<PillSelect
									label="Blocked"
									value={s.blockedReason || "none"}
									options={blockedReasonOptions}
									onChange={(val) =>
										updateStatus(s.status, {
											blockedReason:
												val === "none" ? null : (val as WorkflowBlockedReason),
										})
									}
								/>
								<PillSelect
									label="Closed"
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
						</div>
					</div>
				);
			})}
		</div>
	);
}
