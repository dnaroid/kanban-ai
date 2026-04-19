# Исправленный план: Story Chat — генерация user story через диалог

## Что исправлено по сравнению с исходным планом

Перед реализацией нужно зафиксировать несколько архитектурных поправок, иначе фича будет работать нестабильно.

### 1) Переключать надо `run.kind`, а не только `run.metadata.kind`

В проекте `kind` хранится в колонке `runs.kind`, а наружу уже маппится в `run.metadata.kind` через репозиторий. Поэтому при переходе из `task-story-chat` в `task-description-improve` надо вызывать:

```ts
runRepo.update(runId, { kind: generationRunKind })
```

а не пытаться менять только `metadata.kind`.

### 2) `task-story-chat` — это не regular execution run

Чат-этап не должен вести себя как обычный `task-run`, потому что обычные execution runs:
- участвуют в execution-логике очереди,
- могут триггерить task state machine,
- учитываются как active execution sessions,
- рассматриваются как кандидаты на переход задачи в рабочие состояния.

Для story chat нужен **отдельный класс ранна**:
- **не execution run**,
- **не generation run**,
- **interactive specialized run**.

### 3) Высокий priority score сам по себе недостаточен

Если story-chat оставить в обычной execution-очереди, он может ждать занятый execution slot. Для UX кнопки **Chat & Generate** это плохо.

Нужно дать story-chat:
- высокий приоритет,
- отдельную интерактивную обработку в очереди,
- отсутствие execution-specific ограничений.

Практически это можно сделать без полной переработки очереди: ввести отдельный helper для story-chat и использовать его для bucket/concurrency, не помечая его generation run в бизнес-логике.

### 4) Оставлять `task.description` пустым — рискованный вариант

Сейчас финальная генерация строится через `buildUserStoryPrompt(task, project, options)`, и prompt использует `task.description` как часть контекста.

Поэтому есть два безопасных варианта:

1. **Рекомендованный:** сохранять исходный prompt в `task.description`, а после генерации он будет перезаписан структурированной story.
2. **Альтернативный:** хранить `initialPrompt` в metadata/story-chat state и явно добавлять его в generation prompt при `Generate`.

Для минимального риска и меньшего объёма изменений рекомендуется **вариант 1**.

---

## Обновлённая концепция

Добавить новый flow, в котором пользователь сначала обсуждает задачу с AI в отдельном interactive run, а затем нажимает **Generate User Story**, после чего этот же run переключается в режим обычной story generation в той же сессии.

### Основной принцип

- **Одна задача**
- **Один run**
- **Одна session**
- Сначала `kind = task-story-chat`
- После нажатия Generate: `kind = task-description-improve`

---

## Обновлённый flow

```text
User clicks "Chat & Generate" in QuickCreateModal
  → Task created in backlog
  → initial prompt is stored on task.description (recommended)
  → Story-chat run auto-started (kind=task-story-chat)
  → Task page/drawer opens on Runs tab
  → User sees initial prompt + AI clarifying questions
  → Multi-turn discussion continues in same session
  → User clicks "Generate User Story"
  → Run kind switched: task-story-chat → task-description-improve
  → Final generation prompt injected into same session
  → Task status → generating
  → Existing generation pipeline parses META + STORY
  → Task fields updated by current post-generation flow
```

---

## Обновлённые решения

- **Same session, same run** — оставить
- **Kind switch on Generate** — оставить, но делать через `runRepo.update({ kind: ... })`
- **Chat phase is interactive specialized run** — исправление
- **Chat phase must NOT trigger execution transitions** — исправление
- **Chat phase must NOT count as active execution session risk** — исправление
- **After Generate = normal generation run** — оставить
- **Task stays in backlog during chat** — оставить
- **Generate button stays available for `queued`, `running`, `paused`** — оставить
- **Recommended storage for initial prompt: `task.description`** — исправление

---

## Изменения по шагам

# Step 1: Backend — новый run kind + prompt + start endpoint

## Файлы
- `packages/next-js/src/server/run/prompts/story-chat.ts` — NEW
- `packages/next-js/src/server/run/run-service.ts` — MODIFY
- `packages/next-js/src/server/run/runs-queue-manager.ts` — MODIFY
- `packages/next-js/src/app/api/opencode/story-chat/start/route.ts` — NEW
- `packages/next-js/src/lib/api-client.ts` — MODIFY

## Изменения

### 1.1 Новый kind

В `run-service.ts`:

```ts
const storyChatRunKind = "task-story-chat";
```

Дополнительно полезно завести helper:

```ts
function isStoryChatRun(run: Run): boolean {
  return run.metadata?.kind === storyChatRunKind;
}
```

### 1.2 Prompt builder `story-chat.ts`

Создать:

```ts
buildStoryChatPrompt(task, project, userPrompt, options?) => string
```

Prompt должен:
- объявлять модель как requirements assistant для канбан-проекта,
- использовать `task.title`, `task.description` и `userPrompt` как входной контекст,
- просить модель **уточнять требования**, а не писать финальную story,
- разрешать multi-turn discussion,
- требовать, чтобы при вопросах к пользователю последний статус-маркер был `question`,
- при завершении реплики без блокировки пользователя использовать нейтральный success marker,
- явно запрещать выдавать `<META>`/`<STORY>` до явного Generate.

