"use client";

import { WorkflowStatusesEditor } from "@/components/settings/WorkflowStatusesEditor";
import { useWorkflowSettings } from "@/components/settings/WorkflowSettingsContext";

export default function WorkflowStatusesPage() {
	const { draftConfig, updateDraft } = useWorkflowSettings();

	if (!draftConfig) return null;

	return (
		<WorkflowStatusesEditor
			statuses={draftConfig.statuses}
			columns={draftConfig.columns}
			onChange={(stats) => updateDraft({ statuses: stats })}
		/>
	);
}
