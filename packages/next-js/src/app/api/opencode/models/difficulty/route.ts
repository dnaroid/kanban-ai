import { NextResponse } from "next/server";
import { updateModelDifficulty } from "@/server/opencode/models-store";
import type { OpencodeModel } from "@/types/ipc";

const VALID_DIFFICULTIES = new Set<OpencodeModel["difficulty"]>([
	"easy",
	"medium",
	"hard",
	"epic",
]);

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as {
			name?: string;
			difficulty?: string;
		};

		if (typeof body.name !== "string" || typeof body.difficulty !== "string") {
			return NextResponse.json(
				{ success: false, error: "name and difficulty are required" },
				{ status: 400 },
			);
		}

		if (
			!VALID_DIFFICULTIES.has(body.difficulty as OpencodeModel["difficulty"])
		) {
			return NextResponse.json(
				{ success: false, error: "Invalid difficulty" },
				{ status: 400 },
			);
		}

		const model = updateModelDifficulty(
			body.name,
			body.difficulty as OpencodeModel["difficulty"],
		);

		if (!model) {
			return NextResponse.json(
				{ success: false, error: `Model "${body.name}" not found` },
				{ status: 404 },
			);
		}

		return NextResponse.json({ success: true, data: { model } });
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to update model difficulty";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
