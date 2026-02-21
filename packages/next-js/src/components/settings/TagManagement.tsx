"use client";

import { useEffect, useState, useMemo } from "react";
import {
	Plus,
	Trash2,
	Tag as TagIcon,
	Palette,
	Check,
	Hash,
	Pencil,
	X,
	Search,
	Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import type { Tag } from "@/types/kanban";

const PRESET_COLORS = [
	// Red
	"#ef4444",
	"#dc2626",
	"#b91c1c",
	// Orange
	"#f97316",
	"#ea580c",
	"#c2410c",
	// Amber/Yellow
	"#f59e0b",
	"#d97706",
	"#b45309",
	// Lime/Green
	"#84cc16",
	"#65a30d",
	"#4d7c0f",
	// Emerald/Teal
	"#10b981",
	"#059669",
	"#047857",
	// Cyan/Sky
	"#06b6d4",
	"#0891b2",
	"#0e7490",
	// Blue
	"#3b82f6",
	"#2563eb",
	"#1d4ed8",
	// Indigo/Violet
	"#6366f1",
	"#4f46e5",
	"#4338ca",
	// Purple/Fuchsia
	"#a855f7",
	"#9333ea",
	"#7e22ce",
	// Pink/Rose
	"#ec4899",
	"#db2777",
	"#be185d",
	// Slate/Zinc
	"#64748b",
	"#475569",
	"#334155",
];

export function TagManagement() {
	const [tags, setTags] = useState<Tag[]>([]);
	const [newTagName, setNewTagName] = useState("");
	const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[21]); // Indigo
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [editingTagId, setEditingTagId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editColor, setEditColor] = useState("");
	const [searchQuery, setSearchQuery] = useState("");

	useEffect(() => {
		void loadTags();
	}, []);

	const loadTags = async () => {
		setIsLoading(true);
		try {
			const response = await api.tag.list({});
			setTags(response.tags.sort((a, b) => a.name.localeCompare(b.name)));
		} catch (error) {
			console.error("Failed to load tags:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleCreateTag = async () => {
		if (!newTagName.trim() || isSaving) return;
		setIsSaving(true);
		try {
			const tag = await api.tag.create({
				name: newTagName.trim(),
				color: selectedColor,
			});
			setTags([...tags, tag].sort((a, b) => a.name.localeCompare(b.name)));
			setNewTagName("");
		} catch (error) {
			console.error("Failed to create tag:", error);
		} finally {
			setIsSaving(false);
		}
	};

	const handleDeleteTag = async (id: string) => {
		try {
			const result = await api.tag.delete({ id });
			if (result.ok) {
				setTags(tags.filter((t) => t.id !== id));
			}
		} catch (error) {
			console.error("Failed to delete tag:", error);
		}
	};

	const startEditing = (tag: Tag) => {
		setEditingTagId(tag.id);
		setEditName(tag.name);
		setEditColor(tag.color);
	};

	const cancelEditing = () => {
		setEditingTagId(null);
		setEditName("");
		setEditColor("");
	};

	const handleUpdateTag = async (id: string) => {
		if (!editName.trim()) return;
		try {
			const updatedTag = await api.tag.update({
				id,
				name: editName.trim(),
				color: editColor,
			});
			setTags(
				tags
					.map((t) => (t.id === id ? updatedTag : t))
					.sort((a, b) => a.name.localeCompare(b.name)),
			);
			cancelEditing();
		} catch (error) {
			console.error("Failed to update tag:", error);
		}
	};

	const filteredTags = useMemo(() => {
		return tags.filter((tag) =>
			tag.name.toLowerCase().includes(searchQuery.toLowerCase()),
		);
	}, [tags, searchQuery]);

	return (
		<div className="flex flex-col w-full">
			<div className="flex-none bg-[#0B0E14] border-b border-slate-800/60 pb-6 mb-6 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20 flex items-center justify-center shadow-lg shadow-indigo-500/10">
						<TagIcon className="w-5 h-5 text-indigo-400" />
					</div>
					<div>
						<div className="flex items-center gap-2">
							<span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] leading-none">
								Global Taxonomy
							</span>
							<div className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-[8px] font-bold text-indigo-300 ring-1 ring-indigo-500/30">
								Live Editor
							</div>
						</div>
						<p className="text-xl font-black text-white tracking-tight leading-none mt-1">
							{tags.length}{" "}
							<span className="text-slate-600 font-medium">Active Tags</span>
						</p>
					</div>
				</div>

				<div className="relative group min-w-[300px]">
					<div className="absolute left-3.5 top-1/2 -translate-y-1/2">
						<Search className="w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
					</div>
					<input
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Filter by label name..."
						className="w-full bg-slate-900/40 border border-slate-800/60 text-sm text-slate-200 rounded-xl pl-10 pr-10 py-2.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all placeholder:text-slate-600 font-medium shadow-sm"
					/>
					{searchQuery && (
						<button
							onClick={() => setSearchQuery("")}
							className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-800 rounded-full transition-colors"
						>
							<X className="w-3 h-3 text-slate-500" />
						</button>
					)}
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
				<div className="lg:col-span-4 space-y-6">
					<div className="p-7 rounded-3xl bg-[#0B0E14] border border-slate-800/60 shadow-[0_20px_50px_rgba(0,0,0,0.5)] space-y-7 relative overflow-hidden group/card">
						<div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover/card:bg-indigo-500/10 transition-colors duration-700" />

						<div className="space-y-5 relative">
							<div className="space-y-2.5">
								<label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
									Create New Tag
								</label>
								<div className="relative group">
									<div className="absolute left-4 top-1/2 -translate-y-1/2">
										<Hash className="w-4 h-4 text-slate-600 group-focus-within:text-indigo-400 transition-colors" />
									</div>
									<input
										value={newTagName}
										onChange={(e) => setNewTagName(e.target.value)}
										placeholder="e.g. priority-high"
										className="w-full bg-slate-900/60 border border-slate-800/60 text-base text-slate-100 rounded-2xl pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all placeholder:text-slate-700 font-bold tracking-tight"
										onKeyDown={(e) =>
											e.key === "Enter" && void handleCreateTag()
										}
									/>
								</div>
							</div>

							<div className="space-y-4">
								<div className="flex items-center justify-between pl-1">
									<label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
										<Palette className="w-3.5 h-3.5" /> Color Signature
									</label>
									<div className="flex items-center gap-2">
										<input
											type="text"
											value={selectedColor}
											onChange={(e) => setSelectedColor(e.target.value)}
											className="bg-transparent border-none text-[10px] font-mono text-slate-500 uppercase focus:outline-none w-16 text-right"
										/>
										<div className="relative">
											<input
												type="color"
												value={selectedColor}
												onChange={(e) => setSelectedColor(e.target.value)}
												className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
											/>
											<div
												className="w-4 h-4 rounded-full ring-1 ring-white/20 shadow-sm"
												style={{ backgroundColor: selectedColor }}
											/>
										</div>
									</div>
								</div>
								<div className="grid grid-cols-6 gap-2.5 p-4 bg-slate-900/40 border border-slate-800/60 rounded-2xl">
									{PRESET_COLORS.map((color) => (
										<button
											key={color}
											type="button"
											onClick={() => setSelectedColor(color)}
											className={cn(
												"aspect-square rounded-xl transition-all duration-500 relative group flex items-center justify-center",
												selectedColor === color
													? "scale-110 shadow-[0_0_25px_rgba(0,0,0,0.4)] ring-2 ring-white/30"
													: "hover:scale-110 shadow-sm",
											)}
											style={{
												backgroundColor: color,
												boxShadow:
													selectedColor === color
														? `0 0 20px ${color}50`
														: "none",
											}}
										>
											{selectedColor === color && (
												<Check className="w-4 h-4 text-white animate-in zoom-in-50 duration-500 drop-shadow-md" />
											)}
										</button>
									))}
								</div>
							</div>
						</div>

						{newTagName && (
							<div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-500 relative">
								<label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
									Preview Identity
								</label>
								<div className="flex items-center justify-center p-8 bg-slate-900/60 border border-dashed border-slate-800/80 rounded-2xl relative overflow-hidden">
									<div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
									<div
										className="px-5 py-2.5 rounded-2xl text-base font-black shadow-2xl transition-all duration-500 hover:scale-105 relative z-10"
										style={{
											backgroundColor: `${selectedColor}15`,
											color: selectedColor,
											border: `2px solid ${selectedColor}40`,
											boxShadow: `0 10px 30px ${selectedColor}15`,
										}}
									>
										#{newTagName}
									</div>
								</div>
							</div>
						)}

						<button
							type="button"
							onClick={() => void handleCreateTag()}
							disabled={!newTagName.trim() || isSaving}
							className="group/btn relative w-full py-4 text-sm font-black uppercase tracking-widest rounded-2xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-slate-800/50 disabled:text-slate-700 disabled:shadow-none transition-all duration-500 shadow-[0_15px_30px_rgba(79,70,229,0.3)] flex items-center justify-center gap-3 active:scale-[0.97] overflow-hidden"
						>
							<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/btn:animate-shimmer" />
							{isSaving ? (
								<Loader2 className="w-5 h-5 animate-spin" />
							) : (
								<Plus className="w-5 h-5 group-hover/btn:rotate-90 transition-transform duration-500" />
							)}
							<span>Register Tag</span>
						</button>
					</div>
				</div>

				<div className="lg:col-span-8">
					{isLoading ? (
						<div className="flex flex-col items-center justify-center py-32 gap-6">
							<div className="relative">
								<div className="w-16 h-16 border-[3px] border-indigo-500/10 rounded-full" />
								<div className="w-16 h-16 border-t-[3px] border-indigo-500 rounded-full animate-spin absolute inset-0 shadow-[0_0_20px_rgba(99,102,241,0.2)]" />
							</div>
							<p className="text-sm font-black text-slate-500 tracking-[0.2em] uppercase animate-pulse">
								Synchronizing taxonomy...
							</p>
						</div>
					) : filteredTags.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-slate-800/40 rounded-[2.5rem] bg-slate-900/10 backdrop-blur-sm">
							<div className="w-20 h-20 rounded-3xl bg-slate-800/30 flex items-center justify-center mb-6 ring-1 ring-slate-700/50">
								<TagIcon className="w-10 h-10 text-slate-600" />
							</div>
							<p className="text-xl font-black text-slate-400 mb-2">
								No tags discovered
							</p>
							<p className="text-sm text-slate-600 font-medium">
								{searchQuery
									? "No matches for your current filter"
									: "Your tag repository is currently empty"}
							</p>
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
							{filteredTags.map((tag) => (
								<div
									key={tag.id}
									className={cn(
										"group relative p-5 rounded-[2rem] bg-[#0B0E14] border border-slate-800/60 hover:border-indigo-500/40 transition-all duration-500 hover:shadow-[0_30px_60px_rgba(0,0,0,0.6)] flex flex-col justify-between min-h-[140px]",
										editingTagId === tag.id &&
											"ring-4 ring-indigo-500/20 border-indigo-500/50 z-20 bg-slate-900/80 backdrop-blur-xl scale-105",
									)}
								>
									{editingTagId === tag.id ? (
										<div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
											<input
												value={editName}
												onChange={(e) => setEditName(e.target.value)}
												className="w-full bg-slate-900 border border-slate-700/50 text-base text-slate-100 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 font-black tracking-tight"
												onKeyDown={(e) => {
													if (e.key === "Enter") void handleUpdateTag(tag.id);
													if (e.key === "Escape") cancelEditing();
												}}
												autoFocus
											/>
											<div className="flex flex-wrap gap-1.5 p-2 bg-black/20 rounded-xl">
												{PRESET_COLORS.map((color) => (
													<button
														key={color}
														type="button"
														onClick={() => setEditColor(color)}
														className={cn(
															"w-5 h-5 rounded-md transition-all duration-300",
															editColor === color
																? "ring-2 ring-white scale-110 shadow-lg"
																: "hover:scale-110 shadow-sm",
														)}
														style={{ backgroundColor: color }}
													/>
												))}
											</div>
											<div className="flex gap-2 pt-2">
												<button
													type="button"
													onClick={() => void handleUpdateTag(tag.id)}
													className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
												>
													Save
												</button>
												<button
													type="button"
													onClick={cancelEditing}
													className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-[10px] font-black uppercase tracking-wider hover:bg-slate-700 transition-all active:scale-95"
												>
													Cancel
												</button>
											</div>
										</div>
									) : (
										<>
											<div className="flex items-start justify-between mb-4">
												<div
													className="px-4 py-1.5 rounded-full text-sm font-black tracking-tight transition-all duration-500 group-hover:scale-110 group-hover:-rotate-2"
													style={{
														backgroundColor: `${tag.color}15`,
														color: tag.color,
														border: `1.5px solid ${tag.color}35`,
														boxShadow: `0 5px 15px ${tag.color}10`,
													}}
												>
													#{tag.name}
												</div>
												<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-500">
													<button
														type="button"
														onClick={() => void handleDeleteTag(tag.id)}
														className="p-2 text-red-500/80 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
														title="Delete Tag"
													>
														<Trash2 className="w-4 h-4" />
													</button>
												</div>
											</div>
											<div className="flex items-end justify-between">
												<div className="space-y-1">
													<p className="text-[9px] font-black text-slate-700 uppercase tracking-widest leading-none">
														Signature
													</p>
													<span className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter">
														{tag.color}
													</span>
												</div>
												<div
													className="w-10 h-1 rounded-full opacity-20 group-hover:opacity-100 group-hover:w-16 transition-all duration-700"
													style={{ backgroundColor: tag.color }}
												/>
											</div>
											<button
												className="absolute inset-0 z-0 cursor-pointer"
												onClick={() => startEditing(tag)}
												aria-label="Edit tag"
											/>
										</>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
