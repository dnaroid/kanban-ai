# Kanban AI

Веб-приложение для управления проектами с интеграцией Headless OpenCode и oh-my-openagent.

## Установка

```bash
pnpm install
```

## Git Worktrees

Проект поддерживает Git Worktrees для параллельной разработки нескольких задач. Каждая задача может выполняться в отдельной директории worktree с изолированной веткой.

**В настоящее время отключено.** Задачи выполняются в основной ветке проекта. Для включения установите переменную окружения:

```
RUNS_WORKTREE_ENABLED=true
```

**Структура (при включении):**
```
kanban-ai/                    # Главная директория (master)
kanban-ai.worktrees/          # Worktrees для активных задач
├── {task-id}-git-worktrees-{sha}/
└── ...
```

**Основные команды:**
```bash
git worktree list                                          # Список worktrees
git worktree add -b task/ID ../kanban-ai.worktrees/ID-xxx  # Создать
git worktree remove ../kanban-ai.worktrees/ID-xxx          # Удалить
```

См. подробную документацию: [docs/GIT_WORKTREES.md](docs/GIT_WORKTREES.md)

## Quality Gates

- **TypeScript**: `pnpm typecheck`
- **Linting**: `pnpm lint`
- **Formatting**: `pnpm format:check`
- **Tests**: `pnpm test:run`
- **Все проверки**: `pnpm quality`
