# Kanban for Headless OpenCode + oh-my-opencode — план реализации

## Принципы реализации
- Начать с **MVP**, но сразу заложить:
  - модель данных (runs/events/artifacts),
  - очередь выполнения,
  - безопасное хранение секретов,
  - branch-per-task.
- Любая “AI‑магия” должна быть наблюдаемой: лог, дифф, артефакты, replay.

---

## Этап 0 — Подготовка репозитория и каркас (1–2 итерации)
### Deliverables
- Electron app skeleton (main/renderer).
- IPC слой (типизированные методы + event stream).
- SQLite + migrations.
- Keychain storage для токенов.
- Базовая модель Project/Board/Task.

### Задачи
- [ ] Настроить mono‑repo или единый проект: `apps/desktop`.
- [ ] Сконфигурировать сборку (dev/hot reload, prod packaging).
- [ ] Создать DB слой и миграции.
- [ ] Сделать базовые экраны: список проектов, доска, карточка таски.

---

## Этап 1 — Канбан MVP (2–3 итерации)
### Deliverables
- Доска с колонками, drag&drop.
- CRUD тасок (title/desc/tags/priority/type).
- Поиск и фильтры (минимально).
- История изменений (audit log на уровне таски — хотя бы события).

### Задачи
- [ ] DnD перемещение + сохранение порядка.
- [ ] WIP лимиты (soft warning).
- [ ] Теги/приоритет/тип/оценка.
- [ ] FTS поиск (SQLite FTS) по title/desc/comments.

---

## Этап 2 — Runs/Jobs + “чат таски” (2–4 итерации)
### Deliverables
- Job Runner: очередь, параллелизм, отмена, таймауты.
- Task Chat: Discussion + Execution Log.
- Сохранение run_events, replay.

### Задачи
- [ ] Схема runs/run_events/artifacts.
- [ ] UI: вкладки Discussion / Execution.
- [ ] Стриминг событий в UI.
- [ ] Кнопки “Start run” по ролям (пока заглушки/эхо).

---

## Этап 3 — Интеграция headless OpenCode (2–4 итерации)
### Deliverables
- Реальный запуск `opencode` (spawn) из main.
- Передача контекста (ContextSnapshot) и сбор артефактов.
- Ролевые операции (BA/Dev/QA минимум) как preset workflows.

### Задачи
- [ ] OpenCodeAdapter: запуск процесса, capture stdout/stderr, статус завершения.
- [ ] Контекст‑билдер: сбор markdown + выбор файлов (MVP: вручную выбранные + дифф текущей ветки).
- [ ] Presets:
  - BA: story + AC + вопросы
  - Dev: план файлов + реализация (опционально)
  - QA: тест‑план
- [ ] Политики: budgets, allowlist директорий, запрет секретов.

---

## Этап 4 — Git workflow: branch-per-task + PR (3–5 итераций)
### Deliverables
- Привязка репозитория к проекту (локальный путь).
- Создание ветки на таску.
- Коммиты/диффы отображаются в UI.
- Создание PR (GitHub или GitLab) + статусы.

### Задачи
- [ ] GitAdapter: create branch, status, diff, commit, push.
- [ ] UI: панель “VCS” в таске: ветка, коммиты, diff, PR.
- [ ] PRProvider: create draft PR, update description, fetch status.
- [ ] Merge gates (минимум): CI зелёный + approvals.

---

## Этап 5 — AI conflict resolution + merge automation (2–4 итерации)
### Deliverables
- Детект конфликтов при rebase/merge.
- Run “MergeResolver” с режимами Suggest/Apply.
- Автоматический merge PR после прохождения gates (опционально).

### Задачи
- [ ] Conflict detector: список файлов + ours/theirs/base.
- [ ] Контекст для агента: конфликтные блоки + правила.
- [ ] Применение патча: staged apply + проверки.
- [ ] UX: показать пользователю дифф резолва перед применением.

---

## Этап 6 — Плюшки “взрослого продукта” (параллельно/после)
- Зависимости тасок и граф.
- Swimlanes + расширенные фильтры.
- Timeline/Gantt (сначала простой: даты и бары).
- Метрики (cycle time, lead time).
- Уведомления + saved views.
- Плагины/расширяемость.

---

## Тестирование и качество
- Unit тесты domain/services (queue, policies, context builder).
- Интеграционные тесты:
  - GitAdapter на тестовом репо,
  - OpenCodeAdapter (моки stdout/stderr),
  - DB migrations.
- E2E (минимум): создать таску → старт run → создать ветку → PR.

---

## Риски и меры
- **Нестабильный вывод CLI**: логировать сырой stdout, иметь парсер “best effort”.
- **Секреты в логах**: redaction + denylist файлов.
- **Сложность long-lived процесса**: начать со spawn, потом оптимизировать.
- **Конфликты мерджа**: всегда сначала Suggest; Apply только после подтверждения.

---

## Definition of Done для ключевых фич
- Любой run воспроизводим (replay) и имеет артефакты.
- Любые git действия видны в UI (ветка/PR/дифф).
- Секреты не попадают в логи/артефакты.
- Есть настройки лимитов и безопасного режима.
