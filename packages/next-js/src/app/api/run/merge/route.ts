import { NextResponse } from "next/server";
import { runService } from "@/server/run/run-service";

const MERGE_TIMEOUT_MS = 60_000;

interface MergeRunBody {
	runId?: unknown;
}

function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message: string,
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => reject(new Error(message)), ms);
		}),
	]).finally(() => {
		if (timeoutId !== undefined) clearTimeout(timeoutId);
	});
}

export async function POST(request: Request): Promise<Response> {
	try {
		const body = (await request.json()) as MergeRunBody;
		const runId = typeof body.runId === "string" ? body.runId.trim() : "";

		if (!runId) {
			return NextResponse.json(
				{ success: false, error: "runId is required" },
				{ status: 400 },
			);
		}

		const data = await withTimeout(
			runService.merge(runId),
			MERGE_TIMEOUT_MS,
			"Merge operation timed out",
		);
		return NextResponse.json({ success: true, data });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to merge run changes";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
