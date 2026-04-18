# Kanban AI

A web application for project and task management with integration with [Headless OpenCode](https://github.com/nicepkg/opencode) and [oh-my-openagent](https://github.com/nicepkg/oh-my-openagent).

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
| `STORY_LANGUAGE` | `.env` | Language for AI-generated stories: `en` or `ru` (default: `en`) |
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

The project supports Git Worktrees for parallel development of multiple tasks. Each task can run in an isolated worktree directory with its own branch.

**Currently disabled.** Tasks run on the main branch. To enable, set the environment variable:

```
RUNS_WORKTREE_ENABLED=true
```

**Structure (when enabled):**
```
kanban-ai/                    # Main directory (master)
kanban-ai.worktrees/          # Worktrees for active tasks
├── {task-id}-git-worktrees-{sha}/
└── ...
```

**Commands:**
```bash
git worktree list                                          # List worktrees
git worktree add -b task/ID ../kanban-ai.worktrees/ID-xxx  # Create
git worktree remove ../kanban-ai.worktrees/ID-xxx          # Remove
```

See [docs/GIT_WORKTREES.md](docs/GIT_WORKTREES.md) for details.

## Additional Documentation

- [Git Worktrees](docs/GIT_WORKTREES.md)
- [Style Guide](docs/STYLE_GUIDE.md)
- [LLM Error Samples](docs/LLM_ERRORS_SAMPLES.md)
- [LLM Loop Detection](docs/llm-loop-detection.md)
