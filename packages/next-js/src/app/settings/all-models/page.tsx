"use client";

import { ModelsManagement } from "@/components/settings/ModelsManagement";
import { useSettingsStatus } from "../layout";

export default function AllModelsPage() {
	const { setStatus } = useSettingsStatus();

	return (
		<div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">
			<ModelsManagement activeSubTab="all" onStatusChangeAction={setStatus} />
		</div>
	);
}
