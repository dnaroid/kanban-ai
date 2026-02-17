"use client";

import { ModelsManagement } from "@/components/settings/ModelsManagement";
import { useSettingsStatus } from "../layout";

export default function MyModelsPage() {
	const { setStatus } = useSettingsStatus();

	return (
		<div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">
			<ModelsManagement activeSubTab="my" onStatusChangeAction={setStatus} />
		</div>
	);
}
