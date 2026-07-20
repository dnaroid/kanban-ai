import { NextResponse } from "next/server";
import { getAgentDir, loadSkills } from "@earendil-works/pi-coding-agent";

export async function GET(): Promise<Response> {
	try {
		const { skills: loadedSkills } = loadSkills({
			cwd: process.cwd(),
			agentDir: getAgentDir(),
			skillPaths: [],
			includeDefaults: true,
		});
		const skills = [...new Set(loadedSkills.map((skill) => skill.name))].sort(
			(a, b) => a.localeCompare(b),
		);

		return NextResponse.json({
			success: true,
			data: { skills },
		});
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to fetch Pi skills";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
