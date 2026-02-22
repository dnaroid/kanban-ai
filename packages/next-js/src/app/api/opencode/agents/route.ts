import { NextResponse } from "next/server";
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { getOpencodeService } from "@/server/opencode/opencode-service";

type AgentEntry = {
	name?: unknown;
	id?: unknown;
	label?: unknown;
	title?: unknown;
};

function normalizeAgents(input: unknown): Array<{ id: string; name: string }> {
	if (!Array.isArray(input)) {
		return [];
	}

	const normalized = input
		.map((entry) => {
			if (typeof entry === "string") {
				const id = entry.trim();
				if (!id) {
					return null;
				}
				return { id, name: id };
			}

			if (entry && typeof entry === "object") {
				const item = entry as AgentEntry;
				const id =
					typeof item.id === "string"
						? item.id.trim()
						: typeof item.name === "string"
							? item.name.trim()
							: "";
				const name =
					typeof item.title === "string"
						? item.title.trim()
						: typeof item.label === "string"
							? item.label.trim()
							: typeof item.name === "string"
								? item.name.trim()
								: id;

				if (id) {
					return { id, name: name || id };
				}
			}

			return null;
		})
		.filter((value): value is { id: string; name: string } => value !== null);

	const byId = new Map<string, { id: string; name: string }>();
	for (const item of normalized) {
		if (!byId.has(item.id)) {
			byId.set(item.id, item);
		}
	}

	return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
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

		const response = await client.app.agents();
		const payload =
			response && typeof response === "object" && "data" in response
				? (response as { data?: unknown }).data
				: response;
		const agents = normalizeAgents(payload);

		return NextResponse.json({
			success: true,
			data: { agents },
		});
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to fetch OpenCode agents";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
