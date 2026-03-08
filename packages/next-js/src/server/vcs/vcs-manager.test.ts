import { execFileSync } from "child_process";
import { afterEach, describe, expect, it } from "vitest";
import {
	access,
	mkdtemp,
	mkdir,
	readFile,
	realpath,
	rm,
	writeFile,
} from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { Run, RunVcsMetadata } from "@/types/ipc";
import { VcsManager } from "@/server/vcs/vcs-manager";

const tempRoots: string[] = [];

function git(cwd: string, args: string[]): string {
	return execFileSync("git", ["-C", cwd, ...args], {
		encoding: "utf8",
		maxBuffer: 1024 * 1024,
	}).trim();
}

function gitCommit(cwd: string, message: string): void {
	git(cwd, [
		"-c",
		"user.name=Kanban AI Test",
		"-c",
		"user.email=kanban-ai@example.com",
		"commit",
		"-m",
		message,
	]);
}

async function createRepo(): Promise<{ repoPath: string; baseBranch: string }> {
	const root = await mkdtemp(join(tmpdir(), "kanban-vcs-"));
	tempRoots.push(root);
	const repoPath = join(root, "repo");
	await mkdir(repoPath);
	git(repoPath, ["init", "-b", "main"]);
	await writeFile(join(repoPath, "README.md"), "base\n", "utf8");
	await writeFile(join(repoPath, "NOTES.md"), "notes\n", "utf8");
	git(repoPath, ["add", "README.md", "NOTES.md"]);
	gitCommit(repoPath, "Initial commit");
	return { repoPath, baseBranch: git(repoPath, ["branch", "--show-current"]) };
}

function buildRun(runId: string, vcs: RunVcsMetadata): Run {
	const now = new Date().toISOString();
	return {
		id: runId,
		taskId: "task-1",
		sessionId: "",
		roleId: "dev",
		mode: "execute",
		status: "completed",
		createdAt: now,
		updatedAt: now,
		metadata: {
			kind: "task-run",
			vcs,
		},
	};
}

