import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";

interface PermissionReplyBody {
	runId?: unknown;
	permissionId?: unknown;
	response?: unknown;
}

const validResponses = new Set(["once", "always", "reject"]);

export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json()) as PermissionReplyBody;
		const runId = typeof body.runId === "string" ? body.runId.trim() : "";
		const permissionId =
			typeof body.permissionId === "string" ? body.permissionId.trim() : "";
		const response =
			typeof body.response === "string" ? body.response.trim() : "";

		if (!runId) {
			return NextResponse.json(
				{ success: false, error: "runId is required" },
				{ status: 400 },
			);
		}

		if (!permissionId) {
			return NextResponse.json(
				{ success: false, error: "permissionId is required" },
				{ status: 400 },
			);
		}

		if (!validResponses.has(response)) {
			return NextResponse.json(
				{
					success: false,
					error: `response must be one of: ${[...validResponses].join(", ")}`,
				},
				{ status: 400 },
			);
		}

		await runService.replyPermission(
			runId,
			permissionId,
			response as "once" | "always" | "reject",
		);
		return NextResponse.json({
			success: true,
			data: { runId, permissionId, response },
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to reply to permission";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
