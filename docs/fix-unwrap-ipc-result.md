# Исправление ошибки unwrapIpcResult в Web версии

## Проблема

После миграции с Electron IPC на Web RPC фронтенд получает ошибку:

```
TypeError: Cannot read properties of undefined (reading 'code')
    at unwrapIpcResult (ipc-result.ts:8:36)
```

## Корневая причина

**Двойная распаковка Result**:

1. **Backend возвращает**: `{ok: true, result: {runs: [...]}}`
2. **HttpTransport распаковывает**: `{ok: true, result: X}` → `X` (возвращает данные напрямую)
3. **unwrapIpcResult ожидает**: `{ok: true, data: X}` (старый IPC формат)
4. **Получает**: `{runs: [...]}` ← пытается прочитать `.code` → **undefined**

**Проблема**: `HttpTransport` уже распаковал результат, а `unwrapIpcResult` пытается распаковать ещё раз.

---

## Решение

### Шаг 1: Найти все вызовы unwrapIpcResult

```bash
# Найти все файлы с unwrapIpcResult
grep -rn "unwrapIpcResult" src/renderer --include="*.ts" --include="*.tsx" | grep -v "ipc-result.ts"
```

### Шаг 2: Определить паттерн вызова

Есть 3 паттерна использования:

#### Паттерн 1: Inline вызов

```typescript
// ❌ BEFORE:
const response = unwrapIpcResult(await window.api.task.listByBoard({ boardId }))

// ✅ AFTER:
const response = await window.api.task.listByBoard({ boardId })
```

**Автоматическое исправление**:

```bash
find src/renderer -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's/unwrapIpcResult(await /await /g'
```

#### Паттерн 2: Отдельная переменная

```typescript
// ❌ BEFORE:
const result = await window.api.run.listByTask({ taskId })
const response = unwrapIpcResult(result)

// ✅ AFTER:
const response = await window.api.run.listByTask({ taskId })
```

**Автоматическое исправление**:

```bash
find src/renderer -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's/const \(.*\) = unwrapIpcResult(\(.*\))/const \1 = \2/g'
```

#### Паттерн 3: Multiline вызов

```typescript
// ❌ BEFORE:
const response = unwrapIpcResult(
  await window.api.run.start({
    taskId: task.id,
    roleId: selectedRoleId,
  })
)

// ✅ AFTER:
const response = await window.api.run.start({
  taskId: task.id,
  roleId: selectedRoleId,
})
```

**Исправление**: Вручную удалить `unwrapIpcResult()` wrapper

### Шаг 3: Удалить импорты

```bash
# Удалить все импорты unwrapIpcResult
find src/renderer -name "*.ts" -o -name "*.tsx" | xargs sed -i '' '/import.*unwrapIpcResult/d'
```

### Шаг 4: Исправить TypeScript типы

Создать файл `packages/web/src/api/types.ts`:

```typescript
export interface KanbanApi {
  run: {
    listByTask(params: { taskId: string }): Promise<{ runs: Run[] }>
    start(params: { taskId: string; roleId: string; mode?: string }): Promise<{ runId: string }>
    cancel(params: { runId: string }): Promise<void>
  }
  task: {
    listByBoard(params: { boardId: string }): Promise<{ tasks: Task[] }>
    create(params: CreateTaskParams): Promise<{ task: Task }>
    update(params: UpdateTaskParams): Promise<{ task: Task }>
    delete(params: { taskId: string }): Promise<void>
  }
  board: {
    getDefault(params: { projectId: string }): Promise<{ board: Board; columns: Column[] }>
  }
  project: {
    list(): Promise<{ projects: Project[] }>
    create(params: CreateProjectParams): Promise<{ project: Project }>
  }
  // Добавить другие методы по необходимости
}

declare global {
  interface Window {
    api: KanbanApi
  }
}
```

Обновить `packages/web/src/api/index.ts`:

```typescript
import type { KanbanApi } from './types'

export function createApiTransport(): KanbanApi {
  // ... existing code
}
```

### Шаг 5: Проверить исправления

```bash
# Проверить что все вызовы удалены
grep -rn "unwrapIpcResult" src/renderer --include="*.ts" --include="*.tsx" | grep -v "ipc-result.ts" | wc -l

# Должно быть: 0

# Запустить TypeScript проверку
pnpm tsc --noEmit
```

