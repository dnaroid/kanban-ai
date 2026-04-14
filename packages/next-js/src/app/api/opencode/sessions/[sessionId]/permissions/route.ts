import { NextResponse } from "next/server";
import { listPendingPermissions } from "@/server/opencode/session-store";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	try {
		const { sessionId } = await params;
		if (!sessionId) {
			return NextResponse.json(
				{ success: false, error: "sessionId is required" },
				{ status: 400 },
			);
		}

		const permissions = await listPendingPermissions(sessionId);
		return NextResponse.json({ success: true, data: permissions });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to list pending permissions";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
