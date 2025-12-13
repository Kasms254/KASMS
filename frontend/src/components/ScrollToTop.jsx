import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Simple helper that scrolls the window to top whenever the route changes.
export default function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    // Use instant jump to avoid janky smooth scroll when navigation should land at top
    if (typeof window !== 'undefined' && window.scrollTo) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
  }, [pathname])

  return null
}
