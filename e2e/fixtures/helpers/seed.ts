import {
	request,
	type APIRequestContext,
	type APIResponse,
} from "@playwright/test";

const DEFAULT_BASE_URL = "http://127.0.0.1:3100";
const RUN_COMPLETION_TIMEOUT_MS = 90_000;
const RUN_POLL_INTERVAL_MS = 1_000;

export interface SeedProject {
	id: string;
	name: string;
	path: string;
}

export interface SeedColumn {
	id: string;
	systemKey: string;
	name: string;
}

export interface SeedBoard {
	id: string;
	projectId: string;
	name: string;
	columns: SeedColumn[];
}

export interface SeedTask {
	id: string;
	boardId: string;
	title: string;
	description: string;
	status: string;
	columnId: string;
	priority: string;
	type: string;
}

export interface SeedRun {
	id: string;
	taskId: string;
	status: string;
}

export interface SeedData {
	projects: SeedProject[];
	boards: SeedBoard[];
	tasks: SeedTask[];
	runs: SeedRun[];
}

export type SeedScenario = "minimal" | "task-ready" | "task-with-run";

interface ApiFailure {
	success: false;
	error?: string;
}

interface ApiSuccess<T> {
	success: true;
	data: T;
}

type ApiRouteResponse<T> = ApiSuccess<T> | ApiFailure;

interface ProjectApiData {
	id: string;
	name: string;
	path: string;
}

interface BoardColumnApiData {
	id: string;
	name: string;
	systemKey: string;
}

interface BoardApiData {
	id: string;
	projectId: string;
	name: string;
	columns: BoardColumnApiData[];
}

interface TaskApiData {
	id: string;
	boardId: string;
	columnId: string;
	title: string;
	description: string | null;
	status: string;
	priority: string;
	type: string;
}

interface StartRunApiData {
	runId: string;
}

interface RunApiData {
	id: string;
	taskId: string;
	status: string;
}

interface RunGetApiData {
	run: RunApiData | null;
}

function isApiSuccess<T>(
	payload: ApiRouteResponse<T>,
): payload is ApiSuccess<T> {
	return payload.success === true;
}

async function parseApiResponse<T>(response: APIResponse): Promise<T> {
	const payload = (await response.json()) as ApiRouteResponse<T>;
	if (isApiSuccess(payload)) {
		return payload.data;
	}

	const fallback = `${response.status()} ${response.statusText()}`;
	throw new Error(payload.error?.trim() || fallback);
}

async function ensureSuccess<T>(response: APIResponse): Promise<T> {
	if (!response.ok()) {
		const body = await response.text();
		throw new Error(
			`API request failed (${response.status()} ${response.statusText()}): ${body}`,
		);
	}

	return parseApiResponse<T>(response);
}

async function createProject(
	apiContext: APIRequestContext,
	projectPath: string,
): Promise<SeedProject> {
	const name = `E2E Project ${new Date().toISOString()}`;
	const created = await ensureSuccess<ProjectApiData>(
		await apiContext.post("/api/projects", {
			data: {
				name,
				path: projectPath,
			},
		}),
	);

	return {
		id: created.id,
		name: created.name,
		path: created.path,
	};
}

async function getBoardForProject(
	apiContext: APIRequestContext,
	projectId: string,
): Promise<SeedBoard> {
	const board = await ensureSuccess<BoardApiData>(
		await apiContext.get(
			`/api/boards/project/${encodeURIComponent(projectId)}`,
		),
	);

	return {
		id: board.id,
		projectId: board.projectId,
		name: board.name,
		columns: board.columns.map((column) => ({
			id: column.id,
			systemKey: column.systemKey,
			name: column.name,
		})),
	};
}

function requireColumn(board: SeedBoard, systemKey: string): SeedColumn {
	const column = board.columns.find((item) => item.systemKey === systemKey);
	if (!column) {
		throw new Error(
			`Board ${board.id} is missing required column '${systemKey}'`,
		);
	}

	return column;
}

