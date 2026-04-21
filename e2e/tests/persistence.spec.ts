import { test, expect } from "@playwright/test";
import { seedScenario } from "../fixtures/helpers";

test.describe("Persistence", () => {
	test("task and run data persist after page reload", async ({ page }) => {
		test.setTimeout(120_000);
		const data = await seedScenario("history-rich-task");
		const project = data.projects[0];
		const task = data.tasks[0];

		await page.goto(`/board/${project.id}`);

		const taskCard = page.getByTestId(`task-card-${task.id}`);
		await expect(taskCard).toBeVisible({ timeout: 15_000 });

		await taskCard.getByTestId("task-title").click();
		await expect(page.getByTestId("task-details-panel")).toBeVisible();

		await page.keyboard.press("Escape");
		await expect(page.getByTestId("task-details-panel")).not.toBeVisible({
			timeout: 5_000,
		});

		await page.reload();
		await expect(page.getByTestId("project-board")).toBeVisible();

		await expect(page.getByTestId(`task-card-${task.id}`)).toBeVisible({
			timeout: 15_000,
		});

		await page
			.getByTestId(`task-card-${task.id}`)
			.getByTestId("task-title")
			.click();
		await expect(page.getByTestId("task-details-panel")).toBeVisible();
	});

	test("board state persists after reload", async ({ page }) => {
		const data = await seedScenario("task-ready");
		const project = data.projects[0];

		await page.goto(`/board/${project.id}`);
		await expect(page.getByTestId("project-board")).toBeVisible();

		const tasksBefore = await page
			.locator("[data-testid^='task-card-']")
			.count();

		await page.reload();
		await expect(page.getByTestId("project-board")).toBeVisible();

		const tasksAfter = await page
			.locator("[data-testid^='task-card-']")
			.count();
		expect(tasksAfter).toBe(tasksBefore);
	});
});
