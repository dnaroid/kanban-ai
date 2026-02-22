import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";

export async function GET(): Promise<Response> {
	try {
		const stats = runService.getQueueStats();
		return NextResponse.json({ success: true, data: stats });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to get queue stats";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
