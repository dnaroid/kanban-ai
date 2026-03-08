import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Run } from "@/types/ipc";

const {
	mockQueueManager,
	mockTaskRepo,
	mockRunRepo,
	mockRoleRepo,
	mockProjectRepo,
	mockContextSnapshotRepo,
	mockRunEventRepo,
	mockVcsManager,
} = vi.hoisted(() => ({
	mockQueueManager: {
		enqueue: vi.fn(),
		getQueueStats: vi.fn(),
		cancel: vi.fn(),
	},
	mockTaskRepo: {
		getById: vi.fn(),
		update: vi.fn(),
	},
	mockRunRepo: {
		listByTask: vi.fn(),
		create: vi.fn(),
		getById: vi.fn(),
		update: vi.fn(),
	},
	mockRoleRepo: {
		list: vi.fn(),
		listWithPresets: vi.fn(),
		getPresetJson: vi.fn(),
	},
	mockProjectRepo: {
		getById: vi.fn(),
	},
	mockContextSnapshotRepo: {
		create: vi.fn(),
	},
	mockRunEventRepo: {
		create: vi.fn(),
	},
	mockVcsManager: {
		provisionRunWorkspace: vi.fn(),
		mergeRunWorkspace: vi.fn(),
		cleanupRunWorkspace: vi.fn(),
		syncRunWorkspace: vi.fn(),
		syncVcsMetadata: vi.fn(),
	},
}));

