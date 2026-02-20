# OpenCode SDK — Получение списка агентов

Документация по использованию `@opencode-ai/sdk` для получения доступных AI-агентов.

## Установка

SDK уже установлен в проекте:

```bash
pnpm add @opencode-ai/sdk
```

Текущая версия: `^1.1.42` (см. `packages/next-js/package.json`)

## Базовое использование

### Импорт и создание клиента

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";

const client = createOpencodeClient({
  baseUrl: "http://127.0.0.1:4096",
  throwOnError: true,
  directory: process.cwd(), // Важно: передать directory для корректного projectId
});
```

### Получение списка агентов

```typescript
const response = await client.app.agents();
const agents = response.data; // Array<Agent>
```

### Получение списка навыков (skills)

```typescript
const response = await client.app.skills();
const skills = response.data; // Array<Skill>
```

## Типы данных

### Agent

```typescript
type Agent = {
  name: string;              // Имя агента
  description?: string;      // Описание агента
  mode: "subagent" | "primary" | "all";
  native?: boolean;          // Встроенный агент
  hidden?: boolean;          // Скрыт из меню автодополнения
  color?: string;            // Цвет в UI
  temperature?: number;      // Temperature для генерации
  topP?: number;             // Top-p для генерации
  permission: PermissionRuleset;
  model?: {
    modelID: string;
    providerID: string;
  };
  variant?: string;          // Модель по умолчанию для агента
  prompt?: string;           // Системный промпт
  options: Record<string, unknown>;
  steps?: number;            // Макс. агентских итераций
};
```

### Skill

```typescript
type Skill = {
  name: string;
  description: string;
  location: string;
  content: string;
};
```

## Пример: Next.js API Route

```typescript
// app/api/opencode/agents/route.ts
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";
import { getOpencodeService } from "@/server/opencode/opencode-service";
import { NextResponse } from "next/server";

export async function GET() {
  const service = getOpencodeService();
  await service.start();

  const client = createOpencodeClient({
    baseUrl: `http://127.0.0.1:${service.getPort()}`,
    throwOnError: true,
    directory: process.cwd(),
  });

  const agents = await client.app.agents();
  return NextResponse.json({ success: true, data: agents.data });
}
```

## Пример: Фильтрация агентов

```typescript
// Только primary агенты
const primaryAgents = agents.filter(a => a.mode === "primary" || a.mode === "all");

// Только видимые агенты
const visibleAgents = agents.filter(a => !a.hidden);

// Нативные агенты
const nativeAgents = agents.filter(a => a.native);
```

## Связанные файлы проекта

- `packages/next-js/src/server/opencode/opencode-service.ts` — управление процессом OpenCode
- `packages/next-js/src/server/opencode/models-store.ts` — работа с моделями через SDK
- `packages/next-js/src/app/api/opencode/` — API endpoints

## Примечания

1. **directory** — критически важный параметр. Без него сервер вычислит другой `projectId` и сессии не будут найдены.

2. **OpencodeService** — singleton-класс для управления процессом `opencode serve`. Автоматически находит запущенный процесс или стартует новый.

3. SDK имеет несколько точек входа:
   - `@opencode-ai/sdk` — основной вход
   - `@opencode-ai/sdk/v2/client` — клиент v2 (рекомендуется)
   - `@opencode-ai/sdk/v2/server` — серверные утилиты
