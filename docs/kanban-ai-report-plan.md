# План для код-агента: явный финальный статус через `<REPORT>…</REPORT>` в `kanban-ai`

## Цель

Перевести определение итогового статуса execution/QA-сессии OpenCode с неявной логики (состояние сессии, эвристики по последнему assistant message) на **явный протокол**: агент в **последнем сообщении** обязан завершать ответ тегом:

- execution:
  - `<REPORT>done</REPORT>`
  - `<REPORT>fail</REPORT>`
  - `<REPORT>question</REPORT>`
- QA:
  - `<REPORT>test_ok</REPORT>`
  - `<REPORT>test_fail</REPORT>`

Нужно сделать так, чтобы серверная логика `kanban-ai` интерпретировала **именно этот тег** как источник истины для финализации run.

---

## Что уже известно по проекту

Нужные точки входа уже найдены:

- обычный execution prompt:
  - `packages/next-js/src/server/run/prompts/task.ts`
- QA prompt:
  - `packages/next-js/src/server/run/prompts/qa-testing.ts`
- интерпретация статуса/финального сообщения:
  - `packages/next-js/src/server/run/run-session-interpreter.ts`
- reconciliation / финализация:
  - `packages/next-js/src/server/run/run-reconciliation-service.ts`
  - `packages/next-js/src/server/run/run-finalizer.ts`
- пауза / вопрос / resume-flow:
  - `packages/next-js/src/server/run/run-interaction-coordinator.ts`
- fake runtime для e2e/test:
  - `packages/next-js/src/server/opencode/fake-session-manager.ts`

Дополнительно: в репозитории мог остаться временный файл проверки записи:
- `tmp-chatgpt-write-test.txt`

Его нужно удалить отдельным коммитом или в рамках рабочего коммита.

---

## Желаемое поведение

### Execution run
Последнее assistant message должно заканчиваться **ровно одним** тегом:

- успешное завершение:
  - `<REPORT>done</REPORT>`
- неуспех:
  - `<REPORT>fail</REPORT>`
- нужна информация от пользователя:
  - `<REPORT>question</REPORT>`

Перед тегом агент может писать обычный summary / explanation / question.

### QA run
QA-агент по-прежнему должен выдавать основной отчёт в `<QA REPORT>...</QA REPORT>`, но **в конце того же последнего assistant message** обязан завершать сообщение одним из тегов:

- тесты/проверка пройдены:
  - `<REPORT>test_ok</REPORT>`
- тесты/проверка не пройдены:
  - `<REPORT>test_fail</REPORT>`

### Серверная интерпретация
Определение статуса строится по явному REPORT-тегу:

- `done` → run считается `completed`
- `fail` → run считается `failed`
- `question` → run уходит в paused/question flow
- `test_ok` → QA run считается `completed`, а transition = `qa:pass`
- `test_fail` → QA run считается `failed`, а transition = `qa:fail`

---

## Важные требования

1. **Не полагаться на `sessionStatus` как на источник истины финального исхода**, если REPORT-тег найден.
2. REPORT должен извлекаться из **последнего assistant message**, а не из любого сообщения в истории.
3. Если REPORT-тег отсутствует:
   - сохранить максимально безопасное backward-compatible поведение,
   - но логировать предупреждение,
   - не ломать старые/живые сессии.
4. Для `question` не должно происходить ложного auto-resume только потому, что у OpenCode нет native pending question.
5. Для QA нельзя терять существующий `<QA REPORT>` контент.
6. Обновить fake runtime, чтобы тестовая среда тоже эмитила новый протокол.
7. Удалить временный файл `tmp-chatgpt-write-test.txt`, если он есть.

---

## Общая стратегия внедрения

Делать в 4 слоя:

1. **Prompt layer**  
   Заставить агентов всегда завершать сообщение корректным REPORT-тегом.

2. **Parsing layer**  
   Научить интерпретатор сессии извлекать REPORT из последнего assistant message и возвращать структурированный результат.

