import type { Artifact, OpenCodeMessage, OpenCodeTodo, Run } from "@/types/ipc";

// Mock implementation of the Electron IPC API for Next.js environment
// In the future, these should be replaced with real API calls to the Next.js backend

async function getErrorMessage(
	response: Response,
	fallback: string,
): Promise<string> {
	try {
		const payload = (await response.json()) as {
			error?: string;
			message?: string;
		};
		if (typeof payload.error === "string") return payload.error;
		if (typeof payload.message === "string") return payload.message;
	} catch {
		return fallback;
	}

	return fallback;
}

function unwrapData<T>(payload: T | { data?: T }): T {
	if (payload && typeof payload === "object" && "data" in payload) {
		const data = (payload as { data?: T }).data;
		if (data !== undefined) {
			return data;
		}
	}

	return payload as T;
}

export const api = {
	run: {
		listByTask: async ({
			taskId,
		}: {
			taskId: string;
		}): Promise<{ runs: Run[] }> => {
			console.log("Mock listByTask", taskId);
			return { runs: [] };
		},
		start: async ({
			taskId,
			roleId,
			mode,
		}: {
			taskId: string;
			roleId?: string;
			mode?: string;
		}) => {
			console.log("Mock start run", taskId, roleId, mode);
			return { runId: "mock-run-" + Date.now() };
		},
		cancel: async ({ runId }: { runId: string }) => {
			console.log("Mock cancel run", runId);
			return { success: true };
		},
		delete: async ({ runId }: { runId: string }) => {
			console.log("Mock delete run", runId);
			return { success: true };
		},
		get: async ({ runId }: { runId: string }): Promise<{ run: Run | null }> => {
			console.log("Mock get run", runId);
			return { run: null };
		},
	},
	roles: {
		list: async () => {
			console.log("Mock list roles");
			return { roles: [] };
		},
	},
	opencode: {
		getSessionTodos: async ({
			sessionId,
		}: {
			sessionId: string;
		}): Promise<{ todos: OpenCodeTodo[] }> => {
			const response = await fetch(
				`/api/opencode/sessions/${encodeURIComponent(sessionId)}/todos`,
			);
			if (!response.ok) {
				throw new Error(
					await getErrorMessage(response, "Failed to fetch session todos"),
				);
			}

			const payload = (await response.json()) as {
				data?: { todos?: OpenCodeTodo[] };
			};
			const data = unwrapData<{ todos?: OpenCodeTodo[] }>(payload);
			return { todos: data.todos ?? [] };
		},
		sendMessage: async ({
			sessionId,
			message,
		}: {
			sessionId: string;
			message: string;
		}) => {
			const response = await fetch(
				`/api/opencode/sessions/${encodeURIComponent(sessionId)}/messages`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ message }),
				},
			);

			if (!response.ok) {
				throw new Error(
					await getErrorMessage(response, "Failed to send message"),
				);
			}

			const payload = (await response.json()) as { data?: { ok?: boolean } };
			const data = unwrapData<{ ok?: boolean }>(payload);
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
				`/api/opencode/sessions/${encodeURIComponent(sessionId)}/messages${query}`,
			);
			if (!response.ok) {
				throw new Error(
					await getErrorMessage(response, "Failed to fetch session messages"),
				);
			}

			const payload = (await response.json()) as {
				data?: { messages?: OpenCodeMessage[] };
			};
			const data = unwrapData<{ messages?: OpenCodeMessage[] }>(payload);
			return { messages: data.messages ?? [] };
		},
	},
	artifact: {
		list: async ({
			runId,
		}: {
			runId: string;
		}): Promise<{ artifacts: Artifact[] }> => {
			console.log("Mock list artifacts", runId);
			return { artifacts: [] };
		},
		get: async ({
			artifactId,
		}: {
			artifactId: string;
		}): Promise<{ artifact: Artifact | null }> => {
			console.log("Mock get artifact", artifactId);
			return { artifact: null };
		},
	},
	app: {
		openPath: async (path: string) => {
			console.log("Mock openPath", path);
		},
	},
};
