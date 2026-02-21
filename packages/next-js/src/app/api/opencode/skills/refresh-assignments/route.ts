import { createLogger } from "@/lib/logger";
import { bootstrapOpencodeService } from "@/server/opencode/opencode-bootstrap";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";
import { roleRepo } from "@/server/repositories/role";
import { NextResponse } from "next/server";

const log = createLogger("opencode-skill-refresh");
const messagePollAttempts = 45;
const messagePollIntervalMs = 2000;

interface SkillAssignment {
	roleId: string;
	skills: string[];
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function normalizeSkills(raw: unknown): string[] {
	if (!Array.isArray(raw)) {
		return [];
	}

	const unique = new Set<string>();
	for (const item of raw) {
		if (typeof item !== "string") {
			continue;
		}
		const normalized = item.trim();
		if (normalized.length === 0) {
			continue;
		}
		unique.add(normalized);
	}

	return [...unique];
}

function parsePresetJson(rawPreset: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(rawPreset) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		return {};
	} catch {
		return {};
	}
}

function buildRefreshPrompt(
	roles: Array<{ id: string; name: string; description: string }>,
): string {
	const roleLines = roles
		.map((role) => {
			const description = role.description.trim();
			return `- ${role.id} | ${role.name}: ${description || "No description"}`;
		})
		.join("\n");

	return [
		"You are optimizing a multi-agent team skill matrix.",
		"Your task: redistribute skills across all listed agents based on their role names/descriptions.",
		"Do not ask questions. Do not include explanations.",
		"Assume you already know the available skill catalog in this environment; do not request it.",
		"Return exactly one block in this strict format:",
		"<SKILL_ASSIGNMENTS>",
		'{"assignments":[{"roleId":"agent-id","skills":["skill-1","skill-2"]}]}',
		"</SKILL_ASSIGNMENTS>",
		"Rules:",
		"1) Include every agent exactly once.",
		"2) Keep skills concise and role-appropriate.",
		"3) Every skills list must be non-empty.",
		"4) roleId must match one of the provided IDs.",
		"Agents:",
		roleLines,
	].join("\n");
}

function parseSkillAssignments(
	assistantContent: string,
	validRoleIds: Set<string>,
): SkillAssignment[] {
	const taggedMatch = assistantContent.match(
		/<SKILL_ASSIGNMENTS>([\s\S]*?)<\/SKILL_ASSIGNMENTS>/i,
	);
	const payload = (taggedMatch?.[1] ?? assistantContent).trim();

	const parsed = JSON.parse(payload) as unknown;
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Assistant response is not a valid object");
	}

	const root = parsed as Record<string, unknown>;
	if (!Array.isArray(root.assignments)) {
		throw new Error("Assistant response missing assignments array");
	}

	const deduped = new Map<string, string[]>();
	for (const item of root.assignments) {
		if (!item || typeof item !== "object" || Array.isArray(item)) {
			continue;
		}
		const row = item as Record<string, unknown>;
		const roleId = typeof row.roleId === "string" ? row.roleId.trim() : "";
		if (!roleId || !validRoleIds.has(roleId)) {
			continue;
		}
		const skills = normalizeSkills(row.skills);
		if (skills.length === 0) {
			continue;
		}
		deduped.set(roleId, skills);
	}

	return [...deduped.entries()].map(([roleId, skills]) => ({ roleId, skills }));
}

function areSkillListsEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) {
		return false;
	}

	for (let i = 0; i < a.length; i += 1) {
		if (a[i] !== b[i]) {
			return false;
		}
	}

	return true;
}

async function waitForAssistantMessage(
	sessionId: string,
	sinceTimestamp: number,
): Promise<string | null> {
	const sessionManager = getOpencodeSessionManager();

	for (let attempt = 0; attempt < messagePollAttempts; attempt += 1) {
		const messages = await sessionManager.getMessages(sessionId, 200);
		for (let index = messages.length - 1; index >= 0; index -= 1) {
			const message = messages[index];
			if (message.role !== "assistant") {
				continue;
			}
			if (message.timestamp <= sinceTimestamp) {
				continue;
			}
			const content = message.content.trim();
			if (content.length > 0) {
				return content;
			}
		}

		await sleep(messagePollIntervalMs);
	}

	return null;
}

export async function POST(): Promise<NextResponse> {
	try {
		await bootstrapOpencodeService();

		const roles = roleRepo.listWithPresets();
		if (roles.length === 0) {
			return NextResponse.json(
				{ success: false, error: "No agents found" },
				{ status: 400 },
			);
		}

		const prompt = buildRefreshPrompt(roles);
		const sessionManager = getOpencodeSessionManager();
		const sessionId = await sessionManager.createSession(
			"Refresh Team Skills",
			process.cwd(),
		);
		const sentAt = Date.now();
		await sessionManager.sendPrompt(sessionId, prompt);

		const assistantContent = await waitForAssistantMessage(sessionId, sentAt);
		if (!assistantContent) {
			return NextResponse.json(
				{
					success: false,
					error:
						"Timed out while waiting for skill redistribution response from agents",
				},
				{ status: 504 },
			);
		}

		const validRoleIds = new Set(roles.map((role) => role.id));
		const assignments = parseSkillAssignments(assistantContent, validRoleIds);
		if (assignments.length === 0) {
			return NextResponse.json(
				{
					success: false,
					error:
						"Assistant returned no valid skill assignments for known agents",
				},
				{ status: 422 },
			);
		}

		const assignmentByRoleId = new Map(
			assignments.map((assignment) => [assignment.roleId, assignment.skills]),
		);

		let updatedRoles = 0;
		for (const role of roles) {
			const nextSkills = assignmentByRoleId.get(role.id);
			if (!nextSkills) {
				continue;
			}

			const preset = parsePresetJson(role.preset_json);
			const currentSkills = normalizeSkills(preset.skills);
			if (areSkillListsEqual(currentSkills, nextSkills)) {
				continue;
			}

			const nextPreset = {
				...preset,
				skills: nextSkills,
			};

			roleRepo.upsert({
				id: role.id,
				name: role.name,
				description: role.description,
				preset_json: JSON.stringify(nextPreset),
			});
			updatedRoles += 1;
		}

		return NextResponse.json({
			success: true,
			data: {
				sessionId,
				updatedRoles,
				consideredRoles: roles.length,
			},
		});
	} catch (error) {
		log.error("Failed to refresh skill assignments", {
			error: error instanceof Error ? error.message : String(error),
		});
		const message =
			error instanceof Error
				? error.message
				: "Failed to refresh skill assignments";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
