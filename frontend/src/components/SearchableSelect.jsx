import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Search, ChevronDown, X, Check } from 'lucide-react'

/**
 * A searchable dropdown select component.
 *
 * Props:
 *  - value: currently selected value (string/number)
 *  - onChange: callback when selection changes, receives the value
 *  - options: array of { id, label } objects
 *  - placeholder: placeholder text when nothing is selected
 *  - searchPlaceholder: placeholder for the search input
 *  - className: additional class names for the outer wrapper
 *  - error: whether to show error border styling
 *  - disabled: whether the component is disabled
 */
export default function SearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  searchPlaceholder = 'Type to search...',
  className = '',
  error = false,
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)
  const searchInputRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [open])

  const selectedOption = useMemo(
    () => options.find((o) => String(o.id) === String(value)),
    [options, value]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, search])

  function handleSelect(id) {
    onChange(String(id))
    setOpen(false)
    setSearch('')
  }

  function handleClear(e) {
    e.stopPropagation()
    onChange('')
    setSearch('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false)
      setSearch('')
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`} onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((o) => !o) }}
        className={`w-full flex items-center justify-between gap-2 p-2 rounded-md text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-200 transition ${
          error ? 'border-rose-500' : 'border-neutral-200'
        } ${disabled ? 'bg-neutral-100 cursor-not-allowed text-neutral-400' : 'bg-white text-black cursor-pointer hover:border-neutral-300'}`}
      >
        <span className={`truncate ${selectedOption ? 'text-black' : 'text-neutral-400'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-neutral-100 transition"
            >
              <X className="w-3.5 h-3.5 text-neutral-400" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-neutral-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-2 text-sm border border-neutral-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200 text-black placeholder-neutral-400"
              />
            </div>
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-neutral-400 text-center">No results found</li>
            ) : (
              filtered.map((opt) => {
                const isSelected = String(opt.id) === String(value)
                return (
                  <li
                    key={opt.id}
                    onClick={() => handleSelect(opt.id)}
                    className={`flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer transition ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-black hover:bg-neutral-50'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
                  </li>
                )
              })
            )}
          </ul>

          {/* Result count */}
          {options.length > 5 && (
            <div className="px-3 py-2 border-t border-neutral-100 text-xs text-neutral-400">
              {filtered.length} of {options.length} results
            </div>
          )}
        </div>
      )}
    </div>
  )
}
