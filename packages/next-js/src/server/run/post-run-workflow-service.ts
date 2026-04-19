import { createLogger } from "@/lib/logger";
import { getWorkflowColumnIdBySystemKey } from "@/server/run/task-state-machine";
import type { Board, Task } from "@/server/types";
import type { Run, RunVcsMetadata } from "@/types/ipc";
import type { TaskPriority } from "@/types/kanban";

const log = createLogger("runs-queue");

const runPriorityScore: Record<TaskPriority, number> = {
	postpone: 1,
	low: 2,
	normal: 3,
	urgent: 4,
};

interface PostRunWorkflowServiceDeps {
	mergeRunWorkspace: (
		run: Run,
		mode: "automatic" | "manual",
	) => Promise<RunVcsMetadata>;
	cleanupRunWorkspace: (vcsMetadata: RunVcsMetadata) => Promise<RunVcsMetadata>;
	syncVcsMetadata: (vcsMetadata: RunVcsMetadata) => Promise<RunVcsMetadata>;
	syncRunWorkspace: (run: Run) => Promise<RunVcsMetadata | null>;
	updateRun: (runId: string, patch: Partial<Run>) => Run;
	createRunStatusEvent: (
		runId: string,
		payload: Record<string, unknown>,
	) => void;
	getTaskById: (taskId: string) => Task | null;
	getBoardById: (boardId: string) => Board | null;
	listTasksByBoard: (boardId: string) => Task[];
	listRunsByTask: (taskId: string) => Run[];
	isGenerationRun: (run: Run) => boolean;
	areDependenciesResolved: (taskId: string) => boolean;
	resumeRejectedTaskRun: (task: Task) => Promise<boolean>;
	enqueueExecutionForNextTask: (taskId: string) => Promise<void>;
}

export class PostRunWorkflowService {
	private readonly deps: PostRunWorkflowServiceDeps;

	public constructor(deps: PostRunWorkflowServiceDeps) {
		this.deps = deps;
	}

	public async tryAutomaticMerge(run: Run): Promise<Run> {
		const currentVcs = run.metadata?.vcs;
		if (!currentVcs || currentVcs.mergeStatus === "merged") {
			return run;
		}

		try {
			const mergedVcs = await this.deps.mergeRunWorkspace(run, "automatic");
			const vcsMetadata = await this.cleanupMergedWorkspace(mergedVcs);
			const updatedRun = this.deps.updateRun(run.id, {
				metadata: {
					...(run.metadata ?? {}),
					vcs: vcsMetadata,
				},
			} as Partial<Run>);
			const cleanupMessage =
				vcsMetadata.cleanupStatus === "cleaned"
					? " and cleaned the worktree"
					: vcsMetadata.lastCleanupError
						? `, but cleanup is pending: ${vcsMetadata.lastCleanupError}`
						: "";
			this.deps.createRunStatusEvent(run.id, {
				status: updatedRun.status,
				message: `Automatically merged ${vcsMetadata.branchName} into ${vcsMetadata.baseBranch}${cleanupMessage}`,
				autoMerged: true,
				mergedCommit: vcsMetadata.mergedCommit,
				cleanupStatus: vcsMetadata.cleanupStatus,
			});
			return updatedRun;
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Automatic merge could not be completed";
			const refreshedVcs = await this.deps.syncRunWorkspace(run);
			const updatedRun = this.deps.updateRun(run.id, {
				metadata: {
					...(run.metadata ?? {}),
					vcs: {
						...(refreshedVcs ?? currentVcs),
						lastMergeError: message,
					},
				},
			} as Partial<Run>);
			this.deps.createRunStatusEvent(run.id, {
				status: updatedRun.status,
				message: `Automatic merge deferred: ${message}`,
				autoMerged: false,
			});
			return updatedRun;
		}
	}

	public async cleanupMergedWorkspace(
		vcsMetadata: RunVcsMetadata,
	): Promise<RunVcsMetadata> {
		try {
			return await this.deps.cleanupRunWorkspace(vcsMetadata);
		} catch (error) {
			const syncedVcs = await this.deps
				.syncVcsMetadata(vcsMetadata)
				.catch(() => vcsMetadata);
			const message =
				error instanceof Error
					? error.message
					: "Merged successfully, but worktree cleanup failed";
			return {
				...syncedVcs,
				cleanupStatus: "failed",
				lastCleanupError: message,
			};
		}
	}

	public pickNextReadyTask(boardId: string): Task | null {
		const board = this.deps.getBoardById(boardId);
		if (!board) {
			log.warn("pickNextReadyTask: board not found", { boardId });
			return null;
		}

		const readyColumnId = getWorkflowColumnIdBySystemKey(board, "ready");
		if (!readyColumnId) {
			log.warn("pickNextReadyTask: ready column not found on board", {
				boardId,
			});
			return null;
		}

		const allTasks = this.deps.listTasksByBoard(boardId);
		const readyTasks = allTasks.filter(
			(task) =>
				task.columnId === readyColumnId &&
				task.priority !== "postpone" &&
				(task.status === "pending" || task.status === "rejected"),
		);

		if (readyTasks.length === 0) {
			log.info("pickNextReadyTask: no ready tasks found", { boardId });
			return null;
		}

		readyTasks.sort((a, b) => {
			const scoreA =
				runPriorityScore[a.priority as TaskPriority] ?? runPriorityScore.normal;
			const scoreB =
				runPriorityScore[b.priority as TaskPriority] ?? runPriorityScore.normal;
			if (scoreA !== scoreB) return scoreB - scoreA;
			return a.orderInColumn - b.orderInColumn;
		});

		for (const task of readyTasks) {
			if (this.deps.areDependenciesResolved(task.id)) {
				return task;
			}
			log.info(
				"pickNextReadyTask: skipping task with unresolved dependencies",
				{
					taskId: task.id,
					taskTitle: task.title,
				},
			);
		}

		log.info(
			"pickNextReadyTask: all ready tasks have unresolved dependencies",
			{
				boardId,
			},
		);
		return null;
	}

	public async startNextReadyTaskAfterMerge(
		mergedTaskId: string,
	): Promise<void> {
		try {
			const mergedTask = this.deps.getTaskById(mergedTaskId);
			if (!mergedTask) {
				log.warn("startNextReadyTaskAfterMerge: merged task not found", {
					mergedTaskId,
				});
				return;
			}

			const nextTask = this.pickNextReadyTask(mergedTask.boardId);
			if (!nextTask) {
				log.info(
					"startNextReadyTaskAfterMerge: no suitable next task in Ready",
					{
						boardId: mergedTask.boardId,
						mergedTaskId,
					},
				);
				return;
			}

			const activeRun = this.deps
				.listRunsByTask(nextTask.id)
				.find(
					(run) =>
						!this.deps.isGenerationRun(run) &&
						(run.status === "queued" ||
							run.status === "running" ||
							run.status === "paused"),
				);
			if (activeRun) {
				log.info(
					"startNextReadyTaskAfterMerge: next task already has active run",
					{
						taskId: nextTask.id,
						runId: activeRun.id,
						status: activeRun.status,
					},
				);
				return;
			}

			log.info("startNextReadyTaskAfterMerge: starting next task from Ready", {
				mergedTaskId,
				nextTaskId: nextTask.id,
				nextTaskTitle: nextTask.title,
				boardId: mergedTask.boardId,
			});

			if (await this.deps.resumeRejectedTaskRun(nextTask)) {
				return;
			}

			await this.deps.enqueueExecutionForNextTask(nextTask.id);
		} catch (error) {
			log.error("startNextReadyTaskAfterMerge: failed", {
				mergedTaskId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
