# План миграции на Next.js

**Дата создания:** 2026-02-13
**Статус:** Планирование

## Контекст

Текущий стек:
- **packages/server**: Node.js backend (HTTP RPC + SSE, порт 3000)
- **packages/web**: React 19 + Vite (порт 5174)
- **src/renderer**: UI компоненты и экраны
- **packages/shared**: Общие типы

Целевой стек:
- **Next.js 15** с App Router
- **Server Actions** как прокси к packages/server
- **Tailwind CSS 4** (существующие стили)
- Только веб (без Electron)

## Архитектура после миграции

```
packages/
├── server/          # Существующий backend (порт 3000)
│   └── HTTP RPC + SSE
├── nextjs-app/      # NEW: Next.js App Router (порт 3001)
│   ├── app/         # Routes (App Router)
│   ├── components/  # UI компоненты
│   ├── actions/     # Server Actions (прокси → server)
│   └── lib/         # SSE hooks, utils
└── shared/          # Существующие типы
```

## API Communication

```
Client Component → Server Action → HTTP POST /rpc → packages/server
                                      ↓
                              {ok, result} | {error}
                              
SSE: Client Hook → GET /events → packages/server (EventStream)
```

---

## Этапы миграции

### Этап 1: Инициализация (высокий приоритет)

| #   | Задача                                   | Детали                                                               |
| --- | ---------------------------------------- | -------------------------------------------------------------------- |
| 1.1 | `pnpm create next-app packages/nextjs-app` | TypeScript, Tailwind, App Router, Turbopack                          |
| 1.2 | Настроить `next.config.ts`                 | transpilePackages: ['@kanban-ai/shared']                             |
| 1.3 | Установить зависимости                   | @dnd-kit/core, @dnd-kit/sortable, lucide-react, clsx, tailwind-merge |
| 1.4 | Перенести `tailwind.config.ts`             | Темная тема #0B0E14, существующие классы                             |

### Этап 2: API Layer (высокий приоритет)

| #   | Задача                            | Детали                                                                           |
| --- | --------------------------------- | -------------------------------------------------------------------------------- |
| 2.1 | Создать `lib/rpc-client.ts`         | HTTP клиент для POST /rpc → packages/server                                      |
| 2.2 | Создать `actions/*.ts`              | Server Actions для каждого домена (project, task, run, opencode, settings, etc.) |
| 2.3 | Создать `lib/sse.ts`                | Hook useSSE для подключения к GET /events                                        |
| 2.4 | Перенести типы из `packages/shared` | Переиспользовать существующие Zod schemas                                        |

**Server Actions паттерн:**
```typescript
// actions/project.ts
'use server'
import { rpc } from '@/lib/rpc-client'

export async function getProjects() {
  return rpc('project.list', {})
}

export async function createProject(data: CreateProjectInput) {
  return rpc('project.create', data)
}
```

### Этап 3: Layout + Navigation (высокий приоритет)

| #   | Задача                   | Детали                        |
| --- | ------------------------ | ----------------------------- |
| 3.1 | `app/layout.tsx`           | Root layout с провайдерами    |
| 3.2 | `app/(main)/layout.tsx`    | Layout с Sidebar              |
| 3.3 | Перенести `Sidebar.tsx`    | Адаптировать под Next.js Link |
| 3.4 | Темная тема по умолчанию | CSS переменные, класс .dark   |

### Этап 4: Страницы (средний приоритет)

| Route          | Источник              | Target                            |
| -------------- | --------------------- | --------------------------------- |
| `/`              | -                     | Редирект на `/projects`             |
| `/projects`      | `ProjectsScreen.tsx`    | `app/(main)/projects/page.tsx`      |
| `/board/[id]`    | `BoardScreen.tsx`       | `app/(main)/board/[id]/page.tsx`    |
| `/settings`      | `SettingsScreen.tsx`    | `app/(main)/settings/page.tsx`      |
| `/timeline/[id]` | `TimelineScreen.tsx`    | `app/(main)/timeline/[id]/page.tsx` |
| `/diagnostics`   | `DiagnosticsScreen.tsx` | `app/(main)/diagnostics/page.tsx`   |

### Этап 5: Компоненты (средний приоритет)

| Категория | Компоненты                                   |
| --------- | -------------------------------------------- |
| Kanban    | Board, Column, Task, TaskDrawer, ColumnModal |
| Settings  | ModelsManagement, TagManagement, DangerZone  |
| Common    | FileSystemPicker, ModelPicker, PillSelect    |
| Voice     | VoiceInputButton (если используется)         |

### Этап 6: Финализация (низкий приоритет)

| #   | Задача                                               |
| --- | ---------------------------------------------------- |
| 6.1 | Удалить `packages/web`                                 |
| 6.2 | Удалить `src/renderer`                                 |
| 6.3 | Обновить `pnpm-workspace.yaml`                         |
| 6.4 | Обновить `package.json` scripts (`dev:next`, `build:next`) |
| 6.5 | Проверить все импорты `@kanban-ai/shared`              |

---

## NPM Scripts

```json
{
  "dev": "concurrently \"pnpm dev:server\" \"pnpm dev:next\"",
  "dev:server": "pnpm --dir packages/server dev",
  "dev:next": "pnpm --dir packages/nextjs-app dev",
  "build": "pnpm --dir packages/server build && pnpm --dir packages/nextjs-app build",
  "start": "concurrently \"pnpm start:server\" \"pnpm start:next\"",
  "start:server": "node packages/server/dist/index.js",
  "start:next": "pnpm --dir packages/nextjs-app start"
}
```

---

## Риски и решения

| Риск | Решение |
| ---- | ------- |
| SSE в Server Components не работает | Использовать Client Components с useSSE hook |
| @dnd-kit требует 'use client' | Kanban компоненты — Client Components |
| Zod schemas в shared | Переиспользовать напрямую через workspace:* |
| Аутентификация | Сохранить X-Local-Token header паттерн |

---

## Чек-лист перед началом

- [ ] Убедиться что packages/server запускается и отвечает на /rpc
- [ ] Проверить SSE endpoint /events
- [ ] Зафиксировать текущее состояние в git