Статус-маркеры:
- success: `buildOpencodeStatusLine("success")`
- error: `buildOpencodeStatusLine("fail")`
- question: `buildOpencodeStatusLine("question")`

### 1.3 `startStoryChat(taskId, userPrompt)` в `RunService`

Добавить метод:

```ts
startStoryChat(taskId: string, userPrompt: string): Promise<{ runId: string }>
```

Логика:

1. Найти task.
2. Проверить, нет ли конфликтующего active run:
   - если уже есть активный `task-story-chat` → вернуть его `runId`;
   - если есть активный execution/generation run другого типа → бросить ошибку.
3. Найти project.
4. Выбрать роль так же, как для story generation (`preferredForStoryGeneration`).
5. Создать context snapshot с kind `story-chat`.
6. Создать run через `prepareTaskRun(...)` c `kind: storyChatRunKind`.
7. **Не переводить task в `generating` или `running`.**
8. **Не переводить задачу в `in_progress`.**
9. Поставить run в очередь с session title: `Story Chat: ${task.title}`.
10. Вернуть `{ runId }`.

### 1.4 Очередь: story-chat как interactive run

В `runs-queue-manager.ts` добавить helper:

```ts
private isStoryChatRun(run: Run): boolean {
  return run.metadata?.kind === storyChatRunKind;
}
```

Далее скорректировать логику:

#### `enqueue()`

Story-chat не должен триггерить execution-style task transition на enqueue.

Сейчас такое поведение завязано на `!isGeneration` — для story-chat это нужно отключить.

#### `canRunNow()`

Story-chat не должен блокироваться execution dependency-логикой.

Рекомендация:
- `generation run` → как сейчас,
- `story chat run` → тоже запускать сразу,
- `execution run` → оставлять текущие dependency checks.

#### `resolveRunPriorityScore()`

Для story-chat вернуть `Number.MAX_SAFE_INTEGER`.

#### Bucket / concurrency

Нужно дать story-chat интерактивное поведение. Самый практичный путь без тяжёлой переработки:
- добавить helper вроде `isInteractiveRunBucket(run)`;
- для bucket/concurrency класть `story-chat` в тот же high-priority bucket, что и generation,
- **но не считать его generation run в generation-specific бизнес-логике**.

Иными словами:
- `isGenerationRun(run)` оставить только для `task-description-improve`,
- story-chat обрабатывать отдельным helper.

### 1.5 Start API endpoint

Создать route:

`POST /api/opencode/story-chat/start`

Body:

```ts
{ taskId: string, prompt?: string }
```

Поведение:
- проверить task,
- проверить prompt,
- вызвать `runService.startStoryChat(taskId, prompt)`,
- вернуть:

```ts
{ success: true, data: { runId } }
```

### 1.6 API client

В `api-client.ts` добавить:

```ts
startStoryChat: async ({ taskId, prompt }: { taskId: string; prompt?: string }): Promise<{ runId: string }>
```

---

# Step 2: Backend — Generate endpoint (kind switch + prompt injection)

## Файлы
- `packages/next-js/src/app/api/opencode/story-chat/generate/route.ts` — NEW
- `packages/next-js/src/server/run/run-service.ts` — MODIFY
- `packages/next-js/src/lib/api-client.ts` — MODIFY

## Изменения

### 2.1 `triggerStoryGeneration(runId)` в `RunService`

Добавить:

```ts
triggerStoryGeneration(runId: string): Promise<void>
```

Логика:

1. Найти run.
2. Проверить, что его текущий kind = `task-story-chat`.
3. Проверить наличие `sessionId`.
4. Найти task и project.
5. Собрать финальный generation prompt через `buildUserStoryPrompt(...)`.
6. **Переключить kind через репозиторий:**

```ts
const updatedRun = runRepo.update(runId, {
  kind: generationRunKind,
});
```

7. После переключения kind — отправить prompt в ту же session через `sendSessionMessage(sessionId, prompt)`.
8. Перевести task в `generating`.
9. Опубликовать SSE на task update + run update.

### 2.2 Важное правило

Не пытаться держать в БД разные значения между `kind` и `metadata.kind`.
Источник истины — `runs.kind`.

### 2.3 Generate API endpoint

Создать route:

`POST /api/opencode/story-chat/generate`

Body:

```ts
{ runId: string }
```

Валидация:
- run существует,
- run kind = `task-story-chat`,
- `sessionId` не пустой,
- generate ещё не был вызван ранее.

Response:

```ts
{ success: true }
```

### 2.4 API client

Добавить:

```ts
triggerStoryChatGenerate: async ({ runId }: { runId: string }): Promise<{ success: boolean }>
```

---

# Step 3: Frontend — QuickCreateModal: режим `Chat & Generate`

