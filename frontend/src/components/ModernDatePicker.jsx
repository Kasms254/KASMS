import { useState, useRef, useEffect } from 'react'
import * as Icons from 'lucide-react'

export default function ModernDatePicker({ value, onChange, label, placeholder = "Select date", minDate = null, maxDate = null }) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const dropdownRef = useRef(null)

  // Parse the value (YYYY-MM-DD format)
  const selectedDate = value ? new Date(value + 'T00:00:00') : null

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Format date for display
  const formatDisplayDate = (date) => {
    if (!date) return ''
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
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

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }

    // Add actual days
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day))
    }

    return days
  }

  const days = getDaysInMonth(currentMonth)
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const handleDateClick = (date) => {
    if (date) {
      // Format as YYYY-MM-DD for the input
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      onChange(`${year}-${month}-${day}`)
      setIsOpen(false)
    }
  }

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }

  const goToToday = () => {
    const today = new Date()
    setCurrentMonth(today)
    // Only select today if it's within the allowed range
    if (!isDisabled(today)) {
      handleDateClick(today)
    }
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

  const isDisabled = (date) => {
    if (!date) return false
    const check = new Date(date)
    check.setHours(0, 0, 0, 0)

    // Check if date is before minDate
    if (minDate) {
      const min = new Date(minDate)
      min.setHours(0, 0, 0, 0)
      if (check < min) return true
    }

    // Check if date is after maxDate
    if (maxDate) {
      const max = new Date(maxDate)
      max.setHours(0, 0, 0, 0)
      if (check > max) return true
    }

    return false
  }

  const clearDate = () => {
    onChange('')
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {label && (
        <label className="block text-sm font-medium text-neutral-700 mb-2 flex items-center gap-1.5">
          <Icons.CalendarDays className="w-4 h-4 text-indigo-500" />
          {label}
        </label>
      )}

      {/* Input Field */}
      <div className="relative">
        <Icons.Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
        <input
          type="text"
          readOnly
          value={selectedDate ? formatDisplayDate(selectedDate) : ''}
          onClick={() => setIsOpen(!isOpen)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2.5 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 hover:border-indigo-300 transition-colors cursor-pointer"
        />
        {value && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              clearDate()
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10"
          >
            <Icons.X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Calendar Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-3 w-72">
          {/* Month/Year Header */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={goToPreviousMonth}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <Icons.ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>

            <div className="font-semibold text-sm text-gray-900">
              {currentMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </div>

            <button
              onClick={goToNextMonth}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <Icons.ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          {/* Week Days */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {weekDays.map(day => (
              <div key={day} className="text-center text-[10px] font-medium text-gray-500 py-0.5">
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
              const disabled = isDisabled(date)

              return (
                <button
                  key={date.toISOString()}
                  onClick={() => !disabled && handleDateClick(date)}
                  disabled={disabled}
                  className={`
                    aspect-square flex items-center justify-center rounded text-xs font-medium transition-all
                    ${disabled
                      ? 'text-gray-300 cursor-not-allowed bg-gray-50'
                      : selected
                      ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
                      : today
                      ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                      : 'text-gray-700 hover:bg-gray-100'
                    }
                  `}
                >
                  {date.getDate()}
                </button>
              )
            })}
          </div>

          {/* Footer Actions */}
          <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between">
            <button
              onClick={goToToday}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
            >
              <Icons.Calendar className="w-3 h-3" />
              Today
            </button>
            {value && (
              <button
                onClick={clearDate}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
