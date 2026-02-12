#!/usr/bin/env node
/**
 * IPC Methods Extraction Script
 * Автоматически извлекает методы из src/main/ipc/handlers/
 */
/**
 * Скрипт для автоматического извлечения списка IPC методов из кодовой базы.
 * Генерирует CSV/Markdown файл со всеми методами, их расположением и типами.
 *
 * Использование: node scripts/list-ipc-methods.ts
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

interface IpcMethod {
  namespace: string
  method: string
  handlerFile: string
  hasValidation: boolean
  event: boolean
}

interface IpcNamespace {
  name: string
  methods: IpcMethod[]
}

// Парсинг registration функций в handlers
function parseHandlerFile(filePath: string): IpcMethod[] {
  const content = readFileSync(filePath, 'utf-8')
  const methods: IpcMethod[] = []

  // Поиск patterns: ipcHandlers.register('namespace:method', schema, handler)
  const registerRegex = /ipcHandlers\.register\(['"](.*?)['"],\s*(?:['"](.*?)['"],\s*)?/g
  let match
  while ((match = registerRegex.exec(content)) !== null) {
    const fullMethod = match[1]
    const hasSchema = match[2] !== undefined

    const [namespace, method] = fullMethod.split(':')

    methods.push({
      namespace,
      method,
      handlerFile: filePath,
      hasValidation: hasSchema,
      event: false,
    })
  }

  // Поиск patterns: ipcMain.handle('namespace:method', ...)
  const handleRegex = /ipcMain\.handle\(['"](.*?)['"],\s*\(.*?\)/g
  while ((match = handleRegex.exec(content)) !== null) {
    const fullMethod = match[1]
    const [namespace, method] = fullMethod.split(':')

    methods.push({
      namespace,
      method,
      handlerFile: filePath,
      hasValidation: true, // assume validation
      event: false,
    })
  }

  // Поиск patterns: ipcMain.on('namespace:event', ...)
  const onRegex = /ipcMain\.on\(['"](.*?)['"],\s*\(.*?\)/g
  while ((match = onRegex.exec(content)) !== null) {
    const fullMethod = match[1]
    const [namespace, method] = fullMethod.split(':')

    methods.push({
      namespace,
      method,
      handlerFile: filePath,
      hasValidation: false,
      event: true,
    })
  }

  return methods
}

// Рекурсивный обход директории handlers
function findHandlerFiles(dir: string, baseDir: string): IpcMethod[] {
  const allMethods: IpcMethod[] = []

  try {
    const entries = readdirSync(dir)

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const stat = statSync(fullPath)

      if (stat.isDirectory() && entry !== 'node_modules') {
        allMethods.push(...findHandlerFiles(fullPath, baseDir))
      } else if (entry.endsWith('.handlers.ts') || entry.endsWith('.handlers.js')) {
        const methods = parseHandlerFile(fullPath)
        allMethods.push(...methods)
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error)
  }

  return allMethods
}

// Группировка методов по namespace
function groupByNamespace(methods: IpcMethod[]): IpcNamespace[] {
  const namespaces = new Map<string, IpcMethod[]>()

  for (const method of methods) {
    if (!namespaces.has(method.namespace)) {
      namespaces.set(method.namespace, [])
    }
    namespaces.get(method.namespace)!.push(method)
  }

  return Array.from(namespaces.entries()).map(([name, methods]) => ({
    name,
    methods,
  }))
}

// Генерация CSV
function generateCsv(namespaces: IpcNamespace[]): string {
  const lines: string[] = ['Namespace,Method,Handler File,Has Validation,Is Event']

  for (const ns of namespaces) {
    for (const method of ns.methods) {
      const relativePath = relative(process.cwd(), method.handlerFile)
      lines.push(
        `${ns.name},${method.method},"${relativePath}",${method.hasValidation ? 'Yes' : 'No'},${method.event ? 'Yes' : 'No'}`
      )
    }
  }

  return lines.join('\n')
}

// Генерация Markdown
function generateMarkdown(namespaces: IpcNamespace[]): string {
  const lines: string[] = [
    '# IPC Methods Documentation',
    '',
    '> Автоматически сгенерировано из src/main/ipc/handlers/',
    '',
    '## Summary',
    '',
    `**Total Namespaces:** ${namespaces.length}`,
    `**Total Methods:** ${namespaces.reduce((sum, ns) => sum + ns.methods.length, 0)}`,
    '',
    '---',
    '',
  ]

  for (const ns of namespaces) {
    lines.push(`### ${ns.name}`)
    lines.push('')
    lines.push('| Method | Handler File | Has Validation | Is Event |')
    lines.push('|--------|-------------|---------------|-----------|')

    for (const method of ns.methods) {
      const relativePath = relative(process.cwd(), method.handlerFile)
      lines.push(
        `| \`${ns.name}:${method.method}\` | \`${relativePath}\` | ${method.hasValidation ? '✅' : '❌'} | ${method.event ? '✅' : '❌'} |`
      )
    }

    lines.push('')
  }

  return lines.join('\n')
}

// Главная функция
function main() {
  console.log('Extracting IPC methods from codebase...')
  console.log('')

  const handlersDir = join(process.cwd(), 'src/main/ipc/handlers')

  if (!statSync(handlersDir).isDirectory()) {
    console.error(`Handlers directory not found: ${handlersDir}`)
    process.exit(1)
  }

  const allMethods = findHandlerFiles(handlersDir, process.cwd())
  const namespaces = groupByNamespace(allMethods)

  console.log(`Found ${allMethods.length} methods across ${namespaces.length} namespaces`)
  console.log('')

  // Генерация CSV
  const csvContent = generateCsv(namespaces)
  const csvPath = join(process.cwd(), 'docs/migration/local-web/ipc-methods.csv')
  writeFileSync(csvPath, csvContent, 'utf-8')
  console.log(`✅ Generated: ${csvPath}`)

  // Генерация Markdown
  const mdContent = generateMarkdown(namespaces)
  const mdPath = join(process.cwd(), 'docs/migration/local-web/ipc-methods.md')
  writeFileSync(mdPath, mdContent, 'utf-8')
  console.log(`✅ Generated: ${mdPath}`)
  console.log('')

  // Вывод статистики по namespace
  console.log('### Methods by Namespace:')
  for (const ns of namespaces) {
    const count = ns.methods.length
    const eventCount = ns.methods.filter((m) => m.event).length
    const rpcCount = ns.methods.filter((m) => !m.event).length
    console.log(`  ${ns.name}: ${count} (${rpcCount} RPC, ${eventCount} events)`)
  }
}

// Запуск
if (import.meta.main) {
  main()
}
