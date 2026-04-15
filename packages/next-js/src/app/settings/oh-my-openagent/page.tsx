"use client";

import { ModelsManagement } from "@/components/settings/ModelsManagement";
import { useSettingsStatus } from "@/components/settings/SettingsStatusContext";

export default function OhMyOpenagentPage() {
	const { setStatus } = useSettingsStatus();

	return (
		<div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">
			<ModelsManagement
				activeSubTab="oh-my-openagent"
				onStatusChangeAction={setStatus}
			/>
		</div>
	);
}
