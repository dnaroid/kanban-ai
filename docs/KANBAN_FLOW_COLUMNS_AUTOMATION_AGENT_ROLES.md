# Kanban AI — Колонки, роли агентов и автоматизация флоу (после фазы 5)

> Дата: 2026-01-30  
> Цель: предложить “типовой” набор колонок + правила автоматического перемещения задач + минимальный/оптимальный набор ролей агентов + полностью автоматизируемый end‑to‑end флоу: **требование → user story → ветка → реализация → PR/CI → merge → обновление базы знаний**.

---

## 1) Типовой набор колонок (практичный “по умолчанию”)

Ниже — набор, который хорошо работает в продуктовой разработке и под автоматизацию.

### Вариант A (минимальный, но удобный)
1. **Inbox** — сырой вход (требования, идеи, баг-репорты)
2. **Backlog** — отобранное, но не готовое к разработке
3. **Ready** — готово к старту (есть user story + AC + уточнения)
4. **In Progress** — активно делаем
5. **Review** — PR открыт, ждём ревью/правки
6. **QA** — проверка (ручная/автотесты/регресс)
7. **Done** — готово и вмержено
8. **Parked / Won’t do** — заморожено/отложено/не делаем

### Вариант B (расширенный, лучше отражает реальную “ожидалку”)
1. **Inbox**
2. **Triage** (опц.) — быстрая классификация/приоритезация (BA/PM)
3. **Backlog**
4. **Ready**
5. **In Dev**
6. **Waiting** *(особый статус ожидания, см. ниже)*
7. **PR Open**
8. **CI / Checks**
9. **Review**
10. **QA**
11. **Ready to Merge**
12. **Done**
13. **Blocked** *(иногда вместо Waiting — отдельная колонка)*
14. **Parked / Won’t do**

### Что такое “Waiting” (очень полезно для автоматизации)
Waiting — это не “блокер” в смысле зависимости, это **ожидание внешнего сигнала**.  
Рекомендуемые причины ожидания (как enum/label):
- **Waiting: User** — ждём ответа/решения/данных от пользователя/заказчика
- **Waiting: Review** — ждём ревьюера
- **Waiting: CI** — ждём прогона пайплайна
- **Waiting: External** — ждём внешнюю систему/доступ/инфо
- **Waiting: Dependency** — ждём другую задачу (формально это blocked-by)

Практика: **колонка одна**, а причина — поле `waiting_reason`.

---

## 2) Какие статусы/поля лучше иметь, чтобы колонки двигались “сами”

Чтобы автоматизировать перемещения, важно отделить:
- **UI-колонку** (column)
- **машинные статусы** (state flags), которые вычисляются из фактов

Рекомендуемый минимальный набор “фактов”, которые можно вычислять:
- `has_story` — есть user story (artifact/section в описании)
- `has_acceptance_criteria`
- `has_branch` — ветка создана/checkout
- `has_pr` — PR создан
- `pr_state` — open/draft/merged/closed
- `ci_status` — unknown/pending/success/failed
- `approvals_ok` — да/нет
- `qa_passed` — да/нет (или QA run succeeded + чеклист)
- `blocked_by_count` — количество блокирующих зависимостей
- `waiting_reason` — если задано, задача в ожидании

> Колонка становится **производной** от этих фактов (правила ниже), а не “ручной истиной”.

---

## 3) Правила автоматического перемещения (канонический набор)

Ниже — логика “state machine”. Ручное перемещение разрешено, но система “подталкивает” обратно, если факты противоречат.

### 3.1 Базовые переходы (минимум)
- **Inbox → Backlog**: после triage (BA/PM) и назначения приоритета/типа
- **Backlog → Ready**: когда `has_story && has_acceptance_criteria && !waiting_reason && blocked_by_count==0`
- **Ready → In Progress**: когда создана ветка **или** стартовал Dev-run (`has_branch || dev_run_started`)
- **In Progress → Review**: когда `has_pr && pr_state in (open,draft)`
- **Review → QA**: когда PR принят ревьюером **и** `ci_status==success` (или когда PR помечен “ready for QA”)
- **QA → Done**: когда `qa_passed && pr_state==merged` (или merge triggers done)
- **Любая → Waiting**: когда установили `waiting_reason` (ручной флаг или автоматом)
- **Любая → Blocked**: когда `blocked_by_count>0` (если используешь отдельную колонку)

### 3.2 Авто-переходы по PR/CI (полезная детализация)
- **PR Open**: `has_pr && pr_state==open`
- **CI / Checks**: `has_pr && ci_status in (pending,failed)`  
  - при `failed` — можно оставаться в CI и ставить label “needs fixes”
- **Ready to Merge**: `has_pr && ci_status==success && approvals_ok && qa_passed`  
- **Done**: `pr_state==merged` (и таска не помечена как “keep open”)

