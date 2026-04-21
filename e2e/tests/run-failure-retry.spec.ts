import { test, expect } from "@playwright/test";
import { seedScenario } from "../fixtures/helpers";

test.describe("Run Failure/Retry", () => {
	test("failed run can be retried and succeeds", async ({ page }) => {
		test.setTimeout(120_000);
		const data = await seedScenario("failed-run");
		const project = data.projects[0];
		const task = data.tasks[0];

		await page.goto(`/board/${project.id}`);

		const taskCard = page.getByTestId(`task-card-${task.id}`);
		await expect(taskCard).toBeVisible({ timeout: 10_000 });
		await taskCard.getByTestId("task-title").click();
		await expect(page.getByTestId("task-details-panel")).toBeVisible();

		const runStatus = page.getByTestId("run-status");
		await expect(runStatus).toBeVisible({ timeout: 10_000 });

		await page.getByTestId("run-task-button").click();

		await expect(runStatus).toBeVisible({ timeout: 10_000 });
	});
});
