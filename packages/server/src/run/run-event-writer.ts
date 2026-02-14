import { runEventRepo } from "../db/run-event-repository.js";
import { publishEvent } from "../events/eventBus.js";
import type { RunStatus } from "../db/run-types";

export class RunEventWriter {
	emitStatus(
		runId: string,
		status: RunStatus,
		payload: Record<string, unknown> = {},
	): void {
		runEventRepo.create({
			runId,
			eventType: "status",
			payload: {
				status,
				...payload,
			},
		});

		// Publish to EventBus for SSE (for local-web)
		publishEvent("run:status", {
			runId,
			status,
			...payload,
		});
	}
}
