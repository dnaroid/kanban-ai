// Kanban-specific types for the board UI

export type TaskStatus = string;

export type BlockedReason = "question" | "paused" | "failed";

export type ClosedReason = "done" | "failed";

export type TaskPriority = "postpone" | "low" | "normal" | "urgent";

export type TaskDifficulty = "easy" | "medium" | "hard" | "epic";

export type TaskType = "feature" | "bug" | "chore" | "improvement";

// Extended KanbanTask for UI - maps DB task to kanban display
export interface KanbanTask {
	id: string;
	projectId: string;
	boardId: string;
	columnId: string;
	title: string;
	description: string | null;
	descriptionMd: string | null;
	status: TaskStatus;
	blockedReason: BlockedReason | null;
	closedReason: ClosedReason | null;
	priority: TaskPriority;
	difficulty: TaskDifficulty;
	type: TaskType;
	orderInColumn: number;
	tags: string[];
	startDate: string | null;
	dueDate: string | null;
	estimatePoints: number | null;
	estimateHours: number | null;
	assignee: string | null;
	modelName: string | null;
	latestSessionId: string | null;
	opencodeWebUrl: string | null;
	createdAt: string;
	updatedAt: string;
}

// Input for creating a new task
export interface CreateKanbanTaskInput {
	projectId: string;
	boardId: string;
	columnId: string;
	title: string;
	description?: string;
	type?: TaskType;
	priority?: TaskPriority;
	difficulty?: TaskDifficulty;
	tags?: string[];
	modelName?: string | null;
}

// Patch for updating a task
export interface KanbanTaskPatch {
	title?: string;
	description?: string | null;
	descriptionMd?: string | null;
	status?: TaskStatus;
	blockedReason?: BlockedReason | null;
	closedReason?: ClosedReason | null;
	priority?: TaskPriority;
	difficulty?: TaskDifficulty;
	type?: TaskType;
	columnId?: string;
	orderInColumn?: number;
	tags?: string[];
	startDate?: string | null;
	dueDate?: string | null;
	estimatePoints?: number | null;
	estimateHours?: number | null;
	assignee?: string | null;
	modelName?: string | null;
}

// Tag type
export interface Tag {
	id: string;
	name: string;
	color: string;
	createdAt: string;
	updatedAt: string;
}

// Column input for board updates
export interface BoardColumnInput {
	id?: string;
	name: string;
	systemKey?: string;
	orderIndex: number;
	color?: string | null;
}

// Task link types for dependencies
export type TaskLinkType = "blocks" | "relates";

// Task link for dependencies
export interface TaskLink {
	id: string;
	projectId: string;
	fromTaskId: string;
	toTaskId: string;
	linkType: TaskLinkType;
	createdAt: string;
	updatedAt: string;
}

export interface OpencodeModel {
	name: string;
	enabled: boolean;
	difficulty: TaskDifficulty;
	variants: string;
}
