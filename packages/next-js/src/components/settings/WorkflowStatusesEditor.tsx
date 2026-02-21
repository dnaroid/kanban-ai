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
						className="group relative flex flex-col gap-4 rounded-2xl border border-slate-800/60 bg-slate-900/20 p-5 transition-all hover:border-slate-700/60 hover:bg-slate-900/40"
					>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-4">
								<div className="flex flex-col gap-1">
									<button
										type="button"
										onClick={() => moveStatus(idx, "up")}
										disabled={idx === 0}
										className="text-slate-600 hover:text-slate-300 disabled:opacity-30"
									>
										<ChevronUp className="h-4 w-4" />
									</button>
									<button
										type="button"
										onClick={() => moveStatus(idx, "down")}
										disabled={idx === sortedStatuses.length - 1}
										className="text-slate-600 hover:text-slate-300 disabled:opacity-30"
									>
										<ChevronDown className="h-4 w-4" />
									</button>
								</div>
								<div className="flex items-center gap-3">
									<div
										className="p-2 rounded-xl border"
										style={currentStatusOption?.style}
									>
										<StatusIcon
											className="h-5 w-5"
											style={currentStatusOption?.iconStyle}
										/>
									</div>
									<div>
										<h4 className="text-sm font-bold text-slate-100 uppercase tracking-tight">
											{s.status}
										</h4>
										<p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
											Order Index: {s.orderIndex}
										</p>
									</div>
								</div>
							</div>

							<div className="flex items-center gap-4">
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
						</div>

						<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
							<PillSelect
								label="Blocked Reason Mapping"
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
								label="Closed Reason Mapping"
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
				);
			})}
		</div>
	);
}
