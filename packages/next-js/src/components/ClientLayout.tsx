"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { ApiErrorProvider } from "@/components/common/toast/ApiErrorProvider";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { ToastProvider } from "@/components/common/toast/ToastContext";
import { ToastContainer } from "@/components/common/toast/ToastContainer";
import { useRunSoundNotifications } from "@/lib/use-run-sound-notifications";
import {
	ServerStatusProvider,
	useServerStatus,
} from "@/components/common/ServerStatusContext";
import { ServerStatusOverlay } from "@/components/common/ServerStatusOverlay";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";
export const LAST_PROJECT_ID_KEY = "last-project-id";

function ServerStatusBridge() {
	const { reportNetworkError } = useServerStatus();

	useEffect(() => {
		api.onNetworkError = reportNetworkError;

		return () => {
			if (api.onNetworkError === reportNetworkError) {
				api.onNetworkError = undefined;
			}
		};
	}, [reportNetworkError]);

	return null;
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
	const [isHydrated, setIsHydrated] = useState(false);

	useRunSoundNotifications();

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
		color?: string;
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
						setActiveProject({
							id: project.id,
							name: project.name,
							color: project.color,
						});
						localStorage.setItem(LAST_PROJECT_ID_KEY, project.id);
					}
				} catch (error) {
					console.error("Failed to load active project:", error);
				}
			} else if (pathname === "/projects") {
				// Clear active project when on projects list
				setActiveProject(null);
			} else {
				setActiveProject(null);
			}
		};

		loadActiveProject();
	}, [pathname]);

	const handleProjectSelect = (id: string, name: string, color?: string) => {
		setActiveProject({ id, name, color });
		localStorage.setItem(LAST_PROJECT_ID_KEY, id);
		router.push(`/board/${id}`);
	};

	return (
		<ServerStatusProvider>
			<ServerStatusBridge />
			<ServerStatusOverlay />
			<ToastProvider>
				<ApiErrorProvider>
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
					<ToastContainer />
				</ApiErrorProvider>
			</ToastProvider>
		</ServerStatusProvider>
	);
}
