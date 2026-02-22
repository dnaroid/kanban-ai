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
		<div className="space-y-6">
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-800/60 bg-slate-900/20 p-6 shadow-sm">
				<div>
					<p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
						Workflow Columns
					</p>
					<p className="mt-1 text-xs text-slate-400">
						Define the vertical lanes of your board and their behavior.
					</p>
				</div>
				<div className="flex items-center gap-3">
					<input
						type="text"
						value={newColumnName}
						onChange={(event) => setNewColumnName(event.target.value)}
						placeholder="New column name..."
						className="w-48 rounded-xl border border-slate-700/80 bg-[#0B0E14]/70 px-4 py-2.5 text-xs text-slate-100 outline-none transition focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20"
					/>
					<button
						type="button"
						onClick={addColumn}
						disabled={!canAddColumn}
						title={addDisabledReason ?? "Add column"}
						className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-blue-300 transition-all hover:bg-blue-500/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
					>
						<Plus className="h-4 w-4" />
						Add Column
					</button>
				</div>
			</div>

			{addDisabledReason && newColumnName.trim() ? (
				<p className="text-xs text-red-400/80 px-2">{addDisabledReason}.</p>
			) : null}

			<div className="flex gap-6 overflow-x-auto pb-8 snap-x scroll-smooth outline-none">
				{sortedColumns.map((col, idx) => (
					<div
						key={col.systemKey}
						className="group relative flex flex-col w-[400px] flex-shrink-0 rounded-2xl border bg-[#0B0E14]/30 transition-all hover:border-slate-700/60 hover:bg-[#0B0E14]/50 snap-start shadow-xl"
						style={{ borderColor: `${col.color}80` }}
					>
						{/* Card Header */}
						<div className="flex flex-col gap-4 border-b border-slate-800/60 bg-slate-900/20 px-6 py-5">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-1 p-1 rounded-lg bg-slate-800/20 border border-slate-800/40">
									<button
										type="button"
										onClick={() => moveColumn(idx, "up")}
										disabled={idx === 0}
										className="p-1.5 rounded-md text-slate-500 hover:text-slate-100 hover:bg-slate-700/60 disabled:opacity-10 transition-all"
										title="Move Left"
									>
										<ChevronUp className="h-4 w-4 -rotate-90" />
									</button>
									<div className="w-[1px] h-4 bg-slate-800/60 mx-0.5" />
									<button
										type="button"
										onClick={() => moveColumn(idx, "down")}
										disabled={idx === sortedColumns.length - 1}
										className="p-1.5 rounded-md text-slate-500 hover:text-slate-100 hover:bg-slate-700/60 disabled:opacity-10 transition-all"
										title="Move Right"
									>
										<ChevronDown className="h-4 w-4 -rotate-90" />
									</button>
								</div>

								<button
									type="button"
									onClick={() => removeColumn(col.systemKey)}
									disabled={sortedColumns.length <= 1}
									className="p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-all disabled:opacity-20"
									title="Delete Column"
								>
									<Trash2 className="h-4 w-4" />
								</button>
							</div>

							<div className="space-y-2">
								<input
									type="text"
									value={col.name}
									onChange={(e) =>
										updateColumn(col.systemKey, { name: e.target.value })
									}
									className="bg-transparent text-xl font-black text-slate-100 outline-none border-b-2 border-transparent focus:border-blue-500/50 transition-all w-full"
									placeholder="Column Name"
								/>
								<div className="flex items-center gap-2">
									<span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-800/40 border border-slate-800/40">
										KEY: {col.systemKey}
									</span>
									<span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">
										POS: {col.orderIndex + 1}
									</span>
								</div>
							</div>
						</div>

						{/* Card Body */}
						<div className="p-6 flex flex-col gap-8">
							{/* Section: Config */}
							<div className="space-y-5">
								<div className="flex items-center gap-2">
									<h5 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">
										Configuration
									</h5>
									<div className="h-px flex-1 bg-slate-800/60" />
								</div>

								<div className="grid grid-cols-2 gap-4">
									<ColorPalettePicker
										label="Accent"
										value={col.color}
										onChange={(color) =>
											updateColumn(col.systemKey, { color })
										}
									/>
									<PillSelect
										label="Default"
										value={col.defaultStatus}
										options={statusOptions}
										onChange={(val) =>
											updateColumn(col.systemKey, {
												defaultStatus: val as WorkflowTaskStatus,
											})
										}
									/>
								</div>
							</div>

							{/* Section: Allowed Statuses */}
							<div className="space-y-4">
								<div className="flex items-center gap-2">
									<h5 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">
										Allowed Statuses
									</h5>
									<div className="h-px flex-1 bg-slate-800/60" />
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
														? "shadow-md bg-slate-900/40"
														: "border-slate-800/60 bg-slate-950/20 text-slate-600 grayscale opacity-40 hover:grayscale-0 hover:opacity-100",
													isDefault &&
														"ring-1 ring-blue-500/40 ring-offset-1 ring-offset-[#0B0E14] cursor-default opacity-100 grayscale-0",
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
												<span className="text-[10px] font-black uppercase tracking-tight">
													{status.replace(/_/g, " ")}
												</span>
											</button>
										);
									})}
								</div>
							</div>

							{/* Guidance */}
							<div className="mt-auto rounded-xl bg-slate-900/60 border border-slate-800/40 p-4">
								<p className="text-[10px] leading-relaxed text-slate-500 italic">
									Tasks in this column default to <span className="text-slate-400 not-italic font-bold">{col.defaultStatus.replace("_", " ")}</span>.
								</p>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