vi.mock("@/lib/logger", () => ({
	createLogger: () => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));

vi.mock("@/server/run/prompts/task", () => ({
	buildTaskPrompt: vi.fn(() => "task-prompt"),
}));

vi.mock("@/server/run/prompts/user-story", () => ({
	buildUserStoryPrompt: vi.fn(() => "user-story-prompt"),
}));

vi.mock("@/server/run/prompts/qa-testing", () => ({
	buildQaTestingPrompt: vi.fn(() => "qa-testing-prompt"),
}));

vi.mock("@/server/run/runs-queue-manager", () => ({
	getRunsQueueManager: () => mockQueueManager,
}));

vi.mock("@/server/repositories/task", () => ({
	taskRepo: mockTaskRepo,
}));

vi.mock("@/server/repositories/run", () => ({
	runRepo: mockRunRepo,
}));

vi.mock("@/server/vcs/vcs-manager", () => ({
	getVcsManager: () => mockVcsManager,
}));

vi.mock("@/server/repositories/role", () => ({
	roleRepo: mockRoleRepo,
}));

vi.mock("@/server/repositories/project", () => ({
	projectRepo: mockProjectRepo,
}));

vi.mock("@/server/repositories/context-snapshot", () => ({
	contextSnapshotRepo: mockContextSnapshotRepo,
}));

vi.mock("@/server/repositories/run-event", () => ({
	runEventRepo: mockRunEventRepo,
}));

vi.mock("@/server/run/run-publisher", () => ({
	publishRunUpdate: vi.fn(),
}));

vi.mock("@/server/events/sse-broker", () => ({
	publishSseEvent: vi.fn(),
}));

import { RunService } from "@/server/run/run-service";

function buildTask(overrides: Partial<ReturnType<typeof buildTaskBase>> = {}) {
	return {
		...buildTaskBase(),
		...overrides,
	};
}

function buildTaskBase() {
	const now = new Date().toISOString();
	return {
		id: "task-1",
		projectId: "project-1",
		boardId: "board-1",
		columnId: "column-1",
		title: "Improve onboarding flow",
		description: "Draft task description",
		descriptionMd: null,
		status: "queued",
		blockedReason: null,
		closedReason: null,
		priority: "normal",
		difficulty: "medium",
		type: "chore",
		orderInColumn: 0,
		tags: "[]",
		startDate: null,
		dueDate: null,
		estimatePoints: null,
		estimateHours: null,
		assignee: null,
		modelName: null,
		createdAt: now,
		updatedAt: now,
	};
}

function buildRun(
	status: Run["status"],
	id = "run-1",
	kind = "task-description-improve",
): Run {
	const now = new Date().toISOString();
	return {
		id,
		taskId: "task-1",
		sessionId: "",
		roleId: "dev",
		mode: "execute",
		status,
		createdAt: now,
		updatedAt: now,
		metadata: { kind },
	};
}

describe("RunService.generateUserStory", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockTaskRepo.getById.mockReturnValue(buildTask());
		mockTaskRepo.update.mockImplementation((_taskId, updates) => ({
			...buildTask(),
			...updates,
		}));
		mockRunRepo.listByTask.mockReturnValue([]);
		mockRunRepo.create.mockReturnValue(buildRun("queued", "run-new"));
		const roles = [
			{ id: "ba", name: "Business Analyst" },
			{ id: "dev", name: "Developer" },
		];
		mockRoleRepo.list.mockReturnValue(roles);
		mockRoleRepo.listWithPresets.mockReturnValue(roles);
		mockRoleRepo.getPresetJson.mockReturnValue(null);
		mockProjectRepo.getById.mockReturnValue({
			id: "project-1",
			name: "Kanban",
			path: "/tmp/kanban",
			color: "#111111",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		mockContextSnapshotRepo.create.mockReturnValue("snapshot-1");
		const storedRuns = new Map<string, Run>();
		mockRunRepo.create.mockImplementation((input) => {
			const run: Run = buildRun(
				"queued",
				"run-new",
				typeof input.kind === "string" ? input.kind : "task-run",
			);
			run.taskId = input.taskId;
			run.roleId = input.roleId;
			run.mode = input.mode;
			run.metadata = {
				kind: typeof input.kind === "string" ? input.kind : "task-run",
				...(typeof input.metadata === "object" && input.metadata
					? input.metadata
					: {}),
			};
			storedRuns.set(run.id, run);
			return run;
		});
		mockRunRepo.getById.mockImplementation(
			(runId) => storedRuns.get(runId) ?? null,
		);
		mockRunRepo.update.mockImplementation((runId, patch) => {
			const current =
				storedRuns.get(runId) ?? buildRun("queued", runId, "task-run");
			const next = {
				...current,
				...patch,
				metadata: patch.metadata ?? current.metadata,
				updatedAt: new Date().toISOString(),
			};
			storedRuns.set(runId, next);
			return next;
		});
	});

	it("returns active generation run instead of creating duplicate", async () => {
		mockRunRepo.listByTask.mockReturnValue([buildRun("running", "run-active")]);

		const service = new RunService();
		const result = await service.generateUserStory("task-1");

		expect(result).toEqual({ runId: "run-active" });
		expect(mockRunRepo.create).not.toHaveBeenCalled();
		expect(mockQueueManager.enqueue).not.toHaveBeenCalled();
		expect(mockTaskRepo.update).not.toHaveBeenCalled();
	});

	it("creates and enqueues BA generation run when no active run exists", async () => {
		const service = new RunService();
		const result = await service.generateUserStory("task-1");

		expect(result).toEqual({ runId: "run-new" });
		expect(mockRunRepo.create).toHaveBeenCalledWith(
			expect.objectContaining({
				taskId: "task-1",
				roleId: "ba",
				kind: "task-description-improve",
			}),
		);
		expect(mockTaskRepo.update).toHaveBeenCalledWith("task-1", {
			status: "generating",
		});
		expect(mockQueueManager.enqueue).toHaveBeenCalledWith(
			"run-new",
			expect.objectContaining({
				projectPath: "/tmp/kanban",
				sessionTitle: expect.stringContaining("User Story:"),
			}),
		);
	});

	it("uses BA preset model and agent for session preferences when preferred fields are empty", async () => {
		mockRoleRepo.listWithPresets.mockReturnValue([
			{
				id: "ba",
				name: "Business Analyst",
				preferred_model_name: null,
				preferred_model_variant: null,
				preferred_llm_agent: null,
				preset_json: JSON.stringify({
					modelName: "gpt-5.3-codex#high",
					agent: "ba-agent",
				}),
			},
		]);

		const service = new RunService();
		await service.generateUserStory("task-1");

		expect(mockQueueManager.enqueue).toHaveBeenCalledWith(
			"run-new",
			expect.objectContaining({
				sessionPreferences: {
					preferredModelName: "gpt-5.3-codex",
					preferredModelVariant: "high",
					preferredLlmAgent: "ba-agent",
				},
			}),
		);
	});

	it("combines preset provider and modelName for session preferences", async () => {
		mockRoleRepo.listWithPresets.mockReturnValue([
			{
				id: "ba",
				name: "Business Analyst",
				preferred_model_name: null,
				preferred_model_variant: null,
				preferred_llm_agent: null,
				preset_json: JSON.stringify({
					provider: "google",
					modelName: "antigravity-gemini-3.1-pro#fast",
					agent: "ba-agent",
				}),
			},
		]);

		const service = new RunService();
		await service.generateUserStory("task-1");

		expect(mockQueueManager.enqueue).toHaveBeenCalledWith(
			"run-new",
			expect.objectContaining({
				sessionPreferences: {
					preferredModelName: "google/antigravity-gemini-3.1-pro",
					preferredModelVariant: "fast",
					preferredLlmAgent: "ba-agent",
				},
			}),
		);
	});

	it("uses assigned task executor role for generation when agent tag is present", async () => {
		mockTaskRepo.getById.mockReturnValue(
			buildTask({ tags: JSON.stringify(["agent:qa"]) }),
		);
		mockRoleRepo.list.mockReturnValue([
			{ id: "ba", name: "Business Analyst" },
			{ id: "qa", name: "QA Engineer" },
		]);
		mockRoleRepo.listWithPresets.mockReturnValue([
			{ id: "ba", name: "Business Analyst", preset_json: "{}" },
			{ id: "qa", name: "QA Engineer", preset_json: "{}" },
		]);

		const service = new RunService();
		await service.generateUserStory("task-1");

		expect(mockRunRepo.create).toHaveBeenCalledWith(
			expect.objectContaining({ roleId: "qa" }),
		);
	});
});

