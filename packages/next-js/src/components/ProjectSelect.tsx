"use client";

import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";
import { api } from "@/lib/api-client";
import { Project } from "@/server/types";
import { cn } from "@/lib/utils";

interface ProjectSelectProps {
	projectId: string;
	projectName: string;
	projectColor?: string;
}

export function ProjectSelect({
	projectId,
	projectName,
	projectColor,
}: ProjectSelectProps) {
	const router = useRouter();
	const [isOpen, setIsOpen] = useState(false);
	const [projects, setProjects] = useState<Project[]>([]);
	const [loading, setLoading] = useState(false);
	const [focusedIndex, setFocusedIndex] = useState<number>(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLUListElement>(null);

	useEffect(() => {
		if (isOpen && projects.length === 0 && !loading) {
			setLoading(true);
			api
				.getProjects()
				.then((data) => {
					setProjects(data);
					setLoading(false);
				})
				.catch((err) => {
					console.error("Failed to load projects", err);
					setLoading(false);
				});
		}
	}, [isOpen, projects.length, loading]);

	useEffect(() => {
		if (isOpen && projects.length > 0) {
			const currentIndex = projects.findIndex((p) => p.id === projectId);
			setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
		} else {
			setFocusedIndex(-1);
		}
	}, [isOpen, projects, projectId]);

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	useEffect(() => {
		if (isOpen && listRef.current && focusedIndex >= 0) {
			const items = listRef.current.children;
			if (items[focusedIndex]) {
				(items[focusedIndex] as HTMLElement).scrollIntoView({
					block: "nearest",
				});
			}
		}
	}, [focusedIndex, isOpen]);

	const handleKeyDown = (e: KeyboardEvent) => {
		if (!isOpen) {
			if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
				e.preventDefault();
				setIsOpen(true);
			}
			return;
		}

		switch (e.key) {
			case "Escape":
				setIsOpen(false);
				break;
			case "ArrowDown":
				e.preventDefault();
				setFocusedIndex((prev) =>
					prev < projects.length - 1 ? prev + 1 : prev,
				);
				break;
			case "ArrowUp":
				e.preventDefault();
				setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
				break;
			case "Enter":
				e.preventDefault();
				if (focusedIndex >= 0 && focusedIndex < projects.length) {
					selectProject(projects[focusedIndex].id);
				}
				break;
			case "Tab":
				setIsOpen(false);
				break;
		}
	};

	const selectProject = (id: string) => {
		setIsOpen(false);
		if (id !== projectId) {
			router.push(`/board/${id}`);
		}
	};

	// Determine the current project color to show it next to the name
	const currentProject = projects.find((p) => p.id === projectId);
	const displayColor = projectColor || currentProject?.color;

	return (
		<div className="relative" ref={containerRef} onKeyDown={handleKeyDown}>
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-2 px-2 py-1 -ml-2 rounded-lg hover:bg-slate-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
				aria-haspopup="listbox"
				aria-expanded={isOpen}
			>
				{displayColor && (
					<div
						className="w-3 h-3 rounded-full"
						style={{ backgroundColor: displayColor }}
					/>
				)}
				<h2 className="text-lg font-bold text-slate-200">{projectName}</h2>
				<ChevronDown
					className={cn(
						"w-4 h-4 text-slate-400 transition-transform duration-200",
						isOpen && "rotate-180",
					)}
				/>
			</button>

			{isOpen && (
				<div className="absolute top-full left-0 mt-1 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
					{loading ? (
						<div className="p-4 text-sm text-slate-400 text-center">
							Loading...
						</div>
					) : projects.length === 0 ? (
						<div className="p-4 text-sm text-slate-400 text-center">
							No projects found
						</div>
					) : (
						<ul
							ref={listRef}
							className="max-h-64 overflow-y-auto py-1"
							role="listbox"
							tabIndex={-1}
						>
							{projects.map((project, index) => {
								const isSelected = project.id === projectId;
								const isFocused = index === focusedIndex;

								return (
									<li
										key={project.id}
										role="option"
										aria-selected={isSelected}
										className={cn(
											"flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors",
											isFocused
												? "bg-slate-700 text-slate-100"
												: "text-slate-300 hover:bg-slate-700/50",
											isSelected && "font-medium",
										)}
										onClick={() => selectProject(project.id)}
										onMouseEnter={() => setFocusedIndex(index)}
									>
										<div className="w-4 flex justify-center shrink-0">
											{isSelected && (
												<Check className="w-4 h-4 text-blue-400" />
											)}
										</div>
										{project.color && (
											<div
												className="w-3 h-3 rounded-full shrink-0"
												style={{ backgroundColor: project.color }}
											/>
										)}
										<span className="truncate">{project.name}</span>
									</li>
								);
							})}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}
