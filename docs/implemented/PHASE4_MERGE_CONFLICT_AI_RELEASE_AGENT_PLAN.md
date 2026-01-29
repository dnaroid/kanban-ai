# PHASE 4 — Merge/Release automation: AI-резолв конфликтов + авто-мерж + релизный поток (план для агента GLM 4.7)

> Цель фазы 4: довести workflow до “почти автопилота”:
> - безопасное слияние PR с **AI-помощью в конфликтах**
> - авто-мерж при выполненных gates (опционально)
> - релизный поток: milestones/releases + сбор release notes + пост-мерж синхронизация таски
>
> В конце пользователь должен уметь:
> 1) создать PR → дождаться CI → нажать “Merge”
> 2) если есть конфликт → запустить AI Merge Resolver (Suggest/Apply) → завершить merge
> 3) сформировать release из набора тасок и получить release notes

---

## 0) Definition of Done

Фаза 4 завершена, если:

1) ✅ При merge PR система умеет обнаружить конфликт (локально или по ответу провайдера)  
2) ✅ Есть **AI Merge Resolver** с двумя режимами:
   - **Suggest**: предлагает патч + объяснение
   - **Apply**: применяет патч после подтверждения  
3) ✅ Пользователь видит diff резолва и может:
   - принять/отклонить
   - вручную поправить (минимально: открыть файл в редакторе или скопировать патч)  
4) ✅ Ветки/PR корректно переходят в merged или показывают причину неуспеха  
5) ✅ (Опционально) **Auto-merge**: включаемый флаг, который мержит PR, когда gates выполнены  
6) ✅ Появляется “Release” сущность:
   - milestone/release с набором тасок
   - генерируются release notes (AI-помощь)
   - статус релиза обновляется после merge PR’ов  
7) ✅ Тесты:
   - парсер конфликтов
   - “Suggest” генерация и применение patch
   - безопасность (denylist/redaction)
   - релизный генератор заметок (mock LLM)

---

## 1) Scope / Non-scope

### Входит
- Conflict detection + conflict package builder
- AI Merge Resolver runs (как расширение phase 2 runs)
- Apply patch pipeline (с валидацией и rollback)
- Auto-merge scheduler (feature-flag)
- Release entity + release notes generator
- UI: merge conflict flow + release screen

### Не входит
- Полная IDE внутри app (редактор уровня VSCode) — только минимальный viewer/editor
- Двусторонняя синхронизация с Jira
- Сложные стратегии cherry-pick между ветками

---

## 2) Решения (зафиксировать в `docs/decisions/PHASE4.md`)

1) Конфликт-резолв делается **локально** (через git merge/rebase) в temp workspace  
2) AI получает ограниченный контекст: только конфликтные файлы + base/ours/theirs + правила проекта  
3) “Apply” всегда требует user confirmation и показывает diff  
4) Auto-merge — только если gates ok и нет конфликтов  
5) Release notes — из тасок + PR titles + labels, затем ручная правка

---

## 3) DB: новые таблицы/поля (миграции)

### 3.1 `merge_conflicts`
- `id TEXT PRIMARY KEY`
- `task_id TEXT NOT NULL`
- `pr_id TEXT NOT NULL`
- `status TEXT NOT NULL` (`detected|suggested|applied|resolved|aborted`)
- `base_branch TEXT NOT NULL`
- `head_branch TEXT NOT NULL`
- `conflict_files_json TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### 3.2 `releases`
- `id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `name TEXT NOT NULL` (например `v0.2.0`)
- `status TEXT NOT NULL` (`draft|in_progress|published|canceled`)
- `target_date TEXT NULL`
- `notes_md TEXT NOT NULL DEFAULT ''`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### 3.3 `release_items`
- `id TEXT PRIMARY KEY`
- `release_id TEXT NOT NULL`
- `task_id TEXT NOT NULL`
- `pr_id TEXT NOT NULL DEFAULT ''`
- `state TEXT NOT NULL DEFAULT 'planned'` (`planned|merged|dropped`)
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### 3.4 Индексы
- `idx_conflicts_task` on `merge_conflicts(task_id, updated_at)`
- `idx_releases_project` on `releases(project_id, updated_at)`
- `idx_release_items_release` on `release_items(release_id, state)`

---

## 4) Conflict detection + conflict package builder

### 4.1 Где детектим конфликты
- При локальном merge head → base в temp workspace (рекомендовано)
- Или по ответу PRProvider merge API (“merge conflict”)

### 4.2 Алгоритм (MVP)
1) Создать temp workspace (git worktree или отдельная директория)  
2) Checkout base branch  
3) Попробовать merge head branch  
4) Если конфликты:
   - `git diff --name-only --diff-filter=U` → список файлов
   - для каждого файла получить base/ours/theirs (stage 1/2/3), плюс текущий файл с маркерами

### 4.3 Формат conflict package (payload_json для run)
```json
{
  "task": { "id": "...", "title": "..." },
  "pr": { "id": "...", "base": "main", "head": "task/123-foo" },
  "files": [
    { "path": "src/a.ts", "base": "...", "ours": "...", "theirs": "...", "markers": "..." }
  ],
  "rules": { "style": "...", "denylist": ["*.env"] }
}
```

---

## 5) AI Merge Resolver (как Run роль)