### 3.3 “Не выполнено” и “возврат назад”
- Если в QA тесты не прошли → **QA → In Dev** (и добавить задачу “Fix QA findings” или комментарий).
- Если ревью запросило правки → **Review → In Dev**.
- Если CI упал → **CI → In Dev**.
- Если PR закрыли без мержа → вернуть в **In Dev** или **Ready** (в зависимости от причины).

---

## 4) Какие роли агентов реально нужны

Ниже — **практичный минимальный** и **полный** набор.

### 4.1 Минимум (чтобы уже жить)
1. **BA/PM (Story Writer)**  
   Делает: user story, AC, уточняющие вопросы, разметку “Definition of Ready”.  
   Выход: markdown artifact `User Story + AC + Questions`.

2. **Dev (Implementer)**  
   Делает: план, изменения в коде (patch), запуск локальных тестов (если умеет).  
   Выход: diff/коммит(ы), краткий summary.

3. **QA (Test Planner/Executor-lite)**  
   Делает: тест-план, чеклист, негативные кейсы, “what to verify”.  
   Выход: artifact `Test Plan` + (опц.) автотесты/скрипты.

4. **Merge/Conflict Resolver** *(может быть часть Dev, но лучше отдельной ролью)*  
   Делает: анализ конфликтов, аккуратный merge, минимизация регрессий.  
   Выход: резолв конфликтов + обновление PR.

### 4.2 Оптимальный (для автопайплайна без боли)
5. **Code Reviewer (AI Reviewer)**  
   Делает: ревью PR, замечания, security/perf, style.  
   Выход: review artifact + (опц.) комментарии в PR.

6. **Release Notes Writer**  
   Делает: release notes (из merged tasks/PR), changelog.  
   Выход: `Release Notes` artifact.

7. **Knowledge Base Curator (Doc/Indexer)**  
   Делает: обновление “базы знаний проекта”: архитектурные решения, ADR, changelog-итоги, индекс.  
   Выход: `KB Update` artifact + обновлённые файлы `docs/` или `.indexer/`.

> В реальности **BA + Dev + QA + MergeResolver + KB** закрывают 95% пользы.

---

## 5) Как автоматизировать полный флоу (end‑to‑end)

Ниже — целевой автоматический конвейер, который можно включать как “Auto‑Pilot” на задаче.

### 5.1 События, которые запускают шаги
- Создание/изменение задачи
- Переход по колонке (ручной или авто)
- Появление/изменение ветки/PR/CI статуса
- Завершение run (BA/Dev/QA/Reviewer/KB)
- Изменение зависимостей/blocked-by
- Снятие/установка `waiting_reason`

### 5.2 Полный pipeline (рекомендуемая последовательность)

#### Шаг 0 — Intake / Triage
**Trigger:** новая задача в Inbox  
**Action:**
- BA/PM-run: классификация (bug/story/chore), приоритет, теги, вопросы
- если нужна инфа от пользователя → `waiting_reason=User` + колонка Waiting

**Move:**
- Inbox → Backlog (или Triage → Backlog)

#### Шаг 1 — Создание user story + AC (Definition of Ready)
**Trigger:** задача в Backlog и отмечена “candidate”  
**Action:** BA-run “Story Writer”
- генерирует user story + AC + список вопросов/рисков
- обновляет `description_md` (или прикрепляет artifact и ставит флаг `has_story/has_ac`)

**Move:**
- Backlog → Ready (если нет ожидания и нет блокеров)
- иначе → Waiting/Blocked

#### Шаг 2 — Выбор модели/агента
**Trigger:** задача в Ready и авто-пайплайн включён  
**Policy (типовой):**
- BA: быстрый/дешёвый (но аккуратный)
- Dev: сильный кодовый агент
- QA/Review: средний
- MergeResolver: сильный/точный

**Action:**
- выбрать `role_id` + `executor/model` по конфигу проекта/задачи (например по tags: `security`, `perf`, `ui`)

#### Шаг 3 — Создание git-ветки
**Trigger:** перед Dev-run (или сразу при переходе в In Dev)  
**Action:**
- create branch `task/{taskId}-{slug}`
- checkout
- записать `task_vcs_links.branch_name`
- (опц.) создать initial commit “chore: start task …”

**Move:** Ready → In Dev

#### Шаг 4 — Выполнение (Dev-run)
**Trigger:** ветка есть + задача In Dev  
**Action:**
- Dev-run: план → изменения → локальные проверки → summary
- сохраняет artifacts:
  - `Implementation Plan`
  - `Patch/Diff Summary`
  - `Notes/Decisions`

**Auto-commit policy (по желанию):**
- если `diff < threshold` и tests ok → auto commit
- иначе → “manual review required” (оставить dirty, но показать diff)

#### Шаг 5 — Создание PR
**Trigger:** есть коммиты и рабочая ветка  
**Action:**
- push branch
- create PR (draft по умолчанию для безопасности)
- записать `task_vcs_links.pr_url/pr_id`
- включить polling PR (CI/approvals)