describe("RunService.start", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockTaskRepo.getById.mockReturnValue(buildTask());
		mockRunRepo.listByTask.mockReturnValue([]);
		mockRoleRepo.listWithPresets.mockReturnValue([
			{ id: "dev", name: "Developer", preset_json: "{}" },
		]);
		mockRoleRepo.getPresetJson.mockReturnValue("{}");
		mockProjectRepo.getById.mockReturnValue({
			id: "project-1",
			name: "Kanban",
			path: "/tmp/kanban",
			color: "#111111",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		mockContextSnapshotRepo.create.mockReturnValue("snapshot-run");
		const storedRuns = new Map<string, Run>();
		mockRunRepo.create.mockImplementation((input) => {
			const run: Run = buildRun("queued", "run-start", "task-run");
			run.taskId = input.taskId;
			run.roleId = input.roleId;
			run.mode = input.mode;
			storedRuns.set(run.id, run);
			return run;
		});
		mockRunRepo.update.mockImplementation((runId, patch) => {
			const current =
				storedRuns.get(runId) ?? buildRun("queued", runId, "task-run");
			const next = {
				...current,
				...patch,
				metadata: patch.metadata ?? current.metadata,
				updatedAt: new Date().toISOString(),
			};
			storedRuns.set(runId, next);
			return next;
		});
		mockRunRepo.getById.mockImplementation(
			(runId) => storedRuns.get(runId) ?? null,
		);
		mockVcsManager.provisionRunWorkspace.mockResolvedValue({
			repoRoot: "/tmp/kanban",
			worktreePath: "/tmp/kanban.worktrees/task-1-run-start",
			branchName: "task/task-1-run-start",
			baseBranch: "main",
			baseCommit: "abc123",
			headCommit: "abc123",
			hasChanges: false,
			workspaceStatus: "ready",
			mergeStatus: "pending",
			cleanupStatus: "pending",
		});
	});

	it("provisions a worktree and enqueues the run there", async () => {
		const service = new RunService();
		const result = await service.start({ taskId: "task-1" });

		expect(result).toEqual({ runId: "run-start" });
		expect(mockVcsManager.provisionRunWorkspace).toHaveBeenCalledWith(
			expect.objectContaining({
				projectPath: "/tmp/kanban",
				runId: "run-start",
				taskId: "task-1",
			}),
		);
		expect(mockQueueManager.enqueue).toHaveBeenCalledWith(
			"run-start",
			expect.objectContaining({
				projectPath: "/tmp/kanban.worktrees/task-1-run-start",
			}),
		);
		expect(mockRunRepo.update).toHaveBeenCalledWith(
			"run-start",
			expect.objectContaining({
				metadata: expect.objectContaining({
					vcs: expect.objectContaining({
						branchName: "task/task-1-run-start",
					}),
				}),
			}),
		);
	});

	it("marks the run failed when worktree provisioning fails", async () => {
		mockVcsManager.provisionRunWorkspace.mockRejectedValueOnce(
			new Error("git worktree add failed"),
		);

		const service = new RunService();
		await expect(service.start({ taskId: "task-1" })).rejects.toThrow(
			"git worktree add failed",
		);

		expect(mockRunRepo.update).toHaveBeenCalledWith(
			"run-start",
			expect.objectContaining({
				status: "failed",
				errorText: "git worktree add failed",
			}),
		);
		expect(mockQueueManager.enqueue).not.toHaveBeenCalled();
	});
});

