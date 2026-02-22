"use client";

import { useState, useEffect, useRef } from "react";
import {
	Plus,
	FolderKanban,
	Github,
	MoreVertical,
	Edit2,
	Palette,
	Check,
	X,
} from "lucide-react";
import { FileSystemPicker } from "@/components/common/FileSystemPicker";
import type { Project } from "@/server/types";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";

interface ProjectsScreenProps {
	onProjectSelect: (id: string, name: string) => void;
}

const PROJECT_COLORS = [
	{ name: "Blue", value: "#3B82F6" },
	{ name: "Emerald", value: "#10B981" },
	{ name: "Violet", value: "#8B5CF6" },
	{ name: "Rose", value: "#F43F5E" },
	{ name: "Amber", value: "#F59E0B" },
	{ name: "Cyan", value: "#06B6D4" },
	{ name: "Indigo", value: "#6366F1" },
	{ name: "Slate", value: "#475569" },
];

function CreateProjectModal({
	isOpen,
	onClose,
	onCreate,
}: {
	isOpen: boolean;
	onClose: () => void;
	onCreate: (name: string, path: string, color: string) => void;
}) {
	const [selectedFolder, setSelectedFolder] = useState<{
		path: string;
		name: string;
	} | null>(null);
	const [projectName, setProjectName] = useState("");
	const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[0].value);
	const [isBrowserOpen, setIsBrowserOpen] = useState(false);

	const handleSelectFolder = () => setIsBrowserOpen(true);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (selectedFolder && projectName.trim()) {
			onCreate(projectName.trim(), selectedFolder.path, selectedColor);
			setSelectedFolder(null);
			setSelectedColor(PROJECT_COLORS[0].value);
		}
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
			<div className="bg-[#11151C] border border-slate-800/60 rounded-2xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
				<div className="flex items-center justify-between mb-2">
					<h2 className="text-2xl font-bold text-white">Connect Repository</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-slate-500 hover:text-slate-300 transition-colors"
					>
						<X className="w-5 h-5" />
					</button>
				</div>
				<p className="text-slate-500 text-sm mb-8">
					Select a local folder to start managing tasks
				</p>

				<form onSubmit={handleSubmit} className="space-y-6">
					<div className="space-y-2">
						<label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
							Project Folder
						</label>
						<div className="flex gap-2">
							<div className="flex-1 px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-white font-mono text-sm overflow-hidden">
								{selectedFolder ? (
									<span className="truncate block">{selectedFolder.path}</span>
								) : (
									<span className="text-slate-600">No folder selected</span>
								)}
							</div>
							<button
								type="button"
								onClick={handleSelectFolder}
								className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold text-xs transition-all border border-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
							>
								Browse...
							</button>
						</div>
						<p className="text-[11px] text-slate-500 pl-1">
							Browse and select the project folder.
						</p>
					</div>

					{selectedFolder && (
						<div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
							<div className="space-y-2">
								<label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
									Project Name
								</label>
								<input
									type="text"
									value={projectName}
									onChange={(e) => setProjectName(e.target.value)}
									placeholder="Enter project name"
									className="w-full px-4 py-3 bg-[#0B0E14] border border-slate-800 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
								/>
							</div>

							<div className="space-y-3">
								<label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
									Project Color
								</label>
								<div className="grid grid-cols-4 gap-2">
									{PROJECT_COLORS.map((color) => (
										<button
											key={color.value}
											type="button"
											onClick={() => setSelectedColor(color.value)}
											className={cn(
												"h-10 rounded-xl transition-all relative flex items-center justify-center group",
												selectedColor === color.value
													? "ring-2 ring-white ring-offset-2 ring-offset-[#11151C]"
													: "opacity-60 hover:opacity-100",
											)}
											style={{ backgroundColor: color.value }}
											title={color.name}
										>
											{selectedColor === color.value && (
												<Check className="w-5 h-5 text-white shadow-lg" />
											)}
										</button>
									))}
								</div>
							</div>
						</div>
					)}

					<div className="flex gap-4 pt-4">
						<button
							type="button"
							onClick={() => {
								onClose();
								setSelectedFolder(null);
								setIsBrowserOpen(false);
							}}
							className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold text-xs transition-all border border-slate-700/50"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={!selectedFolder}
							className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
						>
							Connect
						</button>
					</div>
				</form>
			</div>

			<FileSystemPicker
				isOpen={isBrowserOpen}
				mode="folder"
				onSelect={(paths) => {
					if (paths[0]) {
						const folderName = paths[0].split("/").pop() || paths[0];
						setSelectedFolder({ path: paths[0], name: folderName });
						setProjectName(folderName);
						setIsBrowserOpen(false);
					}
				}}
				onClose={() => setIsBrowserOpen(false)}
				title="Select Project Folder"
				selectLabel="Select Current Folder"
			/>
		</div>
	);
}

