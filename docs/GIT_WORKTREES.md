# Git Worktrees

## TL;DR

Kanban AI can optionally run AI agent tasks in isolated **git worktrees** instead of the main project directory. This prevents concurrent runs from stepping on each other's files. The feature is **disabled by default** — set `RUNS_WORKTREE_ENABLED=true` to opt in. Currently, only regular execution runs (mode `"execute"`) go through the worktree path. User Story generation runs and QA testing runs always use the main project directory.

---

## Opt-In and Default Behavior

Worktree isolation is **off by default**. To enable it, set the environment variable:

```
RUNS_WORKTREE_ENABLED=true
```

When disabled (the default), all runs execute directly in the main project directory and all file changes are committed to the current branch. When enabled, only execution runs get a worktree — other run types always use the main project directory regardless of this flag.

---

## Current Scope

| Run kind                                                 | Worktree?                          | How it works                                 |
| -------------------------------------------------------- | ---------------------------------- | -------------------------------------------- |
| Execution runs (`mode: "execute"`, `kind: "task-run"`)       | Yes, if `RUNS_WORKTREE_ENABLED=true` | Provisioned worktree with a temporary branch |
| User Story generation (`kind: "task-description-improve"`) | No                                 | Runs in main project directory               |
| QA testing (`kind: "task-qa-testing"`)                     | No                                 | Runs in main project directory               |

The worktree gating check in the code is:

```typescript
if (worktreeEnabled && (input.mode ?? "execute") === "execute") {
  // provision worktree
}
```

Generation and QA runs bypass this check entirely — they go through separate start paths that do not call `provisionRunWorkspace`.

---

## Lifecycle: Run WITHOUT Worktrees

When `RUNS_WORKTREE_ENABLED` is unset or not `"true"`, or when the run is a generation/QA run:

1. **Agent executes** directly in the main project directory on the current branch.
2. **On merge** (manual or automatic), the app calls `commitAllChanges`:
   - `git add -A` stages everything
   - If there are uncommitted changes, a commit is created on the current branch with the task's `commitMessage` (or a fallback like `"Merge run abc12345 for task Fix login bug"`)
   - If there are no changes, the current HEAD is used as the commit hash
3. **No cleanup needed** — `cleanupStatus` is set to `"cleaned"` immediately since there is no worktree to remove.

The commit author for auto-commits is configured as:

```
user.name=Kanban AI
user.email=kanban-ai@example.com
```

---

## Lifecycle: Run WITH Worktrees

When `RUNS_WORKTREE_ENABLED=true` and the run is an execution run:

### 1. Provisioning

The app creates a temporary branch and a sibling worktree directory:

**Branch name format:**
```
task/{sanitized-task-id}-{sanitized-task-title (max 48 chars)}-{sanitized-run-id (max 12 chars)}
```

**Worktree directory format:**
```
{repo-parent}/{repo-name}.worktrees/{sanitized-task-id}-{sanitized-task-title (max 32 chars)}-{sanitized-run-id (max 8 chars)}
```

**Concrete example** for task `"Fix Login Bug"` with `taskId="abc123"`, `runId="def45678"`:

| Component     | Value                                               |
| ------------- | --------------------------------------------------- |
| Branch        | `task/abc123-fix-login-bug-def45678`                  |
| Worktree path | `/projects/kanban-ai.worktrees/abc123-fix-login-def4` |

The sanitization function (`sanitizeSegment`) lowercases the input, replaces non-alphanumeric characters with hyphens, collapses multiple hyphens, and strips leading/trailing hyphens. If the result is empty, a fallback string is used (`"task"` for task IDs, `"run"` for titles and run IDs). The `trimSegment` function truncates to the max length and strips any trailing hyphens.

**Provisioning steps:**

1. Resolve the repo root and current branch (the "base branch")
2. Record the base commit SHA (`git rev-parse HEAD`)
3. Build the branch name and worktree path
4. Create the parent directory (`.worktrees/`) if it doesn't exist
5. Check that the worktree path doesn't already exist (fail if it does)
6. `git worktree prune` — clean stale refs first
7. `git worktree add -b <branchName> <worktreePath> <baseBranch>` — create the worktree on a new branch from the base
8. Verify HEAD in the worktree
9. Store all metadata (`repoRoot`, `worktreePath`, `branchName`, `baseBranch`, `baseCommit`, `headCommit`) in `RunVcsMetadata`

