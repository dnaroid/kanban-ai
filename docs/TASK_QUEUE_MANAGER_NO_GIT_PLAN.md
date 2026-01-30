# Kanban AI — Переход на последовательное выполнение задач через менеджер очереди (без Git)

> Дата: 2026-01-30  
> Запрос: **уйти от параллельности задач**, оставить ограниченную параллельность **по ролям** (FE/BE/QA/BA) через *
*слоты ролей**, выполнять задачи **в порядке приоритета**, и **выпилить всё, что касается git**.

---

## 1) Что меняется концептуально

### Было (в текущем дизайне фаз 0–5)

- Task → пользователь/автомат запускает runs (BA/Dev/QA) вручную или полуавто
- Есть VCS-слой: ветки/PR/CI/merge/конфликты, таблицы `pull_requests`, `merge_conflicts`, `task_vcs_links` и т.д.

### Станет

- **Единый менеджер очереди** (`TaskQueueManager`) сам:
    - выбирает следующую задачу по приоритету
    - запускает нужный run (BA/FE/BE/QA) когда освобождается слот роли
    - перемещает задачу по колонкам/статусам на основании фактов runs
- **Git полностью исключён**:
    - нет веток/PR/CI/merge-конфликтов
    - дев-результаты живут как patch/артефакт/локальные изменения (в зависимости от режима) и фиксируются в истории runs

---

## 2) Важная оговорка про “параллельность по ролям”

Ты хочешь: “по очереди”, но допускаешь FE+BE+QA+BA параллельно.

Если FE и BE одновременно трогают **один и тот же локальный репозиторий**, даже без git, это всё равно конфликт:

- оба модифицируют одни и те же файлы/папки
- тесты/сборка могут ломать друг друга
- невозможно гарантировать воспроизводимость результата run

### Рекомендуемое правило “безопасной параллельности”

- **BA**: можно параллельно (не трогает рабочую директорию проекта, работает по тексту/контексту)
- **FE/BE/QA**: **вводим блокировку рабочего пространства проекта** `project_workspace_lock`
    - т.е. одновременно в одном проекте выполняется максимум **один** run из группы `workspace_mutating` (обычно
      FE/BE/QA)
    - при этом BA может выполняться параллельно

---

## 3) Новая модель флоу: “Pipeline по ролям”

### 3.1 Типовой pipeline (по умолчанию)

1) **BA**: сформировать user story + AC + вопросы → если нужны ответы → Waiting(User)
2) **FE или BE** (или оба по тегам/типу задачи): реализация/изменения
3) **QA**: проверка (чеклист/автотесты/смоук)
4) **Done**: закрытие + обновление KB/артефактов

### 3.2 Как определяется “какая роль нужна”

Решение делается детерминированно:

- по `task.type` (bug/story/chore)
- по тегам (`frontend`, `backend`, `api`, `ui`, `db`, `infra`)
- по настройкам проекта (policy)

---

## 4) Что именно “выпиливаем” из проекта (Git-часть)

### 4.1 Код/модули

Удаляем или делаем “неиспользуемыми”:

- `src/main/git/**`
- `src/main/pr/**`
- `src/main/merge/**`
- `src/main/release/**` *(если релизы были завязаны на PR; можно вернуть позже как чисто PM-фичу)*
- любые IPC handlers, UI-кнопки и сервисы, которые:
    - create branch
    - create PR
    - polling CI
    - merge gates
    - conflict resolver

### 4.2 База данных (таблицы)

Минимальный путь: **оставить таблицы в схеме**, но:

- не читать/не писать
- скрыть UI
- пометить как “deprecated”

Рекомендуемый путь для “clean install”: **новая consolidated migration** без git-таблиц:

- `vcs_projects`
- `task_vcs_links`
- `pull_requests`
- `merge_conflicts`
- `auto_merge_settings`
- `release_items` (если содержит pr_id)
- всё, что “vcs/pr/merge” и их индексы

---

## 5) Новый компонент: TaskQueueManager

### 5.1 Задачи менеджера очереди

- держать список “queued tasks”
- планировать следующий шаг pipeline для каждой задачи
- запускать runs через существующий `RunService/JobRunner`
- обеспечивать:
    - **слоты по ролям**
    - **workspace lock** (для FE/BE/QA)
    - порядок по приоритету
- устойчивость к перезапуску (состояние хранится в БД)

---

## 6) Изменения в БД (минимально необходимые)

### 6.1 Таблица `task_queue`

