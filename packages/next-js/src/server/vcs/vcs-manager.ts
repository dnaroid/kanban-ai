import { execFile } from "child_process";
import { access, mkdir } from "fs/promises";
import { basename, dirname, join } from "path";
import { promisify } from "util";
import { createLogger } from "@/lib/logger";
import { taskRepo } from "@/server/repositories/task";
import type {
	DiffFile,
	DiffHunk,
	Run,
	RunMergeMode,
	RunVcsMetadata,
} from "@/types/ipc";

const execFileAsync = promisify(execFile);
const log = createLogger("vcs-manager");

const DIFF_MAX_BYTES = 500 * 1024;

interface ProvisionRunWorkspaceInput {
	projectPath: string;
	runId: string;
	taskId: string;
	taskTitle: string;
}

function sanitizeSegment(value: string, fallback: string): string {
	const normalized = value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "");

	return normalized.length > 0 ? normalized : fallback;
}

function trimSegment(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}

	return value.slice(0, maxLength).replace(/-+$/g, "");
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

export class VcsManager {
	public async provisionRunWorkspace(
		input: ProvisionRunWorkspaceInput,
	): Promise<RunVcsMetadata> {
		const repoRoot = await this.resolveRepoRoot(input.projectPath);
		const baseBranch = await this.resolveCurrentBranch(repoRoot);
		const baseCommit = await this.git(repoRoot, ["rev-parse", "HEAD"]);
		const branchName = this.buildRunBranchName(
			input.taskId,
			input.taskTitle,
			input.runId,
		);
		const worktreePath = this.buildWorktreePath(
			repoRoot,
			input.taskId,
			input.taskTitle,
			input.runId,
		);

		await mkdir(dirname(worktreePath), { recursive: true });
		if (await pathExists(worktreePath)) {
			throw new Error(`Worktree path already exists: ${worktreePath}`);
		}

		await this.git(repoRoot, ["worktree", "prune"]);
		await this.git(repoRoot, [
			"worktree",
			"add",
			"-b",
			branchName,
			worktreePath,
			baseBranch,
		]);

		const headCommit = await this.git(worktreePath, ["rev-parse", "HEAD"]);
		log.info("Provisioned run worktree", {
			runId: input.runId,
			branchName,
			worktreePath,
			baseBranch,
		});

		return {
			repoRoot,
			worktreePath,
			branchName,
			baseBranch,
			baseCommit,
			headCommit,
			hasChanges: false,
			workspaceStatus: "ready",
			mergeStatus: "pending",
			cleanupStatus: "pending",
		};
	}

	public async syncRunWorkspace(run: Run): Promise<RunVcsMetadata | null> {
		const vcs = run.metadata?.vcs;
		if (!vcs) {
			return null;
		}

		return this.syncVcsMetadata(vcs);
	}

	public async syncVcsMetadata(vcs: RunVcsMetadata): Promise<RunVcsMetadata> {
		if (vcs.cleanupStatus === "cleaned") {
			return {
				...vcs,
				hasChanges: false,
				workspaceStatus: "cleaned",
			};
		}

		if (!(await pathExists(vcs.worktreePath))) {
			return {
				...vcs,
				workspaceStatus: "missing",
				lastMergeError:
					vcs.lastMergeError ?? "Run worktree directory is missing.",
			};
		}

		const headCommit = await this.git(vcs.worktreePath, ["rev-parse", "HEAD"]);
		const hasChanges = await this.hasUncommittedChanges(vcs.worktreePath);

		return {
			...vcs,
			headCommit,
			hasChanges,
			workspaceStatus:
				vcs.mergeStatus === "merged"
					? "merged"
					: hasChanges
						? "dirty"
						: "ready",
		};
	}

	public async getDiff(
		worktreePath: string,
		baseCommit: string,
		headCommit: string,
	): Promise<{ files: DiffFile[] } | null> {
		if (!(await pathExists(worktreePath))) {
			return null;
		}

		const raw = await this.gitRaw(worktreePath, [
			"diff",
			"--unified=3",
			`${baseCommit}..${headCommit}`,
		]);

		if (raw === null) {
			return null;
		}

		if (raw.length === 0) {
			return { files: [] };
		}

		const files = this.parseUnifiedDiff(raw);
		return { files };
	}

	public async getWorkingDiff(
		projectPath: string,
	): Promise<{ files: DiffFile[] } | null> {
		const repoRoot = await this.resolveRepoRoot(projectPath).catch(() => null);
		if (!repoRoot) {
			return null;
		}

		const raw = await this.gitRaw(repoRoot, ["diff", "--unified=3", "HEAD"]);

		if (raw === null) {
			return null;
		}

		if (raw.length === 0) {
			return { files: [] };
		}

		const files = this.parseUnifiedDiff(raw);
		return { files };
	}

