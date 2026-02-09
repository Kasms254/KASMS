import { useState, useRef, useEffect } from 'react'
import * as Icons from 'lucide-react'

export default function ModernDateTimePicker({ value, onChange, label, placeholder = "Select date & time", min }) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedTime, setSelectedTime] = useState({ hours: '09', minutes: '00' })
  const calendarRef = useRef(null)

  // Parse the value (YYYY-MM-DDTHH:MM format)
  const selectedDate = value ? new Date(value) : null

  // Initialize time from value
  useEffect(() => {
    if (selectedDate) {
      setSelectedTime({
        hours: String(selectedDate.getHours()).padStart(2, '0'),
        minutes: String(selectedDate.getMinutes()).padStart(2, '0')
      })
    }
  }, [value])

  // Close calendar when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setIsCalendarOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Format date for display (date only)
  const formatDisplayDate = (date) => {
    if (!date) return ''
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Get days in month
  const getDaysInMonth = (date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days = []
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day))
    }
    return days
  }

  const days = getDaysInMonth(currentMonth)
  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  const emitChange = (date, time) => {
    if (date) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      onChange(`${year}-${month}-${day}T${time.hours}:${time.minutes}`)
    }
  }

  const handleDateClick = (date) => {
    if (date) {
      emitChange(date, selectedTime)
      setIsCalendarOpen(false)
    }
  }

  const handleTimeChange = (type, val) => {
    const newTime = { ...selectedTime, [type]: val }
    setSelectedTime(newTime)
    if (selectedDate) {
      emitChange(selectedDate, newTime)
    }
  }

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }

  const isToday = (date) => {
    if (!date) return false
    const today = new Date()
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear()
  }

  const isSelected = (date) => {
    if (!date || !selectedDate) return false
    return date.getDate() === selectedDate.getDate() &&
           date.getMonth() === selectedDate.getMonth() &&
           date.getFullYear() === selectedDate.getFullYear()
  }

  const isPastDate = (date) => {
    if (!date || !min) return false
    const minDate = new Date(min)
    minDate.setHours(0, 0, 0, 0)
    const compareDate = new Date(date)
    compareDate.setHours(0, 0, 0, 0)
    return compareDate < minDate
  }

  const setNow = () => {
    const now = new Date()
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(Math.floor(now.getMinutes() / 5) * 5).padStart(2, '0')
    setSelectedTime({ hours, minutes })
    setCurrentMonth(now)
    emitChange(now, { hours, minutes })
    setIsCalendarOpen(false)
  }

  // Generate hours (00-23) and minutes (00, 05, 10, ..., 55)
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

  return (
    <div>
      {label && (
        <div className="text-sm text-neutral-600 mb-1">{label}</div>
      )}

      {/* Date and Time inputs side by side */}
      <div className="flex gap-2">
        {/* Date Input */}
        <div className="relative flex-1" ref={calendarRef}>
          <Icons.Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
          <input
            type="text"
            readOnly
            value={selectedDate ? formatDisplayDate(selectedDate) : ''}
            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
            placeholder={placeholder}
            className="w-full pl-8 pr-2 py-2 text-sm text-black bg-white border border-neutral-200 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 hover:border-indigo-300 transition-colors cursor-pointer"
          />

          {/* Calendar Dropdown */}
          {isCalendarOpen && (
            <div className="absolute z-50 mt-1 left-0 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 w-64">
              {/* Month/Year Header */}
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={goToPreviousMonth}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Icons.ChevronLeft className="w-4 h-4 text-gray-600" />
                </button>
                <div className="font-semibold text-sm text-gray-900">
                  {currentMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </div>
                <button
                  type="button"
                  onClick={goToNextMonth}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Icons.ChevronRight className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              {/* Week Days */}
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {weekDays.map(day => (
                  <div key={day} className="text-center text-[10px] font-medium text-gray-400 py-0.5">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-0.5">
                {days.map((date, index) => {
                  if (!date) {
                    return <div key={`empty-${index}`} className="aspect-square" />
                  }

                  const today = isToday(date)
                  const selected = isSelected(date)
                  const past = isPastDate(date)

                  return (
                    <button
                      type="button"
                      key={date.toISOString()}
                      onClick={() => !past && handleDateClick(date)}
                      disabled={past}
                      className={`
                        aspect-square flex items-center justify-center rounded text-xs font-medium transition-all
                        ${past
                          ? 'text-gray-300 cursor-not-allowed'
                          : selected
                          ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
                          : today
                          ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                          : 'text-gray-700 hover:bg-gray-100'
                        }
                      `}
                    >
                      {date.getDate()}
                    </button>
                  )
                })}
              </div>

              {/* Footer */}
              <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={setNow}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                >
                  <Icons.Clock className="w-3 h-3" />
                  Now
                </button>
                <button
                  type="button"
                  onClick={() => setIsCalendarOpen(false)}
                  className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700 font-medium"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Time Input */}
        <div className="flex items-center gap-1 bg-white border border-neutral-200 rounded px-2">
          <Icons.Clock className="w-4 h-4 text-gray-400" />
          <select
            value={selectedTime.hours}
            onChange={(e) => handleTimeChange('hours', e.target.value)}
            className="bg-transparent text-sm py-2 pr-0 pl-1 border-0 focus:ring-0 text-black cursor-pointer"
          >
            {hours.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <span className="text-gray-400">:</span>
          <select
            value={selectedTime.minutes}
            onChange={(e) => handleTimeChange('minutes', e.target.value)}
            className="bg-transparent text-sm py-2 pr-1 pl-0 border-0 focus:ring-0 text-black cursor-pointer"
          >
            {minutes.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}