- `task_id` TEXT PRIMARY KEY (FK tasks)
- `state` TEXT NOT NULL -- queued | running | waiting_user | paused | done | failed
- `stage` TEXT NOT NULL -- ba | fe | be | qa | kb
- `priority` INTEGER NOT NULL
- `enqueued_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL
- `last_error` TEXT NOT NULL DEFAULT ''
- `locked_by` TEXT NOT NULL DEFAULT ''
- `locked_until` TEXT NULL

Индексы:

- `(state, priority, updated_at)`
- `(stage, state, priority)`

### 6.2 Таблица `role_slots`

- `role_key` TEXT PRIMARY KEY -- ba|fe|be|qa
- `max_concurrency` INTEGER NOT NULL
- `updated_at` TEXT NOT NULL

### 6.3 Таблица `resource_locks` (workspace lock)

- `lock_key` TEXT PRIMARY KEY -- `project:<id>:workspace`
- `owner` TEXT NOT NULL
- `acquired_at` TEXT NOT NULL
- `expires_at` TEXT NOT NULL

### 6.4 Переиспользование `runs`

`runs` = Job, менеджер очереди будет создавать `runs` и запускать их.

---

## 7) Алгоритм планирования (scheduler)

### 7.1 Выбор следующей задачи по роли

Для каждой роли (stage):

1) кандидаты: `state='queued' AND stage=<role>`
2) сортировка: `priority DESC, enqueued_at ASC`
3) старт возможен если:
    - свободен слот роли
    - для FE/BE/QA свободен workspace lock проекта

### 7.2 Завершение job

- success → stage=next, state=queued или done
- error → state=failed или retry по политике
- questions → state=waiting_user

---

## 8) Изменения в коде (структура модулей)

### 8.1 Новый модуль `src/main/queue/**`

- `task-queue-repository.ts`
- `role-slots-repository.ts`
- `resource-lock-repository.ts`
- `pipeline-policy.ts`
- `queue-scheduler.ts`
- `task-queue-manager.ts`

### 8.2 IPC/API

Добавить:

- `queue.enqueue(taskId, priority?)`
- `queue.pause(taskId)`
- `queue.resume(taskId)`
- `queue.setPriority(taskId, priority)`
- `queue.list({ roleKey?, state? })`

Удалить: git/pr/merge методы.

---

## 9) UI изменения

- Упростить колонки (без PR/CI):
    - Inbox → Backlog → Ready → In Progress → QA → Done → Waiting(User) → Failed
- Task screen:
    - блок Queue status + кнопки enqueue/pause/resume/retry
    - Runs остаются
    - VCS панели убрать
- Новый экран Queue:
    - BA/FE/BE/QA lanes + running slots + queued list

---

## 10) План внедрения (по шагам)

### Phase Q0 — подготовка без ломки

- feature-flag `queue_mode=off|on`
- `TaskQueueManager` выключен
- `cwd` единый (без worktree)

### Phase Q1 — БД + репозитории

- миграции: `task_queue`, `role_slots`, `resource_locks`
- CRUD + enqueue/pause/resume

### Phase Q2 — Scheduler + слоты + locks

- выбор кандидатов по ролям
- TTL locks
- старт/финиш runs через `RunService`
- recovery после рестарта

### Phase Q3 — Pipeline policy

- BA → FE/BE → QA → Done
- Waiting(User)

### Phase Q4 — Выпилить Git

- удалить `src/main/git|pr|merge|release`
- убрать UI/IPC
- git-таблицы: deprecated или вынести из consolidated migration

### Phase Q5 — Полировка

- экран Queue
- ретраи/backoff
- acceptance тесты

---

## 11) Acceptance тесты (коротко)

1) enqueue task → stage=BA queued
2) BA slot free → BA run starts
3) BA success → stage=FE/BE queued
4) FE run starts (lock acquired)
5) BE run не стартует пока lock занят
6) FE success → QA queued, lock released
7) QA failed → task_queue failed
8) Retry → QA queued → QA success → Done
9) Waiting(User) → Resume → pipeline continues

---

## 12) “Как фиксировать результат Dev-run без git”

Варианты:

- **Auto apply**: run пишет изменения прямо в проект (требует workspace lock)
- **Manual apply (patch)**: run генерит `patch.diff` как artifact, пользователь нажимает Apply

Рекомендация: начать с Auto, добавить Manual как настройку `dev_apply_mode`.

---

## 13) Backlog задач

- **Q-01** DB tables: task_queue, role_slots, resource_locks
- **Q-02** Queue repos
- **Q-03** PipelinePolicy
- **Q-04** QueueScheduler
- **Q-05** TaskQueueManager loop + recovery
- **Q-06** IPC/API queue
- **Q-07** UI: Queue status + Queue screen
- **Q-08** Remove git/pr/merge/release
- **Q-09** Optional: manual patch apply
- **Q-10** Full acceptance test script

---

## 14) Definition of Done

- Авто-выполнение задач через очередь по приоритетам
- Слоты по ролям FE/BE/QA/BA
- Workspace lock для FE/BE/QA в рамках проекта
- Git/VCS функционал отсутствует
- Очередь видна и управляема из UI
- Рестарт не оставляет “зависших” задач
