# Oh-My-OpenCode Configuration Reference

Полное руководство по полям конфигурации агентов и категорий.

---

## 📋 Таблица содержаний

- [AgentOverrideConfig](#agentoverrideconfig---поля-конфигурации-агента)
- [CategoryConfig](#categoryconfig---поля-конфигурации-категории)
- [AgentPermissionSchema](#agentpermissionschema---разрешения-на-инструменты)
- [Приоритет настроек](#приоритет-настроек)
- [Примеры](#примеры-конфигурации)

---

## 🔐 AgentOverrideConfig - Поля конфигурации агента

Эти поля используются в секции `agents` в конфигурации для переопределения настроек конкретного агента.

```typescript
// src/config/schema.ts (строки 99-133)
export const AgentOverrideConfigSchema = z.object({
  model: z.string().optional(),
  variant: z.string().optional(),
  category: z.string().optional(),
  skills: z.array(z.string()).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  prompt: z.string().optional(),
  prompt_append: z.string().optional(),
  tools: z.record(z.string(), z.boolean()).optional(),
  disable: z.boolean().optional(),
  description: z.string().optional(),
  mode: z.enum(["subagent", "primary", "all"]).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  permission: AgentPermissionSchema.optional(),
  maxTokens: z.number().optional(),
  thinking: z.object({
    type: z.enum(["enabled", "disabled"]),
    budgetTokens: z.number().optional(),
  }).optional(),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
  textVerbosity: z.enum(["low", "medium", "high"]).optional(),
  providerOptions: z.record(z.string(), z.unknown()).optional(),
})
```

### Поля

| Параметр | Тип | Значения | Описание |
|-----------|------|-----------|------------|
| `model` | `string?` | Модель агента. **Устарело**: используйте `category` для наследования настроек |
| `variant` | `string?` | Вариант модели (`max`, `high`, `medium`, `low`, `xhigh`). Добавляется к имени модели (например, `claude-opus-4-5-high`) |
| `category` | `string?` | Имя категории для наследования настроек (`model`, `variant`, `temperature` и т.д.) |
| `skills` | `string[]?` | Массив названий навыков для инъекции в промпт агента |
| `temperature` | `number?` | Температура генерации (0-2). Выше = более креативно |
| `top_p` | `number?` | Nucleus sampling (0-1). Ниже = более сфокусировано |
| `prompt` | `string?` | Системный промпт агента (перезаписывает дефолтный) |
| `prompt_append` | `string?` | Дополнительный текст, добавляемый в конец промпта |
| `tools` | `Record<string, boolean>?` | Включить/выключить инструменты (`true` = включить, `false` = выключить) |
| `disable` | `boolean?` | Отключить агента полностью |
| `description` | `string?` | Описание агента для UI |
| `mode` | `"subagent" \| "primary" \| "all"?` | Режим работы агента |
| `color` | `string?` (#RRGGBB) | Цвет агента в UI (hex формат) |
| `permission` | `AgentPermissionSchema?` | Разрешения на инструменты (см. ниже) |
| `maxTokens` | `number?` | Максимум токенов для ответа |
| `thinking` | `{type, budgetTokens}?` | Extended thinking конфигурация для Anthropic |
| `reasoningEffort` | `"low" \| "medium" \| "high" \| "xhigh"?` | Уровень рассуждения для OpenAI моделей |
| `textVerbosity` | `"low" \| "medium" \| "high"?` | Уровень детальности текста |
| `providerOptions` | `Record<string, unknown>?` | Провайдер-специфичные опции для OpenCode SDK |

### Extended Thinking (Anthropic)

```typescript
thinking: {
  type: "enabled" | "disabled",  // Включить/выключить extended thinking
  budgetTokens: number?               // Максимум токенов для thinking блока
}
```

**Используется**: Модели Anthropic (Claude Opus, Sonnet и т.д.)

---

## 📂 CategoryConfig - Поля конфигурации категории

Категории используются для группировки настроек по домену задач. Агент может ссылаться на категорию через поле `category`.

```typescript
// src/config/schema.ts (строки 168-186)
export const CategoryConfigSchema = z.object({
  description: z.string().optional(),
  model: z.string().optional(),
  variant: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  maxTokens: z.number().optional(),
  thinking: z.object({
    type: z.enum(["enabled", "disabled"]),
    budgetTokens: z.number().optional(),
  }).optional(),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
  textVerbosity: z.enum(["low", "medium", "high"]).optional(),
  tools: z.record(z.string(), z.boolean()).optional(),
  prompt_append: z.string().optional(),
  is_unstable_agent: z.boolean().optional(),
})
```

### Поля

| Параметр | Тип | Значения | Описание |
|-----------|------|-----------|------------|
| `description` | `string?` | Человеко-читаемое описание назначения категории |
| `model` | `string?` | Модель по умолчанию для всех агентов в этой категории |
| `variant` | `string?` | Модельный вариант по умолчанию для категории |
| `temperature` | `number?` | Температура по умолчанию |
| `top_p` | `number?` | Nucleus sampling по умолчанию |
| `maxTokens` | `number?` | Максимум токенов по умолчанию |
| `thinking` | `{type, budgetTokens}?` | Extended thinking конфигурация по умолчанию |
| `reasoningEffort` | `"low" \| "medium" \| "high" \| "xhigh"?` | Уровень рассуждения по умолчанию |
| `textVerbosity` | `"low" \| "medium" \| "high"?` | Уровень детальности текста по умолчанию |
| `tools` | `Record<string, boolean>?` | Инструменты по умолчанию |
| `prompt_append` | `string?` | Текст добавляемый в конец промпта по умолчанию |
| `is_unstable_agent` | `boolean?` | Отметить агента как нестабильный (автоматически фоновый режим) |

---

## 🔐 AgentPermissionSchema - Разрешения на инструменты

Контроль доступа агента к конкретным инструментам.

```typescript
// src/config/schema.ts (строки 11-17)
export const AgentPermissionSchema = z.object({
  edit: PermissionValue.optional(),
  bash: BashPermission.optional(),
  webfetch: PermissionValue.optional(),
  doom_loop: PermissionValue.optional(),
  external_directory: PermissionValue.optional(),
})

type PermissionValue = "ask" | "allow" | "deny"
type BashPermission = PermissionValue | Record<string, PermissionValue>
```

### Поля

| Параметр | Тип | Значения | Описание |
|-----------|------|-----------|------------|
| `edit` | `"ask" \| "allow" \| "deny"?` | Разрешение на файловые операции (read, write, edit) |
| `bash` | `PermissionValue \| Record<string, PermissionValue>?` | Разрешение на shell команды. Может быть глобальным или по команде |
| `webfetch` | `"ask" \| "allow" \| "deny"?` | Разрешение на веб-запросы (webfetch tool) |
| `doom_loop` | `"ask" \| "allow" \| "deny"?` | Разрешение на бесконечные циклы |
| `external_directory` | `"ask" \| "allow" \| "deny"?` | Разрешение на доступ к внешним директориям |

### Значения PermissionValue

- **`ask`**: Спрашивать пользователя перед использованием инструмента
- **`allow`**: Разрешить без подтверждения
- **`deny`**: Запретить использование инструмента

---

## 🎯 Приоритет настроек

Когда агент создаётся, настройки применяются в следующем порядке (от низшего приоритета к высшему):

1. **Factory defaults** - Дефолтные настройки из функции `createXXXAgent()`
2. **Category config** - Если агент ссылается на категорию, её настройки применяются поверх factory defaults
3. **Agent override** - Прямые настройки из `agents.{agent_name}` применяются поверх категории
4. **Model resolution** - Резолвенный `variant` из fallback chain применяется

### Поток применения (src/agents/utils.ts)

```typescript
// Шаг 1: Создание базовой конфигурации
let config = buildAgent(source, model, mergedCategories, gitMasterConfig, browserProvider)

// Шаг 2: Применение variant из модели fallback chain
if (resolvedVariant) {
  config = { ...config, variant: resolvedVariant }
}

// Шаг 3: Расширение category в конкретные свойства
const overrideCategory = override?.category
if (overrideCategory) {
  config = applyCategoryOverride(config, overrideCategory, mergedCategories)
}

// Шаг 4: Применение прямых оверрайдов
config = applyOverrides(config, override, mergedCategories)
```

### applyCategoryOverride (строки 132-151)

```typescript
function applyCategoryOverride(
  config: AgentConfig,
  categoryName: string,
  mergedCategories: Record<string, CategoryConfig>
): AgentConfig {
  const categoryConfig = mergedCategories[categoryName]
  if (!categoryConfig) return config

  const result = { ...config }

  // Применяем настройки категории поверх дефолтных
  if (categoryConfig.model) result.model = categoryConfig.model
  if (categoryConfig.variant !== undefined) result.variant = categoryConfig.variant
  if (categoryConfig.temperature !== undefined) result.temperature = categoryConfig.temperature
  if (categoryConfig.reasoningEffort !== undefined) result.reasoningEffort = categoryConfig.reasoningEffort
  if (categoryConfig.textVerbosity !== undefined) result.textVerbosity = categoryConfig.textVerbosity
  if (categoryConfig.top_p !== undefined) result.top_p = categoryConfig.top_p
  if (categoryConfig.maxTokens !== undefined) result.maxTokens = categoryConfig.maxTokens
  if (categoryConfig.thinking !== undefined) result.thinking = categoryConfig.thinking

  return result
}
```

---

## 📊 Различия между `reasoningEffort` и `variant`

| Параметр | Платформа | Тип | Эффект |
|-----------|------------|------|----------|
| `reasoningEffort` | **OpenAI** | Настройка поведения модели | Управляет глубиной рассуждения (`low` → `xhigh`). Влияет на время ответа и качество, но не меняет имя модели |
| `variant` | **Любая** (GPT, Claude, Gemini) | Модификатор имени модели | Выбирает конкретный вариант модели (`max`, `high`, `medium`, `low`, `xhigh`). Добавляется к имени модели: `claude-opus-4-5-high` |

### Примеры использования

```json
{
  "agents": {
    "oracle": {
      "model": "openai/gpt-5.2",
      "reasoningEffort": "high"      // ← OpenAI параметр: глубина рассуждения
    },
    "sisyphus": {
      "model": "anthropic/claude-opus-4-5",
      "variant": "high"              // ← Вариант модели: claude-opus-4-5-high
      "thinking": {
        "type": "enabled",
        "budgetTokens": 32000       // ← Anthropic параметр: extended thinking
      }
    }
  },
  "categories": {
    "ultrabrain": {
      "model": "openai/gpt-5.2-codex",
      "variant": "xhigh",
      "reasoningEffort": "high",
      "textVerbosity": "high",
      "temperature": 0.1
    },
    "visual-engineering": {
      "model": "google/gemini-3-pro",
      "variant": "high",
      "temperature": 0.2
    }
  }
}
```

### Как это работает (src/shared/model-resolver.ts)

```typescript
// Резолвинг модели с fallback chain
const resolution = resolveModelPipeline({
  intent: { uiSelectedModel, userModel, categoryDefaultModel },
  constraints: { availableModels },
  policy: { fallbackChain, systemDefaultModel },
})

return {
  model: resolved.model,      // Имя модели (например, "claude-opus-4-5")
  source: resolved.provenance, // Откуда пришло ("override" | "category-default" | ...)
  variant: resolved.variant,     // Вариант ("high", "xhigh", ...)
}
```

**`variant` резолвится** через `resolveModelPipeline()` и применяется поверх `reasoningEffort` если оба присутствуют.

---

## 📦 Встроенные категории

```typescript
// src/tools/delegate-task/constants.ts
export const DEFAULT_CATEGORIES = {
  visual-engineering: { ... },
  ultrabrain: { ... },
  deep: { ... },
  artistry: { ... },
  quick: { ... },
  unspecified-low: { ... },
  unspecified-high: { ... },
  writing: { ... },
}
```

### Описание категорий

| Категория | Назначение | Типичные модели |
|-----------|-------------|----------------|
| `visual-engineering` | Frontend, UI/UX, дизайн, анимация | Gemini 3 Pro |
| `ultrabrain` | Сложные логические задачи, архитектура | GPT 5.2 Codex (xhigh variant) |
| `deep` | Целеполагаемое решение, глубокое исследование | Claude Opus 4.5 |
| `artistry` | Креативные, нестандартные подходы | Claude Opus 4.5 |
| `quick` | Быстрые, тривиальные задачи | Claude Haiku 4.5 |
| `unspecified-low` | Низкоусиливные задачи | GPT 5.2 |
| `unspecified-high` | Высокоусиливные задачи | GPT 5.2 |
| `writing` | Документация, техническое письмо | Claude Sonnet 4.5 |

---

## 🎨 Встроенные агенты

```typescript
// src/config/schema.ts (строки 19-29)
export const BuiltinAgentNameSchema = z.enum([
  "sisyphus",
  "prometheus",
  "oracle",
  "librarian",
  "explore",
  "multimodal-looker",
  "metis",
  "momus",
  "atlas",
])
```

### Агенты и их типичные настройки

| Агент | Основная модель | Типичная температура | Назначение |
|--------|----------------|---------------------|------------|
| `sisyphus` | `anthropic/claude-opus-4-5` | 0.1 | Основной оркестратор |
| `atlas` | `anthropic/claude-sonnet-4-5` | 0.1 | Мастер-оркестратор |
| `oracle` | `openai/gpt-5.2` | 0.1 | Архитектура, отладка, консультации |
| `prometheus` | `anthropic/claude-opus-4-5` | 0.1 | Стратегическое планирование |
| `metis` | `anthropic/claude-opus-4-5` | 0.3 | Предварительный анализ плана |
| `momus` | `openai/gpt-5.2` | 0.1 | Валидация планов |
| `librarian` | `zai-coding-plan/glm-4.7` | 0.1 | Документация, GitHub поиск |
| `explore` | `anthropic/claude-haiku-4-5` | 0.1 | Быстрый grep по кодовой базе |
| `multimodal-looker` | `google/gemini-3-flash` | 0.1 | Анализ медиа (PDF, изображения) |
| `sisyphus-junior` | `anthropic/claude-sonnet-4-5` | 0.1 | Исполнитель задач от категорий |

---

## 📝 Примеры конфигурации

### Пример 1: Базовая настройка через категории

```json
{
  "categories": {
    "visual-engineering": {
      "model": "google/gemini-3-pro",
      "variant": "high",
      "temperature": 0.2
    },
    "ultrabrain": {
      "model": "openai/gpt-5.2-codex",
      "variant": "xhigh",
      "reasoningEffort": "high",
      "textVerbosity": "high",
      "temperature": 0.1
    }
  }
}
```

### Пример 2: Переопределение конкретного агента

```json
{
  "agents": {
    "oracle": {
      "category": "ultrabrain",
      "model": "openai/gpt-5.2",
      "reasoningEffort": "high",
      "temperature": 0.1,
      "maxTokens": 8000
    },
    "sisyphus": {
      "skills": ["git-master", "security-engineer"],
      "tools": {
        "delegate_task": true,
        "write": true
      },
      "permission": {
        "bash": "allow",
        "webfetch": "allow"
      }
    }
  }
}
```

### Пример 3: Комбинированный подход (категория + агенты)

```json
{
  "categories": {
    "deep": {
      "model": "anthropic/claude-opus-4-5",
      "thinking": {
        "type": "enabled",
        "budgetTokens": 32000
      },
      "temperature": 0.1
    }
  },
  "agents": {
    "oracle": {
      "category": "deep",
      "reasoningEffort": "medium"  // ← Переопределяет category.reasoningEffort
    },
    "librarian": {
      "category": "deep",
      "tools": {
        "bash": "deny",                // ← Запрещает shell команды
        "webfetch": "allow"
      }
    }
  }
}
```

### Пример 4: Настройка разрешений

```json
{
  "agents": {
    "explore": {
      "permission": {
        "edit": "ask",              // Спрашивать перед редактированием
        "bash": {
          "grep": "allow",           // Разрешить grep
          "cat": "deny",               // Запретить cat
          "rm": "deny"                // Запретить rm
        }
      }
    }
  },
  "multimodal-looker": {
    "tools": {
      "read": true,                  // Разрешить только чтение
      "look_at": true                // Разрешить анализ медиа
      // ...все остальные инструменты запрещены
    }
  }
}
```

### Пример 5: Extended Thinking для Anthropic

```json
{
  "agents": {
    "sisyphus": {
      "model": "anthropic/claude-opus-4-5",
      "thinking": {
        "type": "enabled",
        "budgetTokens": 32000           // ~32K токенов на thinking блок
      },
      "maxTokens": 8000
    },
    "oracle": {
      "model": "anthropic/claude-opus-4-5",
      "thinking": {
        "type": "enabled",
        "budgetTokens": 64000
      }
    }
  }
}
```

---

## 🔧 Провайдер-специфичные опции

`providerOptions` позволяет передавать параметры напрямую в OpenCode SDK. Эти опции специфичны для каждого провайдера и не валидируются схемой.

```json
{
  "agents": {
    "some-agent": {
      "providerOptions": {
        "someProviderSpecificOption": "value",
        "customSetting": true
      }
    }
  }
}
```

---

## 🚀 Где это в коде

| Компонент | Файл | Описание |
|-----------|------|------------|
| **Schema определение** | `src/config/schema.ts` | Zod схемы для всех конфигураций |
| **Применение настроек** | `src/agents/utils.ts` | Функции `buildAgent()`, `applyCategoryOverride()`, `applyOverrides()` |
| **Резолвинг моделей** | `src/shared/model-resolver.ts` | `resolveModelWithFallback()`, `resolveModelPipeline()` |
| **Дефолтные категории** | `src/tools/delegate-task/constants.ts` | `DEFAULT_CATEGORIES` |
| **Конфиг хендлер** | `src/plugin-handlers/config-handler.ts` | Чтение и парсинг конфигурации |

---

## 🚀 Быстрый старт

### Минимальная конфигурация

```json
{
  "agents": {
    "sisyphus": {
      "skills": ["git-master"]
    }
  }
}
```

### Настройка через категории

```json
{
  "categories": {
    "deep": {
      "model": "anthropic/claude-opus-4-5",
      "temperature": 0.1
    }
  }
}
```

### Полный пример с разрешениями

```json
{
  "agents": {
    "oracle": {
      "category": "ultrabrain",
      "permission": {
        "edit": "allow",
        "bash": "ask",
        "webfetch": "allow"
      }
    }
  }
}
```

---

**Сгенерировано**: 2026-02-06
**Проект**: oh-my-opencode
**Версия**: документация конфигурации v1.0
