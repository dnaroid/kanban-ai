"use client";

import { useState } from "react";
import {
	AlignLeft,
	Calendar,
	Flag,
	Tag as TagIcon,
	CheckCircle2,
	X,
	Plus,
} from "lucide-react";
import type { KanbanTask } from "@/types/kanban";
import { cn } from "@/lib/utils";
import {
	priorityConfig,
	typeConfig,
	difficultyConfig,
} from "../TaskPropertyConfigs";

interface TaskDrawerDetailsProps {
	task: KanbanTask;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
	columnName?: string;
	isActive?: boolean;
}

export function TaskDrawerDetails({
	task,
	onUpdate,
	columnName,
	isActive = false,
}: TaskDrawerDetailsProps) {
	const [isEditingDescription, setIsEditingDescription] = useState(false);
	const [editedDescription, setEditedDescription] = useState(
		task.description || "",
	);
	const [newTag, setNewTag] = useState("");

	const handleSaveDescription = () => {
		if (editedDescription !== (task.description || "")) {
			onUpdate?.(task.id, { description: editedDescription });
		}
		setIsEditingDescription(false);
	};

	const handleAddTag = () => {
		if (!newTag.trim()) return;
		const currentTags = task.tags || [];
		if (!currentTags.includes(newTag.trim())) {
			onUpdate?.(task.id, { tags: [...currentTags, newTag.trim()] });
		}
		setNewTag("");
	};

	const handleRemoveTag = (tagToRemove: string) => {
		const newTags = task.tags.filter((tag) => tag !== tagToRemove);
		onUpdate?.(task.id, { tags: newTags });
	};

	const handlePriorityChange = (priority: string) => {
		onUpdate?.(task.id, { priority: priority as KanbanTask["priority"] });
	};

	const handleTypeChange = (type: string) => {
		onUpdate?.(task.id, { type: type as KanbanTask["type"] });
	};

	const handleDifficultyChange = (difficulty: string) => {
		onUpdate?.(task.id, { difficulty: difficulty as KanbanTask["difficulty"] });
	};

	return (
		<div className="flex flex-col h-full bg-[#0B0E14] animate-in fade-in duration-300 overflow-y-auto">
			{/* Quick Actions */}
			<div className="p-6 border-b border-slate-800/50 space-y-4">
				{/* Priority */}
				<div>
					<label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
						<Flag className="w-3 h-3" />
						Priority
					</label>
					<div className="flex gap-2">
						{Object.entries(priorityConfig).map(([key, config]) => (
							<button
								key={key}
								onClick={() => handlePriorityChange(key)}
								className={cn(
									"px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border",
									task.priority === key
										? `${config.bg} ${config.color} ${config.border}`
										: "bg-slate-800/30 text-slate-500 border-slate-800/50 hover:bg-slate-800/50",
								)}
							>
								{key}
							</button>
						))}
					</div>
				</div>

				{/* Type */}
				<div>
					<label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
						<CheckCircle2 className="w-3 h-3" />
						Type
					</label>
					<div className="flex gap-2 flex-wrap">
						{Object.entries(typeConfig).map(([key, config]) => (
							<button
								key={key}
								onClick={() => handleTypeChange(key)}
								className={cn(
									"px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border",
									task.type === key
										? `${config.bg} ${config.color} ${config.border}`
										: "bg-slate-800/30 text-slate-500 border-slate-800/50 hover:bg-slate-800/50",
								)}
							>
								{key}
							</button>
						))}
					</div>
				</div>

				{/* Difficulty */}
				<div>
					<label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
						<Calendar className="w-3 h-3" />
						Difficulty
					</label>
					<div className="flex gap-2">
						{Object.entries(difficultyConfig).map(([key, config]) => (
							<button
								key={key}
								onClick={() => handleDifficultyChange(key)}
								className={cn(
									"px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border",
									task.difficulty === key
										? `${config.bg} ${config.color} ${config.border}`
										: "bg-slate-800/30 text-slate-500 border-slate-800/50 hover:bg-slate-800/50",
								)}
							>
								{key}
							</button>
						))}
					</div>
				</div>

				{/* Tags */}
				<div>
					<label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
						<TagIcon className="w-3 h-3" />
						Tags
					</label>
					<div className="flex flex-wrap gap-2 mb-2">
						{task.tags.map((tag, i) => (
							<span
								key={i}
								className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold bg-slate-800/50 text-slate-300"
							>
								{tag}
								<button
									onClick={() => handleRemoveTag(tag)}
									className="text-slate-500 hover:text-red-400 transition-colors"
								>
									<X className="w-3 h-3" />
								</button>
							</span>
						))}
					</div>
					<div className="flex gap-2">
						<input
							type="text"
							value={newTag}
							onChange={(e) => setNewTag(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
							placeholder="Add tag..."
							className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
						/>
						<button
							onClick={handleAddTag}
							className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors"
						>
							<Plus className="w-4 h-4" />
						</button>
					</div>
				</div>

				{/* Column */}
				{columnName && (
					<div>
						<label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
							Column
						</label>
						<div className="px-3 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-slate-300">
							{columnName}
						</div>
					</div>
				)}
			</div>

			{/* Description */}
			<div className="p-6 flex-1">
				<label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
					<AlignLeft className="w-3 h-3" />
					Description
				</label>
				{isEditingDescription ? (
					<div className="space-y-3">
						<textarea
							value={editedDescription}
							onChange={(e) => setEditedDescription(e.target.value)}
							placeholder="Add a description..."
							className="w-full h-48 px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 resize-none"
							autoFocus
						/>
						<div className="flex gap-2">
							<button
								onClick={() => {
									setIsEditingDescription(false);
									setEditedDescription(task.description || "");
								}}
								className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-colors"
							>
								Cancel
							</button>
							<button
								onClick={handleSaveDescription}
								className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors"
							>
								Save
							</button>
						</div>
					</div>
				) : (
					<div
						onClick={() => setIsEditingDescription(true)}
						className="min-h-[120px] px-4 py-3 bg-slate-900/30 border border-slate-800/50 rounded-xl text-sm text-slate-300 hover:bg-slate-900/50 hover:border-slate-700 transition-colors cursor-pointer"
					>
						{task.description || (
							<span className="text-slate-600 italic">
								Click to add a description...
							</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
