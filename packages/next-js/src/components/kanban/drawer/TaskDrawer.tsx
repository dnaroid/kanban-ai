"use client";

import { useEffect, useRef, useState } from "react";
import {
	ChevronRight,
	Maximize2,
	Minimize2,
	MoreVertical,
	Trash2,
	X,
} from "lucide-react";
import type { KanbanTask } from "@/types/kanban";
import { cn } from "@/lib/utils";
import { TaskDrawerProperties } from "./TaskDrawerProperties";
import { TaskDrawerDetails } from "./TaskDrawerDetails";

interface TaskDrawerProps {
	task: KanbanTask | null;
	isOpen: boolean;
	onClose: () => void;
	onUpdate?: (id: string, patch: Partial<KanbanTask>) => void;
	columnName?: string;
}

export function TaskDrawer({
	task,
	isOpen,
	onClose,
	onUpdate,
	columnName,
}: TaskDrawerProps) {
	const [activeTab, setActiveTab] = useState<"details" | "properties">("details");
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [editedTitle, setEditedTitle] = useState("");
	const titleInputRef = useRef<HTMLInputElement>(null);
	const [isExpanded, setIsExpanded] = useState(false);
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	const prevTaskRef = useRef<KanbanTask | undefined>(undefined);
	const shouldUpdateTitleRef = useRef(false);

	useEffect(() => {
		if (
			task &&
			prevTaskRef.current &&
			prevTaskRef.current.title !== task.title &&
			!shouldUpdateTitleRef.current
		) {
			setEditedTitle(task.title || "");
			shouldUpdateTitleRef.current = true;
		}
		if (task) {
			prevTaskRef.current = task;
		}
	}, [task]);

	useEffect(() => {
		if (isEditingTitle && titleInputRef.current) {
			titleInputRef.current.focus();
		}
	}, [isEditingTitle]);

	const shouldResetTabRef = useRef(false);
	const prevIsOpenRef = useRef(isOpen);

	useEffect(() => {
		if (prevIsOpenRef.current && !isOpen && !shouldResetTabRef.current) {
			setActiveTab("details");
			shouldResetTabRef.current = true;
		}
		if (isOpen) {
			shouldResetTabRef.current = false;
		}
		prevIsOpenRef.current = isOpen;
	}, [isOpen]);

	const handleSaveTitle = () => {
		if (task && editedTitle !== task.title) {
			onUpdate?.(task.id, { title: editedTitle });
		}
		setIsEditingTitle(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleSaveTitle();
		} else if (e.key === "Escape") {
			setIsEditingTitle(false);
			setEditedTitle(task?.title || "");
		}
	};

	useEffect(() => {
		const handleGlobalKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && isOpen && !isEditingTitle) {
				onClose();
			}
		};

		if (isOpen) {
			window.addEventListener("keydown", handleGlobalKeyDown);
		}

		return () => {
			window.removeEventListener("keydown", handleGlobalKeyDown);
		};
	}, [isOpen, isEditingTitle, onClose]);

	if (!isOpen || !task) return null;

	const tabs = [
		{ id: "details" as const, label: "Details" },
		{ id: "properties" as const, label: "Properties" },
	];

	return (
		<>
			<div
				className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300"
				onClick={onClose}
			/>
			<div
				className={cn(
					"fixed inset-y-0 right-0 bg-[#0B0E14] border-l border-slate-800/60 shadow-2xl transform transition-all duration-300 z-50 flex flex-col",
					isExpanded ? "left-[var(--sidebar-width)]" : "w-[600px]",
				)}
			>
				{/* Header */}
				<div className="h-14 border-b border-slate-800/60 flex items-center justify-between px-4 bg-[#11151C] shrink-0">
					<div className="flex items-center gap-2 flex-1 min-w-0 mr-4">
						{isEditingTitle ? (
							<input
								ref={titleInputRef}
								value={editedTitle}
								onChange={(e) => setEditedTitle(e.target.value)}
								onBlur={handleSaveTitle}
								onKeyDown={handleKeyDown}
								className="flex-1 bg-slate-900 border border-blue-500/50 text-sm font-semibold text-white px-2 py-1 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50"
							/>
						) : (
							<div
								className="flex-1 min-w-0 group cursor-pointer"
								onClick={() => setIsEditingTitle(true)}
							>
								<h2 className="text-sm font-semibold text-slate-200 truncate group-hover:text-blue-400 transition-colors">
									{task.title}
								</h2>
							</div>
						)}
					</div>
					<div className="flex items-center gap-1">
						<button
							onClick={() => setIsExpanded(!isExpanded)}
							className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
							title={isExpanded ? "Collapse" : "Expand"}
						>
							{isExpanded ? (
								<Minimize2 className="w-4 h-4" />
							) : (
								<Maximize2 className="w-4 h-4" />
							)}
						</button>
						<div className="relative">
							<button
								onClick={() => setIsMenuOpen(!isMenuOpen)}
								className={cn(
									"p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors",
									isMenuOpen && "text-slate-300 bg-slate-800",
								)}
							>
								<MoreVertical className="w-4 h-4" />
							</button>

							{isMenuOpen && (
								<>
									<div
										className="fixed inset-0 z-10"
										onClick={() => setIsMenuOpen(false)}
									/>
									<div className="absolute right-0 top-full mt-1 w-48 bg-[#161B26] border border-slate-700/60 rounded-xl shadow-xl z-20 py-1 animate-in fade-in zoom-in-95 duration-200">
										<button
											onClick={() => {
												setIsMenuOpen(false);
											}}
											className="w-full text-left px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
										>
											<Trash2 className="w-3.5 h-3.5" />
											Delete Task
										</button>
									</div>
								</>
							)}
						</div>
						<div className="w-px h-4 bg-slate-800/60 mx-1" />
						<button
							onClick={onClose}
							className="p-1.5 text-slate-500 hover:text-white hover:bg-red-500/10 hover:border-red-500/20 border border-transparent rounded-lg transition-colors"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
				</div>

				{/* Tabs */}
				<div className="flex items-center px-4 border-b border-slate-800/60 bg-[#11151C] shrink-0">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							className={cn(
								"px-4 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors relative",
								activeTab === tab.id
									? "text-blue-400 border-blue-500 bg-blue-500/5"
									: "text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/50",
							)}
						>
							{tab.label}
						</button>
					))}
				</div>

				{/* Content */}
				<div className="flex-1 overflow-hidden relative">
					<div
						className={cn(
							"absolute inset-0 flex flex-col",
							activeTab !== "details" && "hidden",
						)}
					>
						<TaskDrawerDetails
							task={task}
							onUpdate={onUpdate}
							columnName={columnName}
							isActive={activeTab === "details"}
						/>
					</div>

					<div
						className={cn(
							"absolute inset-0 flex flex-col",
							activeTab !== "properties" && "hidden",
						)}
					>
						<TaskDrawerProperties task={task} />
					</div>
				</div>
			</div>
		</>
	);
}