3. **Reconciliation / finalization layer**  
   Маппить REPORT → `RunOutcome` / `RunStatus` / task transition.

4. **Test / fake runtime layer**  
   Обновить fake сценарии и покрыть unit-тестами парсинг и reconciliation.

---

# Пошаговый план изменений

## Шаг 0. Подготовка ветки и cleanup

### Действия
- Создать ветку, например:
  - `feat/report-tag-final-status`
- Проверить и удалить временный файл:
  - `tmp-chatgpt-write-test.txt`

### Критерий готовности
- В diff нет посторонних файлов.

---

## Шаг 1. Обновить execution prompt

### Файл
- `packages/next-js/src/server/run/prompts/task.ts`

### Что поменять
Сейчас prompt запрещает control tokens / textual status markers. Это надо заменить на обязательный REPORT-протокол.

### Требуемый смысл инструкции
Добавить в prompt блок типа:

- последняя строка **обязательно** должна быть ровно одним REPORT-тегом;
- использовать только:
  - `<REPORT>done</REPORT>`
  - `<REPORT>fail</REPORT>`
  - `<REPORT>question</REPORT>`
- summary / explanation / question — **до** REPORT-тега;
- не выводить несколько REPORT-тегов;
- если нужен вопрос к пользователю — задать его и закончить `<REPORT>question</REPORT>`.

### Пример желаемого текста в prompt
```text
CRITICAL FINAL MESSAGE FORMAT:
- Your LAST line MUST be exactly one REPORT tag.
- Use <REPORT>done</REPORT> when the task is finished successfully.
- Use <REPORT>fail</REPORT> when the task failed or cannot be completed.
- Use <REPORT>question</REPORT> when you cannot continue without user input.
- Put your natural-language summary, failure reason, or question BEFORE the REPORT tag.
- Do not output multiple REPORT tags.
```

### Что убрать / заменить
Убрать или переписать инструкцию в духе:
- `Do not output textual status markers or special control tokens.`

### Критерий готовности
- Execution prompt явно требует REPORT.
- Нет конфликта между старой и новой инструкцией.

---

## Шаг 2. Обновить QA prompt

### Файл
- `packages/next-js/src/server/run/prompts/qa-testing.ts`

### Что поменять
Оставить требование к `<QA REPORT>...</QA REPORT>`, но добавить требование к финальному REPORT-тегу.

### Желаемое поведение
QA-агент должен возвращать один assistant message такого вида:

```text
<QA REPORT>
...
</QA REPORT>
<REPORT>test_ok</REPORT>
```

или

```text
<QA REPORT>
...
</QA REPORT>
<REPORT>test_fail</REPORT>
```

### Что явно прописать
- `<QA REPORT>` обязателен.
- После него последней строкой обязателен ровно один REPORT-тег.
- Никаких других значений, кроме `test_ok` / `test_fail`, для QA использовать нельзя.

### Критерий готовности
- QA prompt требует и QA REPORT, и REPORT.
- Инструкция однозначна.

---

## Шаг 3. Ввести явный парсер REPORT в session interpreter

### Файл
- `packages/next-js/src/server/run/run-session-interpreter.ts`

### Что добавить

#### 3.1. Новый тип
Добавить тип примерно такого вида:

```ts
export type ReportTag =
  | "done"
  | "fail"
  | "question"
  | "test_ok"
  | "test_fail";
```

#### 3.2. Новый helper для парсинга REPORT
Добавить функции:

- `extractReportTag(text: string): ReportTag | null`
- `findLatestAssistantReport(...)`
- возможно: `stripTrailingReportTag(text: string): string`

### Правила парсинга
1. Ищем REPORT **только в последнем assistant message**.
2. Поддерживаем регистр-insensitive regex, но нормализуем в lower-case.
3. Допускаем пробелы вокруг значения:
   - `<REPORT> done </REPORT>` → `done`
