import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'

export default function StaticTimePicker({ value, onChange, label }) {
  const [selectedHour, setSelectedHour] = useState(9)
  const [selectedMinute, setSelectedMinute] = useState(0)
  const [period, setPeriod] = useState('AM')
  const [selectingHour, setSelectingHour] = useState(true)

  // Parse value on mount or when value changes
  useEffect(() => {
    if (value) {
      const date = new Date(value)
      let hours = date.getHours()
      const minutes = date.getMinutes()

      const newPeriod = hours >= 12 ? 'PM' : 'AM'
      const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours

      setSelectedHour(displayHour)
      setSelectedMinute(minutes)
      setPeriod(newPeriod)
    }
  }, [value])

  // Emit change when hour, minute, or period changes
  const emitChange = (hour, minute, per) => {
    if (!value) return

    const date = new Date(value)
    let hour24 = hour

    if (per === 'PM' && hour !== 12) {
      hour24 = hour + 12
    } else if (per === 'AM' && hour === 12) {
      hour24 = 0
    }

    date.setHours(hour24, minute, 0, 0)
    onChange(date.toISOString().slice(0, 16))
  }

  const handleHourClick = (hour) => {
    setSelectedHour(hour)
    emitChange(hour, selectedMinute, period)
    setSelectingHour(false)
  }

  const handleMinuteClick = (minute) => {
    setSelectedMinute(minute)
    emitChange(selectedHour, minute, period)
  }

  const togglePeriod = () => {
    const newPeriod = period === 'AM' ? 'PM' : 'AM'
    setPeriod(newPeriod)
    emitChange(selectedHour, selectedMinute, newPeriod)
  }

  // Generate hours 1-12
  const hours = Array.from({ length: 12 }, (_, i) => i + 1)

  // Generate minutes 0, 5, 10, ..., 55
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5)

  // Calculate clock positions for visual display
  const getClockPosition = (index, total, radius = 90) => {
    const angle = (index * 360) / total - 90 // Start from top
    const x = radius * Math.cos((angle * Math.PI) / 180)
    const y = radius * Math.sin((angle * Math.PI) / 180)
    return { x, y }
  }

  return (
    <div>
      {label && (
        <div className="text-sm text-neutral-600 mb-2">{label}</div>
      )}

      <div className="bg-white border border-neutral-200 rounded-lg p-4">
        {/* Time Display */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="flex items-center gap-2 bg-indigo-50 rounded-lg px-4 py-3">
            <Clock className="w-5 h-5 text-indigo-600" />
            <button
              type="button"
              onClick={() => setSelectingHour(true)}
              className={`text-3xl font-bold transition-colors ${
                selectingHour ? 'text-indigo-600' : 'text-neutral-400'
              }`}
            >
              {String(selectedHour).padStart(2, '0')}
            </button>
            <span className="text-3xl font-bold text-neutral-400">:</span>
            <button
              type="button"
              onClick={() => setSelectingHour(false)}
              className={`text-3xl font-bold transition-colors ${
                !selectingHour ? 'text-indigo-600' : 'text-neutral-400'
              }`}
            >
              {String(selectedMinute).padStart(2, '0')}
            </button>
            <button
              type="button"
              onClick={togglePeriod}
              className="ml-2 text-xl font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              {period}
            </button>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setSelectingHour(true)}
            className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
              selectingHour
                ? 'bg-indigo-600 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            Hour
          </button>
          <button
            type="button"
            onClick={() => setSelectingHour(false)}
            className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
              !selectingHour
                ? 'bg-indigo-600 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            Minute
          </button>
        </div>

        {/* Clock Face */}
        <div className="relative w-64 h-64 mx-auto">
          <div className="absolute inset-0 rounded-full border-2 border-neutral-200 bg-neutral-50">
            {/* Center dot */}
            <div className="absolute top-1/2 left-1/2 w-3 h-3 bg-indigo-600 rounded-full -translate-x-1/2 -translate-y-1/2" />

            {selectingHour ? (
              // Hour selection
              <>
                {hours.map((hour, index) => {
                  const pos = getClockPosition(index, 12)
                  const isSelected = hour === selectedHour

                  return (
                    <button
                      key={hour}
                      type="button"
                      onClick={() => handleHourClick(hour)}
                      className={`absolute w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                        isSelected
                          ? 'bg-indigo-600 text-white scale-110 shadow-lg'
                          : 'bg-white text-neutral-700 hover:bg-indigo-100 hover:scale-105'
                      }`}
                      style={{
                        left: `calc(50% + ${pos.x}px - 20px)`,
                        top: `calc(50% + ${pos.y}px - 20px)`,
                      }}
                    >
                      {hour}
                    </button>
                  )
                })}
              </>
            ) : (
              // Minute selection
              <>
                {minutes.map((minute, index) => {
                  const pos = getClockPosition(index, 12)
                  const isSelected = minute === selectedMinute

                  return (
                    <button
                      key={minute}
                      type="button"
                      onClick={() => handleMinuteClick(minute)}
                      className={`absolute w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                        isSelected
                          ? 'bg-indigo-600 text-white scale-110 shadow-lg'
                          : 'bg-white text-neutral-700 hover:bg-indigo-100 hover:scale-105'
                      }`}
                      style={{
                        left: `calc(50% + ${pos.x}px - 20px)`,
                        top: `calc(50% + ${pos.y}px - 20px)`,
                      }}
                    >
                      {String(minute).padStart(2, '0')}
                    </button>
                  )
                })}
              </>
            )}
          </div>
        </div>

        {/* Quick Time Shortcuts */}
        <div className="mt-4 pt-4 border-t border-neutral-200">
          <div className="text-xs text-neutral-500 mb-2">Quick Select</div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: '8:00 AM', hour: 8, minute: 0, period: 'AM' },
              { label: '9:00 AM', hour: 9, minute: 0, period: 'AM' },
              { label: '12:00 PM', hour: 12, minute: 0, period: 'PM' },
              { label: '2:00 PM', hour: 2, minute: 0, period: 'PM' },
              { label: '5:00 PM', hour: 5, minute: 0, period: 'PM' },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setSelectedHour(preset.hour)
                  setSelectedMinute(preset.minute)
                  setPeriod(preset.period)
                  emitChange(preset.hour, preset.minute, preset.period)
                }}
                className="px-3 py-1.5 text-xs font-medium bg-neutral-100 text-neutral-700 rounded-lg hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