afterEach(async () => {
	await Promise.all(
		tempRoots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

describe("VcsManager", () => {
	it("provisions a dedicated worktree for an execution run", async () => {
		const { repoPath, baseBranch } = await createRepo();
		const manager = new VcsManager();
		const resolvedRepoPath = await realpath(repoPath);

		const metadata = await manager.provisionRunWorkspace({
			projectPath: repoPath,
			runId: "run-12345678",
			taskId: "task-1",
			taskTitle: "Implement Worktree Support",
		});

		expect(metadata.repoRoot).toBe(resolvedRepoPath);
		expect(metadata.baseBranch).toBe(baseBranch);
		expect(metadata.branchName).toMatch(/^task\//);
		expect(metadata.worktreePath).not.toBe(repoPath);
		expect(git(metadata.worktreePath, ["branch", "--show-current"])).toBe(
			metadata.branchName,
		);
	});

	it("sanitizes task-derived branch and path segments", async () => {
		const { repoPath } = await createRepo();
		const manager = new VcsManager();
		const resolvedRepoPath = await realpath(repoPath);

		const metadata = await manager.provisionRunWorkspace({
			projectPath: repoPath,
			runId: "run/../unsafe",
			taskId: "task/../escape",
			taskTitle: "../Feature / nested .. branch",
		});

		expect(metadata.branchName.startsWith("task/")).toBe(true);
		expect(metadata.branchName.slice("task/".length)).not.toContain("/");
		expect(metadata.branchName).not.toContain("..");
		expect(
			metadata.worktreePath.startsWith(`${resolvedRepoPath}.worktrees/`),
		).toBe(true);
		expect(metadata.worktreePath).not.toContain("..");
	});

	it("merges a completed run branch back into the base branch", async () => {
		const { repoPath } = await createRepo();
		const manager = new VcsManager();
		const metadata = await manager.provisionRunWorkspace({
			projectPath: repoPath,
			runId: "run-merge-1234",
			taskId: "task-1",
			taskTitle: "Merge Changes",
		});

		await writeFile(
			join(metadata.worktreePath, "README.md"),
			"base\nfeature\n",
			"utf8",
		);
		git(metadata.worktreePath, ["add", "README.md"]);
		gitCommit(metadata.worktreePath, "Feature change");

		const merged = await manager.mergeRunWorkspace(
			buildRun("run-merge-1234", metadata),
		);

		expect(merged.mergeStatus).toBe("merged");
		expect(merged.workspaceStatus).toBe("merged");
		expect(merged.mergedCommit).toBeTruthy();
		expect(merged.cleanupStatus).toBe("pending");
		await expect(
			readFile(join(repoPath, "README.md"), "utf8"),
		).resolves.toContain("feature");
	});

	it("merges even when the base worktree has unrelated local changes", async () => {
		const { repoPath } = await createRepo();
		const manager = new VcsManager();
		const metadata = await manager.provisionRunWorkspace({
			projectPath: repoPath,
			runId: "run-dirty-base-1234",
			taskId: "task-1",
			taskTitle: "Dirty Base Merge",
		});

		await writeFile(
			join(metadata.worktreePath, "README.md"),
			"base\nfeature\n",
			"utf8",
		);
		git(metadata.worktreePath, ["add", "README.md"]);
		gitCommit(metadata.worktreePath, "Feature change");

		await writeFile(join(repoPath, "NOTES.md"), "notes\nlocal edit\n", "utf8");

		const merged = await manager.mergeRunWorkspace(
			buildRun("run-dirty-base-1234", metadata),
		);

		expect(merged.mergeStatus).toBe("merged");
		await expect(
			readFile(join(repoPath, "README.md"), "utf8"),
		).resolves.toContain("feature");
		await expect(
			readFile(join(repoPath, "NOTES.md"), "utf8"),
		).resolves.toContain("local edit");
	});

	it("cleans up a merged run worktree and branch", async () => {
		const { repoPath } = await createRepo();
		const manager = new VcsManager();
		const metadata = await manager.provisionRunWorkspace({
			projectPath: repoPath,
			runId: "run-clean-1234",
			taskId: "task-1",
			taskTitle: "Cleanup Merge",
		});

		await writeFile(
			join(metadata.worktreePath, "README.md"),
			"base\ncleanup\n",
			"utf8",
		);
		git(metadata.worktreePath, ["add", "README.md"]);
		gitCommit(metadata.worktreePath, "Cleanup change");

		const merged = await manager.mergeRunWorkspace(
			buildRun("run-clean-1234", metadata),
		);
		const cleaned = await manager.cleanupRunWorkspace(merged);

		expect(cleaned.workspaceStatus).toBe("cleaned");
		expect(cleaned.cleanupStatus).toBe("cleaned");
		await expect(access(metadata.worktreePath)).rejects.toThrow();
		expect(git(repoPath, ["branch", "--list", metadata.branchName])).toBe("");
	});

	it("commits dirty run worktree changes before merging", async () => {
		const { repoPath } = await createRepo();
		const manager = new VcsManager();
		const metadata = await manager.provisionRunWorkspace({
			projectPath: repoPath,
			runId: "run-dirty-1234",
			taskId: "task-1",
			taskTitle: "Dirty Worktree",
		});

		await writeFile(
			join(metadata.worktreePath, "README.md"),
			"base\nworking tree\n",
			"utf8",
		);

		const merged = await manager.mergeRunWorkspace(
			buildRun("run-dirty-1234", metadata),
		);

		expect(merged.mergeStatus).toBe("merged");
		expect(merged.headCommit).toBeTruthy();
		await expect(
			readFile(join(repoPath, "README.md"), "utf8"),
		).resolves.toContain("working tree");
	});

	it("refuses to merge when the base worktree has staged changes", async () => {
		const { repoPath } = await createRepo();
		const manager = new VcsManager();
		const metadata = await manager.provisionRunWorkspace({
			projectPath: repoPath,
			runId: "run-staged-base-1234",
			taskId: "task-1",
			taskTitle: "Staged Base Merge",
		});

		await writeFile(
			join(metadata.worktreePath, "README.md"),
			"base\nfeature\n",
			"utf8",
		);
		git(metadata.worktreePath, ["add", "README.md"]);
		gitCommit(metadata.worktreePath, "Feature change");

		await writeFile(join(repoPath, "NOTES.md"), "notes\nstaged edit\n", "utf8");
		git(repoPath, ["add", "NOTES.md"]);

		await expect(
			manager.mergeRunWorkspace(buildRun("run-staged-base-1234", metadata)),
		).rejects.toThrow("Base project worktree has staged changes");
	});
});