## Файлы
- `packages/next-js/src/components/kanban/board/QuickCreateModal.tsx` — MODIFY
- `packages/next-js/src/features/board/model/use-board-model.ts` — MODIFY
- `packages/next-js/src/components/BoardScreen.tsx` — MODIFY

## Изменения

### 3.1 Новый prop

В `QuickCreateModal` добавить:

```ts
onStartStoryChat: (
  prompt: string,
  selectedAttachments: QuickCreateAttachment[],
) => Promise<{ taskId: string; runId: string }>
```

### 3.2 Кнопка `Chat & Generate`

Добавить кнопку:
- между `Save as Draft` и `Run Raw`,
- с `MessageSquare` icon,
- со своим loading state,
- `submittingAction` расширить значением `"chatGenerate"`.

### 3.3 `handleStartStoryChat()` в `use-board-model.ts`

Добавить метод:

```ts
handleStartStoryChat(columnId, prompt, selectedAttachments?)
  => Promise<{ taskId: string; runId: string }>
```

Рекомендуемая логика:

1. Подготовить `promptWithFiles` так же, как в quick generate.
2. Создать task в backlog.
3. **Рекомендация:** сохранить `promptWithFiles` в `task.description`.
4. Вызвать `api.opencode.startStoryChat({ taskId, prompt: promptWithFiles })`.
5. Вернуть `{ taskId, runId }`.

Если всё-таки нужен абсолютно пустой `description`, это должно быть отражено отдельным механизмом хранения initial prompt в metadata и отдельным использованием в Step 2.

### 3.4 Wire в `BoardScreen`

Передать `onStartStoryChat` в `QuickCreateModal`.

---

# Step 4: Frontend — кнопка `Generate User Story` в `RunDetailsView`

## Файлы
- `packages/next-js/src/components/kanban/drawer/RunDetailsView.tsx` — MODIFY

## Изменения

Добавить кнопку в header actions:

Показывать, если:

```ts
run?.metadata?.kind === "task-story-chat" &&
["queued", "running", "paused"].includes(run?.status)
```

Причина включения `paused`:
- чат может остановиться на `question` marker,
- пользователь должен иметь возможность нажать Generate даже когда ранн paused.

Поведение:
- вызывает `api.opencode.triggerStoryChatGenerate({ runId })`,
- показывает loading state,
- disabled если `!run?.sessionId` или запрос в процессе,
- после успешного SSE update исчезает автоматически, потому что kind уже станет `task-description-improve`.

---

# Step 5: Frontend — auto-open Runs tab после старта story chat

## Файлы
- `packages/next-js/src/features/board/model/use-board-model.ts` — MODIFY
- `packages/next-js/src/components/BoardScreen.tsx` — MODIFY

## Изменения

После успешного `handleStartStoryChat`:
- открыть только что созданную задачу,
- сразу на `?tab=runs`.

Рекомендуемый путь:

```ts
router.push(`/board/${projectId}/task/${taskId}?tab=runs`)
```

Это лучше, чем пытаться вручную синхронизировать локальное состояние drawer внутри доски.

---

## Обновлённый dependency graph

```text
Step 1 backend (kind + prompt + start endpoint + queue handling)
  ↓
Step 2 backend (generate endpoint + kind switch)
  ↓
Step 3 frontend quick create (start story chat)
  ↓
Step 4 frontend generate button
  ↓
Step 5 frontend auto-open runs tab
```

---

## Дополнительные edge cases

### 1. Generate вызван повторно

На сервере строго валидировать текущий kind:
- если уже `task-description-improve`, вернуть 400 / idempotent rejection.

### 2. Есть активный execution run

`startStoryChat()` должен не переиспользовать такой run, а отказывать с понятной ошибкой.

### 3. Есть уже активный story-chat run

Можно вернуть его `runId`, чтобы не плодить дубликаты.

### 4. Session умерла между chat и generate

`triggerStoryGeneration()` должен валидировать `sessionId` и состояние session; при ошибке не переключать задачу в `generating` безуспешно.

### 5. Story chat не должен считаться execution session risk

Все проверки типа active execution session должны игнорировать `task-story-chat`.

### 6. Story chat не должен двигать задачу по workflow

Во время чата задача остаётся в backlog, пока не началась реальная генерация.

---

## Обновлённая стратегия коммитов

1. `feat(run): add task-story-chat interactive run kind and start endpoint`
2. `feat(queue): support interactive story-chat runs without execution transitions`
3. `feat(api): add story-chat generate endpoint with kind switch`
4. `feat(ui): add Chat & Generate mode to QuickCreateModal`
5. `feat(ui): add Generate User Story button for story-chat runs`
6. `feat(ui): open task runs tab after starting story chat`

---

## Краткий итог

Исходная идея правильная, но перед кодингом надо зафиксировать три ключевых правила:

1. **Kind переключается через `runRepo.update({ kind: ... })`.**
2. **Story-chat — отдельный interactive run, а не обычный execution run.**
3. **Нужно сохранить исходный prompt в task или metadata, иначе generation prompt теряет fallback-контекст.**

С этими поправками фича хорошо ложится в текущую архитектуру проекта и использует существующую session-based модель без создания второго run.
