"use client";

import { useState } from "react";
import { Modal } from "@/components/common/Modal";

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
		<Modal
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			size="sm"
			title={title}
			footer={
				<>
					<button
						type="button"
						onClick={onClose}
						className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold text-xs transition-all border border-slate-700/50"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={!name.trim()}
						className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
					>
						{initialData ? "Save Changes" : "Add Column"}
					</button>
				</>
			}
		>
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
						className="w-full px-4 py-3 bg-[#161B26] border border-slate-700 rounded-xl text-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all placeholder:text-slate-500"
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
								className="w-28 rounded-lg border border-slate-700 bg-[#161B26] py-1.5 pl-3 pr-8 text-xs font-mono text-slate-300 outline-none focus:border-blue-500/50 transition-all"
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
			</form>
		</Modal>
	);
}
