"use client";

import { WorkflowColumnsEditor } from "@/components/settings/WorkflowColumnsEditor";
import { useWorkflowSettings } from "@/components/settings/WorkflowSettingsContext";

export default function WorkflowColumnsPage() {
	const { draftConfig, handleColumnsChange } = useWorkflowSettings();

	if (!draftConfig) return null;

	return (
		<WorkflowColumnsEditor
			columns={draftConfig.columns}
			statuses={draftConfig.statuses}
			onChange={handleColumnsChange}
		/>
	);
}
