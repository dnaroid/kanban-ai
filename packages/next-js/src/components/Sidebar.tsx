"use client";

import {
	Activity,
	CalendarRange,
	ChevronLeft,
	ChevronRight,
	FolderKanban,
	Layout,
	Settings,
	Kanban,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface SidebarProps {
	isSidebarCollapsed: boolean;
	onToggleSidebar: () => void;
	activeProject: { id: string; name: string } | null;
	onProjectSelect?: (id: string, name: string) => void;
}

export function Sidebar({
	isSidebarCollapsed,
	onToggleSidebar,
	activeProject,
	onProjectSelect,
}: SidebarProps) {
	const pathname = usePathname();
	const router = useRouter();

	const navItems = [
		{
			id: "projects",
			label: "Projects",
			icon: FolderKanban,
			path: "/projects",
		},
		{
			id: "diagnostics",
			label: "Diagnostics",
			icon: Activity,
			path: "/diagnostics",
		},
		{
			id: "timeline",
			label: "Timeline",
			icon: CalendarRange,
			path: "/timeline",
		},
	];

	const getCurrentScreenId = () => {
		if (pathname.startsWith("/projects")) return "projects";
		if (pathname.startsWith("/diagnostics")) return "diagnostics";
		if (pathname.startsWith("/timeline")) return "timeline";
		if (pathname.startsWith("/board")) return "board";
		if (pathname.startsWith("/settings")) return "settings";
		return "projects";
	};

	const currentScreenId = getCurrentScreenId();

	return (
		<aside
			className={`fixed top-0 left-0 h-full bg-[#11151C] border-r border-slate-800/50 flex flex-col z-50 transition-all duration-300 ${isSidebarCollapsed ? "w-16" : "w-64"}`}
		>
			<div
				className={cn(
					"flex items-center shrink-0 transition-all duration-300 ease-in-out border-b border-slate-800/50",
					isSidebarCollapsed
						? "flex-col justify-center gap-4 py-4"
						: "justify-between px-6 py-5",
				)}
			>
				<div
					className={cn(
						"flex items-center",
						isSidebarCollapsed ? "justify-center w-full" : "gap-3",
					)}
				>
					<div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
						<Layout className="w-5 h-5 text-white" />
					</div>
					{!isSidebarCollapsed && (
						<div className="flex flex-col animate-in fade-in duration-300">
							<span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
								Kanban AI
							</span>
							<span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">
								v1.0.0-beta
							</span>
						</div>
					)}
				</div>

				<button
					type="button"
					onClick={onToggleSidebar}
					className={cn(
						"p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all duration-200",
					)}
				>
					{isSidebarCollapsed ? (
						<ChevronRight className="w-4 h-4" />
					) : (
						<ChevronLeft className="w-4 h-4" />
					)}
				</button>
			</div>

			{/* Active Project (collapsed) */}
			{activeProject && isSidebarCollapsed && (
				<div className="px-2 py-2 border-b border-slate-800/50">
					<button
						type="button"
						onClick={() => {
							if (onProjectSelect) {
								onProjectSelect(activeProject.id, activeProject.name);
							} else {
								router.push(`/board/${activeProject.id}`);
							}
						}}
						className={cn(
							"flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-200",
							currentScreenId === "board"
								? "bg-blue-600/10 text-blue-400 ring-1 ring-inset ring-blue-500/20"
								: "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
						)}
						title={activeProject.name}
					>
						<Kanban className="w-6 h-6" />
					</button>
				</div>
			)}

			<nav
				className={`flex-1 ${isSidebarCollapsed ? "p-2" : "p-4"} space-y-1 mt-4`}
			>
				{navItems.map((item) => {
					const Icon = item.icon;
					const isActive = currentScreenId === item.id;
					const isDisabled = item.id === "timeline" && !activeProject;

					return (
						<button
							key={item.id}
							type="button"
							onClick={() => {
								if (item.id === "timeline") {
									if (!activeProject) return;
									router.push(
										`/timeline/${activeProject.id}?name=${encodeURIComponent(activeProject.name)}`,
									);
									return;
								}
								router.push(item.path);
							}}
							disabled={isDisabled}
							className={cn(
								"flex items-center rounded-xl transition-all duration-200 group",
								isSidebarCollapsed
									? "justify-center w-12 h-12"
									: "gap-3 px-4 py-3 w-full",
								isActive
									? "bg-blue-600/10 text-blue-400 ring-1 ring-inset ring-blue-500/20"
									: "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
								isDisabled &&
									"opacity-50 cursor-not-allowed hover:bg-transparent",
							)}
							title={item.label}
						>
							<Icon
								className={cn(
									"transition-transform duration-200",
									isSidebarCollapsed ? "w-6 h-6" : "w-5 h-5",
									isActive
										? "text-blue-400"
										: "text-slate-500 group-hover:text-slate-300",
								)}
							/>
							{!isSidebarCollapsed && (
								<span className="font-medium">{item.label}</span>
							)}
						</button>
					);
				})}
			</nav>

			<div
				className={`border-t border-slate-800/50 ${isSidebarCollapsed ? "p-2" : "p-4"}`}
			>
				<button
					type="button"
					onClick={() => {
						router.push("/settings");
					}}
					className={cn(
						"w-full flex items-center rounded-xl transition-all duration-200 group",
						isSidebarCollapsed
							? "justify-center w-12 h-12"
							: "gap-3 px-4 py-3 w-full",
						currentScreenId === "settings"
							? "bg-blue-600/10 text-blue-400 ring-1 ring-inset ring-blue-500/20"
							: "text-slate-500 hover:bg-slate-800/50 hover:text-slate-300",
					)}
					title="Settings"
				>
					<Settings className="w-5 h-5" />
					{!isSidebarCollapsed && <span className="font-medium">Settings</span>}
				</button>
			</div>
		</aside>
	);
}
