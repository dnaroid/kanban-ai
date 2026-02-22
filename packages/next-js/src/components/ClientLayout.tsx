"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export function ClientLayout({ children }: { children: React.ReactNode }) {
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
	const [isHydrated, setIsHydrated] = useState(false);

	// Load from localStorage after hydration to avoid SSR mismatch
	useEffect(() => {
		const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
		if (stored !== null) {
			setIsSidebarCollapsed(stored === "true");
		}
		setIsHydrated(true);
	}, []);

	// Save to localStorage when changed (only after initial hydration)
	useEffect(() => {
		if (isHydrated) {
			localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
		}
	}, [isSidebarCollapsed, isHydrated]);
	const [activeProject, setActiveProject] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const router = useRouter();
	const pathname = usePathname();

	// Load active project on mount and when pathname changes
	useEffect(() => {
		const loadActiveProject = async () => {
			// Check if we're on a board page
			const boardMatch = pathname.match(/^\/board\/([^/]+)/);
			if (boardMatch) {
				const projectId = boardMatch[1];
				try {
					const project = await api.getProject(projectId);
					if (project) {
						setActiveProject({ id: project.id, name: project.name });
					}
				} catch (error) {
					console.error("Failed to load active project:", error);
				}
			} else if (pathname === "/projects") {
				// Clear active project when on projects list
				setActiveProject(null);
			} else {
				// Try to load last project from settings
				try {
					const lastProjectId = await api.getLastProjectId();
					if (lastProjectId) {
						const project = await api.getProject(lastProjectId);
						if (project) {
							setActiveProject({ id: project.id, name: project.name });
						}
					}
				} catch (error) {
					console.error("Failed to load last project:", error);
				}
			}
		};

		loadActiveProject();
	}, [pathname]);

	const handleProjectSelect = (id: string, name: string) => {
		setActiveProject({ id, name });
		router.push(`/board/${id}`);
	};

	return (
		<div className="min-h-screen bg-[#0B0E14] text-slate-200">
			<Sidebar
				isSidebarCollapsed={isSidebarCollapsed}
				onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
				activeProject={activeProject}
				onProjectSelect={handleProjectSelect}
			/>
			<main
				className={cn(
					"transition-all duration-300 min-h-screen overflow-x-hidden",
					isSidebarCollapsed ? "pl-16" : "pl-64",
				)}
			>
				{pathname.startsWith("/board/") ? (
					<div className="h-screen flex flex-col">{children}</div>
				) : (
					<div className="min-h-screen flex flex-col">{children}</div>
				)}
			</main>
		</div>
	);
}
