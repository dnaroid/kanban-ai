import { NextResponse } from "next/server";
import { getOpencodeService } from "@/server/opencode/opencode-service";

export async function POST(): Promise<Response> {
	try {
		const service = getOpencodeService();
		await service.stop();
		await service.start();
		return NextResponse.json({ success: true, data: { restarted: true } });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to restart opencode serve";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
