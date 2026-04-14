export type ToolState = "pending" | "running" | "completed" | "error";

export type PartType =
	| "text"
	| "file"
	| "tool"
	| "reasoning"
	| "agent"
	| "step-start"
	| "snapshot"
	| "other";

export interface PartBase {
	id?: string;
	messageID?: string;
	type: PartType;
	ignored?: boolean;
}

export interface TextPart extends PartBase {
	type: "text";
	text: string;
}

export interface FilePart extends PartBase {
	type: "file";
	url: string;
	mime: string;
	filename?: string;
}

export interface ToolPart extends PartBase {
	type: "tool";
	tool: string;
	state: ToolState;
	input?: unknown;
	output?: unknown;
	error?: string;
}

export interface ReasoningPart extends PartBase {
	type: "reasoning";
	text: string;
}

export interface AgentPart extends PartBase {
	type: "agent";
	name: string;
}

export interface StepStartPart extends PartBase {
	type: "step-start";
}

export interface SnapshotPart extends PartBase {
	type: "snapshot";
}

export interface OtherPart extends PartBase {
	type: "other";
}

export interface PermissionData {
	id: string;
	permissionType: string;
	pattern?: string | string[];
	sessionId: string;
	messageId: string;
	callId?: string;
	title: string;
	metadata: Record<string, unknown>;
	createdAt: number;
}

export type Part =
	| TextPart
	| FilePart
	| ToolPart
	| ReasoningPart
	| AgentPart
	| StepStartPart
	| SnapshotPart
	| OtherPart;

export interface OpenCodeMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	parts: Part[];
	timestamp: number;
	modelID?: string;
}

export interface OpenCodeTodo {
	id: string;
	content: string;
	status: "pending" | "in_progress" | "completed" | "cancelled";
	priority: "high" | "medium" | "low";
}

export interface OpencodeModel {
	name: string;
	enabled: boolean;
	difficulty: "easy" | "medium" | "hard" | "epic";
	variants: string;
}

export interface OpencodeAgent {
	id: string;
	name: string;
}

export type RunStatus =
	| "queued"
	| "running"
	| "completed"
	| "failed"
	| "cancelled"
	| "timeout"
	| "paused";

export type RunWorkspaceStatus =
	| "ready"
	| "dirty"
	| "merged"
	| "cleaned"
	| "missing";

export type RunMergeStatus = "pending" | "merged";

export type RunMergeMode = "manual" | "automatic";

export type RunCleanupStatus = "pending" | "cleaned" | "failed";

export interface RunVcsMetadata {
	repoRoot: string;
	worktreePath: string;
	branchName: string;
	baseBranch: string;
	baseCommit: string;
	headCommit?: string;
	hasChanges?: boolean;
	workspaceStatus: RunWorkspaceStatus;
	mergeStatus: RunMergeStatus;
	mergedBy?: RunMergeMode;
	mergedAt?: string;
	mergedCommit?: string;
	lastMergeError?: string;
	cleanupStatus: RunCleanupStatus;
	cleanedAt?: string;
	lastCleanupError?: string;
}

export interface RunMetadata {
	kind?: string;
	errorText?: string;
	budget?: unknown;
	tokensIn?: number;
	tokensOut?: number;
	costUsd?: number;
	durationSec?: number;
	vcs?: RunVcsMetadata;
	[key: string]: unknown;
}

export interface Run {
	id: string;
	taskId: string;
	sessionId: string;
	roleId?: string;
	model?: string;
	mode?: string;
	status: RunStatus;
	startedAt?: string | null;
	endedAt?: string | null;
	createdAt: string;
	updatedAt: string;
	metadata?: RunMetadata;
}

export interface RunEvent {
	id: string;
	runId: string;
	ts: string;
	eventType: "stdout" | "stderr" | "message" | "status" | string;
	payload: unknown;
}

export interface Artifact {
	id: string;
	runId: string;
	kind: "json" | "patch" | "markdown" | string;
	title: string;
	content: string;
	createdAt: string;
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

export interface QueueStatsResponse {
	totalQueued: number;
	totalRunning: number;
	providers: ProviderQueueStats[];
	byProject: ProjectQueueStats[];
}

export interface OpenCodeGenerateUserStoryResponse {
	runId: string;
}

export interface OpenCodeStartQaTestingResponse {
	runId: string;
}

export interface OpenCodeSessionMessagesResponse {
	sessionId: string;
	messages: OpenCodeMessage[];
}

export interface OpenCodeSessionTodosResponse {
	sessionId: string;
	todos: OpenCodeTodo[];
}

export interface OpencodeModelsListResponse {
	models: OpencodeModel[];
}

export interface OpencodeAgentsListResponse {
	agents: OpencodeAgent[];
}

export interface OpencodeSendMessageResponse {
	ok: true;
}