4. Если тегов несколько:
   - предпочтительно считать это malformed input,
   - логировать warning,
   - брать **последний** или отклонять весь message.  
   Рекомендуемый вариант: **если в последнем assistant message найдено больше одного REPORT, считать сообщение malformed и не доверять ему**.
5. REPORT должен относиться к **последнему assistant message**, а не к предыдущему.

### Рекомендуемый regex
```ts
const REPORT_TAG_RE = /<REPORT>\s*(done|fail|question|test_ok|test_fail)\s*<\/REPORT>/gi;
```

### 3.3. Новый структурированный meta-status
Сейчас `SessionMetaStatus` оперирует `completed/question/permission/running/dead`.
Нужно расширить так, чтобы было видно не только факт завершения, но и **тип отчёта**.

Вариант:
```ts
export type SessionMetaStatus =
  | { kind: "reported_done"; content: string }
  | { kind: "reported_fail"; content: string }
  | { kind: "reported_question"; content: string }
  | { kind: "reported_test_ok"; content: string }
  | { kind: "reported_test_fail"; content: string }
  | { kind: "question"; questions: QuestionData[] }
  | { kind: "permission"; permission: PermissionData }
  | { kind: "running" }
  | { kind: "dead" };
```

Или оставить `kind` более общим, но обязательно вернуть `reportTag`.

Например:
```ts
type SessionMetaStatus =
  | { kind: "reported"; report: ReportTag; content: string }
  | ...
```

**Рекомендуется именно второй вариант**: проще поддерживать.

### 3.4. deriveMetaStatus()
Приоритеты внутри `deriveMetaStatus` должны быть такими:

1. pending permission
2. native pending question
3. session not found → dead
4. если есть активные child sessions → running
5. если это story chat — оставить текущую special-логику
6. если в **последнем assistant message** есть REPORT → вернуть `kind: "reported"`
7. если generation/story-specific strict rules → оставить как есть
8. иначе fallback на текущую backward-compatible логику

### Важный момент
Для execution и QA run финализация должна идти через REPORT, а не через «последнее assistant message не user ⇒ completed».

То есть этот кусок:
```ts
if (
  inspection.probeStatus === "alive" &&
  (inspection.sessionStatus === "idle" || inspection.sessionStatus === "unknown")
) {
  const latestMessage = inspection.messages[inspection.messages.length - 1];
  if (latestMessage?.role !== "user") {
    const content = findStoryContent(inspection);
    return { kind: "completed", content };
  }
}
```

нужно либо:
- удалить для обычных execution/QA run,
- либо оставить только как fallback при **отсутствии REPORT**.

### Что сохранять в content
`content` должен быть текст assistant message **без финального REPORT-тега**, чтобы в UI / history / run outcome не торчал control token.

Добавить helper:
```ts
function stripTrailingReportTag(text: string): string
```

### Критерий готовности
- Интерпретатор умеет извлекать REPORT.
- Контент возвращается без REPORT-тега.
- Старые сценарии без REPORT не ломаются.

---

## Шаг 4. Обновить `toRunLastExecutionStatus()`

### Файл
- `packages/next-js/src/server/run/run-session-interpreter.ts`

### Что нужно
Если meta = `reported`, то `RunLastExecutionStatus.kind` должен уметь отражать:
- `completed`
- `failed`
- `question`

Так как тип `RunLastExecutionStatus.kind` уже имеет:
- `completed`
- `failed`
- `question`
- `permission`
- `running`
- `dead`

то mapping можно сделать так:

- `done` / `test_ok` → `completed`
- `fail` / `test_fail` → `failed`
- `question` → `question`

В `content` положить очищенный текст без REPORT.

### Критерий готовности
- lastExecutionStatus в БД/состоянии соответствует REPORT.

---

## Шаг 5. Привязать REPORT к финализации run

### Файл
- `packages/next-js/src/server/run/run-reconciliation-service.ts`

