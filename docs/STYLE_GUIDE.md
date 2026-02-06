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
- **Фон инпутов**: `bg-[#161B26]`
- **Контейнеры**: `bg-slate-900/40` (с прозрачностью)
- **Карточки тасков**: `bg-slate-900/40` + `backdrop-blur-md`
- **Границы (пассивные)**: `border-slate-800/60`
- **Границы (интерактивные)**: `border-slate-700`

### Акцентные цвета

- **Основной акцент**: `blue-600`
- **Успех**: `emerald-600`
- **Очередь (Queued)**: `amber-400` / `amber-500`
- **Предупреждение**: `amber-500`
- **Ошибка**: `red-500`
- **Генерация (AI)**: `purple-400` / `purple-500`

### Статусы и состояния (Unified Palette)

Для обеспечения консистентности используйте конфигурации из `src/renderer/components/kanban/drawer/TaskPropertyConfigs.ts`.

- **Queued**: `amber-400` (иконка `Clock`)
- **Running**: `blue-400` (иконка `Play` / `RefreshCw`)
- **Done / Success**: `emerald-400` (иконка `Check`)
- **Failed / Error**: `red-400` (иконка `XCircle`)
- **Generating**: `purple-400` (иконка `Sparkles`)
- **Paused**: `yellow-400` (иконка `Pause`)
- **Question**: `orange-400` (иконка `HelpCircle`)
- **Canceled**: `slate-400` (иконка `Square`)

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

### Карточки тасков

Паттерн для карточек на канбан-доске с эффектом стекла и цветовым кодированием статуса.

```tsx
<div className={cn(
  // Эффект стекла
  "bg-slate-900/40 backdrop-blur-md border border-slate-700 rounded-xl relative overflow-hidden",
  // Акцент границы для активных состояний
  status === 'running' && 'border-blue-500/50 animate-card-pulse-blue'
)}>
  {/* Цветовой оверлей статуса (абсолютное позиционирование) */}
  <div className="absolute inset-0 pointer-events-none bg-amber-400/5" />
  
  <div className="relative p-4">
    {/* Контент карточки */}
    <h4 className="text-sm font-semibold text-slate-200">Task Title</h4>
  </div>
</div>
```

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

### Компоненты навигации (Tabs)

Паттерн для внутренней навигации (например, в настройках):

```tsx
// Контейнер вкладок
<div className="flex items-center gap-2 mb-8 border-b border-slate-800/40">
  {tabs.map((tab) => {
    const isActive = activeTab === tab.id
    return (
      <button
        key={tab.id}
        onClick={() => setActiveTab(tab.id)}
        className={cn(
          // Базовые стили
          'flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-widest rounded-t-xl transition-all border-b-2',
          // Активное состояние
          isActive
            ? 'border-blue-500 text-blue-400 bg-blue-500/5'
            : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/20'
        )}
      >
        <Icon className={cn('w-4 h-4', isActive ? 'text-blue-400' : 'text-slate-500')} />
        {tab.label}
      </button>
    )
  })}
</div>
```

### Уведомления (Toasts)

Всплывающие уведомления о статусе операций.

```tsx
// Фиксированная позиция
<div className="fixed top-20 right-8 z-50">
  <div
    className={cn(
      'px-5 py-3 rounded-2xl border backdrop-blur-xl animate-in slide-in-from-top-4 shadow-2xl',
      // Варианты стилизации
      type === 'success'
        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
        : type === 'error'
          ? 'bg-red-500/10 border-red-500/20 text-red-400'
          : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
    )}
  >
    <div className="flex items-center gap-3">
      {/* Индикатор статуса */}
      <div className={cn('w-2 h-2 rounded-full animate-pulse', indicatorColor)} />
      <p className="text-sm font-bold tracking-tight">{message}</p>
    </div>
  </div>
</div>
```

### Модальные окна

Стандартный паттерн для диалоговых окон (например, поиск, подтверждение действий).