**Move:** In Dev → PR Open (или Review)

#### Шаг 6 — CI / Checks
**Trigger:** PR открыт  
**Action:**
- ждать CI
- при `failed`:
  - Dev-run “Fix CI” (или поставить Waiting: CI и вернуть в In Dev)
- при `success`:
  - продолжить пайплайн

**Move:** PR Open → CI/Checks → Review

#### Шаг 7 — Review (AI Reviewer +/или человек)
**Trigger:** CI success  
**Action:**
- AI Reviewer-run: замечания/риски/улучшения
- если есть замечания уровня “must fix”:
  - Dev-run “Apply Review Fixes”
  - обновить PR
- если ок:
  - пометить `approvals_ok` (если автоматизировано) или ждать human approval

**Move:** Review → QA (или Waiting: Review)

#### Шаг 8 — QA
**Trigger:** PR готов  
**Action:**
- QA-run: чеклист + что проверить + тестовые данные
- (опц.) генерация/обновление автотестов
- выставить `qa_passed` (да/нет)

**Move:**
- QA pass → Ready to Merge  
- QA fail → In Dev

#### Шаг 9 — Merge / Auto-merge + конфликт-резолв
**Trigger:** `ci_status==success && approvals_ok && qa_passed`  
**Action:**
- если конфликты:
  - MergeResolver-run: resolve conflicts
  - обновить PR → повторить CI
- если конфликтов нет:
  - merge (метод из `auto_merge_settings`)
  - записать итоговый sha

**Move:** Ready to Merge → Done

#### Шаг 10 — Обновление базы знаний проекта (KB)
**Trigger:** merge succeeded  
**Action:** KB Curator-run
- обновить `docs/`:
  - changelog entry / release notes snippet
  - ADR (если нужно)
  - “Project Knowledge Base” summary (архитектурные решения, новые команды, API)
- обновить индекс (например `.indexer/snapshot.json`, если используешь indexer)
- прикрепить artifact `KB Update`

**Closeout:**
- поставить задачу Done
- добавить в релиз (если релиз активен)

---

## 6) Как сделать это “безопасно”: гейты и условия автопилота

### 6.1 Гейты (что блокирует автоматические действия)
- нет user story/AC → не стартовать Dev-run
- `waiting_reason` задан → не трогать, пока не снят
- `blocked_by_count>0` → не трогать, пока не разблокировано
- PR draft → не мерджить
- CI не success → не мерджить
- approvals < required → не мерджить
- diff слишком большой → требовать ручной “Approve auto-commit”
- найдено изменение в запрещённых файлах (denylist) → остановить

### 6.2 Авто-перемещения vs ручные
- Ручное перемещение разрешено, но:
  - если факты “против” — показывать **banner** “state mismatch” + кнопку “Fix automatically”
- Это повышает доверие: UI не “воюет” с человеком.

---

## 7) Практическая реализация в твоём приложении (коротко)

### 7.1 “Rules Engine”
Сделай один модуль:
- вход: текущая задача + факты (PR/CI/blocked/waiting/story flags)
- выход: рекомендуемая колонка + список действий (start run, create branch, create PR, …)

Пример “оценки статуса”:
- сначала `waiting_reason` → Waiting
- потом `blocked_by_count>0` → Blocked
- потом `pr_state==merged` → Done
- потом `has_pr` → (CI/Review)
- потом `has_branch` → In Dev
- потом `has_story && has_ac` → Ready
- иначе Backlog/Inbox

### 7.2 Автопайплайн как очередь шагов
- каждый шаг: `{ id, preconditions, action, onSuccessMove, onFailMove }`
- action — это OpenCode run или Git/Provider операция
- события (run завершился / CI обновился) — “подпинывают” очередь

### 7.3 Где хранить “факты”
- часть — в БД (vcs_links, pr, links, schedule)
- часть — computed из артефактов (has_story/has_ac)  
  *Практика:* хранить **флажки** в `tasks` (или отдельной `task_flags`) и обновлять при изменении описания/артефактов.

---

## 8) Рекомендуемые дефолтные колонки для твоего продукта (готовый стартовый пресет)

Если хочется “самое рабочее”:

1) Inbox  
2) Backlog  
3) Ready  
4) In Dev  
5) PR Open  
6) Review  
7) QA  
8) Ready to Merge  
9) Done  
10) Waiting *(с reason)*  
11) Parked

> В UI можно отображать Waiting/Parked как отдельную секцию справа или “collapsed group”.

---

## 9) TL;DR (в один экран)

- Колонки должны отражать **факты**: story/AC → ветка → PR → CI → review → QA → merge → done.  
- Waiting нужен обязательно (User/CI/Review/External/Dependency).  
- Минимальные роли: **BA, Dev, QA, MergeResolver, KB Curator**.  
- Автоматизация = rules engine + step pipeline + гейты безопасности + события из Git/CI/Run.
