import { publishSseEvent } from "@/server/events/sse-broker";
import type { Run } from "@/types/ipc";

export function publishRunUpdate(run: Run): void {
	publishSseEvent("run:event", {
		runId: run.id,
		id: run.id,
		taskId: run.taskId,
		sessionId: run.sessionId,
		roleId: run.roleId,
		mode: run.mode,
		status: run.status,
		startedAt: run.startedAt,
		endedAt: run.endedAt,
		createdAt: run.createdAt,
		updatedAt: run.updatedAt,
		metadata: run.metadata,
	});
}
