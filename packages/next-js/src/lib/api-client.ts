import type {
	Project,
	CreateProjectInput,
	UpdateProjectInput,
} from "@/server/types";
import type { Task, CreateTaskInput, UpdateTaskInput } from "@/server/types";
import type { Board, BoardColumn } from "@/server/types";
import type { KanbanTask, KanbanTaskPatch, Tag } from "@/types/kanban";

// REST API Client for Next.js standalone
// Uses relative paths to avoid CORS issues

// Helper to convert DB Task to KanbanTask
function taskToKanban(task: Task): KanbanTask {
	return {
		id: task.id,
		projectId: task.projectId,
		boardId: task.boardId,
		columnId: task.columnId,
		title: task.title,
		description: task.description,
		descriptionMd: task.descriptionMd,
		status: task.status as KanbanTask["status"],
		priority: task.priority as KanbanTask["priority"],
		difficulty: task.difficulty as KanbanTask["difficulty"],
		type: task.type as KanbanTask["type"],
		orderInColumn: task.orderInColumn,
		tags: task.tags ? JSON.parse(task.tags) : [],
		startDate: task.startDate,
		dueDate: task.dueDate,
		estimatePoints: task.estimatePoints,
		estimateHours: task.estimateHours,
		assignee: task.assignee,
		modelName: task.modelName,
		createdAt: task.createdAt,
		updatedAt: task.updatedAt,
	};
}

class ApiClient {
	private baseUrl: string;

	constructor(baseUrl: string = "") {
		this.baseUrl = baseUrl;
	}

	private async getErrorMessage(
		response: Response,
		fallback: string,
	): Promise<string> {
		try {
			const data = await response.json();
			if (data && typeof data.error === "string") return data.error;
			if (data && typeof data.message === "string") return data.message;
		} catch {
			return fallback;
		}
		return fallback;
	}

	private unwrapApiData<T>(payload: T | { data?: T }): T {
		if (payload && typeof payload === "object" && "data" in payload) {
			const data = (payload as { data?: T }).data;
			if (data !== undefined) {
				return data;
			}
		}

		return payload as T;
	}

	// Projects
	async getProjects(): Promise<Project[]> {
		const response = await fetch(`${this.baseUrl}/api/projects`);
		if (!response.ok) throw new Error("Failed to fetch projects");
		const payload = await response.json();
		return this.unwrapApiData<Project[]>(payload);
	}

	async getProject(id: string): Promise<Project | null> {
		const response = await fetch(`${this.baseUrl}/api/projects/${id}`);
		if (!response.ok) return null;
		const payload = await response.json();
		return this.unwrapApiData<Project>(payload);
	}

