# PHASE 3 — Git workflow: branch-per-task + PR + CI статусы + merge gates (план для агента GLM 4.7)

> Цель фазы 3: связать Kanban/Runs с реальной разработкой в репозитории:  
> **ветка на таску → изменения/коммиты → PR → статусы CI/Review → merge (ручной, с gates)**.  
> В конце пользователь должен уметь: открыть таску → создать ветку → запустить Dev run (который меняет файлы) → закоммитить → создать PR → видеть статусы → выполнить merge (пока без AI-резолва конфликтов).

---

## 0) Definition of Done

Фаза 3 завершена, если:

1) ✅ Для таски можно создать и привязать **git-ветку** (branch-per-task)  
2) ✅ В UI видно VCS-статус таски: branch, dirty/clean, commits count, last commit, PR status  
3) ✅ Dev-run (из фазы 2) может работать в **ветке таски** (cwd=repoPath) и производить изменения  
4) ✅ Можно создать **commit** из UI (и/или автоматически после Dev run — опция)  
5) ✅ Можно создать **PR** (минимум GitHub *или* GitLab) и привязать к таске  
6) ✅ Статусы PR/CI отображаются в UI (polling приемлем)  
7) ✅ Merge gates работают (минимум: CI success + approvals>=N)  
8) ✅ Тесты: GitAdapter (локальный), PRProvider (mock), сохранение связок в DB

---

## 1) Scope / Non-scope

### Входит
- Local Git operations: open, branch create/checkout, status, diff, commit, push
- Task ↔ branch ↔ PR связка
- PR создание + polling статусов (CI + reviews)
- Merge gates (валидация перед merge)
- UI: вкладка VCS в таске + PR панель

### Не входит
- AI conflict resolution (фаза 4+)
- Автоматический merge без пользователя (можно позже)
- Advanced CI artifact viewer
- Plugin system

---

## 2) Решения (зафиксировать в `docs/decisions/PHASE3.md`)

1) Git library: **simple-git** (MVP)  
2) Provider: выбрать **один** реальный провайдер на MVP: GitHub или GitLab  
3) Статусы: polling (15–30 сек) → позже webhooks  
4) Merge: сначала **ручной merge** через provider API  
5) Секреты токенов провайдеров — только через SecretStore

---

## 3) DB: новые таблицы/поля (миграции)

