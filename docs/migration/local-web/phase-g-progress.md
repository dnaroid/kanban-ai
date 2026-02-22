# Phase G - Specialized Areas (Paths, FS, Dialogs, Git, Plugins)

## Date: Feb 11, 2026

## Status: Starting Phase G

## Phase F Complete ✅

- All TypeScript compilation errors fixed
- All imports from @shared resolved
- Event system fully integrated
- SSE endpoint implemented

## Phase G Tasks

### G5) App settings / userData path (PathsService) ✅ COMPLETED

**Status:** DONE

**Implementation:**

- Enhanced `packages/server/src/paths.ts` with env-paths for cross-platform path support
- Added `getBackupsDir()` method for backup storage location
- `getDataDir()` now uses env-paths for cross-platform path detection
- Compatible with macOS, Linux, and Windows
- Works in both Electron and server modes

**Testing:**

- TypeScript compilation: ✅ PASS
- Cross-platform paths: ✅ Verified (env-paths)

---

### G1) Файловая система

**Действия:**

- `src/main/fs/` перенести в server.
- Ограничить операции рабочей областью (working directory).
- Добавить проверки безопасности:
  - `fs.existsSync()` с валидацией пути
  - Не выходить за пределы DATA_DIR
  - Блокировка символических ссылок

**Критерий готовности:**

- Файловые операции работают через RPC.
- RPC валидирует пути (no traversal, no symlinks).

---

### G2) Диалоги

**Действия:**

- В web UI: `<input type="file">` и `<input type="file" webkitdirectory>` для выбора файлов/папок.
- `src/main/dialogs.ts` → HTTP endpoints:
  - `/api/v1/dialog/open-file` - возвращает выбранный путь/дескриптор
  - `/api/v1/dialog/open-directory` - возвращает путь

**Критерий готовности:**

- Web UI показывает диалог и возвращает выбранный путь.

---

### G3) Git операции

**Действия:**

- `src/main/git/` перенести в server (или использовать `simple-git` напрямую).
- HTTP RPC handlers для git команд:
  - `status`, `add`, `commit`, `push`, `pull`, `checkout`, `branch`
- Git операции остаются в server.
- UI никогда не исполняет git напрямую.

**Критерий готовности:**

- Сценарии, зависящие от git, работают через RPC.

---

### G4) Plugins runtime

**Действия:**

- `src/main/plugins/plugin-runtime.ts` перенести в server.
- Путь плагинов: `DATA_DIR/plugins` (или пользовательский).
- Безопасность: плагины — исполняемый код. В local-web минимум:
  - whitelist/подпись (опционально)
  - отдельный процесс/worker (если уже есть) и ограничение env/путей.

**Критерий готовности:**

- Плагины грузятся/исполняются как и раньше локально.

---

## Progress

### G5) PathsService ✅ COMPLETED

- [x] Create PathsService interface and implementation
- [x] Implement Electron adapter (env-paths works for both)
- [x] Implement server adapter (env-paths)
- [x] Migrate existing path handling code
- [x] Update database initialization
- [x] Update logger
- [x] Update plugin loader
- [x] Update backup service
- [x] Test paths in local-web mode
- [x] Test backward compatibility with Electron

### G1) Файловая система

- [ ] Copy fs/ to server
- [ ] Implement path validation
- [ ] Add traversal protection
- [ ] Add symlink protection
- [ ] Create RPC handlers
- [ ] Test file operations

### G2) Диалоги

- [ ] Create HTTP endpoints for dialogs
- [ ] Implement web UI file dialogs
- [ ] Test file selection
- [ ] Test directory selection

### G3) Git операции

- [ ] Copy git/ to server or implement with simple-git
- [ ] Create RPC handlers for git commands
- [ ] Implement git status
- [ ] Implement git commit/push/pull
- [ ] Test git operations

### G4) Plugins runtime

- [ ] Copy plugin-runtime to server
- [ ] Configure plugins directory
- [ ] Implement plugin isolation
- [ ] Test plugin loading
- [ ] Test plugin execution

---

## Notes

- Start with G5 (PathsService) as it's foundational for other tasks
- Security is critical for filesystem operations
- Git operations should never be executed by UI directly
- Plugins need careful isolation in local-web mode

---

## Migration Status

- **Phase A (HTTP Transport)**: Complete ✅
- **Phase B (RPC Router)**: Complete ✅
- **Phase C (Database)**: Complete ✅
- **Phase D (Core Services)**: Complete ✅
- **Phase E (Ports & Handlers)**: Complete ✅
- **Phase F (Events)**: Complete ✅
- **Phase G (Specialized Areas)**: In Progress ⚠️
- **Phase H (Dev/Prod)**: Not started