### Что менять
В `applyInspectionResult()` добавить явную обработку `meta.kind === "reported"`.

### Логика
Если `meta.kind === "reported"`:

- `done`:
  - `finalizeRunFromSession(run.id, "completed", { kind: "completed", content })`
- `fail`:
  - `finalizeRunFromSession(run.id, "failed", { kind: "failed", content })`
- `question`:
  - run должен перейти в paused/question flow
- `test_ok`:
  - `finalizeRunFromSession(run.id, "completed", { kind: "completed", content })`
- `test_fail`:
  - `finalizeRunFromSession(run.id, "failed", { kind: "failed", content })`

### Как обработать `question`
Есть 2 варианта:

#### Вариант A — synthetic question path
Добавить в reconciliation отдельный путь:
- paused run
- создать `runEventRepo.create(... eventType: "question", payload: { status: "paused", synthetic: true, ... })`
- выполнить `applyTaskTransition(... "run:question" ...)`
- не пытаться опираться на native `pendingQuestions`

#### Вариант B — через новый outcome kind
Добавить в `RunOutcome` поле, например:
```ts
| { kind: "question"; content?: string; synthetic?: boolean }
```
и финализировать вопрос как отдельный path.

**Рекомендуется Вариант A** для минимального вмешательства в существующую финализацию completed/failed, но важно потом защитить paused-run от auto-resume.

### Критерий готовности
- reconciliation чётко следует REPORT.
- `fail` и `test_fail` больше не зависят от dead session / эвристик.
- `question` действительно приводит к blocked/question flow.

---

## Шаг 6. Не дать `question` авто-возобновляться

### Файл
- `packages/next-js/src/server/run/run-interaction-coordinator.ts`

### Проблема
Сейчас paused run может auto-resume’иться, если:
- нет pending native permissions
- нет pending native questions

Но для нового явного REPORT-сценария `question` может быть **synthetic**: агент сам написал вопрос и завершил `<REPORT>question</REPORT>`, без native OpenCode question object.

### Что нужно сделать
Добавить в event payload или metadata явный маркер synthetic-question, например:
```ts
{
  status: "paused",
  questionId: "report-question",
  synthetic: true,
  message: "Question requested via REPORT tag"
}
```

И затем в `reconcilePausedRun()`:
- если awaiting question event synthetic=true,
- не пытаться auto-resume только из-за отсутствия native pendingQuestions,
- ждать явного пользовательского ответа/route/action.

### Возможные места хранения synthetic-флага
1. в payload последнего `question` event
2. в `run.metadata.lastExecutionStatus`
3. в отдельном `run.metadata.awaitingReportQuestion = true`

**Рекомендуется хранить в event payload + при необходимости дублировать в metadata**.

### Критерий готовности
- Run с `<REPORT>question</REPORT>` остаётся paused до фактического ответа пользователя.
- Не уходит обратно в running самопроизвольно.

---

## Шаг 7. Проверить `run-finalizer.ts`

### Файл
- `packages/next-js/src/server/run/run-finalizer.ts`

### Что проверить
`RunOutcome` уже поддерживает:
- `completed`
- `failed`
- `question`

Нужно удостовериться, что:
- для `question` transition остаётся `run:question`
- для QA `test_ok/test_fail` reconciliation передаёт outcome так, чтобы `resolveTriggerFromOutcome()` корректно превратил его в:
  - `qa:pass`
  - `qa:fail`

### Возможная доработка
Если reconciliation будет всегда маппить:
- `test_ok` → `status=completed`, `outcome.kind="completed"`
- `test_fail` → `status=failed`, `outcome.kind="failed"`

то `resolveTriggerFromOutcome()` уже почти готов.

### Критерий готовности
- Finalizer не нуждается в радикальной переработке.
- QA transitions корректны.

---

## Шаг 8. Обновить fake runtime

### Файл
- `packages/next-js/src/server/opencode/fake-session-manager.ts`

