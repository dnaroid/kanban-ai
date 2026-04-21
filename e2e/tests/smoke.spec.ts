import { test, expect } from "@playwright/test";
import { seedScenario } from "../fixtures/helpers";

test.describe("Smoke", () => {
	test("application loads and shows projects", async ({ page }) => {
		await page.goto("/");

		const hasProjectsList = await page
			.getByTestId("projects-list")
			.isVisible()
			.catch(() => false);
		const hasProjectBoard = await page
			.getByTestId("project-board")
			.isVisible()
			.catch(() => false);

		expect(hasProjectsList || hasProjectBoard).toBe(true);
	});

	test("board renders with columns after seeding", async ({ page }) => {
		const data = await seedScenario("minimal");
		const project = data.projects[0];

		await page.goto(`/board/${project.id}`);

		await expect(page.getByTestId("project-board")).toBeVisible();
		await expect(page.getByTestId("board-column-backlog")).toBeVisible();
		await expect(page.getByTestId("board-column-ready")).toBeVisible();
	});
});
