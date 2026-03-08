import { describe, expect, it } from "vitest";
import { buildTaskPrompt } from "./task";

const mockProject = { id: "proj-1", path: "/path/to/project" };

describe("buildTaskPrompt", () => {
	describe("description deduplication", () => {
		it("omits Описание when title and description are identical", () => {
			const prompt = buildTaskPrompt(
				{
					title: "проверь, хватает ли тестов?",
					description: "проверь, хватает ли тестов?",
				},
				mockProject,
			);

			expect(prompt).toContain("ЗАДАЧА: проверь, хватает ли тестов?");
			expect(prompt).not.toContain("Описание:");
		});

		it("omits Описание when normalized title and description are identical", () => {
			const prompt = buildTaskPrompt(
				{ title: "проверь тесты", description: "  проверь   тесты  " },
				mockProject,
			);

			expect(prompt).toContain("ЗАДАЧА: проверь тесты");
			expect(prompt).not.toContain("Описание:");
		});

		it("includes Описание when description differs from title", () => {
			const prompt = buildTaskPrompt(
				{
					title: "проверь тесты",
					description: "проверь покрытие кода тестами",
				},
				mockProject,
			);

			expect(prompt).toContain("ЗАДАЧА: проверь тесты");
			expect(prompt).toContain("Описание: проверь покрытие кода тестами");
		});

		it("omits Описание when description is null", () => {
			const prompt = buildTaskPrompt(
				{ title: "сделать рефакторинг", description: null },
				mockProject,
			);

			expect(prompt).toContain("ЗАДАЧА: сделать рефакторинг");
			expect(prompt).not.toContain("Описание:");
		});

		it("omits Описание when description is empty string", () => {
			const prompt = buildTaskPrompt(
				{ title: "сделать рефакторинг", description: "" },
				mockProject,
			);

			expect(prompt).toContain("ЗАДАЧА: сделать рефакторинг");
			expect(prompt).not.toContain("Описание:");
		});

		it("omits Описание when description is whitespace only", () => {
			const prompt = buildTaskPrompt(
				{ title: "сделать рефакторинг", description: "   " },
				mockProject,
			);

			expect(prompt).toContain("ЗАДАЧА: сделать рефакторинг");
			expect(prompt).not.toContain("Описание:");
		});
	});

	describe("role context", () => {
		it("includes role systemPrompt when provided", () => {
			const prompt = buildTaskPrompt(
				{ title: "задача", description: "описание" },
				mockProject,
				{ id: "role-1", name: "Engineer", systemPrompt: "Ты инженер." },
			);

			expect(prompt).toContain("Ты инженер.");
		});

		it("includes skills when provided", () => {
			const prompt = buildTaskPrompt(
				{ title: "задача", description: "описание" },
				mockProject,
				{
					id: "role-1",
					name: "Engineer",
					skills: ["architect-reviewer", "code-reviewer"],
				},
			);

			expect(prompt).toContain(
				"Можешь использовать скиллы: architect-reviewer, code-reviewer",
			);
		});

		it("omits skills line when skills array is empty", () => {
			const prompt = buildTaskPrompt(
				{ title: "задача", description: "описание" },
				mockProject,
				{ id: "role-1", name: "Engineer", skills: [] },
			);

			expect(prompt).not.toContain("Можешь использовать скиллы:");
		});
	});

	describe("project context and status markers", () => {
		it("includes project path and id", () => {
			const prompt = buildTaskPrompt(
				{ title: "задача", description: null },
				mockProject,
			);

			expect(prompt).toContain("- Путь проекта: /path/to/project");
			expect(prompt).toContain("- ID проекта: proj-1");
		});

		it("includes status markers", () => {
			const prompt = buildTaskPrompt(
				{ title: "задача", description: null },
				mockProject,
			);

			expect(prompt).toContain("__OPENCODE_STATUS__");
			expect(prompt).toContain("::done");
			expect(prompt).toContain("::fail");
			expect(prompt).toContain("::question");
		});
	});
});
