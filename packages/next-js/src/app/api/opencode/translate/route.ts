import { NextResponse } from "next/server";
import { getOpencodeSessionManager } from "@/server/opencode/session-manager";
import type { SessionStartPreferences } from "@/server/opencode/session-manager";
import { taskRepo } from "@/server/repositories/task";
import { projectRepo } from "@/server/repositories/project";
import { roleRepo } from "@/server/repositories/role";
import type { AgentRolePreset } from "@/server/repositories/role";
import { buildTranslatePrompt } from "@/server/run/prompts/translate";

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as {
			taskId?: unknown;
			language?: unknown;
			modelName?: unknown;
		};

		if (typeof body.taskId !== "string" || body.taskId.trim().length === 0) {
			return NextResponse.json(
				{ success: false, error: "taskId is required" },
				{ status: 400 },
			);
		}

		if (
			typeof body.language !== "string" ||
			body.language.trim().length === 0
		) {
			return NextResponse.json(
				{ success: false, error: "language is required" },
				{ status: 400 },
			);
		}

		const taskId = body.taskId.trim();
		const language = body.language.trim();
		const modelName =
			typeof body.modelName === "string" && body.modelName.trim()
				? body.modelName.trim()
				: undefined;

		const task = taskRepo.getById(taskId);
		if (!task) {
			return NextResponse.json(
				{ success: false, error: "Task not found" },
				{ status: 404 },
			);
		}

		const project = projectRepo.getById(task.projectId);
		if (!project) {
			return NextResponse.json(
				{ success: false, error: "Project not found" },
				{ status: 404 },
			);
		}

		const translatorRole = roleRepo
			.listWithPresets()
			.find((role) => role.id === "translator");
		const presetJson = roleRepo.getPresetJson("translator");
		let preferences: SessionStartPreferences | undefined;
		if (presetJson) {
			try {
				const preset = JSON.parse(presetJson) as AgentRolePreset;
				preferences = {
					preferredModelName:
						modelName ??
						translatorRole?.preferred_model_name ??
						preset.modelName ??
						null,
					preferredModelVariant:
						translatorRole?.preferred_model_variant ?? null,
					preferredLlmAgent: translatorRole?.preferred_llm_agent ?? null,
				};
			} catch {
				preferences = undefined;
			}
		}

		const sessionManager = getOpencodeSessionManager();
		const sessionId = await sessionManager.createSession(
			`Translation: ${task.title}`.slice(0, 120),
			project.path,
		);

		const prompt = buildTranslatePrompt(
			{ title: task.title, description: task.description },
			{ id: project.id, name: project.name, path: project.path },
			language,
			{
				role: translatorRole
					? {
							id: "translator",
							name: translatorRole.name ?? "translator",
							systemPrompt: null,
							skills: null,
						}
					: undefined,
			},
		);

		await sessionManager.sendPrompt(sessionId, prompt, preferences);

		return NextResponse.json({ success: true, data: { sessionId } });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to start translation";
		return NextResponse.json(
			{ success: false, error: message },
			{ status: 500 },
		);
	}
}