If provisioning fails at any point, the run is immediately marked as **failed** with the error message stored in `errorText`.

### 2. Agent Execution

The agent session is started with the **worktree path** as the project directory. All file modifications happen inside the isolated worktree. The main project directory remains untouched.

### 3. Merge

When the run completes and merge is triggered (automatically or manually):

1. **Pre-merge validation:**
   - Run status must be `"completed"`
   - The worktree directory must still exist
   - The worktree must be on the expected branch
   - The main repo must be on the base branch
   - The main repo must not have staged changes
   - The run branch must have commits ahead of the base branch

2. **Auto-commit uncommitted changes:** If the worktree has uncommitted changes, they are committed automatically with a capture message (e.g., `"Capture run def45678 changes for task abc123"` or the task's `commitMessage` if available). The commit author is `Kanban AI <kanban-ai@example.com>`.

3. **Merge into base branch:**
   ```
   git merge --no-ff --no-commit <branchName>
   ```
   Then a commit is created with the message. If the task has a `commitMessage`, the merge message is `"Merge: <commitMessage>"`. Otherwise a fallback like `"Merge run def45678 for task abc123"` is used.

4. **On conflict:** The merge is aborted (`git merge --abort`) and the error is stored in `lastMergeError`. The run metadata reflects `mergeStatus: "pending"` with the error details.

5. **On success:** `mergeStatus` is set to `"merged"`, and the merge commit SHA is recorded in `mergedCommit`.

### 4. Cleanup

After a successful merge, cleanup is attempted:

1. `git worktree remove <worktreePath>` — remove the worktree directory
2. `git worktree prune` — clean stale refs
3. `git branch -d <branchName>` — delete the temporary branch (only if it still exists)

**Cleanup is best-effort.** It runs inside a `try/catch`. If any step fails:

- `mergeStatus` remains `"merged"` — the merge itself succeeded
- `cleanupStatus` is set to `"failed"`
- `lastCleanupError` stores the error message
- The worktree directory and/or branch may remain on disk

---

## Naming and Path Conventions

### Branch Name Construction

```
task/${sanitizeSegment(taskId, "task")}-${trimSegment(sanitizeSegment(taskTitle, "run"), 48)}-${sanitizeSegment(runId, "run").slice(0, 12)}
```

- Task ID: sanitized, full length
- Task title: sanitized, trimmed to 48 characters
- Run ID: sanitized, sliced to first 12 characters

### Worktree Path Construction

```
{dirname(repoRoot)}/{basename(repoRoot)}.worktrees/${sanitizeSegment(taskId, "task")}-${trimSegment(sanitizeSegment(taskTitle, "run"), 32)}-${sanitizeSegment(runId, "run").slice(0, 8)}
```

- Task ID: sanitized, full length
- Task title: sanitized, trimmed to 32 characters (shorter than the branch name)
- Run ID: sanitized, sliced to first 8 characters (shorter than the branch name)

### Examples

| Task Title                                | Task ID | Run ID   | Branch Name                                                    | Worktree Dir Name                            |
| ----------------------------------------- | ------- | -------- | -------------------------------------------------------------- | -------------------------------------------- |
| Fix Login Bug                             | `abc123`  | `def45678` | `task/abc123-fix-login-bug-def45678`                             | `abc123-fix-login-def4`                        |
| Implement user authentication with OAuth2 | `xyz789`  | `ghi01234` | `task/xyz789-implement-user-authentication-with-oauth2-ghi01234` | `xyz789-implement-user-authentication-wi-ghi0` |
| Bug #42                                   | `t1b2c3`  | `r4d5e6f7` | `task/t1b2c3-bug-42-r4d5e6f7`                                    | `t1b2c3-bug-42-r4d5e6f`                        |

---

## Merge Behavior

The current implementation uses **local merge orchestration** — not pull requests or merge requests. The merge happens on the local git repository:

- `git merge --no-ff --no-commit <branch>` followed by `git commit -m <message>`
- Merge commits always use `--no-ff` (even if fast-forward is possible, a merge commit is created)
- The `--no-commit` flag lets the system set a custom commit message
- Merge can be triggered **automatically** after run completion or **manually** through the UI

There is no PR/MR workflow in the current implementation.

---

## Failure Modes

### Worktree Provisioning Failure

If the worktree cannot be created (e.g., branch name collision, directory already exists, git error):

- The run is immediately marked as **failed**
- The error message is stored in the run's `errorText`
- No worktree or branch is left behind (the provisioning step is atomic — either it fully succeeds or the run fails)

### Merge Conflict

If `git merge --no-ff --no-commit` detects conflicts:

- The merge is **aborted** (`git merge --abort`)
- `mergeStatus` remains `"pending"`
- `lastMergeError` stores the conflict message (e.g., `"Merge conflict detected for task/abc123-fix-login-bug-def45678: ..."`)
- The run's VCS metadata still shows the worktree as `workspaceStatus: "dirty"` or `"ready"`
- Manual intervention is required to resolve the conflict and retry the merge

### Cleanup Failure

If worktree removal, pruning, or branch deletion fails:

- `mergeStatus` is **still `"merged"`** — the merge succeeded
- `cleanupStatus` is set to `"failed"`
- `lastCleanupError` contains the error message
- The worktree directory and/or branch may remain on disk
- A subsequent cleanup attempt can be made manually (see commands below)

---

## Run VCS Metadata Fields

Each run with a worktree stores a `RunVcsMetadata` object:

| Field            | Description                                         |
| ---------------- | --------------------------------------------------- |
| `repoRoot`         | Absolute path to the main git repository            |
| `worktreePath`     | Absolute path to the worktree directory             |
| `branchName`       | Name of the temporary branch                        |
| `baseBranch`       | Branch the worktree was created from                |
| `baseCommit`       | SHA of the base branch at provisioning time         |
| `headCommit`       | Current HEAD in the worktree                        |
| `hasChanges`       | Whether the worktree has uncommitted changes        |
| `workspaceStatus`  | `"ready"`, `"dirty"`, `"merged"`, `"cleaned"`, or `"missing"` |
| `mergeStatus`      | `"pending"` or `"merged"`                               |
| `mergedBy`         | `"manual"` or `"automatic"`                             |
| `mergedAt`         | ISO timestamp of when merge completed               |
| `mergedCommit`     | SHA of the merge commit on the base branch          |
| `lastMergeError`   | Error message if merge failed                       |
| `cleanupStatus`    | `"pending"`, `"cleaned"`, or `"failed"`                   |
| `cleanedAt`        | ISO timestamp of successful cleanup                 |
| `lastCleanupError` | Error message if cleanup failed                     |

---

## Practical Recommendations

1. **Don't enable worktrees unless you need parallel runs.** If you only run one task at a time (`RUNS_DEFAULT_CONCURRENCY=1`), worktrees add complexity with no benefit.

2. **Keep the `.worktrees/` directory out of version control.** It's a sibling of the repo root, not inside it, so it won't be tracked. But if you have scripts that traverse parent directories, be aware of it.

3. **Avoid manual edits in the main project directory while worktree runs are active.** The merge step checks for staged changes on the base branch and will refuse to merge if any exist.

4. **Don't switch branches in the main project while a worktree run is in progress.** The merge step validates that the main repo is still on the expected base branch.

5. **The commit message comes from the task's `commitMessage` field.** This is typically set during User Story generation. If it's missing, a fallback message is generated from the run ID and task ID.

6. **Monitor `cleanupStatus` after runs.** Failed cleanups leave worktree directories and branches behind. Over time these accumulate and consume disk space.

---

## Useful Git Commands

### Inspect active worktrees

```bash
# List all worktrees with their branches
git worktree list

# Example output:
# /projects/kanban-ai                              abc1234 [main]
# /projects/kanban-ai.worktrees/abc123-fix-login-def4  56789ef [task/abc123-fix-login-bug-def45678]
```

### Check worktree status

```bash
# Check for uncommitted changes in a specific worktree
git -C /projects/kanban-ai.worktrees/abc123-fix-login-def4 status --porcelain
```

### Prune stale worktree references

```bash
# Remove references to worktrees whose directories no longer exist
git worktree prune
```

### Manually remove a worktree

```bash
# Remove a worktree (fails if there are uncommitted changes)
git worktree remove /projects/kanban-ai.worktrees/abc123-fix-login-def4

# Force remove (discards uncommitted changes)
git worktree remove --force /projects/kanban-ai.worktrees/abc123-fix-login-def4
```

### Delete a temporary branch

```bash
# Delete a merged branch
git branch -d task/abc123-fix-login-bug-def45678

# Force delete an unmerged branch
git branch -D task/abc123-fix-login-bug-def45678
```

### Full manual cleanup

```bash
# 1. Remove the worktree
git worktree remove --force /projects/kanban-ai.worktrees/abc123-fix-login-def4

# 2. Prune stale refs
git worktree prune

# 3. Delete the branch
git branch -d task/abc123-fix-login-bug-def45678
```

### Bulk cleanup of all leftover worktrees

```bash
# List all worktrees (skip the first line which is the main repo)
git worktree list | tail -n +2 | while read path commit branch; do
  echo "Removing: $path ($branch)"
  git worktree remove --force "$path" 2>/dev/null
done
git worktree prune
```

---

## Troubleshooting

### "Worktree path already exists"

**Symptom:** A run fails during provisioning with `Worktree path already exists`.

**Cause:** A previous run for the same task left a worktree directory behind (e.g., cleanup failed or was interrupted).

**Fix:**
```bash
# Remove the leftover directory
git worktree remove --force /projects/kanban-ai.worktrees/abc123-fix-login-def4
git worktree prune
```

### "already checked out at..."

**Symptom:** Git refuses to check out or create a branch because it's already checked out in another worktree.

**Cause:** A worktree is still associated with the branch.

**Fix:**
```bash
# Find which worktree has the branch
git worktree list

# Remove that worktree first
git worktree remove --force /path/to/worktree
```

### "Base project worktree has staged changes"

**Symptom:** Merge fails with `Base project worktree has staged changes. Commit or unstage them before merge.`

**Cause:** Someone (or something) staged changes in the main project directory while a worktree run was active.

**Fix:**
```bash
# Check what's staged
git diff --cached --name-only

# Either commit the changes
git commit -m "WIP"

# Or unstage them
git restore --staged .
```

### "Run branch has no commits to merge"

**Symptom:** Merge fails because the worktree branch has no commits ahead of the base.

**Cause:** The agent didn't make any changes, or all changes were reverted.

**Fix:** This is expected for no-op runs. The run can be left as-is — no merge is needed.

### Merge conflict during automatic merge

**Symptom:** Automatic merge is deferred with `lastMergeError` containing "Merge conflict detected."

**Cause:** Files modified in the worktree conflict with changes on the base branch.

**Fix:**
```bash
# Check the worktree status
git -C /projects/kanban-ai.worktrees/abc123-fix-login-def4 log --oneline -5

# Option 1: Manually merge with conflict resolution
cd /projects/kanban-ai
git merge --no-ff task/abc123-fix-login-bug-def45678
# resolve conflicts, then:
git add -A && git commit -m "Merge task/abc123-fix-login-bug-def45678 (conflicts resolved)"

# Option 2: Reset and retry
cd /projects/kanban-ai.worktrees/abc123-fix-login-def4
# rebase or resolve as needed
```

### Stale `.worktrees/` directories accumulating

**Symptom:** The `.worktrees/` sibling directory contains many old directories consuming disk space.

**Cause:** Cleanup failures over time, or the process was killed before cleanup could run.

**Fix:**
```bash
# Check which worktrees git knows about
git worktree list

# Prune worktrees whose directories are gone
git worktree prune

# Find directories that exist but git doesn't track
ls /projects/kanban-ai.worktrees/
# Manually remove any leftover directories:
rm -rf /projects/kanban-ai.worktrees/abc123-old-task-dir
```

### Process stuck in a worktree directory

**Symptom:** `git worktree remove` fails because a process is using the directory.

**Fix:**
```bash
# Find the process
lsof +D /projects/kanban-ai.worktrees/abc123-fix-login-def4

# Kill the process
kill -9 <PID>

# Then retry removal
git worktree remove --force /projects/kanban-ai.worktrees/abc123-fix-login-def4
```
