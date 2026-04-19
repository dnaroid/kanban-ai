import type { Run } from "@/types/ipc";
import type { PollableBoardContext } from "@/server/types";

interface RunReconcilerConfig {
	getPollableBoardContext: (projectId: string) => PollableBoardContext | null;
	listActiveRunsForReconciliation: () => Run[];
	listRecoverableRunsForProject: (taskIds: Set<string>) => Run[];
	reconcileTaskStatuses: (
		projectId: string,
		board: PollableBoardContext["board"],
		tasks: PollableBoardContext["tasks"],
	) => Promise<void>;
	reconcileRun: (runId: string) => Promise<void>;
}

export class RunReconciler {
	private readonly reconciling = new Set<string>();
	private readonly reconcilingProjects = new Set<string>();
	private readonly config: RunReconcilerConfig;

	public constructor(config: RunReconcilerConfig) {
		this.config = config;
	}

	public async pollProjectRuns(projectId: string): Promise<void> {
		if (this.reconcilingProjects.has(projectId)) {
			return;
		}

		this.reconcilingProjects.add(projectId);
		try {
			const scopedBoard = this.config.getPollableBoardContext(projectId);
			if (!scopedBoard) {
				return;
			}

			const activeRuns = this.config
				.listActiveRunsForReconciliation()
				.filter((run) => scopedBoard.taskIds.has(run.taskId));
			const recoverableRuns = this.config.listRecoverableRunsForProject(
				scopedBoard.allTaskIds,
			);

			await this.reconcileRuns(activeRuns);
			await this.reconcileRuns(recoverableRuns);
			await this.config.reconcileTaskStatuses(
				projectId,
				scopedBoard.board,
				scopedBoard.tasks,
			);
		} finally {
			this.reconcilingProjects.delete(projectId);
		}
	}

	private async reconcileRuns(runs: Run[]): Promise<void> {
		for (const run of runs) {
			if (this.reconciling.has(run.id)) {
				continue;
			}

			this.reconciling.add(run.id);
			try {
				await this.config.reconcileRun(run.id);
			} finally {
				this.reconciling.delete(run.id);
			}
		}
	}
}
