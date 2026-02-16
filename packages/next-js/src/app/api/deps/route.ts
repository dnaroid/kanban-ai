import { NextResponse } from "next/server";
import { taskLinkRepo, taskRepo } from "@/server/repositories";
import type { TaskLinkType } from "@/types/kanban";

const VALID_LINK_TYPES: readonly TaskLinkType[] = ["blocks", "relates"];

interface AddDependencyBody {
	fromTaskId: string;
	toTaskId: string;
	type: TaskLinkType;
}

function isTaskLinkType(value: unknown): value is TaskLinkType {
	return (
		typeof value === "string" &&
		VALID_LINK_TYPES.includes(value as TaskLinkType)
	);
}

function introducesBlocksCycle(
	projectId: string,
	fromTaskId: string,
	toTaskId: string,
): boolean {
	const links = taskLinkRepo.listByProject(projectId, "blocks");
	const adjacency = new Map<string, Set<string>>();

	for (const link of links) {
		if (!adjacency.has(link.fromTaskId))
			adjacency.set(link.fromTaskId, new Set());
		adjacency.get(link.fromTaskId)!.add(link.toTaskId);
	}

	if (!adjacency.has(fromTaskId)) adjacency.set(fromTaskId, new Set());
	adjacency.get(fromTaskId)!.add(toTaskId);

	const visited = new Set<string>();
	const stack = [toTaskId];

	while (stack.length > 0) {
		const current = stack.pop();
		if (!current || visited.has(current)) continue;
		if (current === fromTaskId) return true;

		visited.add(current);
		const children = adjacency.get(current);
		if (!children) continue;
		for (const child of children) {
			if (!visited.has(child)) stack.push(child);
		}
	}

	return false;
}

export async function GET(request: Request) {
	try {
		const url = new URL(request.url);
		const taskId = url.searchParams.get("taskId");

		if (!taskId) {
			return NextResponse.json(
				{ success: false, error: "Missing required query parameter: taskId" },
				{ status: 400 },
			);
		}

		const links = taskLinkRepo.listByTaskId(taskId);
		return NextResponse.json({ success: true, data: { links } });
	} catch (error) {
		console.error("GET /api/deps failed", error);
		return NextResponse.json(
			{ success: false, error: "Failed to list dependencies" },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as Partial<AddDependencyBody>;

		if (
			typeof body.fromTaskId !== "string" ||
			typeof body.toTaskId !== "string" ||
			!isTaskLinkType(body.type)
		) {
			return NextResponse.json(
				{
					success: false,
					error:
						"Invalid payload. Expected { fromTaskId: string, toTaskId: string, type: 'blocks' | 'relates' }",
				},
				{ status: 400 },
			);
		}

		if (body.fromTaskId === body.toTaskId) {
			return NextResponse.json(
				{ success: false, error: "Cannot create a self dependency" },
				{ status: 400 },
			);
		}

		const fromTask = taskRepo.getById(body.fromTaskId);
		const toTask = taskRepo.getById(body.toTaskId);

		if (!fromTask || !toTask) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		if (fromTask.projectId !== toTask.projectId) {
			return NextResponse.json(
				{
					success: false,
					error:
						"Dependencies can only be created between tasks in one project",
				},
				{ status: 400 },
			);
		}

		const existing = taskLinkRepo.findByEndpoints(
			body.fromTaskId,
			body.toTaskId,
			body.type,
		);
		if (existing) {
			return NextResponse.json({ success: true, data: { link: existing } });
		}

		if (
			body.type === "blocks" &&
			introducesBlocksCycle(fromTask.projectId, body.fromTaskId, body.toTaskId)
		) {
			return NextResponse.json(
				{ success: false, error: "This dependency would create a cycle" },
				{ status: 409 },
			);
		}

		const link = taskLinkRepo.create({
			projectId: fromTask.projectId,
			fromTaskId: body.fromTaskId,
			toTaskId: body.toTaskId,
			linkType: body.type,
		});

		return NextResponse.json(
			{ success: true, data: { link } },
			{ status: 201 },
		);
	} catch (error) {
		console.error("POST /api/deps failed", error);
		return NextResponse.json(
			{ success: false, error: "Failed to create dependency" },
			{ status: 500 },
		);
	}
}
