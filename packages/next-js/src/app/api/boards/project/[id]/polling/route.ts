import { NextRequest, NextResponse } from "next/server";
import { boardRepo } from "@/server/repositories";
import { runService } from "@/server/run/run-service";

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

		runService.startProjectBoardPolling(id, viewerId);

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

		runService.stopProjectBoardPolling(id, viewerId);

		return NextResponse.json({ success: true, data: { projectId: id } });
	} catch (error) {
		console.error("[API] Error stopping board polling:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to stop board polling" },
			{ status: 500 },
		);
	}
}