function ProjectCard({
	project,
	onSelect,
	onUpdate,
}: {
	project: Project;
	onSelect: (id: string, name: string) => void;
	onUpdate: () => void;
}) {
	const [showMenu, setShowMenu] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	const [newName, setNewName] = useState(project.name);
	const [showColorPicker, setShowColorPicker] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowMenu(false);
				setShowColorPicker(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleRename = async () => {
		if (newName.trim() && newName !== project.name) {
			await api.updateProject(project.id, { name: newName.trim() });
			onUpdate();
		}
		setIsEditing(false);
		setShowMenu(false);
	};

	const handleColorChange = async (color: string) => {
		await api.updateProject(project.id, { color });
		onUpdate();
		setShowColorPicker(false);
		setShowMenu(false);
	};

	const color = project.color || "#3B82F6";

	return (
		<div
			onClick={() =>
				!showMenu && !isEditing && onSelect(project.id, project.name)
			}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					if (!showMenu && !isEditing) onSelect(project.id, project.name);
				}
			}}
			role="button"
			tabIndex={0}
			className="group bg-[#11151C] border p-6 rounded-2xl transition-all text-left relative overflow-hidden active:scale-[0.98] cursor-pointer hover:shadow-2xl hover:shadow-black/40"
			style={{
				borderColor: `${color}40`,
				background: `linear-gradient(135deg, #11151C 0%, ${color}10 100%)`,
				boxShadow: `0 0 40px -20px ${color}15`,
			}}
		>
			<div className="absolute top-2 right-2 z-10" ref={menuRef}>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						setShowMenu(!showMenu);
					}}
					className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
				>
					<MoreVertical className="w-4 h-4" />
				</button>

				{showMenu && (
					<div className="absolute right-0 mt-1 w-48 bg-[#161B26] border border-slate-800 rounded-xl shadow-2xl z-20 py-1.5 animate-in fade-in zoom-in-95 duration-100">
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setIsEditing(true);
								setShowMenu(false);
							}}
							className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
						>
							<Edit2 className="w-4 h-4" /> Rename
						</button>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setShowColorPicker(!showColorPicker);
							}}
							className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
						>
							<Palette className="w-4 h-4" /> Change Color
						</button>
						{showColorPicker && (
							<div className="px-4 py-3 border-t border-slate-800 mt-1.5 grid grid-cols-4 gap-2">
								{PROJECT_COLORS.map((c) => (
									<button
										key={c.value}
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											handleColorChange(c.value);
										}}
										className={cn(
											"w-6 h-6 rounded-full transition-transform hover:scale-125 border border-white/10",
											project.color === c.value &&
												"ring-2 ring-white ring-offset-2 ring-offset-[#161B26]",
										)}
										style={{ backgroundColor: c.value }}
									/>
								))}
							</div>
						)}
					</div>
				)}
			</div>

			<div
				className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
				style={{ backgroundColor: `${color}15`, color: color }}
			>
				<FolderKanban className="w-6 h-6" />
			</div>

			{isEditing ? (
				<div className="mb-2" onClick={(e) => e.stopPropagation()}>
					<input
						autoFocus
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleRename()}
						onBlur={handleRename}
						className="w-full bg-[#0B0E14] border border-blue-500/50 rounded-lg px-2 py-1 text-lg font-bold text-white focus:outline-none"
					/>
				</div>
			) : (
				<h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">
					{project.name}
				</h3>
			)}

			<div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
				<Github className="w-4 h-4" />
				<span className="truncate max-w-[200px]">{project.path}</span>
			</div>

			<div className="mt-6 pt-6 border-t border-slate-800/50 flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-slate-600">
				<span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
				<span className="flex items-center gap-1.5">
					<div
						className="w-1.5 h-1.5 rounded-full"
						style={{ backgroundColor: color }}
					/>
					Active
				</span>
			</div>
		</div>
	);
}

