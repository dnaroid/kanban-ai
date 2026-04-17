import { NextRequest, NextResponse } from "next/server";
import { boardRepo } from "@/server/repositories";

interface RouteParams {
	params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const board = boardRepo.getByProjectId(id);

		if (!board) {
			return NextResponse.json(
				{ success: false, error: "Board not found" },
				{ status: 404 },
			);
		}

		return NextResponse.json({ success: true, data: board });
	} catch (error) {
		console.error("[API] Error fetching board:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to fetch board" },
			{ status: 500 },
		);
	}
}
