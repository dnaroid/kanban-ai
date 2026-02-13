import { useMemo } from 'react'

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const

export function CalendarTable() {
  const calendarData = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()

    const firstDayOfMonth = new Date(year, month, 1)
    const lastDayOfMonth = new Date(year, month + 1, 0)

    const daysInMonth = lastDayOfMonth.getDate()
    const firstDayOfWeek = firstDayOfMonth.getDay()

    const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1

    const days: Array<{ day: number | null; isCurrentMonth: boolean }> = []

    for (let i = 0; i < startOffset; i++) {
      days.push({ day: null, isCurrentMonth: false })
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push({ day, isCurrentMonth: true })
    }

    const weeks: Array<Array<{ day: number | null; isCurrentMonth: boolean }>> = []
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7))
    }

    return {
      monthName: now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
      weeks,
    }
  }, [])

  return (
    <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6">
      <div className="text-sm font-semibold text-white mb-4">{calendarData.monthName}</div>
      <table className="w-full">
        <thead>
          <tr>
            {WEEK_DAYS.map((day) => (
              <th key={day} className="text-xs text-slate-500 uppercase tracking-wider pb-2">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calendarData.weeks.map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((day, dayIndex) => (
                <td key={`${weekIndex}-${dayIndex}`} className="text-center py-2">
                  {day.day ? (
                    <div className="text-xs text-slate-200">{day.day}</div>
                  ) : (
                    <div className="w-6 h-6" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
