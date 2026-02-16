import { boardRepo } from "@/server/repositories/board";
import { taskRepo } from "@/server/repositories/task";
import type { Run, RunStatus } from "@/types/ipc";

const allowedTaskTypes = [
	"feature",
	"bug",
	"chore",
	"improvement",
	"task",
] as const;
const allowedDifficulties = ["easy", "medium", "hard", "epic"] as const;

type AllowedTaskType = (typeof allowedTaskTypes)[number];
type AllowedDifficulty = (typeof allowedDifficulties)[number];

type ParsedUserStoryResponse = {
	description: string;
	title?: string;
	tags?: string[];
	type?: AllowedTaskType;
	difficulty?: AllowedDifficulty;
};

function parseUserStoryResponse(content: string): ParsedUserStoryResponse {
	const metaMatch = content.match(/<META>([\s\S]*?)<\/META>/i);
	const storyMatch = content.match(/<STORY>([\s\S]*?)<\/STORY>/i);

	const storyBody = storyMatch?.[1]?.trim();
	const fallback = metaMatch
		? content.replace(metaMatch[0], "").trim()
		: content.trim();
	const description = storyBody && storyBody.length > 0 ? storyBody : fallback;

	const result: ParsedUserStoryResponse = { description };

	const titleMatch = description.match(/^##\s*Название\s*\n+(.+)$/im);
	if (titleMatch?.[1]) {
		let title = titleMatch[1].trim();
		title = title.replace(/^[\s>*_-]+/, "").replace(/[\s>*_-]+$/, "");
		if (
			(title.startsWith("**") && title.endsWith("**")) ||
			(title.startsWith("__") && title.endsWith("__"))
		) {
			title = title.slice(2, -2).trim();
		}
		title = title.replace(/^\*+/, "").replace(/\*+$/, "").trim();
		title = title.replace(/^_+/, "").replace(/_+$/, "").trim();
		if (title.length > 0) {
			result.title = title;
		}
	}

	if (!metaMatch?.[1]) {
		return result;
	}

	let rawMeta = metaMatch[1].trim();
	rawMeta = rawMeta
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "")
		.trim();

	if (!rawMeta.startsWith("{") || !rawMeta.endsWith("}")) {
		return result;
	}

	try {
		const meta = JSON.parse(rawMeta) as {
			tags?: unknown;
			type?: unknown;
			difficulty?: unknown;
		};

		if (Array.isArray(meta.tags)) {
			const tags = meta.tags
				.filter((value): value is string => typeof value === "string")
				.map((value) => value.trim())
				.filter((value) => value.length > 0);
			if (tags.length > 0) {
				result.tags = [...new Set(tags)];
			}
		}

		if (typeof meta.type === "string") {
			const typeValue = meta.type.trim();
			if ((allowedTaskTypes as readonly string[]).includes(typeValue)) {
				result.type = typeValue as AllowedTaskType;
			}
		}

		if (typeof meta.difficulty === "string") {
			const difficultyValue = meta.difficulty.trim();
			if (
				(allowedDifficulties as readonly string[]).includes(difficultyValue)
			) {
				result.difficulty = difficultyValue as AllowedDifficulty;
			}
		}
	} catch {
		return result;
	}

	return result;
}

function resolveColumnIdBySystemKey(
	boardId: string,
	systemKey: "todo" | "in_progress" | "done",
): string | null {
	const board = boardRepo.getById(boardId);
	if (!board) {
		return null;
	}

	const column = board.columns.find((item) => item.systemKey === systemKey);
	return column?.id ?? null;
}

function isTaskDescriptionImproveRun(run: Run): boolean {
	return run.metadata?.kind === "task-description-improve";
}

export class RunTaskProjector {
	public projectRunStarted(run: Run): void {
		if (isTaskDescriptionImproveRun(run)) {
			return;
		}

		const task = taskRepo.getById(run.taskId);
		if (!task) {
			return;
		}

		const inProgressColumnId = resolveColumnIdBySystemKey(
			task.boardId,
			"in_progress",
		);

		taskRepo.update(task.id, {
			status: "running",
			columnId: inProgressColumnId ?? task.columnId,
		});
	}

	public projectRunOutcome(
		run: Run,
		status: RunStatus,
		assistantContent: string,
	): void {
		if (isTaskDescriptionImproveRun(run) && status === "completed") {
			const parsed = parseUserStoryResponse(assistantContent);
			const patch: Parameters<typeof taskRepo.update>[1] = {
				status: "queued",
				description: parsed.description,
				descriptionMd: parsed.description,
			};

			if (parsed.title) {
				patch.title = parsed.title;
			}
			if (parsed.tags && parsed.tags.length > 0) {
				patch.tags = JSON.stringify(parsed.tags);
			}
			if (parsed.type) {
				patch.type = parsed.type;
			}
			if (parsed.difficulty) {
				patch.difficulty = parsed.difficulty;
			}

			taskRepo.update(run.taskId, patch);
			return;
		}

		if (isTaskDescriptionImproveRun(run)) {
			if (status === "failed" || status === "timeout") {
				taskRepo.update(run.taskId, { status: "failed" });
			}
			return;
		}

		const task = taskRepo.getById(run.taskId);
		if (!task) {
			return;
		}

		if (status === "completed") {
			const doneColumnId = resolveColumnIdBySystemKey(task.boardId, "done");
			taskRepo.update(task.id, {
				status: "done",
				columnId: doneColumnId ?? task.columnId,
			});
			return;
		}

		if (status === "failed" || status === "timeout") {
			taskRepo.update(task.id, { status: "failed" });
			return;
		}

		if (status === "paused") {
			taskRepo.update(task.id, { status: "paused" });
			return;
		}

		if (status === "cancelled") {
			const todoColumnId = resolveColumnIdBySystemKey(task.boardId, "todo");
			taskRepo.update(task.id, {
				status: "queued",
				columnId: todoColumnId ?? task.columnId,
			});
		}
	}
}

let runTaskProjector: RunTaskProjector | null = null;

export function getRunTaskProjector(): RunTaskProjector {
	if (!runTaskProjector) {
		runTaskProjector = new RunTaskProjector();
	}

	return runTaskProjector;
}
