import { NextResponse } from "next/server";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { getOpencodeService } from "@/server/opencode/opencode-service";

type SkillEntry = { name?: unknown; id?: unknown };

function normalizeSkills(input: unknown): string[] {
	if (!Array.isArray(input)) {
		return [];
	}

	const normalized = input
		.map((entry) => {
			if (typeof entry === "string") {
				return entry.trim();
			}
			if (entry && typeof entry === "object") {
				const item = entry as SkillEntry;
				if (typeof item.name === "string") {
					return item.name.trim();
				}
				if (typeof item.id === "string") {
					return item.id.trim();
				}
			}
			return "";
		})
		.filter((value) => value.length > 0);

	return [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
}

export async function GET(): Promise<Response> {
	try {
		const service = getOpencodeService();
		await service.start();

		const baseUrl =
			process.env.OPENCODE_URL ?? `http://127.0.0.1:${service.getPort()}`;
		const client = createOpencodeClient({
			baseUrl,
			throwOnError: true,
			directory: process.cwd(),
		});

		const response = await client.app.skills();
		const payload =
			response && typeof response === "object" && "data" in response
				? (response as { data?: unknown }).data
				: response;
		const skills = normalizeSkills(payload);

		return NextResponse.json({
			success: true,
			data: { skills },
		});
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to fetch OpenCode skills";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
