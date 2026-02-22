"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type {
	WorkflowColumnConfig,
	WorkflowStatusConfig,
	WorkflowTaskStatus,
} from "@/lib/api-client";
import { PillSelect } from "@/components/common/PillSelect";
import { createStatusPillOptions } from "@/components/kanban/workflow-display";
import { ColorPalettePicker } from "@/components/settings/ColorPalettePicker";
import { cn } from "@/lib/utils";

interface WorkflowColumnsEditorProps {
	columns: WorkflowColumnConfig[];
	statuses: WorkflowStatusConfig[];
	onChange: (columns: WorkflowColumnConfig[]) => void;
}

export function WorkflowColumnsEditor({
	columns,
	statuses,
	onChange,
}: WorkflowColumnsEditorProps) {
	const [newColumnName, setNewColumnName] = useState("");
	const sortedColumns = [...columns].sort(
		(a, b) => a.orderIndex - b.orderIndex,
	);
	const statusOptions = createStatusPillOptions(statuses);
	const availableStatuses = statuses.map((status) => status.status);
	const columnKeySet = useMemo(
		() => new Set(columns.map((column) => column.systemKey)),
		[columns],
	);

	const COLUMN_COLOR_PRESET: Record<string, string> = {
		backlog: "#6b7280",
		ready: "#3b82f6",
		deferred: "#8b5cf6",
		in_progress: "#f59e0b",
		blocked: "#ef4444",
		review: "#0ea5e9",
		closed: "#10b981",
	};

	function toColumnSystemKey(name: string): string {
		const base = name
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "");

		if (!base) {
			return "";
		}

		return /^[0-9]/.test(base) ? `col_${base}` : base;
	}

	const updateColumn = (
		systemKey: string,
		updates: Partial<WorkflowColumnConfig>,
	) => {
		const newColumns = columns.map((col) =>
			col.systemKey === systemKey ? { ...col, ...updates } : col,
		);
		onChange(newColumns);
	};

	const moveColumn = (index: number, direction: "up" | "down") => {
		const newIndex = direction === "up" ? index - 1 : index + 1;
		if (newIndex < 0 || newIndex >= sortedColumns.length) return;

		const updatedColumns = [...sortedColumns];
		const temp = updatedColumns[index].orderIndex;
		updatedColumns[index].orderIndex = updatedColumns[newIndex].orderIndex;
		updatedColumns[newIndex].orderIndex = temp;

		onChange(updatedColumns);
	};

	const toggleStatus = (systemKey: string, status: WorkflowTaskStatus) => {
		const col = columns.find((c) => c.systemKey === systemKey);
		if (!col) return;

		let newAllowed = [...col.allowedStatuses];
		if (newAllowed.includes(status)) {
			// Don't remove if it's the default status
			if (col.defaultStatus === status) return;
			newAllowed = newAllowed.filter((s) => s !== status);
		} else {
			newAllowed.push(status);
		}

		updateColumn(systemKey, { allowedStatuses: newAllowed });
	};

	const normalizedKey = toColumnSystemKey(newColumnName);
	const canAddColumn = statuses.length > 0 && normalizedKey.length > 0;
	const addDisabledReason =
		statuses.length === 0
			? "Add at least one status first"
			: !newColumnName.trim()
				? "Enter a column name"
				: null;

	const addColumn = () => {
		if (!canAddColumn) {
			return;
		}

		let systemKey = normalizedKey;
		let suffix = 2;
		while (columnKeySet.has(systemKey)) {
			systemKey = `${normalizedKey}_${suffix}`;
			suffix += 1;
		}

		const maxOrderIndex = columns.reduce(
			(max, col) => Math.max(max, col.orderIndex),
			-1,
		);
		const defaultStatus = statuses[0]?.status;
		if (!defaultStatus) {
			return;
		}

		onChange([
			...columns,
			{
				systemKey,
				name: newColumnName.trim(),
				color: COLUMN_COLOR_PRESET[systemKey] ?? "#64748b",
				icon: "list",
				orderIndex: maxOrderIndex + 1,
				defaultStatus,
				allowedStatuses: [defaultStatus],
			},
		]);

		setNewColumnName("");
	};

	const removeColumn = (systemKey: string) => {
		if (sortedColumns.length <= 1) {
			return;
		}

		const remainingColumns = sortedColumns
			.filter((col) => col.systemKey !== systemKey)
			.map((col, index) => ({ ...col, orderIndex: index }));

		onChange(remainingColumns);
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between rounded-2xl border border-slate-800/50 bg-slate-900/20 p-4">
				<div>
					<p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
						Columns
					</p>
					<p className="mt-1 text-xs text-slate-400">
						Add or remove workflow columns from board settings.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<input
						type="text"
						value={newColumnName}
						onChange={(event) => setNewColumnName(event.target.value)}
						placeholder="New column name"
						className="w-44 rounded-xl border border-slate-700/80 bg-[#0B0E14]/70 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-blue-500/60"
					/>
					<button
						type="button"
						onClick={addColumn}
						disabled={!canAddColumn}
						title={addDisabledReason ?? "Add column"}
						className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-300 transition-colors hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
					>
						<Plus className="h-3.5 w-3.5" />
						Add Column
					</button>
				</div>
			</div>
			{addDisabledReason ? (
				<p className="text-xs text-slate-500">{addDisabledReason}.</p>
			) : null}
			{sortedColumns.map((col, idx) => (
				<div
					key={col.systemKey}
					className="group relative overflow-hidden flex flex-col gap-6 rounded-2xl border border-slate-800/60 bg-[#0B0E14]/30 p-6 transition-all hover:border-slate-700/60 hover:bg-[#0B0E14]/50"
					style={{ borderColor: col.color }}
				>
					{/* Background accent */}
					<div
						className="absolute left-0 top-0 h-full w-1 opacity-[0.05] group-hover:opacity-[0.1]"
						style={{ backgroundColor: col.color }}
					/>

					<div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
						{/* Left: Identity & Order */}
						<div className="flex items-center gap-5">
							<div className="flex flex-col gap-1.5 p-1 rounded-lg bg-slate-800/20 border border-slate-800/40">
								<button
									type="button"
									onClick={() => moveColumn(idx, "up")}
									disabled={idx === 0}
									className="p-1 rounded text-slate-600 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-20 transition-all"
									title="Move Up"
								>
									<ChevronUp className="h-4 w-4" />
								</button>
								<button
									type="button"
									onClick={() => moveColumn(idx, "down")}
									disabled={idx === sortedColumns.length - 1}
									className="p-1 rounded text-slate-600 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-20 transition-all"
									title="Move Down"
								>
									<ChevronDown className="h-4 w-4" />
								</button>
							</div>

							<div className="space-y-1">
								<h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
									System Key:{" "}
									<span className="text-slate-400 font-mono">
										{col.systemKey}
									</span>
								</h4>
								<div className="relative group/input">
									<input
										type="text"
										value={col.name}
										onChange={(e) =>
											updateColumn(col.systemKey, { name: e.target.value })
										}
										className="bg-transparent text-xl font-bold text-slate-100 outline-none border-b-2 border-transparent focus:border-blue-500/50 transition-all w-full max-w-md"
										placeholder="Column Name"
									/>
								</div>
							</div>
						</div>

						{/* Right: Color Config */}
						<div className="w-full lg:max-w-xs lg:ml-auto">
							<div className="flex items-start justify-end gap-3">
								<button
									type="button"
									onClick={() => removeColumn(col.systemKey)}
									disabled={sortedColumns.length <= 1}
									className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-500/20 px-3 text-[10px] font-black uppercase tracking-widest text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
									title={
										sortedColumns.length <= 1
											? "At least one column is required"
											: "Delete column"
									}
								>
									<Trash2 className="h-3.5 w-3.5" />
									Delete
								</button>
							</div>
							<div className="mt-3">
								<ColorPalettePicker
									label="Column Accent Color"
									value={col.color}
									onChange={(color) => updateColumn(col.systemKey, { color })}
								/>
							</div>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-8 border-t border-slate-800/60 pt-6 md:grid-cols-2">
						{/* Default Status */}
						<div className="space-y-4">
							<div className="flex flex-col gap-1">
								<PillSelect
									label="Default Task Status"
									value={col.defaultStatus}
									options={statusOptions}
									onChange={(val) =>
										updateColumn(col.systemKey, {
											defaultStatus: val as WorkflowTaskStatus,
										})
									}
								/>
								<p className="text-[10px] text-slate-500 italic mt-1">
									Tasks created in or moved to this column will receive this
									status if not specified.
								</p>
							</div>
						</div>

						{/* Allowed Statuses */}
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
									Allowed Statuses in Column
								</span>
							</div>
							<div className="flex flex-wrap gap-2">
								{availableStatuses.map((status) => {
									const isAllowed = col.allowedStatuses.includes(status);
									const option = statusOptions[status];
									const Icon = option.icon;
									const isDefault = col.defaultStatus === status;

									return (
										<button
											key={status}
											type="button"
											onClick={() => toggleStatus(col.systemKey, status)}
											disabled={isDefault}
											className={cn(
												"flex items-center gap-2 rounded-xl border px-3 py-2 transition-all hover:scale-105 active:scale-95",
												isAllowed
													? "shadow-sm"
													: "border-slate-800 bg-slate-900/30 text-slate-600 grayscale opacity-40 hover:grayscale-0 hover:opacity-100",
												isDefault &&
													"ring-2 ring-blue-500/40 ring-offset-2 ring-offset-[#0B0E14] cursor-default opacity-100 grayscale-0",
											)}
											style={isAllowed ? option.style : undefined}
											title={
												isDefault ? "Default status cannot be removed" : ""
											}
										>
											<Icon
												className="h-3.5 w-3.5"
												style={isAllowed ? option.iconStyle : undefined}
											/>
											<span className="text-[10px] font-black uppercase tracking-widest">
												{status.replace(/_/g, " ")}
											</span>
											{isDefault && (
												<div className="ml-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
											)}
										</button>
									);
								})}
							</div>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
