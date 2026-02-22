import { NextResponse } from "next/server";
import type { Artifact } from "@/types/ipc";
import { artifactRepo } from "@/server/repositories/artifact";

export async function GET(request: Request): Promise<Response> {
	try {
		const { searchParams } = new URL(request.url);
		const artifactId = searchParams.get("artifactId")?.trim();

		if (!artifactId) {
			return NextResponse.json(
				{ success: false, error: "artifactId query parameter is required" },
				{ status: 400 },
			);
		}

		const artifact = artifactRepo.getById(artifactId);
		const data: { artifact: Artifact | null } = { artifact };
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to get artifact";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
