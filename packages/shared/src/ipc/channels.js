"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = void 0;
exports.IPC_CHANNELS = {
    APP: {
        GET_INFO: 'app:getInfo',
        OPEN_PATH: 'app:openPath',
    },
    PROJECT: {
        SELECT_FOLDER: 'project:selectFolder',
        SELECT_FILES: 'project:selectFiles',
        CREATE: 'project:create',
        GET_ALL: 'project:getAll',
        GET_BY_ID: 'project:getById',
        UPDATE: 'project:update',
        DELETE: 'project:delete',
    },
    BOARD: {
        GET_DEFAULT: 'board:getDefault',
        UPDATE_COLUMNS: 'board:updateColumns',
    },
    TASK: {
        CREATE: 'task:create',
        LIST_BY_BOARD: 'task:listByBoard',
        UPDATE: 'task:update',
        MOVE: 'task:move',
        DELETE: 'task:delete',
        ON_EVENT: 'task:onEvent',
    },
    TAG: {
        CREATE: 'tag:create',
        UPDATE: 'tag:update',
        DELETE: 'tag:delete',
        LIST: 'tag:list',
    },
    DEPS: {
        LIST: 'deps:list',
        ADD: 'deps:add',
        REMOVE: 'deps:remove',
    },
    SCHEDULE: {
        GET: 'schedule:get',
        UPDATE: 'schedule:update',
    },
    SEARCH: {
        QUERY: 'search:query',
    },
    ANALYTICS: {
        GET_OVERVIEW: 'analytics:getOverview',
        GET_RUN_STATS: 'analytics:getRunStats',
    },
    PLUGINS: {
        LIST: 'plugins:list',
        INSTALL: 'plugins:install',
        ENABLE: 'plugins:enable',
        RELOAD: 'plugins:reload',
    },
    ROLES: {
        LIST: 'roles:list',
    },
    BACKUP: {
        EXPORT_PROJECT: 'backup:exportProject',
        IMPORT_PROJECT: 'backup:importProject',
    },
    DIAGNOSTICS: {
        GET_LOGS: 'diagnostics:getLogs',
        GET_LOG_TAIL: 'diagnostics:getLogTail',
        GET_SYSTEM_INFO: 'diagnostics:getSystemInfo',
        GET_DB_INFO: 'diagnostics:getDbInfo',
        GET_METRICS: 'diagnostics:getMetrics',
    },
    DATABASE: {
        DELETE: 'database:delete',
    },
    RUN: {
        START: 'run:start',
        CANCEL: 'run:cancel',
        DELETE: 'run:delete',
        LIST_BY_TASK: 'run:listByTask',
        GET: 'run:get',
    },
    EVENTS: {
        TAIL: 'events:tail',
    },
    ARTIFACT: {
        LIST: 'artifact:list',
        GET: 'artifact:get',
    },
    APP_SETTING: {
        GET_LAST_PROJECT_ID: 'appSetting:getLastProjectId',
        SET_LAST_PROJECT_ID: 'appSetting:setLastProjectId',
        GET_SIDEBAR_COLLAPSED: 'appSetting:getSidebarCollapsed',
        SET_SIDEBAR_COLLAPSED: 'appSetting:setSidebarCollapsed',
        GET_DEFAULT_MODEL: 'appSetting:getDefaultModel',
        SET_DEFAULT_MODEL: 'appSetting:setDefaultModel',
        GET_OH_MY_OPENCODE_PATH: 'appSetting:getOhMyOpencodePath',
        SET_OH_MY_OPENCODE_PATH: 'appSetting:setOhMyOpencodePath',
        GET_RETENTION_POLICY: 'appSetting:getRetentionPolicy',
        SET_RETENTION_POLICY: 'appSetting:setRetentionPolicy',
        RUN_RETENTION_CLEANUP: 'appSetting:runRetentionCleanup',
    },
    OPENCODE: {
        ON_EVENT: 'opencode:onEvent',
        GENERATE_USER_STORY: 'opencode:generateUserStory',
        GET_SESSION_STATUS: 'opencode:getSessionStatus',
        GET_ACTIVE_SESSIONS: 'opencode:getActiveSessions',
        GET_SESSION_MESSAGES: 'opencode:getSessionMessages',
        GET_SESSION_TODOS: 'opencode:getSessionTodos',
        LIST_MODELS: 'opencode:listModels',
        LIST_ENABLED_MODELS: 'opencode:listEnabledModels',
        REFRESH_MODELS: 'opencode:refreshModels',
        TOGGLE_MODEL: 'opencode:toggleModel',
        UPDATE_MODEL_DIFFICULTY: 'opencode:updateModelDifficulty',
        SEND_MESSAGE: 'opencode:sendMessage',
        LOG_PROVIDERS: 'opencode:logProviders',
    },
    OH_MY_OPENCODE: {
        READ_CONFIG: 'ohMyOpencode:readConfig',
        SAVE_CONFIG: 'ohMyOpencode:saveConfig',
        LIST_PRESETS: 'ohMyOpencode:listPresets',
        LOAD_PRESET: 'ohMyOpencode:loadPreset',
        SAVE_PRESET: 'ohMyOpencode:savePreset',
        BACKUP_CONFIG: 'ohMyOpencode:backupConfig',
        RESTORE_CONFIG: 'ohMyOpencode:restoreConfig',
    },
    DIALOG: {
        SHOW_OPEN_DIALOG: 'dialog:showOpenDialog',
    },
    FILE_SYSTEM: {
        EXISTS: 'fileSystem:exists',
    },
    VOSK: {
        DOWNLOAD_MODEL: 'vosk:downloadModel',
    },
    STT: {
        START: 'stt:start',
        STOP: 'stt:stop',
        SET_LANGUAGE: 'stt:setLanguage',
        SEND_AUDIO: 'stt:sendAudio',
    },
};
