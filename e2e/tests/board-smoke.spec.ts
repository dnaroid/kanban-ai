import { test, expect } from "@playwright/test";
import { seedScenario } from "../fixtures/helpers";

test.describe("Board Smoke", () => {
	test("board shows multiple columns with tasks", async ({ page }) => {
		const data = await seedScenario("multi-column-board");
		const project = data.projects[0];

		await page.goto(`/board/${project.id}`);

		await expect(page.getByTestId("project-board")).toBeVisible();
		await expect(page.getByTestId("board-column-backlog")).toBeVisible();
		await expect(page.getByTestId("board-column-ready")).toBeVisible();

		for (const task of data.tasks) {
			await expect(page.getByTestId(`task-card-${task.id}`)).toBeVisible();
		}
	});

	test("clicking a task card opens details panel", async ({ page }) => {
		const data = await seedScenario("task-ready");
		const project = data.projects[0];
		const task = data.tasks[0];

		await page.goto(`/board/${project.id}`);

		const taskCard = page.getByTestId(`task-card-${task.id}`);
		await expect(taskCard).toBeVisible({ timeout: 10_000 });

		await taskCard.getByTestId("task-title").click();
		await page.waitForSelector("[data-testid='task-details-panel']", {
			state: "visible",
			timeout: 10_000,
		});
	});
});
