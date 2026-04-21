"use client";

import {
	useState,
	useEffect,
	useRef,
	useCallback,
	useLayoutEffect,
} from "react";
import {
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	ChevronDown,
	Layout,
	LogOut,
	Settings,
	Volume2,
	VolumeX,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { cn, getContrastColor } from "@/lib/utils";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { api } from "@/lib/api-client";
import type { Project } from "@/server/types";
import { useSoundMute } from "@/lib/use-sound-mute";

interface SidebarProps {
	isSidebarCollapsed: boolean;
	onToggleSidebar: () => void;
	activeProject: { id: string; name: string; color?: string } | null;
	onProjectSelect?: (id: string, name: string, color?: string) => void;
}

export function Sidebar({
	isSidebarCollapsed,
	onToggleSidebar,
	activeProject,
}: SidebarProps) {
	const pathname = usePathname();
	const router = useRouter();
	const [isQuitModalOpen, setIsQuitModalOpen] = useState(false);
	const [isQuitting, setIsQuitting] = useState(false);
	const [isActiveSessionsModalOpen, setIsActiveSessionsModalOpen] =
		useState(false);
	const [busySessionCount, setBusySessionCount] = useState(0);
	const [queuedRunCount, setQueuedRunCount] = useState(0);
	const [runningRunCount, setRunningRunCount] = useState(0);
	const [projects, setProjects] = useState<Project[]>([]);
	const [showProjectHints, setShowProjectHints] = useState(false);
	const [hintPositions, setHintPositions] = useState<Record<string, number>>(
		{},
	);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const projectItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const { muted: soundMuted, toggleMute: toggleSoundMute } = useSoundMute();

	const measureHintPositions = useCallback(() => {
		const positions: Record<string, number> = {};
		projectItemRefs.current.forEach((el, id) => {
			const rect = el.getBoundingClientRect();
			positions[id] = rect.top + rect.height / 2;
		});
		setHintPositions(positions);
	}, []);

	useLayoutEffect(() => {
		if (showProjectHints && isSidebarCollapsed) {
			measureHintPositions();
		}
	}, [showProjectHints, isSidebarCollapsed, measureHintPositions, projects]);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container || !isSidebarCollapsed) return;
		const onScroll = () => {
			if (showProjectHints) measureHintPositions();
		};
		container.addEventListener("scroll", onScroll, { passive: true });
		return () => container.removeEventListener("scroll", onScroll);
	}, [showProjectHints, isSidebarCollapsed, measureHintPositions]);

	useEffect(() => {
		if (!isSidebarCollapsed) setShowProjectHints(false);
	}, [isSidebarCollapsed]);

	useEffect(() => {
		api
			.getProjects()
			.then((data) => setProjects(data))
			.catch((err) => console.error("Failed to load projects", err));
	}, []);

	const handleReorder = async (projectId: string, direction: "up" | "down") => {
		const currentIndex = projects.findIndex((p) => p.id === projectId);
		const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
		if (swapIndex < 0 || swapIndex >= projects.length) return;

		// Optimistic update: swap in local state
		const newProjects = [...projects];
		[newProjects[currentIndex], newProjects[swapIndex]] = [
			newProjects[swapIndex],
			newProjects[currentIndex],
		];
		setProjects(newProjects);

		// Persist to server
		try {
			const updated = await api.reorderProject(projectId, direction);
			if (!updated) {
				// Rollback
				const data = await api.getProjects();
				setProjects(data);
			}
		} catch {
			// Rollback on error
			api.getProjects().then(setProjects).catch(console.error);
		}
	};

	const handleQuitClick = async () => {
		const queueStatsPromise = api.run.queueStats().catch(() => null);
		const sessionStatsPromise = api.opencode
			.activeSessionStats()
			.catch(() => null);

		const [queueStats, sessionStats] = await Promise.all([
			queueStatsPromise,
			sessionStatsPromise,
		]);

		const hasQueuedRuns = (queueStats?.totalQueued ?? 0) > 0;
		const hasRunningRuns = (queueStats?.totalRunning ?? 0) > 0;
		const hasBusySessions = (sessionStats?.busySessions ?? 0) > 0;

		if (hasQueuedRuns || hasRunningRuns || hasBusySessions) {
			setQueuedRunCount(queueStats?.totalQueued ?? 0);
			setRunningRunCount(queueStats?.totalRunning ?? 0);
			setBusySessionCount(sessionStats?.busySessions ?? 0);
			setIsActiveSessionsModalOpen(true);
			return;
		}

		setIsQuitModalOpen(true);
	};

	const handleProjectsAreaEnter = () => {
		if (isSidebarCollapsed) setShowProjectHints(true);
	};

	const handleProjectsAreaLeave = () => {
		setShowProjectHints(false);
	};

	const isSettingsScreen = pathname.startsWith("/settings");

	return (
		<aside
			className={`fixed top-0 left-0 h-full bg-[#11151C] border-r border-slate-800/50 flex flex-col z-50 transition-all duration-300 overflow-x-hidden ${isSidebarCollapsed ? "w-16" : "w-64"}`}
		>
			<div
				className={cn(
					"flex items-center shrink-0 transition-all duration-300 ease-in-out border-b border-slate-800/50",
					isSidebarCollapsed
						? "flex-col justify-center gap-4 py-4"
						: "justify-between px-6 py-5",
				)}
			>
				<button
					type="button"
					onClick={() => router.push("/projects")}
					className={cn(
						"flex items-center cursor-pointer transition-all duration-200 hover:bg-slate-800/50 hover:text-slate-300 rounded-lg",
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
				</button>

				<button
					type="button"
					onClick={onToggleSidebar}
					className={cn(
						"p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all duration-200 cursor-pointer",
					)}
				>
					{isSidebarCollapsed ? (
						<ChevronRight className="w-4 h-4" />
					) : (
						<ChevronLeft className="w-4 h-4" />
					)}
				</button>
			</div>

			{projects.length > 0 && (
				<div
					ref={scrollContainerRef}
					className={cn(
						"flex-1 min-h-0 overflow-y-auto overflow-x-hidden border-t border-slate-800/50",
						isSidebarCollapsed ? "px-2 py-2" : "px-4 py-2",
					)}
					onMouseEnter={handleProjectsAreaEnter}
					onMouseLeave={handleProjectsAreaLeave}
				>
					{!isSidebarCollapsed && (
						<div className="mb-2 px-3">
							<span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
								Projects
							</span>
						</div>
					)}
					<div className="space-y-0.5">
						{projects.map((project, index) => {
							const isActive = activeProject?.id === project.id;
							return (
								<div
									key={project.id}
									ref={(el) => {
										if (el) projectItemRefs.current.set(project.id, el);
										else projectItemRefs.current.delete(project.id);
									}}
									role="button"
									tabIndex={0}
									onClick={() => {
										if (!isActive) {
											router.push(`/board/${project.id}`);
										}
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											if (!isActive) {
												router.push(`/board/${project.id}`);
											}
										}
									}}
									aria-label={project.name}
									className={cn(
										"flex items-center transition-all duration-200 w-full group cursor-pointer",
										isSidebarCollapsed
											? "justify-center w-12 h-10 mx-auto rounded-lg"
											: "gap-2.5 px-3 py-2 rounded-xl",
										isActive
											? isSidebarCollapsed
												? "cursor-default"
												: "bg-blue-600/10 text-blue-400 ring-1 ring-inset ring-blue-500/20"
											: isSidebarCollapsed
												? "text-slate-400"
												: "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
									)}
								>
									{isSidebarCollapsed ? (
										<div
											className={cn(
												"rounded-lg shrink-0 flex items-center justify-center font-semibold text-sm transition-all duration-200",
												isActive
													? "w-10 h-10"
													: "w-8 h-8 group-hover:scale-110",
											)}
											style={{
												backgroundColor: project.color || "#64748b",
												color: getContrastColor(project.color || "#64748b"),
											}}
										>
											{project.name.slice(0, 2).toUpperCase()}
										</div>
									) : (
										<div
											className="rounded-full shrink-0 w-3 h-3"
											style={{ backgroundColor: project.color || "#64748b" }}
										/>
									)}
									{!isSidebarCollapsed && (
										<span className="text-sm font-medium truncate text-left flex-1">
											{project.name}
										</span>
									)}
									{!isSidebarCollapsed && (
										<div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
											<button
												type="button"
												disabled={index === 0}
												onClick={(e) => {
													e.stopPropagation();
													handleReorder(project.id, "up");
												}}
												className="p-0.5 text-slate-500 hover:text-slate-300 disabled:opacity-20 disabled:cursor-default cursor-pointer transition-colors"
												title="Move up"
											>
												<ChevronUp className="w-3.5 h-3.5" />
											</button>
											<button
												type="button"
												disabled={index === projects.length - 1}
												onClick={(e) => {
													e.stopPropagation();
													handleReorder(project.id, "down");
												}}
												className="p-0.5 text-slate-500 hover:text-slate-300 disabled:opacity-20 disabled:cursor-default cursor-pointer transition-colors"
												title="Move down"
											>
												<ChevronDown className="w-3.5 h-3.5" />
											</button>
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}

			{showProjectHints &&
				isSidebarCollapsed &&
				projects.map((project) => {
					const top = hintPositions[project.id];
					if (top == null) return null;
					const isActive = activeProject?.id === project.id;
					return (
						<div
							key={project.id}
							className={cn(
								"fixed left-[4rem] z-40 pointer-events-none -translate-y-1/2 whitespace-nowrap max-w-[200px]",
								"before:content-[''] before:absolute before:-left-[9px] before:top-1/2 before:-translate-y-1/2 before:w-4 before:h-4 before:rotate-[45deg] before:bg-[#1E2433] before:border-l-2 before:border-b-2 before:border-slate-700/60 before:rounded-[2px]",
								isActive && "before:border-blue-500/30",
							)}
							style={{ top }}
						>
							<div
								className={cn(
									"bg-[#1E2433] text-slate-200 text-xs font-medium px-2.5 py-1.5 rounded-md shadow-lg shadow-black/40 border border-slate-700/60 truncate",
									isActive && "text-blue-400 border-blue-500/30",
								)}
							>
								{project.name}
							</div>
						</div>
					);
				})}

			<div
				className={`shrink-0 border-t border-slate-800/50 ${isSidebarCollapsed ? "p-2" : "p-4"}`}
			>
				<div className="flex flex-col gap-1">
					<button
						type="button"
						onClick={toggleSoundMute}
						className={cn(
							"w-full flex items-center rounded-xl transition-all duration-200 group cursor-pointer",
							isSidebarCollapsed
								? "justify-center w-12 h-12"
								: "gap-3 px-4 py-3 w-full",
							soundMuted
								? "text-slate-600 hover:bg-slate-800/50 hover:text-slate-400"
								: "text-slate-500 hover:bg-slate-800/50 hover:text-slate-300",
						)}
						title={soundMuted ? "Unmute sounds" : "Mute sounds"}
					>
						{soundMuted ? (
							<VolumeX
								className={cn(isSidebarCollapsed ? "w-6 h-6" : "w-5 h-5")}
							/>
						) : (
							<Volume2
								className={cn(isSidebarCollapsed ? "w-6 h-6" : "w-5 h-5")}
							/>
						)}
						{!isSidebarCollapsed && (
							<span className="font-medium">
								{soundMuted ? "Unmute" : "Mute"}
							</span>
						)}
					</button>

					<button
						type="button"
						onClick={() => {
							router.push("/settings");
						}}
						className={cn(
							"w-full flex items-center rounded-xl transition-all duration-200 group cursor-pointer",
							isSidebarCollapsed
								? "justify-center w-12 h-12"
								: "gap-3 px-4 py-3 w-full",
							isSettingsScreen
								? "bg-blue-600/10 text-blue-400 ring-1 ring-inset ring-blue-500/20"
								: "text-slate-500 hover:bg-slate-800/50 hover:text-slate-300",
						)}
						title="Settings"
					>
						<Settings
							className={cn(
								isSidebarCollapsed ? "w-6 h-6" : "w-5 h-5",
								isSettingsScreen
									? "text-blue-400"
									: "text-slate-500 group-hover:text-slate-300",
							)}
						/>
						{!isSidebarCollapsed && (
							<span className="font-medium">Settings</span>
						)}
					</button>

					<button
						type="button"
						onClick={handleQuitClick}
						className={cn(
							"w-full flex items-center rounded-xl transition-all duration-200 group text-slate-500 hover:bg-slate-800/50 hover:text-slate-300",
							isSidebarCollapsed
								? "justify-center w-12 h-12"
								: "gap-3 px-4 py-3 w-full",
						)}
						title="Quit"
					>
						<LogOut className="w-5 h-5" />
						{!isSidebarCollapsed && <span className="font-medium">Quit</span>}
					</button>
				</div>
			</div>

			<ConfirmationModal
				isOpen={isQuitModalOpen}
				onClose={() => setIsQuitModalOpen(false)}
				onConfirm={async () => {
					setIsQuitting(true);
					try {
						await api.app.shutdown();
					} catch {
						setIsQuitting(false);
					}
				}}
				title="Quit application"
				description="Are you sure you want to quit? OpenCode and the application will be stopped."
				confirmLabel="Quit"
				variant="warning"
				isLoading={isQuitting}
			/>

			<ConfirmationModal
				isOpen={isActiveSessionsModalOpen}
				onClose={() => {
					setIsActiveSessionsModalOpen(false);
					setBusySessionCount(0);
					setQueuedRunCount(0);
					setRunningRunCount(0);
				}}
				onConfirm={async () => {
					setIsQuitting(true);
					try {
						await api.app.shutdown({ force: true });
					} catch {
						setIsQuitting(false);
					}
				}}
				title="Active work in progress"
				description="There are active tasks or sessions running. Quitting will interrupt them."
				confirmLabel="Quit anyway"
				variant="danger"
				isLoading={isQuitting}
			>
				{(runningRunCount > 0 ||
					queuedRunCount > 0 ||
					busySessionCount > 0) && (
					<div className="mt-3 flex gap-2">
						{runningRunCount > 0 && (
							<div className="flex-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center">
								<div className="text-lg font-bold text-red-400 font-mono">
									{runningRunCount}
								</div>
								<div className="text-[10px] text-red-400/70 uppercase tracking-wider font-semibold">
									Running
								</div>
							</div>
						)}
						{queuedRunCount > 0 && (
							<div className="flex-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center">
								<div className="text-lg font-bold text-amber-400 font-mono">
									{queuedRunCount}
								</div>
								<div className="text-[10px] text-amber-400/70 uppercase tracking-wider font-semibold">
									Queued
								</div>
							</div>
						)}
						{busySessionCount > 0 && (
							<div className="flex-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-center">
								<div className="text-lg font-bold text-blue-400 font-mono">
									{busySessionCount}
								</div>
								<div className="text-[10px] text-blue-400/70 uppercase tracking-wider font-semibold">
									Sessions
								</div>
							</div>
						)}
					</div>
				)}
			</ConfirmationModal>
		</aside>
	);
}