	public async mergeRunWorkspace(
		run: Run,
		mergeMode: RunMergeMode = "manual",
	): Promise<RunVcsMetadata> {
		if (run.status !== "completed") {
			throw new Error("Only completed runs can be merged.");
		}

		const vcs = run.metadata?.vcs;
		if (!vcs) {
			throw new Error("Run does not have a provisioned worktree.");
		}
		if (vcs.mergeStatus === "merged") {
			throw new Error("Run changes are already merged.");
		}
		if (!(await pathExists(vcs.worktreePath))) {
			throw new Error(`Run worktree is missing: ${vcs.worktreePath}`);
		}
		const worktreeBranch = await this.resolveCurrentBranch(vcs.worktreePath);
		if (worktreeBranch !== vcs.branchName) {
			throw new Error(
				`Run worktree must stay on ${vcs.branchName} before merge; current branch is ${worktreeBranch}.`,
			);
		}

		const repoRoot = await this.resolveRepoRoot(vcs.repoRoot);
		const currentBranch = await this.resolveCurrentBranch(repoRoot);
		if (currentBranch !== vcs.baseBranch) {
			throw new Error(
				`Project worktree must stay on ${vcs.baseBranch} before merge; current branch is ${currentBranch}.`,
			);
		}

		const baseStagedChanges = await this.hasStagedChanges(repoRoot);
		if (baseStagedChanges) {
			throw new Error(
				"Base project worktree has staged changes. Commit or unstage them before merge.",
			);
		}

		const preparedVcs = await this.prepareRunWorkspaceForMerge(run, vcs);

		const branchRef = `refs/heads/${preparedVcs.branchName}`;
		await this.git(repoRoot, ["show-ref", "--verify", branchRef]);

		const aheadCount = await this.countAheadCommits(
			repoRoot,
			preparedVcs.baseBranch,
			preparedVcs.branchName,
		);
		if (aheadCount === 0) {
			throw new Error("Run branch has no commits to merge.");
		}

		try {
			await this.git(repoRoot, [
				"merge",
				"--no-ff",
				"--no-commit",
				preparedVcs.branchName,
			]);
		} catch (error) {
			await this.abortMerge(repoRoot);
			throw this.wrapGitError(
				error,
				`Merge conflict detected for ${preparedVcs.branchName}`,
			);
		}

		try {
			const mergeFallback = `Merge run ${run.id.slice(0, 8)} for task ${run.taskId}`;
			const task = taskRepo.getById(run.taskId);
			const commitMsg = task?.commitMessage?.trim();
			const mergeMessage = commitMsg ? `Merge: ${commitMsg}` : mergeFallback;

			await this.git(repoRoot, ["commit", "-m", mergeMessage]);
		} catch (error) {
			await this.abortMerge(repoRoot);
			throw this.wrapGitError(error, "Merge commit failed");
		}

		const mergedCommit = await this.git(repoRoot, ["rev-parse", "HEAD"]);
		const headCommit = await this.git(vcs.worktreePath, ["rev-parse", "HEAD"]);

		return {
			...preparedVcs,
			headCommit,
			hasChanges: false,
			workspaceStatus: "merged",
			mergeStatus: "merged",
			mergedBy: mergeMode,
			mergedAt: new Date().toISOString(),
			mergedCommit,
			lastMergeError: undefined,
			cleanupStatus: "pending",
			cleanedAt: undefined,
			lastCleanupError: undefined,
		};
	}

	private async prepareRunWorkspaceForMerge(
		run: Run,
		vcs: RunVcsMetadata,
	): Promise<RunVcsMetadata> {
		if (!(await this.hasUncommittedChanges(vcs.worktreePath))) {
			return vcs;
		}

		const captureFallback = `Capture run ${run.id.slice(0, 8)} changes for task ${run.taskId}`;
		const task = taskRepo.getById(run.taskId);
		const captureMessage = task?.commitMessage?.trim() || captureFallback;

		await this.git(vcs.worktreePath, ["add", "-A"]);
		await this.gitWithConfig(vcs.worktreePath, [
			"commit",
			"-m",
			captureMessage,
		]);

		const headCommit = await this.git(vcs.worktreePath, ["rev-parse", "HEAD"]);

		return {
			...vcs,
			headCommit,
			hasChanges: false,
			workspaceStatus: "ready",
		};
	}

