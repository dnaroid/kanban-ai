"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DangerZoneSettings } from "@/components/settings/DangerZoneSettings";
import { api } from "@/lib/api-client";
import { useSettingsStatus } from "../layout";

export default function DangerPage() {
	const router = useRouter();
	const { setStatus } = useSettingsStatus();
	const [projects, setProjects] = useState<Array<{ id: string; name: string }>>(
		[],
	);

	useEffect(() => {
		api.project
			.getAll()
			.then((list) =>
				setProjects(list.map((p) => ({ id: p.id, name: p.name }))),
			)
			.catch(console.error);
	}, []);

	return (
		<div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">
			<DangerZoneSettings
				projects={projects}
				onStatusChange={setStatus}
				onProjectDeleted={() => {
					void api.project
						.getAll()
						.then((list) =>
							setProjects(list.map((p) => ({ id: p.id, name: p.name }))),
						)
						.catch(console.error);
					router.push("/projects");
				}}
			/>
		</div>
	);
}
