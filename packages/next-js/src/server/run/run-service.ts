import { publishSseEvent } from "@/server/events/sse-broker";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";
import { contextSnapshotRepo } from "@/server/repositories/context-snapshot";
import { projectRepo } from "@/server/repositories/project";
import { roleRepo } from "@/server/repositories/role";
import { runEventRepo } from "@/server/repositories/run-event";
import { runRepo } from "@/server/repositories/run";
import { taskRepo } from "@/server/repositories/task";
import type { Run, RunStatus } from "@/types/ipc";

export interface StartRunInput {
	taskId: string;
	roleId?: string;
	mode?: string;
}

function buildTaskPrompt(
	task: { title: string; description: string | null },
	projectPath: string,
): string {
	return [
		`You are executing a task in project: ${projectPath}`,
		"",
		`Task title: ${task.title}`,
		"",
		"Task description:",
		task.description ?? "(empty)",
	].join("\n");
}

function isRunStatus(value: string): value is RunStatus {
	return (
		value === "queued" ||
		value === "running" ||
		value === "completed" ||
		value === "failed" ||
		value === "cancelled" ||
		value === "timeout" ||
		value === "paused"
	);
}

function extractRunStatusFromText(text: string): RunStatus | null {
	const normalized = text.toLowerCase();
	if (
		normalized.includes("status: completed") ||
		normalized.includes("status: done") ||
		normalized.includes("status: success")
	) {
		return "completed";
	}
	if (
		normalized.includes("status: failed") ||
		normalized.includes("status: error")
	) {
		return "failed";
	}
	if (normalized.includes("status: timeout")) {
		return "timeout";
	}
	if (
		normalized.includes("status: paused") ||
		normalized.includes("status: question")
	) {
		return "paused";
	}
	return null;
}

export class RunService {
	private readonly queue: string[] = [];
	private readonly running = new Set<string>();
	private readonly opencodeService = getOpencodeService();
	private readonly sessionManager = getOpencodeSessionManager();
	private readonly sessionSubscribers = new Map<string, string>();
	private draining = false;
	private readonly concurrency = 1;

	public async start(input: StartRunInput): Promise<{ runId: string }> {
		const task = taskRepo.getById(input.taskId);
		if (!task) {
			throw new Error(`Task not found: ${input.taskId}`);
		}

		const selectedRoleId = input.roleId ?? roleRepo.list()[0]?.id;
		if (!selectedRoleId) {
			throw new Error("No agent roles configured");
		}

		const snapshotId = contextSnapshotRepo.create({
			taskId: task.id,
			kind: "run-start",
			summary: `Run started for ${task.title}`,
			payload: {
				taskId: task.id,
				title: task.title,
				description: task.description,
				mode: input.mode ?? "execute",
				roleId: selectedRoleId,
			},
		});

		const run = runRepo.create({
			taskId: task.id,
			roleId: selectedRoleId,
			mode: input.mode ?? "execute",
			contextSnapshotId: snapshotId,
		});

		runEventRepo.create({
			runId: run.id,
			eventType: "status",
			payload: { status: run.status, message: "Run queued" },
		});
		this.publishRunUpdate(run);

		this.enqueue(run.id);
		return { runId: run.id };
	}

	public listByTask(taskId: string): Run[] {
		return runRepo.listByTask(taskId);
	}

	public get(runId: string): Run | null {
		return runRepo.getById(runId);
	}

	public async cancel(runId: string): Promise<void> {
		this.removeFromQueue(runId);

		const run = runRepo.getById(runId);
		if (!run) {
			return;
		}

		if (run.sessionId) {
			try {
				await this.sessionManager.abortSession(run.sessionId);
			} catch (error) {
				console.warn("Failed to abort OpenCode session during cancel", error);
			}
		}

		const now = new Date().toISOString();
		const cancelled = runRepo.update(runId, {
			status: "cancelled",
			finishedAt: now,
			errorText: "",
		});

		runEventRepo.create({
			runId,
			eventType: "status",
			payload: { status: "cancelled", message: "Run cancelled" },
		});
		this.publishRunUpdate(cancelled);

		await this.unsubscribeRunSession(runId);
	}

	public async delete(runId: string): Promise<void> {
		await this.cancel(runId);
		runRepo.delete(runId);
	}

	private enqueue(runId: string): void {
		if (this.queue.includes(runId) || this.running.has(runId)) {
			return;
		}

		this.queue.push(runId);
		this.scheduleDrain();
	}

	private scheduleDrain(): void {
		if (this.draining) {
			return;
		}

		this.draining = true;
		queueMicrotask(() => {
			void this.drainQueue();
		});
	}

