import { describe, expect, it } from "vitest";
import { buildUserStoryPrompt } from "./user-story";

describe("buildUserStoryPrompt", () => {
	it("includes explicit visual QA acceptance-criteria rule for visual/UI-impacting tasks", () => {
		const prompt = buildUserStoryPrompt(
			{
				title: "Update dashboard card styling",
				description: "Adjust spacing and typography in dashboard cards",
			},
			{
				id: "proj-1",
				name: "kanban-ai",
				path: "/tmp/kanban-ai",
			},
		);

		expect(prompt).toContain("If the task has visual/UI impact");
		expect(prompt).toContain(
			"requiring QA to validate the result visually as a human manual tester",
		);
		expect(prompt).toContain(
			"must clearly distinguish manual visual verification from automated or non-visual checks",
		);
	});

	it("includes explicit non-visual exemption for visual/manual QA criterion", () => {
		const prompt = buildUserStoryPrompt(
			{
				title: "Optimize DB indexing",
				description: "Improve query performance for task history",
			},
			{
				id: "proj-1",
				name: "kanban-ai",
				path: "/tmp/kanban-ai",
			},
		);

		expect(prompt).toContain(
			"If the task has no visual/UI impact, do not add a visual/manual QA acceptance criterion.",
		);
	});
});