export function ProjectsScreen({ onProjectSelect }: ProjectsScreenProps) {
	const [projects, setProjects] = useState<Project[]>([]);
	const [loading, setLoading] = useState(true);
	const [isModalOpen, setIsModalOpen] = useState(false);

	useEffect(() => {
		loadProjects();
	}, []);

	const loadProjects = async () => {
		try {
			setLoading(true);
			const data = await api.getProjects();
			setProjects(Array.isArray(data) ? data : []);
		} catch (error) {
			console.error("[ProjectsScreen] Failed to load projects:", error);
			setProjects([]);
		} finally {
			setLoading(false);
		}
	};

	const handleCreateProject = async (
		name: string,
		path: string,
		color: string,
	) => {
		try {
			await api.createProject({ name, path, color });
			setIsModalOpen(false);
			loadProjects();
		} catch (error) {
			console.error("[ProjectsScreen] Failed to create project:", error);
		}
	};

	return (
		<div className="flex flex-col min-h-screen animate-in fade-in duration-500">
			<div className="flex items-center justify-between px-8 py-6 border-b border-slate-800/60 bg-[#0B0E14] sticky top-0 z-40">
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center text-blue-400">
						<FolderKanban className="w-5 h-5" />
					</div>
					<div>
						<h2 className="text-xl font-bold text-white tracking-tight leading-tight">
							Projects
						</h2>
						<p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest mt-0.5">
							Manage AI Workspaces
						</p>
					</div>
				</div>
				<button
					type="button"
					onClick={() => setIsModalOpen(true)}
					className="bg-blue-600 hover:bg-blue-500 text-white px-4 h-10 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95 text-xs uppercase tracking-wider"
				>
					<Plus className="w-4 h-4" />
					New Project
				</button>
			</div>

			<div className="p-8 space-y-8">
				{loading ? (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{[1, 2, 3].map((i) => (
						<div
							key={i}
							className="h-48 bg-slate-800/20 rounded-2xl border border-slate-800/50 animate-pulse"
						/>
					))}
				</div>
			) : projects.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-24 bg-slate-800/10 rounded-3xl border border-dashed border-slate-800/50">
					<div className="w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center mb-4">
						<FolderKanban className="w-8 h-8 text-slate-500" />
					</div>
					<h3 className="text-xl font-bold text-white">Workspace is empty</h3>
					<p className="text-slate-500 mt-2 max-w-sm text-center">
						Connect your first repository to start managing tasks with Kanban AI
					</p>
					<button
						type="button"
						onClick={() => setIsModalOpen(true)}
						className="mt-6 text-blue-400 font-semibold hover:text-blue-300 transition-colors flex items-center gap-2"
					>
						Get Started <Plus className="w-4 h-4" />
					</button>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{projects.map((project) => (
						<ProjectCard
							key={project.id}
							project={project}
							onSelect={async (id, name) => {
								await api.setLastProjectId(id);
								onProjectSelect(id, name);
							}}
							onUpdate={loadProjects}
						/>
					))}
				</div>
			)}

			<CreateProjectModal
				isOpen={isModalOpen}
				onClose={() => setIsModalOpen(false)}
				onCreate={handleCreateProject}
			/>
		</div>
		</div>
	);
}
