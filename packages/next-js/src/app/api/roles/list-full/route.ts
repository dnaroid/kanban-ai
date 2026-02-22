import { NextResponse } from "next/server";
import { roleRepo } from "@/server/repositories/role";

export async function GET(): Promise<Response> {
	try {
		const roles = roleRepo.listWithPresets();
		return NextResponse.json({ success: true, data: { roles } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to list roles";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
