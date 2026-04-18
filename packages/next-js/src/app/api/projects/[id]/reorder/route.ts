import { NextRequest, NextResponse } from "next/server";
import { projectRepo } from "@/server/repositories";

interface RouteParams {
	params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const body = (await request.json()) as { direction: "up" | "down" };

		if (
			!body.direction ||
			(body.direction !== "up" && body.direction !== "down")
		) {
			return NextResponse.json(
				{ success: false, error: "Direction must be 'up' or 'down'" },
				{ status: 400 },
			);
		}

		const project = projectRepo.reorder(id, body.direction);

		if (!project) {
			return NextResponse.json(
				{ success: false, error: "Project not found or cannot be moved" },
				{ status: 400 },
			);
		}

		return NextResponse.json({ success: true, data: project });
	} catch (error) {
		console.error("[API] Error reordering project:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to reorder project" },
			{ status: 500 },
		);
	}
}
