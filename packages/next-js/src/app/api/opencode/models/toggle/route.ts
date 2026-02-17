import { NextResponse } from "next/server";
import { toggleModel } from "@/server/opencode/models-store";

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as {
			name?: string;
			enabled?: boolean;
		};

		if (typeof body.name !== "string" || typeof body.enabled !== "boolean") {
			return NextResponse.json(
				{ success: false, error: "name and enabled are required" },
				{ status: 400 },
			);
		}

		const model = toggleModel(body.name, body.enabled);
		if (!model) {
			return NextResponse.json(
				{ success: false, error: `Model "${body.name}" not found` },
				{ status: 404 },
			);
		}

		return NextResponse.json({ success: true, data: { model } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to toggle model";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