### Что поменять
Fake assistant messages должны завершаться REPORT-тегами.

### Минимально нужные изменения

#### happy-path
Сейчас сообщение типа:
```text
Fake run completed successfully (happy-path scenario).
```

Нужно сделать:
```text
Fake run completed successfully (happy-path scenario).

<REPORT>done</REPORT>
```

#### failure
Сейчас failure-сценарий, похоже, просто делает session absent / failed без финального assistant message.
Нужно выбрать один из вариантов:

**Рекомендуется:**
- перед переводом в failed/absent добавить assistant message:
```text
Fake run failed (failure scenario).

<REPORT>fail</REPORT>
```

#### pause-resume
Нужно, чтобы после ответа на вопрос финальный assistant message завершался:
```text
<REPORT>done</REPORT>
```

Если будет отдельный synthetic-question fake scenario — можно добавить и его.

### Дополнительно для QA fake flow
Если в тестах есть QA runtime/scenario — добавить:
- `test_ok`
- `test_fail`

Если отдельного QA fake flow пока нет, достаточно подготовить helper для генерации assistant message с параметризуемым REPORT.

### Критерий готовности
- fake runtime больше не полагается на старую эвристику финализации.

---

## Шаг 9. Добавить unit-тесты парсинга REPORT

### Предполагаемое место
- `packages/next-js/src/server/run/run-session-interpreter.test.ts`
или рядом с существующими тестами, если уже есть подходящий файл.

### Обязательные кейсы

#### Парсинг
1. `extractReportTag("<REPORT>done</REPORT>")` → `done`
2. `extractReportTag("...\n<REPORT>fail</REPORT>")` → `fail`
3. `extractReportTag("<REPORT> question </REPORT>")` → `question`
4. `extractReportTag("<REPORT>test_ok</REPORT>")` → `test_ok`
5. `extractReportTag("<REPORT>test_fail</REPORT>")` → `test_fail`
6. нет тега → `null`
7. несколько тегов → malformed strategy (согласно выбранной политике)

#### Очистка текста
8. `stripTrailingReportTag("summary\n<REPORT>done</REPORT>")` → `summary`
9. QA report + REPORT → QA REPORT контент сохраняется, REPORT удаляется

#### deriveMetaStatus
10. Последний assistant message с `<REPORT>done</REPORT>` → `reported(done)`
11. `<REPORT>fail</REPORT>` → `reported(fail)`
12. `<REPORT>question</REPORT>` → `reported(question)`
13. Последнее сообщение user, а REPORT только в предыдущем assistant message → не считать terminal
14. При наличии pending native question приоритетнее REPORT, если это текущая логика UX

### Критерий готовности
- Парсер и deriveMetaStatus покрыты прямыми тестами.

---

## Шаг 10. Добавить unit-тесты reconciliation

### Файл
Новый или существующий test для:
- `run-reconciliation-service.ts`

### Кейсы
1. execution + `done` → `finalizeRunFromSession(... completed ...)`
2. execution + `fail` → `finalizeRunFromSession(... failed ...)`
3. execution + `question` → paused/question flow, без финализации completed/failed
4. QA + `test_ok` → completed / `qa:pass`
5. QA + `test_fail` → failed / `qa:fail`
6. synthetic question не auto-resume’ится при reconcile paused run

### Критерий готовности
- REPORT-driven transitions подтверждены тестами.

---

## Шаг 11. Проверить E2E seed / сценарии

### Файлы
- `e2e/fixtures/helpers/seed.ts`
- связанные e2e тесты

### Что проверить
Сценарии:
- `task-with-run`
- `paused-run`
- `failed-run`

После обновления fake runtime эти сценарии должны по-прежнему доходить до ожидаемых статусов:
- completed
- paused
- failed

Если что-то завязано на старую эвристику, подправить ожидания.

### Критерий готовности
- E2E сценарии не ломаются после перехода на REPORT.

---

## Шаг 12. Backward compatibility fallback

