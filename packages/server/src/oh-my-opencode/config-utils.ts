import type { OhMyOpencodeModelField } from "@shared/types/ipc"

export const PRESET_SUFFIX = '.oh-my-opencode.json'
export const ORIGINAL_PRESET_NAME = `_original${PRESET_SUFFIX}`

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export const mergeInPlace = (target: Record<string, unknown>, source: Record<string, unknown>) => {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key]
  }

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      delete target[key]
      continue
    }

    const existing = target[key]
    if (isPlainObject(existing) && isPlainObject(value)) {
      mergeInPlace(existing, value)
    } else {
      target[key] = value
    }
  }
}

export const buildOhMyOpencodeModelFields = (config: Record<string, unknown>) => {
  const modelFields: OhMyOpencodeModelField[] = []

  const extractModelFields = (obj: Record<string, unknown>, prefix: string[]) => {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object') {
        const nested = value as Record<string, unknown>
        if ('model' in nested && typeof nested.model === 'string') {
          modelFields.push({
            key: key,
            path: [...prefix, key],
            value: nested.model as string,
            reasoningEffort:
              'reasoningEffort' in nested ? ((nested.reasoningEffort as string) ?? null) : null,
            variant: 'variant' in nested ? ((nested.variant as string) ?? null) : null,
            temperature:
              'temperature' in nested && typeof nested.temperature === 'number'
                ? nested.temperature
                : null,
          })
        } else {
          extractModelFields(nested, [...prefix, key])
        }
      } else if (typeof value === 'string') {
        modelFields.push({
          key: key,
          path: [...prefix, key],
          value: value as string,
          reasoningEffort: null,
          variant: null,
          temperature: null,
        })
      }
    }
  }

  if (config.categories) {
    extractModelFields(config.categories as Record<string, unknown>, ['categories'])
  }
  if (config.agents) {
    extractModelFields(config.agents as Record<string, unknown>, ['agents'])
  }

  return modelFields
}
