import { NextRequest, NextResponse } from "next/server";
import { taskRepo } from "@/server/repositories";

interface RouteParams {
	params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const body = await request.json();
		const { columnId, toIndex } = body;

		if (!columnId) {
			return NextResponse.json(
				{ success: false, error: "columnId is required" },
				{ status: 400 },
			);
		}

		const task = taskRepo.move(id, columnId, toIndex);

		if (!task) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		return NextResponse.json({ success: true, data: task });
	} catch (error) {
		console.error("[API] Error moving task:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to move task" },
			{ status: 500 },
		);
	}
}
