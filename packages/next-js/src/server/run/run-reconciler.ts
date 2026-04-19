import type { TaskStatusProjectionService } from "@/server/run/task-status-projection-service";
import type { Run } from "@/types/ipc";

interface RunReconcilerConfig {
	taskStatusProjectionService: TaskStatusProjectionService;
	runReconciliationService: {
		listActiveRunsForReconciliation: () => Run[];
		reconcileRun: (runId: string) => Promise<void>;
	};
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
			const scopedBoard =
				this.config.taskStatusProjectionService.getPollableBoardContext(
					projectId,
				);
			if (!scopedBoard) {
				return;
			}

			const activeRuns = this.config.runReconciliationService
				.listActiveRunsForReconciliation()
				.filter((run) => scopedBoard.taskIds.has(run.taskId));
			const recoverableRuns =
				this.config.taskStatusProjectionService.listRecoverableRunsForProject(
					scopedBoard.allTaskIds,
				);

			await this.reconcileRuns(activeRuns);
			await this.reconcileRuns(recoverableRuns);
			await this.config.taskStatusProjectionService.reconcileTaskStatuses(
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
				await this.config.runReconciliationService.reconcileRun(run.id);
			} finally {
				this.reconciling.delete(run.id);
			}
		}
	}
}
