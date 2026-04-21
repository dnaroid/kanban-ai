import { NextResponse } from "next/server";
import { setFakeOpencodeScenario } from "@/server/opencode/fake-session-manager";

interface SetScenarioBody {
	scenario?: unknown;
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json()) as SetScenarioBody;
		const scenario =
			typeof body.scenario === "string" ? body.scenario.trim() : "";

		if (!scenario) {
			return NextResponse.json(
				{ success: false, error: "scenario is required" },
				{ status: 400 },
			);
		}

		const normalizedScenario = setFakeOpencodeScenario(scenario);
		process.env.AI_RUNTIME_FAKE_SCENARIO = normalizedScenario;
		return NextResponse.json({
			success: true,
			data: { scenario: normalizedScenario },
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to set scenario";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
