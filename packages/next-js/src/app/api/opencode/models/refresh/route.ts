import { NextResponse } from "next/server";
import { refreshModelsFromProviders } from "@/server/opencode/models-store";

export async function POST() {
	try {
		const models = await refreshModelsFromProviders();
		return NextResponse.json({ success: true, data: { models } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to refresh models";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
