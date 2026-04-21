import { test, expect } from "@playwright/test";
import { seedScenario } from "../fixtures/helpers";

test.describe("Task Workflow", () => {
	test("task appears in correct column after creation", async ({ page }) => {
		const data = await seedScenario("minimal");
		const project = data.projects[0];
		const taskTitle = `Workflow task ${Date.now()}`;

		await page.goto(`/board/${project.id}`);
		await expect(page.getByTestId("project-board")).toBeVisible();

		await page.getByRole("button", { name: "Instant Task" }).click();
		await expect(page.getByTestId("create-task-modal")).toBeVisible();

		await page.getByTestId("create-task-prompt").fill(taskTitle);
		await page.getByTestId("create-task-submit").click();

		await expect(page.getByTestId("create-task-modal")).not.toBeVisible({
			timeout: 20_000,
		});

		await expect(
			page.getByTestId("task-title").filter({ hasText: taskTitle }),
		).toBeVisible({ timeout: 20_000 });

		await page.getByTestId("task-title").filter({ hasText: taskTitle }).click();
		await expect(page.getByTestId("task-details-panel")).toBeVisible();
	});

	test("task persists after page reload", async ({ page }) => {
		const data = await seedScenario("task-ready");
		const project = data.projects[0];
		const task = data.tasks[0];

		await page.goto(`/board/${project.id}`);
		await expect(page.getByTestId(`task-card-${task.id}`)).toBeVisible({
			timeout: 10_000,
		});

		await page.reload();

		await expect(page.getByTestId(`task-card-${task.id}`)).toBeVisible({
			timeout: 10_000,
		});
	});
});
