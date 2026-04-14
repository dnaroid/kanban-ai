import { NextResponse } from "next/server";
import { getOpencodeService } from "@/server/opencode/opencode-service";

export async function POST(): Promise<Response> {
	try {
		const service = getOpencodeService();
		await service.stop();

		// Defer process.exit so the HTTP response can flush out first
		setImmediate(() => {
			process.exit(0);
		});

		return NextResponse.json({ success: true, data: { shutdown: true } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to shutdown application";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
