import { NextResponse } from "next/server";
import { projectUpdatesService } from "@/server/services/project-updates-service";

export async function GET() {
	try {
		return NextResponse.json({
			success: true,
			data: {
				projectIds: projectUpdatesService.getUpdatedProjectIds(),
			},
		});
	} catch (error) {
		console.error("[API] Error fetching project updates:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to fetch project updates" },
			{ status: 500 },
		);
	}
}