	async createProject(input: CreateProjectInput): Promise<Project> {
		const response = await fetch(`${this.baseUrl}/api/projects`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		});
		if (!response.ok) {
			const message = await this.getErrorMessage(
				response,
				"Failed to create project",
			);
			throw new Error(message);
		}
		const payload = await response.json();
		return this.unwrapApiData<Project>(payload);
	}

	async updateProject(
		id: string,
		updates: UpdateProjectInput,
	): Promise<Project | null> {
		const response = await fetch(`${this.baseUrl}/api/projects/${id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(updates),
		});
		if (!response.ok) return null;
		const payload = await response.json();
		return this.unwrapApiData<Project>(payload);
	}

	async deleteProject(id: string): Promise<boolean> {
		const response = await fetch(`${this.baseUrl}/api/projects/${id}`, {
			method: "DELETE",
		});
		return response.ok;
	}

	// Tasks
	async getTasks(boardId: string): Promise<KanbanTask[]> {
		const response = await fetch(
			`${this.baseUrl}/api/tasks?boardId=${boardId}`,
		);
		if (!response.ok) throw new Error("Failed to fetch tasks");
		const payload = await response.json();
		const tasks = this.unwrapApiData<Task[]>(payload);
		return tasks.map(taskToKanban);
	}

	async getTask(id: string): Promise<KanbanTask | null> {
		const response = await fetch(`${this.baseUrl}/api/tasks/${id}`);
		if (!response.ok) return null;
		const payload = await response.json();
		const task = this.unwrapApiData<Task>(payload);
		return taskToKanban(task);
	}

	async createTask(input: CreateTaskInput): Promise<KanbanTask> {
		const response = await fetch(`${this.baseUrl}/api/tasks`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		});
		if (!response.ok) throw new Error("Failed to create task");
		const payload = await response.json();
		const task = this.unwrapApiData<Task>(payload);
		return taskToKanban(task);
	}

	async updateTask(id: string, updates: UpdateTaskInput): Promise<KanbanTask | null> {
		const response = await fetch(`${this.baseUrl}/api/tasks/${id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(updates),
		});
		if (!response.ok) return null;
		const payload = await response.json();
		const task = this.unwrapApiData<Task>(payload);
		return taskToKanban(task);
	}

	async deleteTask(id: string): Promise<boolean> {
		const response = await fetch(`${this.baseUrl}/api/tasks/${id}`, {
			method: "DELETE",
		});
		return response.ok;
	}

	async moveTask(id: string, columnId: string, toIndex?: number): Promise<KanbanTask | null> {
		const response = await fetch(`${this.baseUrl}/api/tasks/${id}/move`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ columnId, toIndex }),
		});
		if (!response.ok) return null;
		const payload = await response.json();
		const task = this.unwrapApiData<Task>(payload);
		return taskToKanban(task);
	}

	// Boards
	async getBoardByProject(projectId: string): Promise<Board | null> {
		const response = await fetch(
			`${this.baseUrl}/api/boards/project/${projectId}`,
		);
		if (!response.ok) return null;
		const payload = await response.json();
		return this.unwrapApiData<Board>(payload);
	}

	async updateBoardColumns(
		boardId: string,
		columns: Array<{
			id?: string;
			name: string;
			systemKey?: string;
			orderIndex: number;
			color?: string | null;
		}>,
	): Promise<BoardColumn[]> {
		const response = await fetch(
			`${this.baseUrl}/api/boards/${boardId}/columns`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ columns }),
			},
		);
		if (!response.ok) throw new Error("Failed to update columns");
		const payload = await response.json();
		return this.unwrapApiData<BoardColumn[]>(payload);
	}

	// Tags
	async getGlobalTags(): Promise<Tag[]> {
		const response = await fetch(`${this.baseUrl}/api/tags`);
		if (!response.ok) throw new Error("Failed to fetch tags");
		const payload = await response.json();
		return this.unwrapApiData<Tag[]>(payload);
	}

	// App Settings
	async getAppSetting(key: string): Promise<string | null> {
		const response = await fetch(`${this.baseUrl}/api/app-settings?key=${key}`);
		if (!response.ok) return null;
		const payload = await response.json();

		if (payload && typeof payload === "object" && "data" in payload) {
			const data = this.unwrapApiData<{ value?: string }>(
				payload as { data?: { value?: string } },
			);
			return data?.value ?? null;
		}

		const data = payload as { value?: string };
		return data.value ?? null;
	}

	async setAppSetting(key: string, value: string): Promise<boolean> {
		const response = await fetch(`${this.baseUrl}/api/app-settings`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ key, value }),
		});
		return response.ok;
	}

	// Convenience methods
	async getLastProjectId(): Promise<string | null> {
		return this.getAppSetting("lastProjectId");
	}

	async setLastProjectId(projectId: string): Promise<boolean> {
		return this.setAppSetting("lastProjectId", projectId);
	}

	async browseDirectory(dirPath?: string): Promise<{
		currentPath: string;
		parentPath: string | null;
		homePath: string;
		entries: {
			name: string;
			path: string;
			isDirectory: boolean;
			isFile: boolean;
		}[];
	}> {
		const pathParam = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
		const response = await fetch(`${this.baseUrl}/api/browse${pathParam}`);
		if (!response.ok) throw new Error("Failed to browse directory");
		return response.json();
	}
}

export const api = new ApiClient();

if (typeof window !== "undefined") {
	(window as any).api = api;
}
