import { useEffect, useState } from "react";

import { api } from "@/lib/api-client";
import type { WorkflowConfig } from "@/lib/api-client";

let cachedWorkflowConfig: WorkflowConfig | null = null;
let inflightWorkflowConfigRequest: Promise<WorkflowConfig> | null = null;

async function fetchWorkflowConfig(): Promise<WorkflowConfig> {
	if (cachedWorkflowConfig) {
		return cachedWorkflowConfig;
	}

	if (!inflightWorkflowConfigRequest) {
		inflightWorkflowConfigRequest = api.workflow
			.getConfig()
			.then((config) => {
				cachedWorkflowConfig = config;
				return config;
			})
			.finally(() => {
				inflightWorkflowConfigRequest = null;
			});
	}

	return inflightWorkflowConfigRequest;
}

export function useWorkflowDisplayConfig(): WorkflowConfig | null {
	const [config, setConfig] = useState<WorkflowConfig | null>(
		cachedWorkflowConfig,
	);

	useEffect(() => {
		if (cachedWorkflowConfig) {
			return;
		}

		let isMounted = true;
		void fetchWorkflowConfig()
			.then((nextConfig) => {
				if (isMounted) {
					setConfig(nextConfig);
				}
			})
			.catch(() => {
				if (isMounted) {
					setConfig(null);
				}
			});

		return () => {
			isMounted = false;
		};
	}, []);

	return config;
}

export function resetWorkflowDisplayConfigCacheForTests(): void {
	cachedWorkflowConfig = null;
	inflightWorkflowConfigRequest = null;
}
