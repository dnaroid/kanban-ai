import { test, expect } from "@playwright/test";
import { seedScenario } from "../fixtures/helpers";

test.describe("Run Pause/Resume", () => {
	test("run pauses with question and resumes after answer", async ({
		page,
	}) => {
		test.setTimeout(120_000);
		const data = await seedScenario("paused-run");
		const project = data.projects[0];
		const task = data.tasks[0];

		await page.goto(`/board/${project.id}`);

		const taskCard = page.getByTestId(`task-card-${task.id}`);
		await expect(taskCard).toBeVisible({ timeout: 10_000 });
		await taskCard.getByTestId("task-title").click();
		await expect(page.getByTestId("task-details-panel")).toBeVisible();

		const runStatus = page.getByTestId("run-status");
		await expect(runStatus).toBeVisible({ timeout: 10_000 });

		const followUpDialog = page.getByTestId("run-follow-up-dialog");
		await expect(followUpDialog).toBeVisible({ timeout: 30_000 });

		await followUpDialog.getByRole("button", { name: /yes/i }).click();
		await page.getByTestId("run-follow-up-submit").click();

		await expect(followUpDialog).not.toBeVisible({ timeout: 30_000 });
	});
});
