// Core domain types for kanban-ai

export interface Project {
	id: string;
	name: string;
	path: string;
	color: string;
	createdAt: string;
	updatedAt: string;
	lastActivityAt: string | null;
}

export interface CreateProjectInput {
	name: string;
	path: string;
	color?: string;
}

export interface UpdateProjectInput {
	name?: string;
	path?: string;
	color?: string;
}

export interface BoardColumn {
	id: string;
	boardId: string;
	name: string;
	systemKey: string;
	orderIndex: number;
	wipLimit?: number | null;
	color?: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface Board {
	id: string;
	projectId: string;
	name: string;
	columns: BoardColumn[];
	createdAt: string;
	updatedAt: string;
}

export interface CreateBoardInput {
	projectId: string;
	name: string;
	columns?: string[];
}

export interface Task {
	id: string;
	projectId: string;
	boardId: string;
	columnId: string;
	title: string;
	description: string | null;
	descriptionMd: string | null;
	status: string;
	blockedReason: "question" | "paused" | "failed" | null;
	blockedReasonText: string | null;
	closedReason: "done" | "failed" | null;
	priority: string;
	difficulty: string;
	type: string;
	orderInColumn: number;
	tags: string; // JSON string
	startDate: string | null;
	dueDate: string | null;
	estimatePoints: number | null;
	estimateHours: number | null;
	assignee: string | null;
	modelName: string | null;
	commitMessage: string | null;
	qaReport: string | null;
	isGenerated: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CreateTaskInput {
	projectId: string;
	boardId: string;
	columnId: string;
	title: string;
	description?: string;
	status?: string;
	blockedReason?: "question" | "paused" | "failed" | null;
	blockedReasonText?: string | null;
	closedReason?: "done" | "failed" | null;
	priority?: string;
	difficulty?: string;
	type?: string;
	tags?: string[];
	dueDate?: string;
	modelName?: string | null;
	commitMessage?: string;
	qaReport?: string | null;
	isGenerated?: boolean;
}

export interface UpdateTaskInput {
	columnId?: string;
	title?: string;
	description?: string | null;
	descriptionMd?: string | null;
	status?: string;
	blockedReason?: "question" | "paused" | "failed" | null;
	blockedReasonText?: string | null;
	closedReason?: "done" | "failed" | null;
	priority?: string;
	difficulty?: string;
	type?: string;
	orderInColumn?: number;
	tags?: string;
	startDate?: string | null;
	dueDate?: string | null;
	estimatePoints?: number | null;
	estimateHours?: number | null;
	assignee?: string | null;
	modelName?: string | null;
	commitMessage?: string | null;
	qaReport?: string | null;
	isGenerated?: boolean;
}

export interface Run {
	id: string;
	taskId: string;
	status: "pending" | "running" | "completed" | "failed" | "cancelled";
	agentRole: string;
	startedAt: string | null;
	completedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface CreateRunInput {
	taskId: string;
	agentRole: string;
}

export interface Tag {
	id: string;
	boardId: string;
	name: string;
	color: string;
	createdAt: string;
}

export interface CreateTagInput {
	boardId: string;
	name: string;
	color: string;
}

// App Settings
export interface AppSetting {
	key: string;
	value: string;
	updatedAt: string;
}

// API Response types
export interface ApiResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}
