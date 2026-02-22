import { NextResponse } from "next/server";
import { appSettingsRepo } from "@/server/repositories";

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const key = searchParams.get("key");

	if (!key) {
		return NextResponse.json(
			{ error: "Key parameter required" },
			{ status: 400 },
		);
	}

	try {
		const value = appSettingsRepo.get(key);
		return NextResponse.json({ value });
	} catch (error) {
		console.error("[API] Failed to get app setting:", error);
		return NextResponse.json(
			{ error: "Failed to get app setting" },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const { key, value } = body;

		if (!key || value === undefined) {
			return NextResponse.json(
				{ error: "Key and value required" },
				{ status: 400 },
			);
		}

		appSettingsRepo.set(key, String(value));
		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("[API] Failed to set app setting:", error);
		return NextResponse.json(
			{ error: "Failed to set app setting" },
			{ status: 500 },
		);
	}
}
