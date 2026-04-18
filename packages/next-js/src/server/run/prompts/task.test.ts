import { describe, expect, it } from "vitest";
import { buildTaskPrompt } from "./task";

const mockProject = { id: "proj-1", path: "/path/to/project" };

describe("buildTaskPrompt", () => {
	describe("description deduplication", () => {
		it("omits Description when title and description are identical", () => {
			const prompt = buildTaskPrompt(
				{
					title: "check if there are enough tests?",
					description: "check if there are enough tests?",
				},
				mockProject,
			);

			expect(prompt).toContain("TASK: check if there are enough tests?");
			expect(prompt).not.toContain("Description:");
		});

		it("omits Description when normalized title and description are identical", () => {
			const prompt = buildTaskPrompt(
				{ title: "check tests", description: "  check   tests  " },
				mockProject,
			);

			expect(prompt).toContain("TASK: check tests");
			expect(prompt).not.toContain("Description:");
		});

		it("includes Description when description differs from title", () => {
			const prompt = buildTaskPrompt(
				{
					title: "check tests",
					description: "check code test coverage",
				},
				mockProject,
			);

			expect(prompt).toContain("TASK: check tests");
			expect(prompt).toContain("Description: check code test coverage");
		});

		it("omits Description when description is null", () => {
			const prompt = buildTaskPrompt(
				{ title: "do refactoring", description: null },
				mockProject,
			);

			expect(prompt).toContain("TASK: do refactoring");
			expect(prompt).not.toContain("Description:");
		});

		it("omits Description when description is empty string", () => {
			const prompt = buildTaskPrompt(
				{ title: "do refactoring", description: "" },
				mockProject,
			);

			expect(prompt).toContain("TASK: do refactoring");
			expect(prompt).not.toContain("Description:");
		});

		it("omits Description when description is whitespace only", () => {
			const prompt = buildTaskPrompt(
				{ title: "do refactoring", description: "   " },
				mockProject,
			);

			expect(prompt).toContain("TASK: do refactoring");
			expect(prompt).not.toContain("Description:");
		});
	});

	describe("role context", () => {
		it("includes role systemPrompt when provided", () => {
			const prompt = buildTaskPrompt(
				{ title: "task", description: "description" },
				mockProject,
				{
					id: "role-1",
					name: "Engineer",
					systemPrompt: "You are an engineer.",
				},
			);

			expect(prompt).toContain("You are an engineer.");
		});

		it("omits skills when provided but ENABLE_SKILLS_IN_PROMPTS is false (default)", () => {
			const prompt = buildTaskPrompt(
				{ title: "task", description: "description" },
				mockProject,
				{
					id: "role-1",
					name: "Engineer",
					skills: ["architect-reviewer", "code-reviewer"],
				},
			);

			expect(prompt).not.toContain("You may use skills:");
		});

		it("omits skills line when skills array is empty", () => {
			const prompt = buildTaskPrompt(
				{ title: "task", description: "description" },
				mockProject,
				{ id: "role-1", name: "Engineer", skills: [] },
			);

			expect(prompt).not.toContain("You may use skills:");
		});
	});

	describe("project context and status markers", () => {
		it("includes project path and id", () => {
			const prompt = buildTaskPrompt(
				{ title: "task", description: null },
				mockProject,
			);

			expect(prompt).toContain("- Project path: /path/to/project");
			expect(prompt).toContain("- Project ID: proj-1");
		});

		it("includes execution status markers (done, fail, question)", () => {
			const prompt = buildTaskPrompt(
				{ title: "task", description: null },
				mockProject,
			);

			expect(prompt).toContain("__OPENCODE_STATUS__");
			expect(prompt).toContain("::done");
			expect(prompt).toContain("::fail");
			expect(prompt).toContain("::question");
		});

		it("does NOT include QA-specific status markers (test_ok, test_fail)", () => {
			const prompt = buildTaskPrompt(
				{ title: "task", description: null },
				mockProject,
			);

			expect(prompt).not.toContain("::test_ok");
			expect(prompt).not.toContain("::test_fail");
		});
	});
});
