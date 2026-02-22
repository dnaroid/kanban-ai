"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BoardScreen } from "@/components/BoardScreen";
import { api } from "@/lib/api-client";
import type { Project } from "@/server/types";

export default function BoardPage() {
	const params = useParams();
	const router = useRouter();
	const projectId = params.projectId as string;
	const [project, setProject] = useState<Project | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		async function loadProject() {
			try {
				const projectData = await api.getProject(projectId);
				if (!projectData) {
					router.push("/projects");
					return;
				}
				setProject(projectData);
			} catch (error) {
				console.error("Failed to load project:", error);
				router.push("/projects");
			} finally {
				setLoading(false);
			}
		}

		loadProject();
	}, [projectId, router]);

	if (loading) {
		return (
			<div className="h-full flex items-center justify-center">
				<div className="text-slate-400">Loading...</div>
			</div>
		);
	}

	if (!project) {
		return (
			<div className="h-full flex items-center justify-center">
				<div className="text-red-400">Project not found</div>
			</div>
		);
	}

	return (
		<BoardScreen projectId={projectId} projectName={project.name} />
	);
}
