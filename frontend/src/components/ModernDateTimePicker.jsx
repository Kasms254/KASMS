import { useState, useRef, useEffect } from 'react'
import * as Icons from 'lucide-react'

export default function ModernDateTimePicker({ value, onChange, label, placeholder = "Select date & time", min }) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedTime, setSelectedTime] = useState({ hours: '09', minutes: '00' })
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false)
  const [timePickerMode, setTimePickerMode] = useState('hours') // 'hours' or 'minutes'
  const calendarRef = useRef(null)
  const timePickerRef = useRef(null)

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
      if (timePickerRef.current && !timePickerRef.current.contains(event.target)) {
        setIsTimePickerOpen(false)
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
        <div className="relative" ref={timePickerRef}>
          <div
            onClick={() => {
              setIsTimePickerOpen(!isTimePickerOpen)
              setTimePickerMode('hours')
            }}
            className="flex items-center gap-1 bg-white border border-neutral-200 rounded px-3 py-2 cursor-pointer hover:border-indigo-300 transition-colors"
          >
            <Icons.Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-black font-medium">
              {selectedTime.hours}:{selectedTime.minutes}
            </span>
          </div>

          {/* Clock Picker Dropdown */}
          {isTimePickerOpen && (
            <div className="absolute z-50 mt-1 right-0 bg-white rounded-lg shadow-2xl border border-gray-200 p-2 w-52">
              {/* Time Display */}
              <div className="text-center mb-1.5">
                <div className="text-lg font-bold text-indigo-600">
                  {selectedTime.hours}:{selectedTime.minutes}
                </div>
              </div>

              {/* AM/PM Toggle */}
              {timePickerMode === 'hours' && (
                <div className="flex gap-1 mb-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const currentHour = parseInt(selectedTime.hours)
                      const newHour = currentHour >= 12 ? currentHour - 12 : currentHour
                      handleTimeChange('hours', String(newHour).padStart(2, '0'))
                    }}
                    className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-all ${
                      parseInt(selectedTime.hours) < 12
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const currentHour = parseInt(selectedTime.hours)
                      const newHour = currentHour < 12 ? currentHour + 12 : currentHour
                      handleTimeChange('hours', String(newHour).padStart(2, '0'))
                    }}
                    className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-all ${
                      parseInt(selectedTime.hours) >= 12
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    PM
                  </button>
                </div>
              )}

              {/* Clock Face */}
              <div className="relative w-36 h-36 mx-auto mb-1.5">
                <svg className="w-full h-full" viewBox="0 0 150 150">
                  {/* Clock circle background */}
                  <circle cx="75" cy="75" r="70" fill="#f9fafb" />
                  <circle cx="75" cy="75" r="70" fill="none" stroke="#e5e7eb" strokeWidth="2" />
                  <circle cx="75" cy="75" r="3" fill="#4f46e5" />

                  {timePickerMode === 'hours' ? (
                    /* Hour markers - 12 numbers (0-23 using AM/PM toggle) */
                    Array.from({ length: 12 }, (_, i) => {
                      const displayNum = i === 0 ? 12 : i
                      const currentHour = parseInt(selectedTime.hours)
                      const isPM = currentHour >= 12
                      const hour12 = currentHour % 12 || 12

                      // Calculate position
                      const angle = (i * 30 - 90) * (Math.PI / 180)
                      const radius = 54
                      const x = 75 + radius * Math.cos(angle)
                      const y = 75 + radius * Math.sin(angle)
                      const isSelected = displayNum === hour12

                      return (
                        <g key={i}>
                          <circle
                            cx={x}
                            cy={y}
                            r="13"
                            fill={isSelected ? '#4f46e5' : 'white'}
                            stroke={isSelected ? '#4f46e5' : '#e5e7eb'}
                            strokeWidth="1.5"
                            className="cursor-pointer hover:fill-indigo-100 transition-all"
                            onClick={() => {
                              // Convert 12-hour to 24-hour
                              let hour24 = displayNum === 12 ? 0 : displayNum
                              if (isPM && hour24 !== 0) hour24 += 12
                              else if (isPM && hour24 === 0) hour24 = 12
                              handleTimeChange('hours', String(hour24).padStart(2, '0'))
                              setTimePickerMode('minutes')
                            }}
                          />
                          <text
                            x={x}
                            y={y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="text-xs font-bold pointer-events-none select-none"
                            fill={isSelected ? 'white' : '#374151'}
                          >
                            {displayNum}
                          </text>
                        </g>
                      )
                    })
                  ) : (
                    /* Minute markers */
                    Array.from({ length: 12 }, (_, i) => {
                      const minute = i * 5
                      const angle = (i * 30 - 90) * (Math.PI / 180)
                      const radius = 54
                      const x = 75 + radius * Math.cos(angle)
                      const y = 75 + radius * Math.sin(angle)
                      const isSelected = String(minute).padStart(2, '0') === selectedTime.minutes

                      return (
                        <g key={minute}>
                          <circle
                            cx={x}
                            cy={y}
                            r="14"
                            fill={isSelected ? '#4f46e5' : 'white'}
                            stroke={isSelected ? '#4f46e5' : '#e5e7eb'}
                            strokeWidth="1.5"
                            className="cursor-pointer hover:fill-indigo-100 transition-all"
                            onClick={() => {
                              handleTimeChange('minutes', String(minute).padStart(2, '0'))
                              setIsTimePickerOpen(false)
                            }}
                          />
                          <text
                            x={x}
                            y={y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className="text-xs font-bold pointer-events-none select-none"
                            fill={isSelected ? 'white' : '#374151'}
                          >
                            {String(minute).padStart(2, '0')}
                          </text>
                        </g>
                      )
                    })
                  )}
                </svg>
              </div>

              {/* Mode switcher */}
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setTimePickerMode('hours')}
                  className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-all ${
                    timePickerMode === 'hours'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Hours
                </button>
                <button
                  type="button"
                  onClick={() => setTimePickerMode('minutes')}
                  className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-all ${
                    timePickerMode === 'minutes'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Minutes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
