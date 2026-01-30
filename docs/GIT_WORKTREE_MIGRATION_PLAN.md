# Kanban AI — План миграции на `git worktree` (параллельные таски в отдельных воркспейсах)

> Дата: 2026-01-30  
> Цель: чтобы каждая активная задача могла иметь **собственную рабочую директорию** (workspace) на своей ветке, и чтобы **несколько задач могли выполняться параллельно локально**, не трогая основной код/working tree проекта.

---

## 0) Принципы и целевое поведение

### Что хотим получить
- На проект: один “основной” репозиторий (base repo), обычно на `main`/`develop`
- На каждую задачу: отдельный worktree-каталог:
  - `.../worktrees/<project>/<taskKey>-<slug>/`
  - в нём checkout ветки `task/<taskId>-<slug>`
- Все git-операции (run/тесты/коммиты) выполняются **в каталоге worktree**, а не в base repo
- По завершении/мерже:
  - worktree удаляется
  - ветка может быть удалена (опционально) или оставлена

### Что НЕ делаем
- Не меняем workflow PR/CI (он остаётся прежним)
- Не переходим на monorepo или новую VCS модель
- Не вводим “облако”

---

## 1) Данные, которые нужно хранить в БД (минимальные изменения)

У тебя уже есть:
- `projects.path` — путь к проекту
- `vcs_projects.repo_path`
- `task_vcs_links.branch_name`, `last_commit_sha`, `pr_id`, `pr_url`

Нужно добавить (рекомендуется):

### 1.1 Новая таблица `task_worktrees` (лучше отдельная)
**Почему не в `task_vcs_links`?** Потому что worktree — это локальный runtime-ресурс, не всегда VCS-сущность (PR может быть без worktree, а worktree может жить без PR).

**DDL:**
- `task_id` (PK, FK tasks)
- `workspace_path` TEXT NOT NULL
- `base_repo_path` TEXT NOT NULL
- `branch_name` TEXT NOT NULL
- `status` TEXT NOT NULL DEFAULT 'active'   (active|detached|removed|error)
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

Индекс:
- `idx_worktrees_base_repo` (base_repo_path)

### 1.2 Политика размещения (в настройках)
В `app_settings` или `projects`:
- `worktree_root` (nullable) — где создавать worktrees
- `worktree_mode` enum:
  - `off` (старое поведение)
  - `per_task` (default)
  - `shared` (редко, не советую)

---

## 2) Структура путей (конвенция)

### 2.1 Root для worktrees
Рекомендуемый default:
- `<repo_parent>/.kanban-worktrees/<repo_name>/...`
или:
- `~/.kanban-ai/worktrees/<repo_name>/...`

Важно:
- root должен быть **на том же диске**, иначе `git worktree` может вести себя не так, как ожидаешь (обычно ок, но лучше без сюрпризов).

### 2.2 Папка одной задачи
`<worktree_root>/<taskId>-<slug>/`

Slug — короткий и безопасный:
- lowercase
- `a-z0-9-`
- 40–60 символов максимум

---

## 3) Git-операции: что меняется

### До (сейчас)
- ветка создаётся в base repo
- рабочие файлы меняются в одном каталоге

### После (worktree)
- ветка создаётся (если нет)
- создаётся worktree:
  - `git worktree add <workspace_path> -b <branch> <base_ref>`
  - или если ветка уже есть: `git worktree add <workspace_path> <branch>`
- любые команды выполняются в `workspace_path`

---

## 4) Новые компоненты в коде

### 4.1 WorktreeService
Файл: `src/main/git/worktree-service.ts`

Методы:
- `ensureWorktreeForTask({ projectId, taskId }) -> workspacePath`
- `removeWorktreeForTask(taskId, opts)`
- `listWorktrees(projectId)` (для диагностики)
- `repairWorktree(taskId)` (если каталог удалили руками)
- `resolveWorkspacePath(taskId)` (единая точка правды)

### 4.2 Изменения в существующих сервисах
#### `task-branch-service.ts`
- `ensureTaskBranch` остаётся, но вызывается внутри `ensureWorktreeForTask`

#### `opencode-executor.ts` / `job-runner.ts`
- принимать `cwd` как `workspace_path`
- все команды/patch/apply выполняются в worktree

#### `merge-service.ts` / конфликт-детектор
- может работать по PR/remote, но если нужно локально:
  - использовать `workspace_path` ветки
  - или создать временный worktree для merge simulation (часто удобнее)

---

## 5) Чёткие сценарии (user flows) после миграции

### 5.1 Start Dev Run on Task
1) `ensureTaskBranch(task)` → branch name
2) `ensureWorktreeForTask(task)` → workspace path
3) `runService.startRun(task, role=Dev, cwd=workspace_path)`
4) результат → commit/push (внутри worktree)

### 5.2 Create PR
- делается как сейчас, ветка та же
- разница: `git push` выполняется из worktree

### 5.3 Parallel runs
- разные задачи → разные worktrees → разные `cwd`
- можно параллельно:
  - `npm test` в двух worktrees
  - `opencode` в двух worktrees
  - `git status` не конфликтует

### 5.4 Finish task (merged)
1) PR merged
2) mark task Done
3) auto-clean:
   - `git worktree remove <workspace_path> --force`
   - удалить запись `task_worktrees`
   - опционально: delete local branch `git branch -D ...`
   - опционально: prune `git worktree prune`

