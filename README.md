# Kanban AI

Kanban AI is a kanban-style task manager with built-in AI task execution.

It allows tasks to be turned into runs, tracks their progress, supports follow-up questions during execution, and keeps the result tied to the task workflow.

## Features

- Kanban board for managing project tasks
- AI runs started directly from tasks
- Run status tracking and execution history
- Follow-up questions and pause/resume flow during execution
- Task state updates based on run results
- Role-based agent presets
- Context snapshots and linked task data
- SQLite-based local storage
- Optional Git worktree isolation for runs

## How it works

1. Create or open a project board.
2. Add tasks and organize them in the workflow.
3. Start an AI run for a task.
4. The system tracks the run and updates its status.
5. If the agent needs clarification, the run can pause and wait for user input.
6. When execution finishes, the result stays connected to the task and workflow.

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Turbopack)
- **UI**: [React 19](https://react.dev/), [Tailwind CSS 4](https://tailwindcss.com/), [Radix UI](https://www.radix-ui.com/), [Lucide icons](https://lucide.dev/)
- **Language**: [TypeScript 5.9](https://www.typescriptlang.org/)
- **Database**: SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **Drag & Drop**: [@dnd-kit](https://dndkit.com/)
- **AI Integration**: [@opencode-ai/sdk](https://github.com/nicepkg/opencode)
- **Diagramming**: [Mermaid](https://mermaid.js.org/)
- **Testing**: [Vitest](https://vitest.dev/)
- **Linting**: [ESLint 9](https://eslint.org/)

## Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [pnpm](https://pnpm.io/) v9+

## Setup

```bash
# Clone the repository
git clone <repo-url> kanban-ai
cd kanban-ai

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
cp packages/next-js/.env.local.example packages/next-js/.env.local
```

### Environment Variables

| Variable | File | Description |
|---|---|---|
| `OPENCODE_PORT` | `.env` | Port for the OpenCode server (default: `4096`) |
| `OPENCODE_URL` | `.env` | URL for connecting to the OpenCode SDK |
| `STORY_LANGUAGE` | `.env` | Language for AI-generated stories — any ISO 639-1 code, e.g. `en`, `ru`, `de`, `fr` (default: `en`) |
| `NEXT_PUBLIC_API_URL` | `packages/next-js/.env.local` | API URL (default: `http://127.0.0.1:3000`) |
| `NEXT_PUBLIC_APP_URL` | `packages/next-js/.env.local` | App URL (default: `http://127.0.0.1:3100`) |
| `RUNS_DEFAULT_CONCURRENCY` | `packages/next-js/.env.local` | Default run concurrency |
| `RUNS_PROVIDER_CONCURRENCY` | `packages/next-js/.env.local` | Per-provider concurrency limits |
| `RUNS_WORKTREE_ENABLED` | `packages/next-js/.env.local` | Enable Git worktree isolation for regular execution runs (experimental, default: `false`) |

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server (port `3100`, Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run tests in watch mode |
| `pnpm test:run` | Run tests once |
| `pnpm e2e` | Run E2E tests (Playwright, Chromium) |
| `pnpm e2e:ui` | Run E2E tests with Playwright UI |
| `pnpm e2e:headed` | Run E2E tests in headed browser mode |
| `pnpm e2e:debug` | Run E2E tests in debug mode |

## Project Structure

```
kanban-ai/
├── packages/
│   ├── next-js/          # Main Next.js application
│   │   └── src/
│   │       ├── app/      # Next.js App Router pages and layouts
│   │       ├── components/  # Shared UI components
│   │       ├── features/    # Feature modules
│   │       ├── lib/         # Shared utilities
│   │       ├── server/      # Server-side logic
│   │       └── types/       # TypeScript type definitions
│   └── tsconfig.base.json  # Shared TypeScript config
├── docs/                  # Supplementary documentation
├── .env.example           # Root environment variables
└── package.json           # Root workspace config
```

## Quality Gates

| Check | Command |
|---|---|
| Linting | `pnpm lint` |
| Tests | `pnpm test:run` |
| E2E Tests | `pnpm e2e` |

Additional tooling configured: [Prettier](https://prettier.io/) (`.prettierrc`), TypeScript strict mode.

## E2E Testing

End-to-end tests use [Playwright](https://playwright.dev/) with a fake AI runtime (no real AI calls).

### Quick Start

```bash
pnpm e2e              # run all E2E tests
pnpm e2e:ui           # interactive test UI
```

### How It Works

- Tests run against the Next.js dev server started automatically by Playwright
- Each test run gets an **isolated SQLite database** in a temp directory
- A **fake AI runtime** simulates run execution without external dependencies
- Database is cleaned up after each run

### Configuration

E2E settings are in `.env.e2e`:

| Variable | Default | Description |
|---|---|---|
| `AI_RUNTIME_MODE` | `fake` | Always `fake` for E2E |
| `AI_RUNTIME_FAKE_SCENARIO` | `happy-path` | Fake scenario to use (`happy-path`, `pause-resume`, `failure`) |

### Test Scenarios

Tests are organized in `e2e/tests/`:
- **Smoke** — app loads, boards render
- **Create Task** — task creation via modal, seeded tasks display
- **Run Happy Path** — starting and viewing AI runs

## Git Worktrees

Git worktree support is **opt-in** and disabled by default. Set `RUNS_WORKTREE_ENABLED=true` to enable it.

When enabled, regular execution runs (mode `"execute"`) are isolated in a dedicated worktree — a separate working directory on its own branch — so changes don't affect the main project directory until explicitly merged. User Story generation and QA testing runs always execute in the main project directory and do not use worktrees.

When disabled (the default), all runs work directly in the main project directory.

After merging a completed run, the worktree and branch are cleaned up automatically. Cleanup is best-effort; if it fails (e.g., a process is still holding a file lock), manual cleanup may be needed.

See [docs/GIT_WORKTREES.md](docs/GIT_WORKTREES.md) for full details and troubleshooting.

## Additional Documentation

- [Git Worktrees](docs/GIT_WORKTREES.md)
- [Style Guide](docs/STYLE_GUIDE.md)
- [LLM Error Samples](docs/LLM_ERRORS_SAMPLES.md)
- [LLM Loop Detection](docs/llm-loop-detection.md)
