import { NextRequest, NextResponse } from "next/server";
import { taskRepo } from "@/server/repositories";
import type { UpdateTaskInput } from "@/server/types";

interface RouteParams {
	params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const task = taskRepo.getById(id);

		if (!task) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		return NextResponse.json({ success: true, data: task });
	} catch (error) {
		console.error("[API] Error fetching task:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to fetch task" },
			{ status: 500 },
		);
	}
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const body = (await request.json()) as UpdateTaskInput;

		const task = taskRepo.update(id, body);

		if (!task) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		return NextResponse.json({ success: true, data: task });
	} catch (error) {
		console.error("[API] Error updating task:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to update task" },
			{ status: 500 },
		);
	}
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const deleted = taskRepo.delete(id);

		if (!deleted) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("[API] Error deleting task:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to delete task" },
			{ status: 500 },
		);
	}
}
