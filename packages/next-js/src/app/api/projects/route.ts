import { NextRequest, NextResponse } from "next/server";
import { projectRepo, boardRepo } from "@/server/repositories";
import type { CreateProjectInput } from "@/server/types";

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

export async function GET() {
	try {
		const projects = projectRepo.getAll();
		return NextResponse.json({ success: true, data: projects });
	} catch (error) {
		console.error("[API] Error fetching projects:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to fetch projects" },
			{ status: 500 },
		);
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json()) as CreateProjectInput;

		if (!body.name || !body.path) {
			return NextResponse.json(
				{ success: false, error: "Name and path are required" },
				{ status: 400 },
			);
		}

		const project = projectRepo.create({
			name: body.name,
			path: body.path,
			color: body.color,
		});

		boardRepo.create({
			projectId: project.id,
			name: "Main Board",
		});

		return NextResponse.json({ success: true, data: project });
	} catch (error) {
		console.error("[API] Error creating project:", error);
		const message = getErrorMessage(error);

		if (
			message.includes("UNIQUE constraint failed: projects.path") ||
			message.includes("SQLITE_CONSTRAINT_UNIQUE")
		) {
			return NextResponse.json(
				{ success: false, error: "Project path already exists" },
				{ status: 409 },
			);
		}

		return NextResponse.json(
			{
				success: false,
				error: "Failed to create project",
				...(process.env.NODE_ENV !== "production" ? { details: message } : {}),
			},
			{ status: 500 },
		);
	}
}
