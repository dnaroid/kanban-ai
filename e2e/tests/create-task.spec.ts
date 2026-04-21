import { test, expect } from "@playwright/test";
import { seedScenario } from "../fixtures/helpers";

test.describe("Create Task", () => {
	test("user can create a task via quick create modal", async ({ page }) => {
		const data = await seedScenario("minimal");
		const project = data.projects[0];
		const prompt = `E2E test task - implement login feature ${Date.now()}`;

		await page.goto(`/board/${project.id}`);

		await page.getByRole("button", { name: "Instant Task" }).click();
		await expect(page.getByTestId("create-task-modal")).toBeVisible();

		await page.getByTestId("create-task-prompt").fill(prompt);
		await page.getByTestId("create-task-submit").click();

		await expect(page.getByTestId("create-task-modal")).not.toBeVisible({
			timeout: 20_000,
		});

		await expect(
			page.getByTestId("task-title").filter({ hasText: prompt }),
		).toBeVisible({
			timeout: 20_000,
		});
	});

	test("seeded tasks appear on the board", async ({ page }) => {
		const data = await seedScenario("task-ready");
		const project = data.projects[0];

		await page.goto(`/board/${project.id}`);

		for (const task of data.tasks) {
			await expect(page.getByTestId(`task-card-${task.id}`)).toBeVisible();
		}
	});
});