---

## 6) Безопасность и “грабли” worktree

### 6.1 Нельзя иметь один и тот же branch в двух worktrees
Git запретит. Поэтому:
- `ensureWorktreeForTask` должен:
  - проверять, нет ли уже worktree для ветки
  - если есть, использовать существующий (если путь совпадает)
  - если путь другой — ошибка + “repair” сценарий

### 6.2 Detached worktrees (после краша/удаления папки)
Если папку worktree удалили руками:
- `git worktree list` покажет “prunable”
- нужно `git worktree prune`
Твой сервис должен:
- уметь detect missing workspace_path
- уметь `prune` и пересоздать worktree

### 6.3 Lock files
Git может оставлять `.git/worktrees/<name>/locked`
Нужно:
- диагностика + команда “unlock” (редко, но полезно)

### 6.4 Node_modules и кеши
Каждый worktree — отдельная папка, значит:
- `node_modules` будет в каждой (дорого)
Опции:
1) оставить как есть (простое, но тяжёлое)
2) использовать pnpm store + `node-linker=isolated` (обычно и так)
3) сделать shared `node_modules` через tooling (сложно, часто не стоит)
Рекомендация: **начать с 1**, оптимизировать потом.

---

## 7) Миграция данных/кода по шагам (пошаговый план)

## Phase WT0 — Подготовка (без изменения поведения)
1) Добавить настройку `worktree_mode` (default `off`)
2) Добавить `WorktreeService` заглушку (возвращает `repo_path` как workspace)
3) В `RunService/JobRunner` ввести единый параметр `cwd` (сейчас = repo_path)

**Критерий:** ничего не ломается, electron UI работает.

## Phase WT1 — Схема БД для worktrees
1) Добавить migration `task_worktrees` (или поля в существующую)
2) Repository: `task-worktree-repository.ts`

**Критерий:** можно записывать/читать worktree записи.

## Phase WT2 — Реальный `git worktree add/remove`
1) Реализовать в `git-adapter.ts`:
   - `worktreeList()`
   - `worktreeAdd(path, branch, baseRef?)`
   - `worktreeRemove(path, force)`
   - `worktreePrune()`
2) Реализовать `WorktreeService.ensureWorktreeForTask`
3) Реализовать `removeWorktreeForTask`

**Критерий:** из CLI/diagnostics можно создать/удалить worktree.

## Phase WT3 — Подключить к task branching и runs
1) В `task-branch-service` при старте Dev-run:
   - если `worktree_mode=per_task`: ensure worktree
2) В `opencode-executor` передавать `cwd=workspace_path`
3) Все git-команды (commit/push/status) делаются в `cwd`

**Критерий:** Dev-run работает в worktree и пушит ветку.

## Phase WT4 — UI/UX (Electron + будущие TUI/Web)
1) В Task drawer показать:
   - `workspace_path`
   - кнопки: “Open folder”, “Remove worktree”, “Repair”
2) В Diagnostics добавить:
   - `git worktree list`
   - prune
3) Авто-clean при Done (опционально флагом)

**Критерий:** пользователь контролирует воркспейсы.

## Phase WT5 — Полировка и edge cases
- обработка missing path
- обработка locked
- конфликт branch already used
- оптимизация node_modules (по желанию)

---

## 8) Тест-план (минимальный)

### Unit
- slugify path generator
- worktree path resolver
- repository CRUD

### Integration (реальный git репо в tmp)
1) create repo, commit main
2) create task, ensure worktree → папка появилась
3) изменить файл в worktree, commit, проверить ветку
4) ensure second task worktree параллельно
5) remove worktree и prune
6) simulate deleted folder → prune → repair

---

## 9) Команды/шпаргалка (для диагностики)

- `git worktree list`
- `git worktree add <path> -b <branch> <baseRef>`
- `git worktree add <path> <branch>`
- `git worktree remove <path> --force`
- `git worktree prune`

---

## 10) Рекомендации по дефолтному поведению

- Для проектов с большим node_modules: начать с worktree, но:
  - показывать предупреждение “каждый worktree создаст свой node_modules”
- Auto-clean worktrees:
  - включить по умолчанию, но с задержкой (например, через кнопку “Clean merged worktrees”)
- Сохранять worktree, если task в статусе “Waiting” (чтобы не терять контекст)

---

## 11) Ready-to-implement задачи (готовый backlog)

**WT-01** Add `worktree_mode` setting + pluggable workspace resolver  
**WT-02** Add DB table `task_worktrees` + repository  
**WT-03** Extend git-adapter with worktree commands  
**WT-04** Implement WorktreeService ensure/remove/repair/list  
**WT-05** Wire worktree into RunService (pass cwd)  
**WT-06** Wire worktree into task branching + PR creation/push  
**WT-07** Add Diagnostics UI for worktrees + prune  
**WT-08** Add auto-clean on task Done + safety gates  
**WT-09** Add integration tests with tmp git repo

---

## 12) Definition of Done (миграция завершена)

- Для любой активной задачи можно создать worktree и работать в нём  
- Параллельные задачи запускают runs в разных `cwd` без конфликтов  
- PR/CI/merge работают как раньше  
- Можно безопасно удалить/восстановить worktree  
- UI показывает workspace и диагностирует проблемы (`prune`, missing path)