	public async cleanupRunWorkspace(
		vcs: RunVcsMetadata,
	): Promise<RunVcsMetadata> {
		if (vcs.mergeStatus !== "merged") {
			throw new Error("Only merged runs can be cleaned up.");
		}
		if (vcs.cleanupStatus === "cleaned") {
			return {
				...vcs,
				hasChanges: false,
				workspaceStatus: "cleaned",
			};
		}

		const repoRoot = await this.resolveRepoRoot(vcs.repoRoot);

		if (await pathExists(vcs.worktreePath)) {
			await this.git(repoRoot, ["worktree", "remove", vcs.worktreePath]);
		}
		await this.git(repoRoot, ["worktree", "prune"]);

		const branchRef = `refs/heads/${vcs.branchName}`;
		if (await this.branchExists(repoRoot, branchRef)) {
			await this.git(repoRoot, ["branch", "-d", vcs.branchName]);
		}

		return {
			...vcs,
			hasChanges: false,
			workspaceStatus: "cleaned",
			cleanupStatus: "cleaned",
			cleanedAt: new Date().toISOString(),
			lastCleanupError: undefined,
		};
	}

	public async commitAllChanges(
		projectPath: string,
		commitMessage: string,
	): Promise<{ commitHash: string }> {
		const repoRoot = await this.resolveRepoRoot(projectPath);

		await this.gitWithConfig(repoRoot, ["add", "-A"]);

		const hasChanges = await this.hasUncommittedChanges(repoRoot);
		if (!hasChanges) {
			const headCommit = await this.git(repoRoot, ["rev-parse", "HEAD"]);
			return { commitHash: headCommit };
		}

		await this.gitWithConfig(repoRoot, ["commit", "-m", commitMessage]);
		const commitHash = await this.git(repoRoot, ["rev-parse", "HEAD"]);

		log.info("Committed all changes on main branch", {
			projectPath,
			commitHash,
		});

		return { commitHash };
	}

	public async push(
		projectPath: string,
	): Promise<{ success: boolean; output: string }> {
		const repoRoot = await this.resolveRepoRoot(projectPath);
		const branch = await this.resolveCurrentBranch(repoRoot);
		const output = await this.git(repoRoot, ["push", "origin", branch]);
		log.info("Pushed to remote", { projectPath, branch });
		return { success: true, output };
	}

	private async resolveRepoRoot(projectPath: string): Promise<string> {
		return this.git(projectPath, ["rev-parse", "--show-toplevel"]);
	}

	private async resolveCurrentBranch(projectPath: string): Promise<string> {
		const branch = await this.git(projectPath, ["branch", "--show-current"]);
		if (!branch) {
			throw new Error(
				`Git repository is in detached HEAD state: ${projectPath}`,
			);
		}

		return branch;
	}

	private buildRunBranchName(
		taskId: string,
		taskTitle: string,
		runId: string,
	): string {
		const safeTaskId = sanitizeSegment(taskId, "task");
		const safeTitle = trimSegment(sanitizeSegment(taskTitle, "run"), 48);
		const safeRunId = sanitizeSegment(runId, "run").slice(0, 12);
		return `task/${safeTaskId}-${safeTitle}-${safeRunId}`;
	}

	private buildWorktreePath(
		repoRoot: string,
		taskId: string,
		taskTitle: string,
		runId: string,
	): string {
		const repoName = basename(repoRoot);
		const siblingRoot = join(dirname(repoRoot), `${repoName}.worktrees`);
		const safeTaskId = sanitizeSegment(taskId, "task");
		const safeTitle = trimSegment(sanitizeSegment(taskTitle, "run"), 32);
		const safeRunId = sanitizeSegment(runId, "run").slice(0, 8);
		return join(siblingRoot, `${safeTaskId}-${safeTitle}-${safeRunId}`);
	}

