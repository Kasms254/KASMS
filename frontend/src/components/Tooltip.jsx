import React, { useId, useState, useRef, useEffect } from 'react'
// Lightweight tooltip without framer-motion to avoid dev lint hiccups

export default function Tooltip({ children, content, placement = 'top', delay = 80 }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const timeoutRef = useRef(null)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  const show = () => {
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setOpen(true), delay)
  }
  const hide = () => {
    clearTimeout(timeoutRef.current)
    setOpen(false)
  }

  // position helpers -> basic offset classes
  const placementClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-3',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-3',
  }

  // We won't attempt to merge child's handlers to avoid accessing refs during render.
  // Instead we wrap the child and attach interaction handlers on the wrapper while
  // adding aria-describedby to the child element (without inspecting child's props).
  const wrappedChild = React.cloneElement(React.Children.only(children), { 'aria-describedby': id })

  return (
    <span
      className="relative inline-block"
      onKeyDown={(e) => e.key === 'Escape' && hide()}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {wrappedChild}

      {open && (
        <span
          id={id}
          role="tooltip"
          className={`z-50 pointer-events-none select-none absolute ${placementClasses[placement] || placementClasses.top} whitespace-nowrap rounded bg-gray-900 text-white text-xs py-1 px-2 shadow-lg transition-opacity duration-150 ease-out opacity-100 transform scale-100`}
        >
          {content}
        </span>
      )}
    </span>
  )
}
