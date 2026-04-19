import type { SessionStartPreferences } from "@/server/opencode/session-manager";

export interface QueuedRunInput {
	projectPath: string;
	projectId?: string;
	sessionTitle: string;
	prompt: string;
	sessionPreferences?: SessionStartPreferences;
}

export interface QueueMeta {
	projectScope: string;
	providerKey: string;
	isGeneration: boolean;
}

export interface ProviderQueueStats {
	providerKey: string;
	queued: number;
	running: number;
	concurrency: number;
}

export interface ProjectQueueStats {
	projectScope: string;
	queued: number;
	running: number;
	providers: ProviderQueueStats[];
}

export interface QueueStats {
	totalQueued: number;
	totalRunning: number;
	providers: ProviderQueueStats[];
	byProject: ProjectQueueStats[];
}
