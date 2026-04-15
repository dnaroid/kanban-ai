import type {
	Project,
	CreateProjectInput,
	UpdateProjectInput,
} from "@/server/types";
import type { JSONSchema } from "./json-schema-types";
import type { Task, CreateTaskInput, UpdateTaskInput } from "@/server/types";
import type { Board, BoardColumn } from "@/server/types";
import type {
	KanbanTask,
	OpencodeModel,
	Tag,
	TaskLink,
	TaskLinkType,
} from "@/types/kanban";
import type {
	Artifact,
	OpenCodeMessage,
	OpenCodeTodo,
	OpencodeAgent,
	PermissionData,
	Run,
	QueueStatsResponse,
} from "@/types/ipc";

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
		blockedReason: task.blockedReason,
		closedReason: task.closedReason,
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

	readonly project = {
		getAll: async (): Promise<Project[]> => this.getProjects(),
		delete: async ({ id }: { id: string }): Promise<{ ok: boolean }> => ({
			ok: await this.deleteProject(id),
		}),
		browseDirectory: async ({
			path,
		}: {
			path?: string;
		}): Promise<{
			currentPath: string;
			parentPath: string | null;
			homePath: string;
			entries: {
				name: string;
				path: string;
				isDirectory: boolean;
				isFile: boolean;
			}[];
		}> => this.browseDirectory(path),
	};

	readonly task = {
		listByBoard: async (boardId: string): Promise<{ tasks: KanbanTask[] }> => ({
			tasks: await this.getTasks(boardId),
		}),
	};

	readonly run = {
		listByTask: async ({
			taskId,
		}: {
			taskId: string;
		}): Promise<{ runs: Run[] }> => {
			const query = new URLSearchParams({ taskId });
			const response = await fetch(
				`${this.baseUrl}/api/run/listByTask?${query.toString()}`,
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to list runs",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{ runs?: Run[] }>(payload);
			return { runs: data.runs ?? [] };
		},
		start: async ({
			taskId,
			roleId,
			mode,
			modelName,
		}: {
			taskId: string;
			roleId?: string;
			mode?: string;
			modelName?: string | null;
		}): Promise<{ runId: string }> => {
			const response = await fetch(`${this.baseUrl}/api/run/start`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ taskId, roleId, mode, modelName }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to start run",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{ runId?: string }>(payload);
			if (!data.runId) {
				throw new Error("Run start response did not contain runId");
			}
			return { runId: data.runId };
		},
		cancel: async ({
			runId,
		}: {
			runId: string;
		}): Promise<{ success: true }> => {
			const response = await fetch(`${this.baseUrl}/api/run/cancel`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ runId }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to cancel run",
				);
				throw new Error(message);
			}
			return { success: true };
		},
		delete: async ({
			runId,
		}: {
			runId: string;
		}): Promise<{ success: true }> => {
			const response = await fetch(`${this.baseUrl}/api/run/delete`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ runId }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to delete run",
				);
				throw new Error(message);
			}
			return { success: true };
		},
		merge: async ({ runId }: { runId: string }): Promise<{ run: Run }> => {
			const response = await fetch(`${this.baseUrl}/api/run/merge`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ runId }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to merge run changes",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{ run?: Run | null }>(payload);
			if (!data.run) {
				throw new Error("Run merge response did not contain run");
			}
			return { run: data.run };
		},
		get: async ({ runId }: { runId: string }): Promise<{ run: Run | null }> => {
			const query = new URLSearchParams({ runId });
			const response = await fetch(
				`${this.baseUrl}/api/run/get?${query.toString()}`,
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to get run",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{ run?: Run | null }>(payload);
			return { run: data.run ?? null };
		},
		queueStats: async (): Promise<QueueStatsResponse> => {
			const response = await fetch(`${this.baseUrl}/api/run/queueStats`);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to get queue stats",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<QueueStatsResponse>(payload);
		},
		startBySignal: async ({
			projectId,
			signalKey,
		}: {
			projectId: string;
			signalKey: string;
		}): Promise<{
			startedCount: number;
			skippedNoRuleCount: number;
			skippedActiveRunCount: number;
			taskIds: string[];
			runIds: string[];
		}> => {
			const response = await fetch(`${this.baseUrl}/api/run/startBySignal`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ projectId, signalKey }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to start runs by signal",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{
				startedCount: number;
				skippedNoRuleCount: number;
				skippedActiveRunCount: number;
				taskIds: string[];
				runIds: string[];
			}>(payload);
		},
		replyPermission: async ({
			runId,
			permissionId,
			response,
		}: {
			runId: string;
			permissionId: string;
			response: "once" | "always" | "reject";
		}): Promise<void> => {
			const res = await fetch(`${this.baseUrl}/api/run/permission/reply`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ runId, permissionId, response }),
			});
			if (!res.ok) {
				const message = await this.getErrorMessage(
					res,
					"Failed to reply to permission",
				);
				throw new Error(message);
			}
		},
	};

	readonly deps = {
		list: async ({
			taskId,
		}: {
			taskId: string;
		}): Promise<{ links: TaskLink[] }> => {
			const response = await fetch(
				`${this.baseUrl}/api/deps?taskId=${encodeURIComponent(taskId)}`,
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to fetch task dependencies",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{ links: TaskLink[] }>(payload);
			return { links: data.links ?? [] };
		},
		add: async ({
			fromTaskId,
			toTaskId,
			type,
		}: {
			fromTaskId: string;
			toTaskId: string;
			type: TaskLinkType;
		}): Promise<{ link: TaskLink }> => {
			const response = await fetch(`${this.baseUrl}/api/deps`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ fromTaskId, toTaskId, type }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to create task dependency",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ link: TaskLink }>(payload);
		},
		remove: async ({ linkId }: { linkId: string }): Promise<{ ok: true }> => {
			const response = await fetch(
				`${this.baseUrl}/api/deps/${encodeURIComponent(linkId)}`,
				{
					method: "DELETE",
				},
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to remove task dependency",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{ ok?: boolean }>(payload);
			if (data.ok !== true) {
				throw new Error("Failed to remove task dependency");
			}
			return { ok: true };
		},
	};

	readonly tag = {
		list: async (_: Record<string, never>): Promise<{ tags: Tag[] }> => ({
			tags: await this.getGlobalTags(),
		}),
		create: async (input: { name: string; color: string }): Promise<Tag> =>
			this.createTag(input),
		delete: async ({ id }: { id: string }): Promise<{ ok: boolean }> => {
			const response = await fetch(`${this.baseUrl}/api/tags/${id}`, {
				method: "DELETE",
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to delete tag",
				);
				throw new Error(message);
			}
			return { ok: true };
		},
		update: async ({
			id,
			name,
			color,
		}: {
			id: string;
			name: string;
			color: string;
		}): Promise<Tag> => {
			const response = await fetch(`${this.baseUrl}/api/tags/${id}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, color }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to update tag",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<Tag>(payload);
		},
	};

	readonly roles = {
		list: async (): Promise<{
			roles: Array<{ id: string; name: string; description: string }>;
		}> => {
			const response = await fetch(`${this.baseUrl}/api/roles/list`);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to list roles",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{
				roles?: Array<{ id: string; name: string; description: string }>;
			}>(payload);
			return { roles: data.roles ?? [] };
		},
		listFull: async (): Promise<{
			roles: Array<{
				id: string;
				name: string;
				description: string;
				preset_json: string;
				preferred_model_name?: string | null;
				preferred_model_variant?: string | null;
				preferred_llm_agent?: string | null;
			}>;
		}> => {
			const response = await fetch(`${this.baseUrl}/api/roles/list-full`);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to list roles with presets",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{
				roles?: Array<{
					id: string;
					name: string;
					description: string;
					preset_json: string;
					preferred_model_name?: string | null;
					preferred_model_variant?: string | null;
					preferred_llm_agent?: string | null;
				}>;
			}>(payload);
			return { roles: data.roles ?? [] };
		},
		save: async (role: {
			id: string;
			name: string;
			description?: string;
			preset_json: string;
			preferred_model_name?: string | null;
			preferred_model_variant?: string | null;
			preferred_llm_agent?: string | null;
		}): Promise<{ success: boolean }> => {
			const response = await fetch(`${this.baseUrl}/api/roles/save`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(role),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to save role",
				);
				throw new Error(message);
			}
			return { success: true };
		},
		delete: async ({ id }: { id: string }): Promise<{ success: boolean }> => {
			const response = await fetch(`${this.baseUrl}/api/roles/delete`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to delete role",
				);
				throw new Error(message);
			}
			return { success: true };
		},
	};

	readonly opencode = {
		generateUserStory: async ({
			taskId,
		}: {
			taskId: string;
		}): Promise<{ runId: string }> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/generate-user-story`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ taskId }),
				},
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to generate user story",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ runId: string }>(payload);
		},
		startQaTesting: async ({
			taskId,
		}: {
			taskId: string;
		}): Promise<{ runId: string }> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/start-qa-testing`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ taskId }),
				},
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to start QA testing",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ runId: string }>(payload);
		},
		generateUserStories: async ({
			taskIds,
		}: {
			taskIds: string[];
		}): Promise<{ runIds: string[] }> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/generate-user-story`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ taskIds }),
				},
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to generate user stories",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{ runIds?: string[] }>(payload);
			return { runIds: data.runIds ?? [] };
		},
		listSkills: async (): Promise<{ skills: string[] }> => {
			const response = await fetch(`${this.baseUrl}/api/opencode/skills`);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to fetch OpenCode skills",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{ skills?: string[] }>(payload);
			return { skills: data.skills ?? [] };
		},
		listAgents: async (): Promise<{ agents: OpencodeAgent[] }> => {
			const response = await fetch(`${this.baseUrl}/api/opencode/agents`);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to fetch OpenCode agents",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{ agents?: OpencodeAgent[] }>(payload);
			return { agents: data.agents ?? [] };
		},
		refreshSkillAssignments: async (): Promise<{
			sessionId: string;
			updatedRoles: number;
			consideredRoles: number;
		}> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/skills/refresh-assignments`,
				{ method: "POST" },
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to refresh skill assignments",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{
				sessionId: string;
				updatedRoles: number;
				consideredRoles: number;
			}>(payload);
		},
		getWebUrl: async ({
			projectId,
		}: {
			projectId: string;
		}): Promise<{ url: string }> => {
			const query = new URLSearchParams({ projectId });
			const response = await fetch(
				`${this.baseUrl}/api/opencode/web-url?${query.toString()}`,
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to get OpenCode web URL",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ url: string }>(payload);
		},
		listEnabledModels: async (): Promise<{ models: OpencodeModel[] }> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/models/enabled`,
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to fetch enabled models",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ models: OpencodeModel[] }>(payload);
		},
		listModels: async (): Promise<{ models: OpencodeModel[] }> => {
			const response = await fetch(`${this.baseUrl}/api/opencode/models`);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to fetch models",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ models: OpencodeModel[] }>(payload);
		},
		toggleModel: async ({
			name,
			enabled,
		}: {
			name: string;
			enabled: boolean;
		}): Promise<{ model: OpencodeModel }> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/models/toggle`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name, enabled }),
				},
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to toggle model",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ model: OpencodeModel }>(payload);
		},
		updateModelDifficulty: async ({
			name,
			difficulty,
		}: {
			name: string;
			difficulty: OpencodeModel["difficulty"];
		}): Promise<{ model: OpencodeModel }> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/models/difficulty`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name, difficulty }),
				},
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to update model difficulty",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ model: OpencodeModel }>(payload);
		},
		refreshModels: async (): Promise<{ models: OpencodeModel[] }> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/models/refresh`,
				{
					method: "POST",
				},
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to refresh models",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ models: OpencodeModel[] }>(payload);
		},
		exportModelsConfig: async (): Promise<{
			version: number;
			exportedAt: string;
			models: Array<{
				name: string;
				difficulty: string;
			}>;
			defaultModels: Record<string, string>;
			allModelsHash: string;
		}> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/models/config`,
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to export models config",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{
				version: number;
				exportedAt: string;
				models: Array<{
					name: string;
					difficulty: string;
				}>;
				defaultModels: Record<string, string>;
				allModelsHash: string;
			}>(payload);
		},
		importModelsConfig: async (data: {
			version: number;
			models: Array<{
				name: string;
				difficulty: string;
			}>;
			defaultModels?: Record<string, string>;
			allModelsHash?: string;
		}): Promise<{
			imported: number;
			skipped: number;
			hashMismatch: boolean;
		}> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/models/config`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(data),
				},
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to import models config",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{
				imported: number;
				skipped: number;
				hashMismatch: boolean;
			}>(payload);
		},
		restartServe: async (options?: {
			force?: boolean;
		}): Promise<{ restarted: boolean }> => {
			const params = new URLSearchParams();
			if (options?.force) params.set("force", "true");
			const qs = params.toString() ? `?${params.toString()}` : "";
			const response = await fetch(
				`${this.baseUrl}/api/opencode/restart${qs}`,
				{
					method: "POST",
				},
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to restart opencode serve",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ restarted: boolean }>(payload);
		},
		getSessionTodos: async ({
			sessionId,
		}: {
			sessionId: string;
		}): Promise<{ todos: OpenCodeTodo[] }> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/sessions/${sessionId}/todos`,
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to fetch session todos",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{ todos: OpenCodeTodo[] }>(payload);
			return { todos: data.todos ?? [] };
		},
		sendMessage: async ({
			sessionId,
			message,
		}: {
			sessionId: string;
			message: string;
		}): Promise<{ success: boolean }> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/sessions/${sessionId}/messages`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ message }),
				},
			);
			if (!response.ok) {
				const errorMessage = await this.getErrorMessage(
					response,
					"Failed to send message",
				);
				throw new Error(errorMessage);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{ ok: boolean }>(payload);
			return { success: data.ok === true };
		},
		getSessionMessages: async ({
			sessionId,
			limit,
		}: {
			sessionId: string;
			limit?: number;
		}): Promise<{ messages: OpenCodeMessage[] }> => {
			const query =
				typeof limit === "number" && limit > 0
					? `?limit=${encodeURIComponent(String(limit))}`
					: "";
			const response = await fetch(
				`${this.baseUrl}/api/opencode/sessions/${sessionId}/messages${query}`,
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to fetch session messages",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{ messages: OpenCodeMessage[] }>(payload);
			return { messages: data.messages ?? [] };
		},
		getPendingPermissions: async ({
			sessionId,
		}: {
			sessionId: string;
		}): Promise<PermissionData[]> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/sessions/${sessionId}/permissions`,
			);
			if (!response.ok) {
				return [];
			}
			const payload = await response.json();
			const data = this.unwrapApiData<PermissionData[]>(payload);
			return Array.isArray(data) ? data : [];
		},
		replyQuestion: async ({
			sessionId,
			requestId,
			answers,
		}: {
			sessionId: string;
			requestId: string;
			answers: string[][];
		}): Promise<void> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/session/question/reply`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ sessionId, requestId, answers }),
				},
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to reply to question",
				);
				throw new Error(message);
			}
		},
		rejectQuestion: async ({
			sessionId,
			requestId,
		}: {
			sessionId: string;
			requestId: string;
		}): Promise<void> => {
			const response = await fetch(
				`${this.baseUrl}/api/opencode/session/question/reject`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ sessionId, requestId }),
				},
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to reject question",
				);
				throw new Error(message);
			}
		},
	};

	readonly schema = {
		fetch: async (url: string): Promise<{ schema: JSONSchema }> => {
			const response = await fetch(
				`${this.baseUrl}/api/schema?url=${encodeURIComponent(url)}`,
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to fetch schema",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ schema: JSONSchema }>(payload);
		},
	};

	readonly omc = {
		readConfig: async ({
			path,
		}: {
			path?: string;
		}): Promise<{ config: unknown; path?: string }> => {
			const query = path ? `?path=${encodeURIComponent(path)}` : "";
			const response = await fetch(`${this.baseUrl}/api/omc${query}`);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to read OMC config",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ config: unknown; path?: string }>(payload);
		},
		saveConfig: async ({
			path,
			config,
		}: {
			path: string;
			config: unknown;
		}): Promise<{ ok: boolean }> => {
			const response = await fetch(`${this.baseUrl}/api/omc`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path, config }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to save OMC config",
				);
				throw new Error(message);
			}
			return { ok: true };
		},
		listPresets: async ({
			path,
		}: {
			path: string;
		}): Promise<{ presets: string[] }> => {
			const response = await fetch(
				`${this.baseUrl}/api/omc/presets?path=${encodeURIComponent(path)}`,
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to list OMC presets",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ presets: string[] }>(payload);
		},
		savePreset: async ({
			path,
			presetName,
			config,
		}: {
			path: string;
			presetName: string;
			config: unknown;
		}): Promise<{ ok: boolean; presetPath?: string }> => {
			const response = await fetch(`${this.baseUrl}/api/omc/presets/save`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path, presetName, config }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to save OMC preset",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ ok: boolean; presetPath?: string }>(payload);
		},
		loadPreset: async ({
			path,
			presetName,
		}: {
			path: string;
			presetName: string;
		}): Promise<{ config: unknown }> => {
			const response = await fetch(`${this.baseUrl}/api/omc/presets/load`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path, presetName }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to load OMC preset",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ config: unknown }>(payload);
		},
		backup: async ({
			path,
		}: {
			path: string;
		}): Promise<{ ok: boolean; backupPath: string }> => {
			const response = await fetch(`${this.baseUrl}/api/omc/backup`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to backup OMC config",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ ok: boolean; backupPath: string }>(payload);
		},
		restore: async ({ path }: { path: string }): Promise<{ ok: boolean }> => {
			const response = await fetch(`${this.baseUrl}/api/omc/restore`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to restore OMC config",
				);
				throw new Error(message);
			}
			return { ok: true };
		},
	};

	readonly filesystem = {
		exists: async ({
			path,
		}: {
			path: string;
		}): Promise<{ exists: boolean }> => {
			const response = await fetch(
				`${this.baseUrl}/api/filesystem/exists?path=${encodeURIComponent(path)}`,
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to check path",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ exists: boolean }>(payload);
		},
	};

	readonly git = {
		push: async ({
			projectId,
		}: {
			projectId: string;
		}): Promise<{ success: boolean; output?: string }> => {
			const response = await fetch(`${this.baseUrl}/api/git/push`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ projectId }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(response, "Failed to push");
				throw new Error(message);
			}
			const payload = await response.json();
			return this.unwrapApiData<{ success: boolean; output?: string }>(payload);
		},
	};

	readonly database = {
		delete: async (_: Record<string, never>): Promise<{ ok: boolean }> => {
			const response = await fetch(`${this.baseUrl}/api/database/delete`, {
				method: "POST",
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to wipe database",
				);
				throw new Error(message);
			}
			return { ok: true };
		},
	};

	readonly appSetting = {
		getDefaultModel: async ({
			difficulty,
		}: {
			difficulty: "easy" | "medium" | "hard" | "epic";
		}): Promise<{ modelName: string | null }> => ({
			modelName: await this.getAppSetting(`defaultModel_${difficulty}`),
		}),
		setDefaultModel: async ({
			difficulty,
			modelName,
		}: {
			difficulty: "easy" | "medium" | "hard" | "epic";
			modelName: string;
		}): Promise<{ ok: boolean }> => ({
			ok: await this.setAppSetting(`defaultModel_${difficulty}`, modelName),
		}),
		getOhMyOpencodePath: async (): Promise<{ path: string | null }> => ({
			path: await this.getAppSetting("ohMyOpencodePath"),
		}),
		setOhMyOpencodePath: async ({
			path,
		}: {
			path: string;
		}): Promise<{ ok: boolean }> => ({
			ok: await this.setAppSetting("ohMyOpencodePath", path),
		}),
	};

	readonly artifact = {
		list: async ({
			runId,
		}: {
			runId: string;
		}): Promise<{ artifacts: Artifact[] }> => {
			const query = new URLSearchParams({ runId });
			const response = await fetch(
				`${this.baseUrl}/api/artifact/list?${query.toString()}`,
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to list artifacts",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{ artifacts?: Artifact[] }>(payload);
			return { artifacts: data.artifacts ?? [] };
		},
		get: async ({
			artifactId,
		}: {
			artifactId: string;
		}): Promise<{ artifact: Artifact | null }> => {
			const query = new URLSearchParams({ artifactId });
			const response = await fetch(
				`${this.baseUrl}/api/artifact/get?${query.toString()}`,
			);
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to fetch artifact",
				);
				throw new Error(message);
			}
			const payload = await response.json();
			const data = this.unwrapApiData<{ artifact?: Artifact | null }>(payload);
			return { artifact: data.artifact ?? null };
		},
	};

	readonly app = {
		openPath: async (path: string): Promise<{ success: true }> => {
			const response = await fetch(`${this.baseUrl}/api/app/open-path`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path }),
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to open path",
				);
				throw new Error(message);
			}
			return { success: true };
		},
		shutdown: async (options?: {
			force?: boolean;
		}): Promise<{ success: true }> => {
			const params = new URLSearchParams();
			if (options?.force) params.set("force", "true");
			const qs = params.toString() ? `?${params.toString()}` : "";
			const response = await fetch(`${this.baseUrl}/api/app/shutdown${qs}`, {
				method: "POST",
			});
			if (!response.ok) {
				const message = await this.getErrorMessage(
					response,
					"Failed to shutdown application",
				);
				throw new Error(message);
			}
			return { success: true };
		},
	};

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

	async updateTask(
		id: string,
		updates: UpdateTaskInput,
	): Promise<KanbanTask | null> {
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

	async moveTask(
		id: string,
		columnId: string,
		toIndex?: number,
	): Promise<KanbanTask | null> {
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

	async createTag(input: { name: string; color: string }): Promise<Tag> {
		const response = await fetch(`${this.baseUrl}/api/tags`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		});
		if (!response.ok) throw new Error("Failed to create tag");
		const payload = await response.json();
		return this.unwrapApiData<Tag>(payload);
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
	(window as Window & { api?: ApiClient }).api = api;
}
