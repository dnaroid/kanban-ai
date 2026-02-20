import { NextResponse } from "next/server";
import { roleRepo } from "@/server/repositories/role";

export async function POST(request: Request): Promise<Response> {
	try {
		const body = await request.json();
		const { id, name, description, preset_json } = body;

		if (!id || !name || !preset_json) {
			return NextResponse.json(
				{
					success: false,
					error: "Missing required fields (id, name, preset_json)",
				},
				{ status: 400 },
			);
		}

		// Basic JSON validation for preset_json
		try {
			JSON.parse(preset_json);
		} catch {
			return NextResponse.json(
				{ success: false, error: "Invalid JSON in preset_json" },
				{ status: 400 },
			);
		}

		roleRepo.upsert({ id, name, description: description || "", preset_json });

		return NextResponse.json({ success: true });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to save role";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