	private async countAheadCommits(
		projectPath: string,
		baseBranch: string,
		branchName: string,
	): Promise<number> {
		const raw = await this.git(projectPath, [
			"rev-list",
			"--right-only",
			"--count",
			`${baseBranch}...${branchName}`,
		]);
		const parsed = Number.parseInt(raw, 10);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	public async hasUncommittedChanges(projectPath: string): Promise<boolean> {
		const output = await this.git(projectPath, ["status", "--porcelain"]);
		return output.length > 0;
	}

	public async getAheadCount(projectPath: string): Promise<number> {
		const repoRoot = await this.resolveRepoRoot(projectPath);
		try {
			const raw = await this.git(repoRoot, [
				"rev-list",
				"--count",
				"@{upstream}..HEAD",
			]);
			const parsed = Number.parseInt(raw, 10);
			return Number.isFinite(parsed) ? parsed : 0;
		} catch {
			return 0;
		}
	}

	private async hasStagedChanges(projectPath: string): Promise<boolean> {
		const output = await this.git(projectPath, [
			"diff",
			"--cached",
			"--name-only",
		]);
		return output.length > 0;
	}

	private async branchExists(
		projectPath: string,
		branchRef: string,
	): Promise<boolean> {
		try {
			await this.git(projectPath, ["show-ref", "--verify", branchRef]);
			return true;
		} catch {
			return false;
		}
	}

	private async abortMerge(projectPath: string): Promise<void> {
		try {
			await this.git(projectPath, [
				"rev-parse",
				"-q",
				"--verify",
				"MERGE_HEAD",
			]);
		} catch {
			return;
		}

		try {
			await this.git(projectPath, ["merge", "--abort"]);
		} catch (error) {
			log.warn("Failed to abort merge", {
				projectPath,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private wrapGitError(error: unknown, prefix: string): Error {
		if (!(error instanceof Error)) {
			return new Error(prefix);
		}

		const message = error.message.trim();
		return new Error(message.length > 0 ? `${prefix}: ${message}` : prefix);
	}

	private async git(projectPath: string, args: string[]): Promise<string> {
		const { stdout } = await execFileAsync(
			"git",
			["-C", projectPath, ...args],
			{
				maxBuffer: 1024 * 1024,
			},
		);
		return stdout.trim();
	}

	private async gitWithConfig(
		projectPath: string,
		args: string[],
	): Promise<string> {
		const { stdout } = await execFileAsync(
			"git",
			[
				"-C",
				projectPath,
				"-c",
				"user.name=Kanban AI",
				"-c",
				"user.email=kanban-ai@example.com",
				...args,
			],
			{
				maxBuffer: 1024 * 1024,
			},
		);
		return stdout.trim();
	}

	private async gitRaw(
		projectPath: string,
		args: string[],
	): Promise<string | null> {
		try {
			const { stdout } = await execFileAsync(
				"git",
				["-C", projectPath, ...args],
				{
					maxBuffer: DIFF_MAX_BYTES + 1024,
				},
			);
			const output = stdout;
			if (Buffer.byteLength(output, "utf-8") > DIFF_MAX_BYTES) {
				return null;
			}
			return output;
		} catch (error) {
			log.warn("gitRaw command failed", {
				projectPath,
				args,
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		}
	}

	private parseUnifiedDiff(raw: string): DiffFile[] {
		const files: DiffFile[] = [];
		let currentFile: DiffFile | null = null;
		let currentHunk: DiffHunk | null = null;

		for (const line of raw.split("\n")) {
			const fileMatch = /^diff --git a\/(.+?) b\/(.+?)$/.exec(line);
			if (fileMatch) {
				if (currentFile && currentHunk) {
					currentFile.hunks.push(currentHunk);
				}
				currentFile = {
					path: fileMatch[2],
					addedLines: 0,
					removedLines: 0,
					hunks: [],
				};
				currentHunk = null;
				files.push(currentFile);
				continue;
			}

			const hunkMatch = /^@@[^@]+@@(.*)$/.exec(line);
			if (hunkMatch && currentFile) {
				if (currentHunk) {
					currentFile.hunks.push(currentHunk);
				}
				currentHunk = {
					header: line,
					lines: [],
				};
				continue;
			}

			if (!currentFile || !currentHunk) {
				continue;
			}

			if (line.startsWith("+")) {
				currentFile.addedLines += 1;
				currentHunk.lines.push({
					type: "added",
					content: line.slice(1),
				});
			} else if (line.startsWith("-")) {
				currentFile.removedLines += 1;
				currentHunk.lines.push({
					type: "removed",
					content: line.slice(1),
				});
			} else if (line.startsWith(" ")) {
				currentHunk.lines.push({
					type: "context",
					content: line.slice(1),
				});
			} else if (line.startsWith("\\") && line.includes("No newline")) {
				currentHunk.lines.push({
					type: "context",
					content: line,
				});
			}
		}

		if (currentFile && currentHunk) {
			currentFile.hunks.push(currentHunk);
		}

		return files;
	}
}

let vcsManager: VcsManager | null = null;

export function getVcsManager(): VcsManager {
	if (!vcsManager) {
		vcsManager = new VcsManager();
	}

	return vcsManager;
}
