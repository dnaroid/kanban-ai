import { NextResponse } from "next/server";
import { roleRepo } from "@/server/repositories/role";

export async function POST(request: Request): Promise<Response> {
	try {
		const body = await request.json();
		const { id } = body;

		if (!id) {
			return NextResponse.json(
				{ success: false, error: "Missing role ID" },
				{ status: 400 },
			);
		}

		roleRepo.delete(id);

		return NextResponse.json({ success: true });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to delete role";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
