"use client";
import { ProjectsScreen } from "@/components/ProjectsScreen";
import { useRouter } from "next/navigation";

export default function ProjectsPage() {
	const router = useRouter();
	return (
		<ProjectsScreen
			onProjectSelect={(id, name) => {
				router.push(`/board/${id}`);
			}}
		/>
	);
}