---

## Автоматизация

### Полный скрипт исправления

Создать `scripts/fix-unwrap-ipc-result.sh`:

```bash
#!/bin/bash

echo "🔍 Finding unwrapIpcResult calls..."
CALLS=$(grep -rn "unwrapIpcResult" src/renderer --include="*.ts" --include="*.tsx" | grep -v "ipc-result.ts" | wc -l)
echo "Found $CALLS calls to fix"

if [ "$CALLS" -eq 0 ]; then
  echo "✅ No calls found!"
  exit 0
fi

echo ""
echo "🔧 Fixing Pattern 1: inline calls..."
find src/renderer -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's/unwrapIpcResult(await /await /g'

echo "🔧 Fixing Pattern 2: separate variable..."
find src/renderer -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's/const \(.*\) = unwrapIpcResult(\(.*\))/const \1 = \2/g'

echo "🔧 Fixing extra brackets..."
find src/renderer -name "*.ts" -o -name "*.tsx" | xargs sed -i '' 's/}))$/})/g'

echo "🔧 Removing imports..."
find src/renderer -name "*.ts" -o -name "*.tsx" | xargs sed -i '' '/import.*unwrapIpcResult/d'

echo ""
echo "✅ Automated fixes applied!"
echo ""
echo "📊 Remaining calls (may need manual fix):"
grep -rn "unwrapIpcResult" src/renderer --include="*.ts" --include="*.tsx" | grep -v "ipc-result.ts"

echo ""
echo "⚠️  Manual steps required:"
echo "1. Fix multiline calls (Pattern 3)"
echo "2. Update TypeScript types if needed"
echo "3. Run: pnpm tsc --noEmit"
```

---

## Проверка на новых страницах

### Быстрая проверка

```bash
# Проверить конкретную страницу
grep -rn "unwrapIpcResult" src/renderer/features/YOUR_FEATURE --include="*.ts" --include="*.tsx"
```

### Тестирование RPC

```bash
# Протестировать конкретный метод
curl -s http://127.0.0.1:3000/rpc \
  -H "Content-Type: application/json" \
  -d '{"method":"task:listByBoard","params":{"boardId":"1"}}' | jq .

# Ожидаемый формат:
# {"ok":true,"result":{"tasks":[...]}}
```

---

## Типичные ошибки

### Ошибка 1: Property X does not exist on type 'Result<Y>'

**Причина**: TypeScript ожидает `Result<T>`, но получает данные напрямую.

**Решение**: Обновить type definitions (см. Шаг 4).

### Ошибка 2: LSP показывает ошибки, но код исправлен

**Причина**: Кэш TypeScript/LSP не обновился.

**Решение**:

```bash
# Перезапустить TypeScript server в IDE
# Или перезапустить dev server
pnpm dev
```

### Ошибка 3: Multiline вызовы не исправляются автоматически

**Причина**: Sed не работает с multiline regex на macOS.

**Решение**: Исправить вручную или использовать Python скрипт.

---

## Чеклист исправлений

- [ ] Найти все вызовы `unwrapIpcResult`
- [ ] Исправить Pattern 1 (inline)
- [ ] Исправить Pattern 2 (separate variable)
- [ ] Исправить Pattern 3 (multiline) вручную
- [ ] Удалить все импорты
- [ ] Создать/обновить type definitions
- [ ] Запустить TypeScript проверку
- [ ] Протестировать страницу в браузере

---

## Связанные файлы

- `src/renderer/lib/ipc-result.ts` - определение функции (можно оставить)
- `packages/web/src/api/transports/http.ts` - HttpTransport (уже распаковывает)
- `packages/web/src/api/types.ts` - TypeScript типы для window.api
- `packages/server/src/http/rpcRouter.ts` - RPC handlers

---

## Дополнительная информация

**Migration Plan**: `docs/LOCAL_WEB_MIGRATION_PLAN_GLM-4.7.md`

- Phase C: ApiTransport abstraction ✅
- Phase E: RPC format ✅
- **Требуется**: Удалить старую логику распаковки IPC Result

**Формат RPC**:

- Server возвращает: `{ok: true, result: DATA}` или `{ok: false, error: {...}}`
- HttpTransport распаковывает и возвращает: `DATA` напрямую
- Frontend получает: `DATA` (не `Result<DATA>`)
