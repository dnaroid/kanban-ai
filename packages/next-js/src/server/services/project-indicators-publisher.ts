import * as sseBroker from "@/server/events/sse-broker";
import { taskRepo } from "@/server/repositories";
import { projectUpdatesService } from "@/server/services/project-updates-service";

let cachedAttentionProjectIds = new Set<string>();
let cachedUpdatedProjectIds = new Set<string>();

function setsEqual(a: Set<string>, b: Set<string>): boolean {
	if (a.size !== b.size) {
		return false;
	}

	for (const item of a) {
		if (!b.has(item)) {
			return false;
		}
	}

	return true;
}

function publishIndicatorsIfChanged(): void {
	const currentAttentionProjectIds = new Set(
		taskRepo.getProjectIdsWithAttentionStatuses().map((row) => row.projectId),
	);
	const currentUpdatedProjectIds = new Set(
		projectUpdatesService.getUpdatedProjectIds(),
	);

	const attentionUnchanged = setsEqual(
		currentAttentionProjectIds,
		cachedAttentionProjectIds,
	);
	const updatesUnchanged = setsEqual(
		currentUpdatedProjectIds,
		cachedUpdatedProjectIds,
	);

	if (attentionUnchanged && updatesUnchanged) {
		return;
	}

	cachedAttentionProjectIds = currentAttentionProjectIds;
	cachedUpdatedProjectIds = currentUpdatedProjectIds;

	tryPublishSseEvent("project:indicators", {
		attentionProjectIds: [...currentAttentionProjectIds],
		updatedProjectIds: [...currentUpdatedProjectIds],
	});
}

const subscribeSse = tryGetSubscribeSse();
if (subscribeSse) {
	subscribeSse("project-indicators-publisher", (channel) => {
		if (channel === "task:event" || channel === "project:event") {
			publishIndicatorsIfChanged();
		}
	});
}

export function refreshIndicators(): void {
	publishIndicatorsIfChanged();
}

export function getCurrentIndicators(): {
	attentionProjectIds: string[];
	updatedProjectIds: string[];
} {
	return {
		attentionProjectIds: [...cachedAttentionProjectIds],
		updatedProjectIds: [...cachedUpdatedProjectIds],
	};
}

function tryGetSubscribeSse():
	| ((
			listenerId: string,
			listener: (channel: string, payload: unknown) => void,
	  ) => () => void)
	| null {
	try {
		return (
			(
				sseBroker as unknown as {
					subscribeSse?: (
						listenerId: string,
						listener: (channel: string, payload: unknown) => void,
					) => () => void;
				}
			).subscribeSse ?? null
		);
	} catch {
		return null;
	}
}

function tryPublishSseEvent(channel: string, payload: unknown): void {
	try {
		(
			sseBroker as unknown as {
				publishSseEvent?: (eventChannel: string, eventPayload: unknown) => void;
			}
		).publishSseEvent?.(channel, payload);
	} catch {
		return;
	}
}