	private async drainQueue(): Promise<void> {
		this.draining = false;

		while (this.running.size < this.concurrency) {
			const runId = this.queue.shift();
			if (!runId) {
				return;
			}

			this.running.add(runId);
			void this.executeRun(runId).finally(() => {
				this.running.delete(runId);
				this.scheduleDrain();
			});
		}
	}

	private async executeRun(runId: string): Promise<void> {
		const current = runRepo.getById(runId);
		if (!current || current.status !== "queued") {
			return;
		}

		const startedAt = new Date().toISOString();
		let runningRun = runRepo.update(runId, {
			status: "running",
			startedAt,
			errorText: "",
		});

		runEventRepo.create({
			runId,
			eventType: "status",
			payload: { status: "running", message: "Run started" },
		});
		this.publishRunUpdate(runningRun);

		try {
			const task = taskRepo.getById(runningRun.taskId);
			if (!task) {
				throw new Error(`Task not found: ${runningRun.taskId}`);
			}

			const project = projectRepo.getById(task.projectId);
			if (!project) {
				throw new Error(`Project not found for task: ${task.id}`);
			}

			await this.opencodeService.start();

			const sessionTitle = task.title.slice(0, 120);
			const sessionId = await this.sessionManager.createSession(
				sessionTitle,
				project.path,
			);

			runningRun = runRepo.update(runId, { sessionId });
			runEventRepo.create({
				runId,
				eventType: "status",
				payload: {
					status: "running",
					message: "OpenCode session created",
					sessionId,
				},
			});
			this.publishRunUpdate(runningRun);

			await this.sessionManager.sendPrompt(
				sessionId,
				buildTaskPrompt(task, project.path),
			);

			runEventRepo.create({
				runId,
				eventType: "status",
				payload: {
					status: "running",
					message: "Prompt sent to OpenCode",
				},
			});

			await this.subscribeRunSession(runId, sessionId);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Run execution failed";
			const finishedAt = new Date().toISOString();
			const failedRun = runRepo.update(runId, {
				status: "failed",
				finishedAt,
				errorText: message,
				durationSec: this.durationSec(startedAt, finishedAt),
			});

			runEventRepo.create({
				runId,
				eventType: "status",
				payload: {
					status: "failed",
					message,
				},
			});
			this.publishRunUpdate(failedRun);
		}
	}

	private async subscribeRunSession(
		runId: string,
		sessionId: string,
	): Promise<void> {
		const subscriberId = `run:${runId}`;
		if (this.sessionSubscribers.has(runId)) {
			return;
		}

		await this.sessionManager.subscribe(sessionId, subscriberId, (event) => {
			if (event.type !== "message.updated") {
				return;
			}

			if (event.message.role !== "assistant") {
				return;
			}

			const nextStatus = extractRunStatusFromText(event.message.content);
			if (!nextStatus || !isRunStatus(nextStatus)) {
				return;
			}

			void this.finalizeRunFromSession(runId, nextStatus);
		});

		this.sessionSubscribers.set(runId, sessionId);
	}

	private async finalizeRunFromSession(
		runId: string,
		status: RunStatus,
	): Promise<void> {
		const run = runRepo.getById(runId);
		if (!run || run.status === status) {
			return;
		}

		if (run.status !== "running" && run.status !== "queued") {
			return;
		}

		const finishedAt = new Date().toISOString();
		const nextRun = runRepo.update(runId, {
			status,
			finishedAt,
			errorText: status === "failed" ? "Run failed" : "",
			durationSec: this.durationSec(run.startedAt ?? finishedAt, finishedAt),
		});

		runEventRepo.create({
			runId,
			eventType: "status",
			payload: { status, message: `Run ${status}` },
		});
		this.publishRunUpdate(nextRun);

		await this.unsubscribeRunSession(runId);
	}

	private async unsubscribeRunSession(runId: string): Promise<void> {
		const sessionId = this.sessionSubscribers.get(runId);
		if (!sessionId) {
			return;
		}

		this.sessionSubscribers.delete(runId);
		await this.sessionManager.unsubscribe(sessionId, `run:${runId}`);
	}

	private removeFromQueue(runId: string): void {
		const index = this.queue.indexOf(runId);
		if (index >= 0) {
			this.queue.splice(index, 1);
		}
	}

	private publishRunUpdate(run: Run): void {
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

	private durationSec(startedAt: string, finishedAt: string): number {
		const startMs = Date.parse(startedAt);
		const endMs = Date.parse(finishedAt);
		if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
			return 0;
		}
		return Math.max(0, Math.round((endMs - startMs) / 1000));
	}
}

export const runService = new RunService();
