"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const COLUMN_COLORS = [
	{ name: "Blue", value: "#3B82F6", bg: "bg-blue-500", hover: "hover:bg-blue-400" },
	{ name: "Green", value: "#10B981", bg: "bg-emerald-500", hover: "hover:bg-emerald-400" },
	{ name: "Purple", value: "#8B5CF6", bg: "bg-violet-500", hover: "hover:bg-violet-400" },
	{ name: "Red", value: "#EF4444", bg: "bg-red-500", hover: "hover:bg-red-400" },
	{ name: "Orange", value: "#F59E0B", bg: "bg-amber-500", hover: "hover:bg-amber-400" },
	{ name: "Cyan", value: "#06B6D4", bg: "bg-cyan-500", hover: "hover:bg-cyan-400" },
	{ name: "Pink", value: "#EC4899", bg: "bg-pink-500", hover: "hover:bg-pink-400" },
	{ name: "Teal", value: "#14B8A6", bg: "bg-teal-500", hover: "hover:bg-teal-400" },
	{ name: "Indigo", value: "#6366F1", bg: "bg-indigo-500", hover: "hover:bg-indigo-400" },
	{ name: "Yellow", value: "#EAB308", bg: "bg-yellow-500", hover: "hover:bg-yellow-400" },
	{ name: "Rose", value: "#F43F5E", bg: "bg-rose-500", hover: "hover:bg-rose-400" },
	{ name: "Sky", value: "#0EA5E9", bg: "bg-sky-500", hover: "hover:bg-sky-400" },
];

export interface ColumnModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (name: string, color: string) => void;
	initialData?: { name: string; color?: string | null };
	title: string;
}

export function ColumnModal({
	isOpen,
	onClose,
	onSubmit,
	initialData,
	title,
}: ColumnModalProps) {
	const [name, setName] = useState("");
	const [selectedColor, setSelectedColor] = useState(COLUMN_COLORS[0].value);

	useEffect(() => {
		if (isOpen && initialData) {
			setName(initialData.name);
			setSelectedColor(initialData.color || COLUMN_COLORS[0].value);
		} else if (isOpen) {
			setName("");
			setSelectedColor(COLUMN_COLORS[0].value);
		}
	}, [isOpen, initialData]);

	if (!isOpen) return null;

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim()) return;
		onSubmit(name.trim(), selectedColor);
	};

	return (
		<div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
			<div className="bg-[#11151C] border border-slate-800/60 rounded-2xl p-6 max-w-md w-full shadow-2xl">
				<div className="flex items-center justify-between mb-6">
					<h2 className="text-xl font-bold text-white">{title}</h2>
					<button
						onClick={onClose}
						className="text-slate-500 hover:text-slate-300 transition-colors"
					>
						<X className="w-5 h-5" />
					</button>
				</div>
				<form onSubmit={handleSubmit} className="space-y-5">
					<div>
						<label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
							Column Name *
						</label>
						<input
							type="text"
							required
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="w-full px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
							placeholder="e.g., To Do, In Progress, Done"
							autoFocus
						/>
					</div>
					<div>
						<label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
							Pick Column Color
						</label>
						<div className="grid grid-cols-6 gap-3">
							{COLUMN_COLORS.map((color) => (
								<button
									key={color.value}
									type="button"
									onClick={() => setSelectedColor(color.value)}
									className={cn(
										"aspect-square rounded-xl transition-all relative flex items-center justify-center group",
										color.bg,
										color.hover,
										selectedColor === color.value
											? "ring-2 ring-white ring-offset-2 ring-offset-[#11151C]"
											: "opacity-80 hover:opacity-100",
									)}
									style={{ backgroundColor: color.value }}
									title={color.name}
								>
									{selectedColor === color.value && (
										<div className="w-2.5 h-2.5 bg-white rounded-full shadow-lg" />
									)}
									<div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-black/10 group-hover:ring-black/20" />
								</button>
							))}
						</div>
					</div>
					<div className="flex gap-3 pt-2">
						<button
							type="button"
							onClick={onClose}
							className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold text-xs transition-all border border-slate-700/50"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={!name.trim()}
							className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
						>
							{initialData ? "Save Changes" : "Add Column"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