```tsx
// Оверлей
<div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center pt-24 (или center)">
  
  // Контейнер модального окна
  <div className="w-[720px] bg-[#0B0E14] border border-slate-800/60 rounded-2xl shadow-2xl p-6 space-y-4">
    
    // Заголовок и закрытие
    <div className="flex items-center justify-between">
       <h2 className="text-xl font-bold text-white">Title</h2>
       <button onClick={onClose}><X /></button>
    </div>

    // Контент
    <div>...</div>

    // Футер с действиями
    <div className="flex gap-3 pt-2">
      <button className="...">Cancel</button>
      <button className="...">Confirm</button>
    </div>
  </div>
</div>
```

### Таблицы данных

Паттерн для отображения списков (например, теги, логи).

```tsx
// Контейнер с скроллом и границами
<div className="bg-[#0B0E14] border border-slate-800/60 rounded-xl overflow-hidden shadow-inner shadow-black/40">
  <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
    <table className="w-full text-left">
      
      // Sticky заголовок
      <thead className="sticky top-0 z-10 bg-slate-900/50 backdrop-blur-md">
        <tr className="text-[9px] uppercase tracking-[0.2em] text-slate-500 font-black">
          <th className="px-4 py-3">Column 1</th>
          <th className="px-4 py-3 text-right">Action</th>
        </tr>
      </thead>

      // Тело таблицы с разделителями
      <tbody className="divide-y divide-slate-800/40">
        <tr className="group hover:bg-slate-800/20 transition-all">
          <td className="px-4 py-2.5">Content</td>
        </tr>
      </tbody>

    </table>
  </div>
</div>
```

### Поля ввода

```tsx
<div className="space-y-1.5">
  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
    Label Text
  </label>
  <div className="relative">
    <input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder="Placeholder text"
      className="w-full bg-[#161B26] border border-slate-700 text-sm text-slate-200 rounded-xl px-4 py-2.5 hover:border-slate-600 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.1)] transition-all placeholder:text-slate-500"
    />
  </div>
</div>
```

**Важные правила для ввода:**
1. **Заметность**: Инпуты используют более светлый фон `#161B26`, чтобы выделяться на основном фоне.
2. **Hover**: Обязательно добавляйте `hover:border-slate-600` для визуального отклика.
3. **Focus**: Используйте комбинацию `ring-4 ring-blue-500/10` и `shadow` для создания мягкого свечения.
4. **Placeholder**: Используйте `text-slate-500` для баланса читаемости и иерархии.

### Поле ввода чата (Chat Input)

Паттерн для длинных текстовых сообщений с кнопкой отправки внутри:

```tsx
<div className="relative flex items-end w-full bg-[#161B26] border border-slate-700 rounded-2xl focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/50 shadow-xl shadow-black/20 overflow-hidden transition-all duration-200">
  <textarea
    className="w-full min-h-[52px] max-h-[200px] pl-4 pr-14 py-4 bg-transparent border-none focus:outline-none focus:ring-0 text-sm text-slate-200 placeholder:text-slate-600 font-medium resize-none custom-scrollbar"
    rows={1}
  />
  <div className="absolute right-2 bottom-2">
    <button className="flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:scale-105 active:scale-95 transition-all">
      <Send className="w-4 h-4" />
    </button>
  </div>
</div>
```

### Списки с группами и фильтрами (Collapsible Sections)

Паттерн для управления наборами данных (например, список моделей):

1. **Группировка**: Разделяйте данные по логическим провайдерам (первая часть пути в имени).
2. **Состояние групп**: По умолчанию группы свернуты. При активном поиске или фильтрации группы должны разворачиваться автоматически.
3. **Визуальное выделение**: Активные группы (где выбрано > 0 элементов) должны подсвечиваться:
   - Рамка: `border-blue-500/30`
   - Фон заголовка: `bg-blue-500/[0.03]`
   - Цвет иконки и текста: `text-blue-400`
4. **Статистика**: Отображайте `Выбрано / Всего` в бейджах для каждой группы и в заголовке всей секции.
5. **Контроллы**: 
   - Групповые триггеры (Toggle All) вместо текстовых кнопок.
   - Кнопки массового управления (Expand/Collapse All) рядом с поиском.

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
