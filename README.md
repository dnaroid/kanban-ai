# Kanban AI

Веб-приложение для управления проектами с интеграцией Headless OpenCode и oh-my-openagent.

## Phase 0: Каркас приложения

Текущая версия (Phase 0) включает:

- **Vite + React + TypeScript**: Быстрая разработка с горячей перезагрузкой
- **SQLite**: Локальное хранилище с миграциями (через better-sqlite3)
- **Server**: Node.js сервер для backend логики
- **Логирование**: Структурированные логи с системой диагностики
- **UI**: Базовые экраны (Projects, Diagnostics)

## Установка

```bash
pnpm install
```

## Troubleshooting

### Проблема: OpenCode ищет сессию в другом проекте (NotFoundError)

**Симптомы:**

- `NotFoundError: Resource not found: .../storage/session/<wrong_project_id>/<session_id>.json`
- Сессия создается, но `prompt` или чтение сообщений падает

**Корневая причина:**

`@opencode-ai/sdk` определяет проект по заголовку `x-opencode-directory`. Если не передать `directory` при создании клиента, сервер использует дефолтную директорию и вычисляет другой `projectId`.

**Решение:**

Передавайте `directory` при создании клиента:

```ts
const client = createOpencodeClient({
  baseUrl: process.env.OPENCODE_URL || 'http://127.0.0.1:4096',
  throwOnError: true,
  directory: projectPath,
})
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