describe("RunService.startQaTesting", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockTaskRepo.getById.mockReturnValue(buildTask());
		mockRunRepo.listByTask.mockReturnValue([]);
		mockRunRepo.create.mockReturnValue(
			buildRun("queued", "run-qa-new", "task-qa-testing"),
		);
		const roles = [
			{ id: "qa", name: "QA" },
			{ id: "dev", name: "Developer" },
		];
		mockRoleRepo.list.mockReturnValue(roles);
		mockRoleRepo.listWithPresets.mockReturnValue(roles);
		mockRoleRepo.getPresetJson.mockReturnValue(null);
		mockProjectRepo.getById.mockReturnValue({
			id: "project-1",
			name: "Kanban",
			path: "/tmp/kanban",
			color: "#111111",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		});
		mockContextSnapshotRepo.create.mockReturnValue("snapshot-qa");
	});

	it("returns active QA run instead of creating duplicate", async () => {
		mockRunRepo.listByTask.mockReturnValue([
			buildRun("running", "run-qa-active", "task-qa-testing"),
		]);

		const service = new RunService();
		const result = await service.startQaTesting("task-1");

		expect(result).toEqual({ runId: "run-qa-active" });
		expect(mockRunRepo.create).not.toHaveBeenCalled();
		expect(mockQueueManager.enqueue).not.toHaveBeenCalled();
		expect(mockRunEventRepo.create).not.toHaveBeenCalled();
	});

	it("creates and enqueues QA testing run when no active run exists", async () => {
		const service = new RunService();
		const result = await service.startQaTesting("task-1");

		expect(result).toEqual({ runId: "run-qa-new" });
		expect(mockContextSnapshotRepo.create).toHaveBeenCalledWith(
			expect.objectContaining({
				taskId: "task-1",
				kind: "qa-testing",
			}),
		);
		expect(mockRunRepo.create).toHaveBeenCalledWith(
			expect.objectContaining({
				taskId: "task-1",
				roleId: "qa",
				kind: "task-qa-testing",
			}),
		);
		expect(mockRunEventRepo.create).toHaveBeenCalledWith(
			expect.objectContaining({
				eventType: "status",
				payload: expect.objectContaining({ message: "QA testing queued" }),
			}),
		);
		expect(mockQueueManager.enqueue).toHaveBeenCalledWith(
			"run-qa-new",
			expect.objectContaining({
				projectPath: "/tmp/kanban",
				sessionTitle: expect.stringContaining("QA Testing:"),
				prompt: "qa-testing-prompt",
			}),
		);
	});
});

