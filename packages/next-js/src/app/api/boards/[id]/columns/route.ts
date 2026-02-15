import { NextRequest, NextResponse } from "next/server";
import { boardRepo } from "@/server/repositories";

interface RouteParams {
	params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const body = await request.json();
		const { columns } = body;

		if (!Array.isArray(columns)) {
			return NextResponse.json(
				{ success: false, error: "columns must be an array" },
				{ status: 400 },
			);
		}

		const board = boardRepo.updateColumns(id, columns);

		if (!board) {
			return NextResponse.json(
				{ success: false, error: "Board not found" },
				{ status: 404 },
			);
		}

		return NextResponse.json({ success: true, data: board.columns });
	} catch (error) {
		console.error("[API] Error updating columns:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to update columns" },
			{ status: 500 },
		);
	}
}
