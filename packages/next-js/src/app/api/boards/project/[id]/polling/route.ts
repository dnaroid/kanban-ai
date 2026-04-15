import { NextRequest, NextResponse } from "next/server";
import { boardRepo } from "@/server/repositories";
import { getRunsQueueManager } from "@/server/run/runs-queue-manager";

interface RouteParams {
	params: Promise<{ id: string }>;
}

async function extractViewerId(request: NextRequest): Promise<string> {
	const body = (await request.json().catch(() => null)) as {
		viewerId?: unknown;
	} | null;
	return typeof body?.viewerId === "string" ? body.viewerId.trim() : "";
}

export async function POST(request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const viewerId = await extractViewerId(request);
		if (viewerId.length === 0) {
			return NextResponse.json(
				{ success: false, error: "viewerId is required" },
				{ status: 400 },
			);
		}

		const board = boardRepo.getByProjectId(id);
		if (!board) {
			return NextResponse.json(
				{ success: false, error: "Board not found" },
				{ status: 404 },
			);
		}

		const manager = getRunsQueueManager();
		manager.startProjectBoardPolling(id, viewerId);

		return NextResponse.json({ success: true, data: { projectId: id } });
	} catch (error) {
		console.error("[API] Error starting board polling:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to start board polling" },
			{ status: 500 },
		);
	}
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const viewerId = await extractViewerId(request);
		if (viewerId.length === 0) {
			return NextResponse.json(
				{ success: false, error: "viewerId is required" },
				{ status: 400 },
			);
		}

		getRunsQueueManager().stopProjectBoardPolling(id, viewerId);

		return NextResponse.json({ success: true, data: { projectId: id } });
	} catch (error) {
		console.error("[API] Error stopping board polling:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to stop board polling" },
			{ status: 500 },
		);
	}
}
