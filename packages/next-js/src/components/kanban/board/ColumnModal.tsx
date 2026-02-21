"use client";

import { useState } from "react";
import { X } from "lucide-react";

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
	const [name, setName] = useState(initialData?.name ?? "");
	const [selectedColor, setSelectedColor] = useState(
		initialData?.color || "#3B82F6",
	);

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
						type="button"
						onClick={onClose}
						className="text-slate-500 hover:text-slate-300 transition-colors"
					>
						<X className="w-5 h-5" />
					</button>
				</div>
				<form onSubmit={handleSubmit} className="space-y-5">
					<div>
						<label
							htmlFor="column-name"
							className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2"
						>
							Column Name *
						</label>
						<input
							id="column-name"
							type="text"
							required
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="w-full px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
							placeholder="e.g., To Do, In Progress, Done"
						/>
					</div>
					<div>
						<span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
							Column Color
						</span>
						<div className="flex items-center gap-3">
							<div
								className="h-8 w-8 rounded-lg border border-slate-700"
								style={{ backgroundColor: selectedColor }}
							/>
							<div className="relative flex items-center">
								<input
									type="text"
									value={selectedColor}
									onChange={(e) => setSelectedColor(e.target.value)}
									className="w-28 rounded-lg border border-slate-800 bg-slate-950 py-1.5 pl-3 pr-8 text-xs font-mono text-slate-300 outline-none focus:border-slate-600"
								/>
								<input
									type="color"
									value={selectedColor}
									onChange={(e) => setSelectedColor(e.target.value)}
									className="absolute right-1 h-5 w-5 cursor-pointer opacity-0"
								/>
							</div>
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
