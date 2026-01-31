# Хранение сессий OpenCode

## Расположение файлов

### Метаданные сессий

- **macOS/Linux**: `~/.local/share/opencode/storage/session/{projectId}/ses_*.json`
- **Windows**: `%APPDATA%\opencode\storage\session{projectId}\ses_*.json`
- **Глобальные сессии**: `.../session/global/`

### Сообщения

- **macOS/Linux**: `~/.local/share/opencode/storage/message/ses_{sessionId}/msg_*.json`

## Структура файлов

### Сессия (метаданные)

```json
{
  "id": "ses_3ef9f99d9ffeCGTggGIzMHTk9c",
  "slug": "eager-tiger",
  "version": "0.0.0-dev-202601301847",
  "projectID": "101909477e71726ca8e0d5654b5baad8eb97a3bc",
  "directory": "/path/to/project",
  "title": "Название сессии",
  "time": {
    "created": 1769801279014,
    "updated": 1769801432147
  },
  "summary": {
    "additions": 36,
    "deletions": 29,
    "files": 1
  }
}
```

### Сообщение (отдельный JSON)

```json
{
  "id": "msg_c10606630001sonXJ9U6NoSH0E",
  "sessionID": "ses_3ef9f99d9ffeCGTggGIzMHTk9c",
  "role": "user",
  "time": {
    "created": 1769801279033
  },
  "summary": {
    "title": "Название действия/задачи",
    "diffs": [
      {
        "file": "path/to/file.ts",
        "before": "...",
        "after": "...",
        "additions": 36,
        "deletions": 29
      }
    ]
  },
  "agent": "sisyphus",
  "model": {
    "providerID": "zai-coding-plan",
    "modelID": "glm-4.7"
  },
  "variant": "max"
}
```

## Доступ к сообщениям

Сообщения хранятся как отдельные JSON файлы в поддиректориях директории `message/`. Каждый файл сообщения содержит:

- `id`: уникальный ID сообщения
- `sessionID`: ID родительской сессии
- `role`: роль (`user`, `assistant`, etc.)
- `time`: временные метки создания
- `summary`: резюме действия с diff-ами изменённых файлов
- `agent`: имя агента
- `model`: информация о модели
- `variant`: вариант модели

## Сопутствующие директории

В хранилище также присутствуют:

- `part/` - части данных
- `session_diff/` - diff'ы сессий
- `todo/` - задачи
- `directory-agents/` - агенты директорий
- `directory-readme/` - README директорий
- `agent-usage-reminder/` - напоминания об использовании агентов