describe("RunService.merge", () => {
	it("merges a completed run and persists merged VCS metadata", async () => {
		const run = {
			...buildRun("completed", "run-merge", "task-run"),
			metadata: {
				kind: "task-run",
				vcs: {
					repoRoot: "/tmp/kanban",
					worktreePath: "/tmp/kanban.worktrees/task-1-run-merge",
					branchName: "task/task-1-run-merge",
					baseBranch: "main",
					baseCommit: "abc123",
					workspaceStatus: "ready",
					mergeStatus: "pending",
					cleanupStatus: "pending",
				},
			},
		};
		mockRunRepo.getById.mockReturnValue(run);
		mockVcsManager.mergeRunWorkspace.mockResolvedValue({
			...run.metadata.vcs,
			workspaceStatus: "merged",
			mergeStatus: "merged",
			mergedBy: "manual",
			mergedAt: "2026-03-08T12:00:00.000Z",
			mergedCommit: "def456",
			cleanupStatus: "pending",
		});
		mockVcsManager.cleanupRunWorkspace.mockResolvedValue({
			...run.metadata.vcs,
			workspaceStatus: "cleaned",
			mergeStatus: "merged",
			mergedBy: "manual",
			mergedAt: "2026-03-08T12:00:00.000Z",
			mergedCommit: "def456",
			cleanupStatus: "cleaned",
			cleanedAt: "2026-03-08T12:01:00.000Z",
		});
		mockRunRepo.update.mockImplementation((_runId, patch) => ({
			...run,
			...patch,
			metadata: patch.metadata,
		}));

		const service = new RunService();
		const result = await service.merge("run-merge");

		expect(mockVcsManager.mergeRunWorkspace).toHaveBeenCalledWith(
			run,
			"manual",
		);
		expect(mockVcsManager.cleanupRunWorkspace).toHaveBeenCalled();
		expect(result.run.metadata?.vcs?.mergeStatus).toBe("merged");
		expect(result.run.metadata?.vcs?.mergedCommit).toBe("def456");
		expect(result.run.metadata?.vcs?.cleanupStatus).toBe("cleaned");
	});

	it("preserves synced workspace state when cleanup fails after merge", async () => {
		const run = {
			...buildRun("completed", "run-merge-fail", "task-run"),
			metadata: {
				kind: "task-run",
				vcs: {
					repoRoot: "/tmp/kanban",
					worktreePath: "/tmp/kanban.worktrees/task-1-run-merge-fail",
					branchName: "task/task-1-run-merge-fail",
					baseBranch: "main",
					baseCommit: "abc123",
					workspaceStatus: "ready",
					mergeStatus: "pending",
					cleanupStatus: "pending",
				},
			},
		};
		mockRunRepo.getById.mockReturnValue(run);
		mockVcsManager.mergeRunWorkspace.mockResolvedValue({
			...run.metadata.vcs,
			workspaceStatus: "merged",
			mergeStatus: "merged",
			mergedBy: "manual",
			mergedAt: "2026-03-08T12:00:00.000Z",
			mergedCommit: "def456",
			cleanupStatus: "pending",
		});
		mockVcsManager.cleanupRunWorkspace.mockRejectedValueOnce(
			new Error("branch delete failed"),
		);
		mockVcsManager.syncVcsMetadata.mockResolvedValueOnce({
			...run.metadata.vcs,
			workspaceStatus: "missing",
			mergeStatus: "merged",
			mergedBy: "manual",
			mergedAt: "2026-03-08T12:00:00.000Z",
			mergedCommit: "def456",
			cleanupStatus: "pending",
		});
		mockRunRepo.update.mockImplementation((_runId, patch) => ({
			...run,
			...patch,
			metadata: patch.metadata,
		}));

		const service = new RunService();
		const result = await service.merge("run-merge-fail");

		expect(mockVcsManager.syncVcsMetadata).toHaveBeenCalled();
		expect(result.run.metadata?.vcs?.mergeStatus).toBe("merged");
		expect(result.run.metadata?.vcs?.workspaceStatus).toBe("missing");
		expect(result.run.metadata?.vcs?.cleanupStatus).toBe("failed");
		expect(result.run.metadata?.vcs?.lastCleanupError).toBe(
			"branch delete failed",
		);
	});
});