### 5.1 Новая роль
- `merge-resolver`
- preset:
  - “resolve conflicts only”
  - “do not touch unrelated code”
  - “output unified diff patch + explanation”

### 5.2 Suggest
- artifacts:
  - `patch` (unified diff)
  - `markdown` (explanation)
- UI: diff viewer + Apply/Reject

### 5.3 Apply
- Применить patch в temp workspace
- Проверки:
  - `git status` без unmerged paths
  - (опционально) `pnpm typecheck/test`
- Commit: “Resolve merge conflicts”
- Push обновлённой ветки (или выполнить merge локально и пушнуть base — зависит от стратегии)

### 5.4 Rollback
- При ошибке: не трогаем основной repo
- сохраняем artifact “apply error” + логи

---

## 6) Auto-merge (feature-flag)

### 6.1 Настройки проекта
- `autoMergeEnabled`
- `autoMergeMethod: merge|squash|rebase`
- `requireCiSuccess`
- `requiredApprovals`
- `requireNoConflicts`

### 6.2 Планировщик
- периодически сканирует open PR:
  - gates ok → merge
  - conflict → создать merge_conflict + уведомление

---

## 7) Release flow

### 7.1 UI: Releases
- список релизов, создание
- добавление items (таски/PR)
- статусы items: planned/merged/dropped

### 7.2 Release notes generator
- собрать: task titles + PR titles + labels/tags
- запустить run роли `release-notes` (или BA)
- получить markdown artifact → пользователь правит → publish

### 7.3 Publish
- сохранить `notes_md`
- статус `published`
- (опционально) создать release в GitHub/GitLab через API

---

## 8) IPC (минимум)

### Conflicts
- `merge.detect({ taskId }) -> { conflictId | none }`
- `merge.suggest({ conflictId }) -> { runId }`
- `merge.apply({ conflictId, patchArtifactId }) -> { ok }`
- `merge.abort({ conflictId }) -> { ok }`

### Auto-merge
- `autoMerge.set({ projectId, enabled, method, ... })`
- `autoMerge.runOnce({ projectId }) -> { mergedCount, conflictsCount }`

### Releases
- `release.create({ projectId, name, targetDate? }) -> { releaseId }`
- `release.addItems({ releaseId, taskIds })`
- `release.generateNotes({ releaseId }) -> { runId }`
- `release.publish({ releaseId, notesMd })`
- `release.list({ projectId })`
- `release.get({ releaseId })`

---

## 9) UI изменения

### 9.1 PR panel: Merge flow upgrade
- Merge → если conflict → CTA “Resolve conflicts”
- модал “Conflict Resolver”:
  - список файлов
  - Suggest/Apply
  - diff viewer + explanation
  - log panel

### 9.2 Releases screen
- список релизов + create
- details: items + notes + publish

### 9.3 Notifications
- toast + badge на таске/PR при конфликте

---

## 10) Тестирование (минимум)

### Unit
- conflict marker parser
- patch apply dry-run
- auto-merge policy evaluate()

### Integration
- temp repo с конфликтом:
  - detect → suggest (mock patch) → apply → merge success
- release notes generator (mock) produces markdown

---

## 11) План работ (тикеты фазы 4)

### T4.1 — DB миграции: merge_conflicts + releases + release_items
Коммит: `feat(db): add merge conflicts and releases tables`

### T4.2 — Temp workspace manager (worktree/clone)
Коммит: `feat(merge): temp workspace manager`

### T4.3 — Conflict detector v1
Коммит: `feat(merge): detect conflicts and build package`

### T4.4 — Роль `merge-resolver` + wiring
Коммит: `feat(roles): add merge-resolver role preset`

### T4.5 — Suggest flow (patch + explanation artifacts)
Коммит: `feat(merge): suggest resolution via run`

### T4.6 — UI: Conflict Resolver modal
Коммит: `feat(ui): merge conflict resolver modal`

### T4.7 — Apply pipeline (apply → validate → commit → push)
Коммит: `feat(merge): apply patch pipeline with validation`

### T4.8 — PR merge integration: conflict record + link
Коммит: `feat(pr): merge conflict handling`

### T4.9 — Auto-merge scheduler + runOnce
Коммит: `feat(auto-merge): scheduler and policy`

### T4.10 — Releases: DB repo + UI skeleton
Коммит: `feat(release): entities and screen`

### T4.11 — Release notes run + publish flow
Коммит: `feat(release): generate notes and publish`

### T4.12 — Tests: conflict integration + auto-merge + release notes mock
Коммит: `test: merge conflicts + releases`

---

## 12) Команды проверки
- После T4.1, T4.3, T4.7, T4.11, T4.12:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Каждый тикет:
  - `pnpm dev`

---

## 13) UX проверка фазы 4 (user acceptance)
1) Merge PR → конфликт → открыть resolver  
2) Suggest → увидеть patch + explanation  
3) Apply → конфликт исчез, merge проходит  
4) Auto-merge включён → PR мержится сам при gates ok (без конфликтов)  
5) Release: создать → добавить таски → generate notes → publish

---

## 14) Инструкции агенту (вставить в prompt)
- Делай тикеты T4.1–T4.12 маленькими коммитами.  
- Merge/conflict операции — только в temp workspace.  
- Apply — только после подтверждения и с показом diff.  
- Секреты — только SecretStore, логи — с redaction.
