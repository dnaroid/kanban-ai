import { NextRequest, NextResponse } from "next/server";

import {
	getWorkflowConfig,
	parseWorkflowConfig,
	updateWorkflowConfig,
} from "@/server/workflow/task-workflow-manager";

export async function GET() {
	try {
		const config = getWorkflowConfig();
		return NextResponse.json({ success: true, data: config });
	} catch (error) {
		console.error("[API] Error loading workflow config:", error);
		return NextResponse.json(
			{ success: false, error: "Failed to load workflow configuration" },
			{ status: 500 },
		);
	}
}

export async function PUT(request: NextRequest) {
	try {
		const body = await request.json();
		const parsedConfig = parseWorkflowConfig(body);

		if (!parsedConfig) {
			return NextResponse.json(
				{ success: false, error: "Invalid workflow configuration payload" },
				{ status: 400 },
			);
		}

		updateWorkflowConfig(parsedConfig);
		const savedConfig = getWorkflowConfig();

		return NextResponse.json({ success: true, data: savedConfig });
	} catch (error) {
		console.error("[API] Error saving workflow config:", error);
		const message =
			error instanceof Error
				? error.message
				: "Failed to update workflow configuration";

		return NextResponse.json(
			{ success: false, error: message },
			{ status: 400 },
		);
	}
}