### 3.1 `vcs_projects` (на проект)
- `project_id TEXT PRIMARY KEY`
- `repo_path TEXT NOT NULL`
- `remote_url TEXT NOT NULL DEFAULT ''`
- `default_branch TEXT NOT NULL DEFAULT 'main'`
- `provider_type TEXT NOT NULL DEFAULT ''` (`github|gitlab|`)
- `provider_repo_id TEXT NOT NULL DEFAULT ''` (например `owner/repo` или numeric id)
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### 3.2 `task_vcs_links` (на таску)
- `task_id TEXT PRIMARY KEY`
- `branch_name TEXT NOT NULL DEFAULT ''`
- `pr_id TEXT NOT NULL DEFAULT ''`
- `pr_url TEXT NOT NULL DEFAULT ''`
- `last_commit_sha TEXT NOT NULL DEFAULT ''`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### 3.3 `pull_requests` (кэш PR данных)
- `id TEXT PRIMARY KEY` (внутренний UUID)
- `task_id TEXT NOT NULL`
- `provider_pr_id TEXT NOT NULL`
- `title TEXT NOT NULL`
- `state TEXT NOT NULL` (`open|closed|merged|draft`)
- `url TEXT NOT NULL`
- `base_branch TEXT NOT NULL`
- `head_branch TEXT NOT NULL`
- `ci_status TEXT NOT NULL DEFAULT 'unknown'` (`unknown|pending|success|failed`)
- `approvals_count INTEGER NOT NULL DEFAULT 0`
- `required_approvals INTEGER NOT NULL DEFAULT 0`
- `last_synced_at TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### 3.4 Индексы
- `idx_task_vcs_branch` on `task_vcs_links(branch_name)`
- `idx_pr_task` on `pull_requests(task_id, updated_at)`

---

## 4) Integration Layer: GitAdapter (локальный)

### 4.1 Обязательные методы
```ts
interface GitAdapter {
  ensureRepo(repoPath: string): Promise<void>;
  getDefaultBranch(repoPath: string): Promise<string>;
  getStatus(repoPath: string): Promise<{ branch: string; isDirty: boolean; ahead: number; behind: number; }>;
  checkoutBranch(repoPath: string, branch: string): Promise<void>;
  createBranch(repoPath: string, branch: string, from?: string): Promise<void>;
  getDiff(repoPath: string): Promise<string>;
  commitAll(repoPath: string, message: string): Promise<{ sha: string }>;
  push(repoPath: string, branch: string): Promise<void>;
}
```

### 4.2 Branch naming policy
- шаблон: `task/{taskId}-{slug}`
- slug: lowercase + '-', без спецсимволов

---

## 5) Integration Layer: PRProvider (GitHub или GitLab)

### 5.1 Обязательные методы
```ts
interface PRProvider {
  createPR(input: { repoId: string; base: string; head: string; title: string; body: string; draft?: boolean }): Promise<{ providerPrId: string; url: string; state: string }>;
  getPR(input: { repoId: string; providerPrId: string }): Promise<{ state: string; title: string; url: string; approvals: number; ciStatus: string }>;
  mergePR(input: { repoId: string; providerPrId: string; method: 'merge'|'squash'|'rebase' }): Promise<{ ok: true }>;
}
```

### 5.2 Auth
- Token в SecretStore (`provider/github/token` или `provider/gitlab/token`)
- UI настройки интеграций на уровне проекта (provider + repoId + token)

### 5.3 Polling
- обновлять open PR каждые 15–30 сек:
  - state, approvals_count, ci_status

---

## 6) Merge Gates (Policy layer)

### 6.1 Минимальные gates
Проектные настройки:
- `requireCiSuccess: boolean`
- `requiredApprovals: number`
- `allowMergeWhenDraft: boolean`

### 6.2 Поведение
- Merge disabled, если gates не выполнены
- Повторная проверка gates в main перед merge обязательна

---

## 7) Связка с Runs (Dev run → изменения → commit)

### 7.1 Минимальный flow
- Dev run выполняется в repoPath в ветке таски
- После run:
  - если dirty → предложить Commit
  - показывать Diff в UI
- run может сохранять artifact `patch` (diff)

### 7.2 Safe mode
- запрет опасных команд
- denylist секретных файлов
- redaction в логах

---

## 8) UI изменения

### 8.1 Вкладка “VCS” в TaskDetails
Показывать:
- Branch: create/checkout
- Status: dirty/clean, ahead/behind, last commit
- Diff viewer
- Actions: Commit, Push, Create PR

### 8.2 PR panel
- URL, state, approvals, CI status
- Actions: Refresh, Merge (если gates ok)

### 8.3 Project Settings: Integrations
- repoPath picker
- provider selection + repoId
- token management (SecretStore)

---

## 9) IPC (минимум)

### Git
- `git.status({ projectId })`
- `git.branch.create({ taskId })`
- `git.branch.checkout({ taskId })`
- `git.diff({ taskId })`
- `git.commit({ taskId, message })`
- `git.push({ taskId })`

### PR
- `pr.create({ taskId, title, body, draft? })`
- `pr.refresh({ taskId })`
- `pr.merge({ taskId, method })`

### Settings
- `vcs.connectRepo({ projectId, repoPath })`
- `integrations.setProvider({ projectId, providerType, repoId })`
- `integrations.setToken({ providerType, token })`

---

## 10) Тестирование (минимум)

### Unit
- slugify + branch naming
- merge gates evaluate()

### Integration
- GitAdapter на temp repo: create branch → modify file → diff → commit
- PRProvider mock: create/get/merge + gates

---

## 11) План работ (тикеты)

### T3.1 — DB миграции (vcs + pr tables)
Коммит: `feat(db): add vcs + pr tables`

### T3.2 — GitAdapter v1 (simple-git)
Коммит: `feat(git): adapter v1 with status/diff/commit`

### T3.3 — Branch-per-task workflow + task_vcs_links
Коммит: `feat(git): branch-per-task workflow`

### T3.4 — IPC: git endpoints
Коммит: `feat(ipc): git endpoints`

### T3.5 — UI: VCS tab (status + create branch + diff)
Коммит: `feat(ui): task vcs tab with status and diff`

### T3.6 — Commit + Push UI
Коммит: `feat(ui): commit and push actions`

### T3.7 — PRProvider v1 + SecretStore wiring (GitHub или GitLab)
Коммит: `feat(pr): provider v1 + auth via secret store`

### T3.8 — IPC: pr endpoints + polling refresh
Коммит: `feat(ipc): pr endpoints and polling refresh`

### T3.9 — UI: PR panel (CI/approvals)
Коммит: `feat(ui): pr panel with ci and approvals`

### T3.10 — Merge gates + merge guard
Коммит: `feat(merge): gates validation before merge`

### T3.11 — Runs integration: Dev run in branch + post-run commit prompt
Коммит: `feat(run): dev run integrates with git branch and post-run commit flow`

### T3.12 — Tests: git integration + provider mock + gates
Коммит: `test: git adapter + pr provider mock + gates`

---

## 12) Команды проверки
- После T3.1, T3.4, T3.7, T3.10, T3.12:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Каждый тикет:
  - `pnpm dev`

---

## 13) Проверка фазы 3 (user acceptance)
1) Подключить repoPath и токен провайдера  
2) Создать branch для таски  
3) Сделать изменения (Dev run или вручную)  
4) Commit + Push  
5) Create PR  
6) Дождаться CI → увидеть статус  
7) Merge доступен только при выполненных gates → выполнить merge

---

## 14) Инструкции агенту (вставить в prompt)
- Иди по тикетам T3.1–T3.12, маленькими коммитами.  
- Сначала local git, потом PR provider.  
- Любые секреты — только SecretStore.  
- Перед merge всегда проверяй gates в main.
