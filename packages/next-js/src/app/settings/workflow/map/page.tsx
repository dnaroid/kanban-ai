"use client";

import { WorkflowMermaid } from "@/components/settings/WorkflowMermaid";
import { useWorkflowSettings } from "@/components/settings/WorkflowSettingsContext";

export default function WorkflowMapPage() {
	const { draftConfig } = useWorkflowSettings();

	if (!draftConfig) return null;

	return <WorkflowMermaid config={draftConfig} />;
}
