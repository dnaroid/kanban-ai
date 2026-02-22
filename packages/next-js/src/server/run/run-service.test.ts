import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockQueueManager,
	mockTaskRepo,
	mockRunRepo,
	mockRoleRepo,
	mockProjectRepo,
	mockContextSnapshotRepo,
	mockRunEventRepo,
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
	},
	mockRoleRepo: {
		list: vi.fn(),
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

function buildTask() {
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
	status: string,
	id = "run-1",
	kind = "task-description-improve",
) {
	const now = new Date().toISOString();
	return {
		id,
		taskId: "task-1",
		sessionId: "",
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
		mockRoleRepo.list.mockReturnValue([
			{ id: "ba", name: "Business Analyst" },
			{ id: "dev", name: "Developer" },
		]);
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
});

describe("RunService.startQaTesting", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockTaskRepo.getById.mockReturnValue(buildTask());
		mockRunRepo.listByTask.mockReturnValue([]);
		mockRunRepo.create.mockReturnValue(
			buildRun("queued", "run-qa-new", "task-qa-testing"),
		);
		mockRoleRepo.list.mockReturnValue([
			{ id: "qa", name: "QA" },
			{ id: "dev", name: "Developer" },
		]);
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
