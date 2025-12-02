import React, { useState, useMemo } from 'react'

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function pad(n) { return String(n).padStart(2, '0') }

function formatISO(d) {
  // Format using local date components to avoid UTC timezone shifts
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function Calendar({ events = {}, selected: selectedProp, onSelect, showEvents = true }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState(() => formatISO(new Date()))

  const monthData = useMemo(() => {
    const start = startOfMonth(cursor)
    const end = endOfMonth(cursor)
    const days = []

    // Use Monday as first day of week. Convert JS getDay (0=Sun..6=Sat)
    // to Monday-based leading count: Monday -> 0, Sunday -> 6
    const leading = (start.getDay() + 6) % 7
    for (let i = 0; i < leading; i++) days.push(null)

    for (let d = 1; d <= end.getDate(); d++) days.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))

    // fill to complete weeks (7 columns)
    while (days.length % 7 !== 0) days.push(null)

    return { start, end, days }
  }, [cursor])

  function prevMonth() {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
  }

  function nextMonth() {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
  }

  const monthLabel = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })
  const displaySelected = selectedProp || selected

  return (
    <div className="bg-white rounded-xl p-4 border border-neutral-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-black">{monthLabel}</h4>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1 rounded-md text-neutral-600 hover:bg-neutral-100">◀</button>
          <button onClick={nextMonth} className="p-1 rounded-md text-neutral-600 hover:bg-neutral-100">▶</button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-xs text-center mb-2">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
          <div key={d} className={d === 'Sat' || d === 'Sun' ? 'text-rose-600' : 'text-black'}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthData.days.map((d, i) => {
          if (!d) return <div key={i} className="h-10" />
          const iso = formatISO(d)
          const hasEvents = showEvents && Array.isArray(events[iso]) && events[iso].length > 0
          const isSelected = displaySelected === iso
          const dow = d.getDay()
          const isWeekend = dow === 0 || dow === 6
          // If the date has events, prefer a black number for contrast/readability.
          const numberClass = isSelected
            ? 'text-white'
            : hasEvents
            ? 'text-black'
            : `${isWeekend ? 'text-rose-600' : 'text-black'}`
          return (
            <button
              key={iso}
              onClick={() => {
                setSelected(iso)
                if (onSelect) onSelect(iso)
              }}
              className={`h-10 flex items-center justify-center rounded-md transition ${isSelected ? 'bg-indigo-500' : 'hover:bg-neutral-100'}`}>
              <div className="flex flex-col items-center">
                <span className={`text-sm leading-4 ${numberClass}`}>{d.getDate()}</span>
                {hasEvents && <span className={`${isWeekend ? 'bg-rose-500' : 'bg-indigo-500'} w-1.5 h-1.5 rounded-full mt-1`} />}
              </div>
            </button>
          )
        })}
      </div>

      {showEvents && (
        <div className="mt-4">
          <h5 className="text-sm font-medium text-black">Events on {displaySelected}</h5>
          <ul className="mt-2">
            {(events[displaySelected] || []).length === 0 && (
              <li className="text-sm text-black">No events</li>
            )}
            {(events[displaySelected] || []).map((ev, idx) => (
              <li key={idx} className="py-1 text-sm text-black">
                • {ev}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
