import { NextRequest, NextResponse } from "next/server";
import { projectRepo } from "@/server/repositories";
import type { UpdateProjectInput } from "@/server/types";
import { publishSseEvent } from "@/server/events/sse-broker";

interface RouteParams {
	params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const project = projectRepo.getById(id);

		if (!project) {
			return NextResponse.json(
				{ success: false, error: "Project not found" },
				{ status: 404 },
			);
		}

		return NextResponse.json({ success: true, data: project });
	} catch (error) {
		console.error("[API] Error fetching project:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to fetch project" },
			{ status: 500 },
		);
	}
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const body = (await request.json()) as UpdateProjectInput;

		const project = projectRepo.update(id, body);

		if (!project) {
			return NextResponse.json(
				{ success: false, error: "Project not found" },
				{ status: 404 },
			);
		}

		publishSseEvent("project:event", {
			projectId: project.id,
			eventType: "project:updated",
			updatedAt: project.updatedAt,
		});

		return NextResponse.json({ success: true, data: project });
	} catch (error) {
		console.error("[API] Error updating project:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to update project" },
			{ status: 500 },
		);
	}
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
	try {
		const { id } = await params;
		const deleted = projectRepo.delete(id);

		if (!deleted) {
			return NextResponse.json(
				{ success: false, error: "Project not found" },
				{ status: 404 },
			);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("[API] Error deleting project:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to delete project" },
			{ status: 500 },
		);
	}
}
