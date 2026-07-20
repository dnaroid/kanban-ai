import type { AgentSessionManager } from "@/server/agent/session-types";
import { FakeOpencodeSessionManager } from "@/server/opencode/fake-session-manager";
import { PiSessionManager } from "@/server/pi/session-manager";

let sessionManager: AgentSessionManager | null = null;

export function getAgentSessionManager(): AgentSessionManager {
	if (!sessionManager) {
		sessionManager =
			process.env.AI_RUNTIME_MODE === "fake"
				? new FakeOpencodeSessionManager()
				: new PiSessionManager();
	}

	return sessionManager;
}
