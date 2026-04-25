import { test, expect } from "@playwright/test";
import { seedScenario } from "../fixtures/helpers";

test.describe("Run Happy Path", () => {
	test("task drawer shows run tab with status", async ({ page }) => {
		const data = await seedScenario("task-ready");
		const project = data.projects[0];
		const task = data.tasks[0];

		await page.goto(`/board/${project.id}`);

		const taskCard = page.getByTestId(`task-card-${task.id}`);
		await expect(taskCard).toBeVisible({ timeout: 10_000 });

		await taskCard.getByTestId("task-title").click();
		await expect(page.getByTestId("task-details-panel")).toBeVisible();

		await page.getByTestId("tab-runs").click();

		const runTab = page.locator(
			"[data-testid='run-status'], button:has-text('New Run')",
		);
		await expect(runTab.first()).toBeVisible({ timeout: 5_000 });
	});
});
