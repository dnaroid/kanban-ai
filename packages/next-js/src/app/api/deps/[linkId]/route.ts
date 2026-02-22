import { NextResponse } from "next/server";
import { taskLinkRepo } from "@/server/repositories";

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ linkId: string }> },
) {
	try {
		const { linkId } = await params;

		const deleted = taskLinkRepo.delete(linkId);
		if (!deleted) {
			return NextResponse.json(
				{ success: false, error: "Dependency link not found" },
				{ status: 404 },
			);
		}

		return NextResponse.json({ success: true, data: { ok: true } });
	} catch (error) {
		console.error("DELETE /api/deps/[linkId] failed", error);
		return NextResponse.json(
			{ success: false, error: "Failed to delete dependency" },
			{ status: 500 },
		);
	}
}
