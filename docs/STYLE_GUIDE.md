# Frontend Style Guide

## Технологический стек

- **React 18+** с TypeScript
- **Electron** - десктопное приложение
- **Vite** - сборщик проекта
- **Tailwind CSS** - CSS фреймворк
- **@dnd-kit** - Drag & Drop функциональность
- **lucide-react** - иконки
- **clsx** + **tailwind-merge** - объединение className

## Цветовая схема

### Основные цвета

- **Основной фон**: `bg-[#0B0E14]`
- **Вторичный фон**: `bg-[#11151C]`
- **Контейнеры**: `bg-slate-900/40` (с прозрачностью)
- **Границы**: `border-slate-800/60` (с низкой прозрачностью)

### Акцентные цвета

- **Основной акцент**: `blue-600`
- **Успех**: `emerald-600`
- **Предупреждение**: `amber-500`
- **Ошибка**: `red-500`

### Текст

- **Основной текст**: `text-slate-200`
- **Вторичный текст**: `text-slate-400`
- **Третьичный текст**: `text-slate-500`
- **Заголовки**: `text-white`

## Типографика

### Размеры

```tsx
// Очень маленький
text - [10px]

// Маленький (по умолчанию)
text - xs

// Маленький плюс
text - sm

// Средний
text - base

// Большой
text - lg

// Большой плюс
text - xl

// Огромный
text - 2
xl
```

### Стили

```tsx
// Основная семья шрифтов
font - sans

// Увеличенный межбуквенный интервал
tracking - wider

// Верхний регистр для лейблов
uppercase
```

## Компоненты и их паттерны

### Кнопки

```tsx
// Основная кнопка (синяя)
<button
  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-600/20 transition-all disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
  disabled={isLoading}
>
  {isLoading ? 'Loading...' : 'Save'}
</button>

// Кнопка успеха (зеленая)
<button
  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white disabled:shadow-none"
>
  Import
</button>

// Важные правила для кнопок:
// 1. Всегда отключайте тень в disabled состоянии: disabled:shadow-none
// 2. Используйте transition-all для плавных hover-эффектов
```

### Поля ввода

```tsx
<div className="space-y-1.5">
  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
    Label Text
  </label>
  <input
    value={value}
    onChange={(event) => setValue(event.target.value)}
    placeholder="Placeholder text"
    className="w-full bg-[#0B0E14] border border-slate-800/60 text-sm text-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all"
  />
</div>
```

### Карточки / Контейнеры

```tsx
// Вторичный фон для карточек (Project/Settings sections)
<div className="bg-[#11151C] border border-slate-800/50 rounded-2xl p-6 shadow-xl">
  <SectionHeader ... />
  <div className="space-y-4">{/* Контент */}</div>
</div>
```

### Заголовки секций (SectionHeader)

Паттерн для разделения настроек или контента:

```tsx
<div className="flex items-center gap-3 mb-6">
  <div className="w-10 h-10 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20 flex items-center justify-center text-blue-400">
    <Icon className="w-5 h-5" />
  </div>
  <div>
    <h3 className="text-lg font-bold text-white tracking-tight">Title</h3>
    <p className="text-xs text-slate-500 font-medium">Subtitle</p>
  </div>
</div>
```

### Лейблы

```tsx
// Лейбл для поля ввода
<label className="text-xs text-slate-400">Label text</label>

// Заголовок секции с uppercase
<div className="text-xs text-slate-500 uppercase tracking-wider">SECTION HEADER</div>
```

## Макет

### Основной layout

```tsx
// Фиксированный сайдбар + основной контент
<div className="flex h-screen overflow-hidden">
  <Sidebar className="w-64 flex-shrink-0" />
  <main className="flex-1 pl-64 overflow-hidden">
    <Header className="sticky top-0 z-10 backdrop-blur-md" />
    <Content className="h-full overflow-y-auto" />
  </main>
</div>
```

### Отступы и Пространство (Spacing)

#### Стандартные отступы страниц

Все основные экраны (Settings, Diagnostics, Analytics и т.д.) должны иметь стандартный внутренний отступ от краев основного контейнера:

- **Padding**: `p-8` (32px) со всех сторон.
- В `App.tsx` этот отступ применяется автоматически к контейнеру экрана (за исключением `BoardScreen`, который управляет отступами самостоятельно).

#### Выравнивание контента

Контент на всех страницах должен быть выровнен по одной линии. Если страница не использует стандартный контейнер `App.tsx`, необходимо вручную обеспечить отступ `32px` (`8` в Tailwind) сверху и слева.

#### Сайдбар и переменные

Ширина сайдбара динамически меняется. Для привязки элементов к краю сайдбара используйте CSS-переменную:

- `--sidebar-width`: `64px` (collapsed) или `256px` (expanded).
- Пример использования: `left-[var(--sidebar-width)]`.

### Flexbox паттерны