### Зачем
На момент деплоя в системе могут быть:
- старые сессии без REPORT
- зависшие сессии
- ручные эксперименты

### Что сделать
В `deriveMetaStatus()` оставить fallback:

- если REPORT нет, но:
  - session idle/unknown
  - последний message assistant
  - нет pending child sessions / questions / permissions
- тогда можно использовать текущую эвристику `completed`

Но:
- обязательно `log.warn(...)`, что completion определён fallback-эвристикой без REPORT.

### Рекомендуемый лог
```ts
log.warn("Session completed without explicit REPORT tag; falling back to legacy completion heuristic", {
  runId: run?.id,
  sessionId: ...,
  runKind: ...,
});
```

### Критерий готовности
- Новый протокол основной.
- Старые сессии не умирают от несовместимости.

---

# Предлагаемая реализация: технические детали

## 1. Новый helper для REPORT

### Пример API
```ts
export type ReportTag =
  | "done"
  | "fail"
  | "question"
  | "test_ok"
  | "test_fail";

export function extractReportTag(text: string): ReportTag | null;
export function stripTrailingReportTag(text: string): string;
```

### Поведение
- `extractReportTag()` возвращает **одно** значение или `null`
- `stripTrailingReportTag()` удаляет только финальный REPORT-тег и trim’ит хвост

---

## 2. Новый helper: последняя assistant-реплика

### Пример API
```ts
function findLatestAssistantMessage(
  inspection: SessionInspectionResult,
  options?: { afterTimestamp?: number }
): OpenCodeMessage | null;
```

Можно переиспользовать существующий helper, но лучше не смешивать story-specific naming.

---

## 3. Новый reported-status

### Рекомендуемый shape
```ts
type SessionMetaStatus =
  | { kind: "reported"; report: ReportTag; content: string }
  | { kind: "question"; questions: QuestionData[] }
  | { kind: "permission"; permission: PermissionData }
  | { kind: "running" }
  | { kind: "dead" };
```

Это наименее шумное изменение.

---

## 4. Mapping REPORT → outcome/status

### Execution
| REPORT | Run status | Outcome kind | Transition |
|---|---|---|---|
| done | completed | completed | run:done |
| fail | failed | failed | run:fail |
| question | paused | question-flow | run:question |

### QA
| REPORT | Run status | Outcome kind | Transition |
|---|---|---|---|
| test_ok | completed | completed | qa:pass |
| test_fail | failed | failed | qa:fail |

---

## 5. Что делать с malformed REPORT

### Политика
Если в последнем assistant message:
- несколько REPORT-тегов
- неизвестное значение
- REPORT найден не в последнем assistant message

то:
- считать REPORT отсутствующим,
- логировать warning,
- использовать fallback-логику.

### Почему так
Это безопаснее, чем «угадывать» нужный status.

---

# Предлагаемый порядок коммитов

## Коммит 1
**cleanup: remove temporary repository write test file**
- удалить `tmp-chatgpt-write-test.txt` если есть

## Коммит 2
**feat(run-prompts): require explicit REPORT tags in final agent messages**
- `task.ts`
- `qa-testing.ts`

## Коммит 3
**feat(run-interpreter): derive run outcome from REPORT tags**
- `run-session-interpreter.ts`

## Коммит 4
**feat(run-reconciliation): map REPORT tags to completed/failed/question states**
- `run-reconciliation-service.ts`
- при необходимости `run-interaction-coordinator.ts`
- при необходимости `run-finalizer.ts`

## Коммит 5
**test(fake-runtime): emit REPORT tags in fake opencode scenarios**
- `fake-session-manager.ts`

## Коммит 6
**test(run-status): add coverage for REPORT parsing and reconciliation**
- unit tests
- при необходимости e2e fixups

---

# Acceptance Criteria

