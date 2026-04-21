import { NextResponse } from "next/server";
import { getRunsQueueManager } from "@/server/run/runs-queue-manager";

export async function POST(): Promise<Response> {
	const qm = getRunsQueueManager();
	const reconciled = await qm.forceReconcileAll();
	return NextResponse.json({ success: true, data: { reconciled } });
}
