import { bootstrapOpencodeService } from "@/server/opencode/opencode-bootstrap";

export async function register(): Promise<void> {
	if (process.env.NEXT_RUNTIME !== "nodejs") {
		return;
	}

	void bootstrapOpencodeService();
}