async function createTask(
	apiContext: APIRequestContext,
	input: {
		projectId: string;
		boardId: string;
		columnId: string;
		title: string;
		description: string;
	},
): Promise<SeedTask> {
	const task = await ensureSuccess<TaskApiData>(
		await apiContext.post("/api/tasks", {
			data: {
				projectId: input.projectId,
				boardId: input.boardId,
				columnId: input.columnId,
				title: input.title,
				description: input.description,
			},
		}),
	);

	return {
		id: task.id,
		boardId: task.boardId,
		title: task.title,
		description: task.description ?? "",
		status: task.status,
		columnId: task.columnId,
		priority: task.priority,
		type: task.type,
	};
}

async function startRun(
	apiContext: APIRequestContext,
	taskId: string,
): Promise<string> {
	const started = await ensureSuccess<StartRunApiData>(
		await apiContext.post("/api/run/start", {
			data: {
				taskId,
				forceDirtyGit: true,
			},
		}),
	);

	return started.runId;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCompletedRun(
	apiContext: APIRequestContext,
	runId: string,
	timeoutMs: number = RUN_COMPLETION_TIMEOUT_MS,
): Promise<RunApiData> {
	const deadline = Date.now() + timeoutMs;
	let lastStatus = "queued";

	while (Date.now() < deadline) {
		const result = await ensureSuccess<RunGetApiData>(
			await apiContext.get(`/api/run/get?runId=${encodeURIComponent(runId)}`),
		);

		if (result.run) {
			lastStatus = result.run.status;
			if (result.run.status === "completed") {
				return result.run;
			}
		}

		await sleep(RUN_POLL_INTERVAL_MS);
	}

	throw new Error(
		`Run ${runId} did not reach completed status within ${timeoutMs}ms (last status: ${lastStatus})`,
	);
}

function createProjectPath(): string {
	const randomSuffix = globalThis.crypto.randomUUID().slice(0, 8);
	return `${process.cwd()}/.e2e-seed-projects/${Date.now()}-${randomSuffix}`;
}

export async function seedScenario(
	scenario: SeedScenario,
	baseURL: string = DEFAULT_BASE_URL,
): Promise<SeedData> {
	const apiContext = await request.newContext({ baseURL });
	const data: SeedData = { projects: [], boards: [], tasks: [], runs: [] };

	try {
		const projectPath = createProjectPath();
		const project = await createProject(apiContext, projectPath);
		data.projects.push(project);

		const board = await getBoardForProject(apiContext, project.id);
		data.boards.push(board);

		switch (scenario) {
			case "minimal": {
				break;
			}
			case "task-ready": {
				const readyColumn = requireColumn(board, "ready");
				const firstTask = await createTask(apiContext, {
					projectId: project.id,
					boardId: board.id,
					columnId: readyColumn.id,
					title: "Ready task #1",
					description: "Seeded task in ready column",
				});
				const secondTask = await createTask(apiContext, {
					projectId: project.id,
					boardId: board.id,
					columnId: readyColumn.id,
					title: "Ready task #2",
					description: "Second seeded task in ready column",
				});
				data.tasks.push(firstTask, secondTask);
				break;
			}
			case "task-with-run": {
				const readyColumn = requireColumn(board, "ready");
				const task = await createTask(apiContext, {
					projectId: project.id,
					boardId: board.id,
					columnId: readyColumn.id,
					title: "Task with completed run",
					description: "Task seeded for run completion scenario",
				});
				data.tasks.push(task);

				const runId = await startRun(apiContext, task.id);
				const completedRun = await waitForCompletedRun(apiContext, runId);
				data.runs.push({
					id: completedRun.id,
					taskId: completedRun.taskId,
					status: completedRun.status,
				});
				break;
			}
		}

		return data;
	} finally {
		await apiContext.dispose();
	}
}
