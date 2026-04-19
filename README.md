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

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server (port `3100`, Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run tests in watch mode |
| `pnpm test:run` | Run tests once |

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

Additional tooling configured: [Prettier](https://prettier.io/) (`.prettierrc`), TypeScript strict mode.

## Git Worktrees

Git Worktree support is planned but currently disabled.

At the moment, tasks run on the main project directory and branch. The `RUNS_WORKTREE_ENABLED` flag exists for development, but this feature is not considered ready yet.

See [docs/GIT_WORKTREES.md](docs/GIT_WORKTREES.md) for design notes and planned behavior.

## Additional Documentation

- [Git Worktrees](docs/GIT_WORKTREES.md)
- [Style Guide](docs/STYLE_GUIDE.md)
- [LLM Error Samples](docs/LLM_ERRORS_SAMPLES.md)
- [LLM Loop Detection](docs/llm-loop-detection.md)
