import { NextResponse } from "next/server";
import { taskRepo } from "@/server/repositories";

export async function GET() {
	try {
		const statusRows = taskRepo.getProjectIdsWithAttentionStatuses() as Array<{
			projectId: string;
		}>;

		return NextResponse.json({
			success: true,
			data: {
				projectIds: statusRows.map((r) => r.projectId),
			},
		});
	} catch (error) {
		console.error("[API] Error fetching project attention:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to fetch project attention" },
			{ status: 500 },
		);
	}
}