## Функциональные
- [ ] execution-run с `<REPORT>done</REPORT>` завершается как `completed`
- [ ] execution-run с `<REPORT>fail</REPORT>` завершается как `failed`
- [ ] execution-run с `<REPORT>question</REPORT>` переходит в paused/question flow
- [ ] QA-run с `<REPORT>test_ok</REPORT>` проходит как `qa:pass`
- [ ] QA-run с `<REPORT>test_fail</REPORT>` проходит как `qa:fail`
- [ ] UI/история не захламляются REPORT-тегом в summary/content, где это не нужно
- [ ] старые сессии без REPORT продолжают корректно работать через fallback

## Технические
- [ ] unit tests на parser/report mapping добавлены
- [ ] fake runtime обновлён
- [ ] временный тестовый файл удалён
- [ ] нет конфликтующей prompt-инструкции, запрещающей control tokens

---

# Проверка вручную после внедрения

## Case 1: execution success
Запустить обычный task-run и убедиться:
- агент завершает текстом summary
- последняя строка `<REPORT>done</REPORT>`
- run → `completed`
- task → `done/review` по текущему workflow

## Case 2: execution fail
Смоделировать провал:
- агент пишет причину
- заканчивает `<REPORT>fail</REPORT>`
- run → `failed`
- task → blocked/failed

## Case 3: explicit question
Смоделировать задачу без нужного входа:
- агент задаёт конкретный вопрос
- заканчивает `<REPORT>question</REPORT>`
- run → `paused`
- task → `question`
- run не auto-resume’ится сам

## Case 4: QA pass
- QA-агент выдаёт `<QA REPORT>...</QA REPORT>`
- последняя строка `<REPORT>test_ok</REPORT>`
- run → `completed`
- task transition → `qa:pass`

## Case 5: QA fail
- QA-агент выдаёт `<QA REPORT>...</QA REPORT>`
- последняя строка `<REPORT>test_fail</REPORT>`
- run → `failed`
- task transition → `qa:fail`

---

# Риски и как их снизить

## Риск 1. Агент забудет REPORT
**Снижение:**
- жёсткая prompt-инструкция
- fallback для legacy
- warning log

## Риск 2. QA-агент начнёт класть REPORT внутрь QA REPORT
**Снижение:**
- в prompt явно написать: REPORT отдельной последней строкой после `</QA REPORT>`

## Риск 3. Synthetic question auto-resume
**Снижение:**
- отдельный synthetic marker
- `reconcilePausedRun()` не должен auto-resume synthetic-question run

## Риск 4. Старые e2e сломаются
**Снижение:**
- обновить `fake-session-manager.ts`
- прогнать `pnpm test:run`
- прогнать релевантные e2e

---

# Минимальный чек-лист для код-агента

1. Удалить `tmp-chatgpt-write-test.txt`, если есть.
2. Изменить `task.ts` prompt на обязательный `<REPORT>done/fail/question</REPORT>`.
3. Изменить `qa-testing.ts` prompt на обязательный `<REPORT>test_ok/test_fail</REPORT>` после `<QA REPORT>`.
4. В `run-session-interpreter.ts`:
   - добавить parser REPORT,
   - strip REPORT из content,
   - вернуть structured `reported` status.
5. В `run-reconciliation-service.ts`:
   - маппить REPORT на completed / failed / question flow.
6. В `run-interaction-coordinator.ts`:
   - защитить synthetic question от auto-resume.
7. Проверить `run-finalizer.ts` на совместимость.
8. Обновить `fake-session-manager.ts`, чтобы fake сообщения тоже завершались REPORT-тегами.
9. Добавить unit tests.
10. Прогнать:
    - `pnpm test:run`
    - при возможности релевантные e2e.

---

# Что считать завершением задачи

Задача считается выполненной, когда:

- обычный execution-run и QA-run завершаются **по явному REPORT-тегу**;
- `sessionStatus` больше не является основным источником истины для финального исхода;
- synthetic question корректно удерживает paused state;
- fake runtime и тесты обновлены;
- временный файл cleanup выполнен.

