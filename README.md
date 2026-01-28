# Kanban AI

Электронное приложение для управления проектами с интеграцией Headless OpenCode и oh-my-opencode.

## Phase 0: Каркас приложения

Текущая версия (Phase 0) включает базовый каркас Electron-приложения:

- **Vite + React + TypeScript**: Быстрая разработка с горячей перезагрузкой
- **Electron**: Десктопное приложение с безопасным процессом
- **IPC с валидацией**: Типобезопасная коммуникация main ↔ renderer через zod
- **SQLite**: Локальное хранилище с миграциями
- **SecretStore**: Безопасное хранение секретов (safeStorage + mock fallback)
- **Логирование**: Структурированные логи с системой диагностики
- **UI**: Базовые экраны (Projects, Diagnostics)

## Установка

```bash
pnpm install
```

## Разработка

```bash
pnpm dev              # Vite dev server (localhost:5173)
pnpm electron:dev     # Полная Electron dev среда
pnpm typecheck        # Проверка типов TypeScript
pnpm test             # Запуск тестов
pnpm quality          # Все проверки качества
```

## Quality Gates

- **TypeScript**: `pnpm typecheck`
- **Linting**: `pnpm lint`
- **Formatting**: `pnpm format:check`
- **Tests**: `pnpm test:run`
- **Все проверки**: `pnpm quality`

## Структура проекта

```
src/
├── main/           # Main process (Electron)
│   ├── ipc/        # IPC handlers + validation
│   ├── db/         # SQLite + репозитории
│   ├── secrets/    # SecretStore
│   └── log/        # Logger
├── preload/        # Preload bridge (contextIsolation)
├── renderer/       # React UI
│   ├── screens/    # Экраны приложений
│   └── components/ # React компоненты
└── shared/         # Общие типы
```

## Фаза 0 завершена

Следующие фазы будут включать:
- Git integration (clone, status, branch-per-task)
- AI agents (Sisyphus, Oracle, Librarian)
- PR workflow (автоматизация через OpenCode)
- Канбан доска с drag-and-drop

## Лицензия

MIT