```tsx
// Вертикальный стек с отступами
<div className="space-y-4">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

// Горизонтальный flex с отступами
<div className="flex items-center gap-3">
  <Icon/>
  <span>Text</span>
</div>

// Полноценная колонка
<div className="flex flex-col h-full">
  <div>Header</div>
  <div className="flex-1 overflow-y-auto">Content</div>
</div>
```

## Border и скругления

### Border

```tsx
// Стандартный border
border - slate - 800 / 60

// Границы с низкой прозрачностью для эффекта глубины
border - slate - 800 / 50
```

### Border radius

```tsx
// Скругленные карточки (большее)
rounded - 2
xl

// Стандартное скругление
rounded - xl

// Маленькое скругление (для input/button)
rounded - lg
```

## Тени

```tsx
// Стандартная тень
shadow - lg

// Цветная тень с прозрачностью (для акцентов)
shadow - blue - 600 / 20
```

## Транзиции и анимации

```tsx
// Транзиция для hover состояний
transition - all
duration - 200

// Анимация появления
animate - in
fade - in

// Задержка анимации
delay - 100
delay - 200
```

## Утилиты

### cn() helper

Используйте функцию `cn()` для объединения className:

```tsx
import { cn } from '@/lib/utils'

// Слияние Tailwind классов
;<button className={cn('base-classes', condition && 'conditional-classes')}>Button</button>
```

Эта функция использует `clsx` и `tailwind-merge` для:

1. Условного объединения классов
2. Разрешения конфликтов Tailwind (например, `p-4` и `p-2`)

### Скроллбары

Для элементов с прокруткой используйте класс `.custom-scrollbar`:

```tsx
<div className="flex-1 overflow-y-auto custom-scrollbar">{/* Контент */}</div>
```

Это применит тонкий темный скроллбар, который лучше вписывается в интерфейс.

## Drag & Drop паттерны

```tsx
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'

// В компоненте доски
const sensors = useSensors(
  useSensor(PointerSensor),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
)

return (
  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
    <SortableContext items={items} strategy={verticalListSortingStrategy}>
      {/* Draggable items */}
    </SortableContext>
  </DndContext>
)
```

## Иконки

Используйте `lucide-react` для иконок:

```tsx
import {Plus, Settings, Trash2} from 'lucide-react'

// Размер иконок обычно small или medium
<
Plus
className = "w-4 h-4" / >
  < Settings
className = "w-5 h-5" / >

  // Цвет иконок обычно slate-400 или slate-500
  < Trash2
className = "w-4 h-4 text-slate-400" / >
```

## IPC Communication

Все IPC вызовы должны быть типизированы через `window.api`:

```tsx
// Пример вызова IPC
const result = await window.api.projects.create({
  name: 'New Project',
  path: '/path/to/project',
})

// Обработка ошибок
try {
  const result = await window.api.backup.exportProject({
    projectId,
    toPath: exportPath.trim(),
  })
  setStatus(`Exported to ${result.path}`)
} catch (error) {
  console.error('Export failed:', error)
  setStatus('Export failed. Check path and try again.')
}
```

## Структура компонентов

### Screen компоненты

- Расположены в `src/renderer/screens/`
- Каждый screen - полноценная страница приложения
- Принимают props (обычно projectId, projectName)
- Управляют своей логикой и состоянием

### Component компоненты

- Переиспользуемые UI компоненты
- Должны быть простыми и предсказуемыми
- Используют props для конфигурации

## Состояние (State Management)

- Используйте React hooks: `useState`, `useEffect`, `useMemo`, `useCallback`
- Нет внешних библиотек для управления состоянием (Redux, Zustand и т.д.)
- Для сложной логики рассмотрите `useReducer` или кастомные hooks

## Загрузочные состояния

```tsx
// Логическое значение для загрузки
const [isLoading, setIsLoading] = useState(false)

// В кнопке
< button
disabled = {isLoading} >
  {isLoading ? 'Loading...' : 'Save'}
</button>
```

## Обработка ошибок

```tsx
try {
  await operation()
} catch (error) {
  console.error('Operation failed:', error)
  setStatus('Operation failed. Try again.')
}
```

## Правила TypeScript

- Всегда указывайте типы для props
- Используйте интерфейсы для типов компонентов
- Избегайте `any`, используйте `unknown` если тип неизвестен

```tsx
type ComponentProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function Component({ value, onChange, disabled = false }: ComponentProps) {
  // ...
}
```

## Производительность

- Используйте `React.memo` для компонентов, которые не часто перерисовываются
- Используйте `useCallback` для callback функций, передаваемых в пропсы
- Используйте `useMemo` для дорогостоящих вычислений

## Accessibility

- Все кнопки должны иметь текст или aria-label
- Используйте semantic HTML элементы
- Поддерживайте keyboard navigation для Drag & Drop

## Примечания

- **Нет responsive design** - приложение только для десктопа (Electron)
- Всегда используйте темную тему (dark mode)
- Следуйте существующим паттернам в кодовой базе
- Используйте семантические цвета для статусов (success, warning, error)
