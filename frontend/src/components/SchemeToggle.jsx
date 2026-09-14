import * as LucideIcons from 'lucide-react'
import useColorScheme from '../hooks/useColorScheme'

const NEXT_LABEL = {
  light: 'Switch to dark theme',
  dark: 'Follow system theme',
  system: 'Switch to light theme',
}

/**
 * Cycles light → dark → system. Single control rather than a dropdown, so it
 * costs one tap on mobile where the navbar is tightest.
 */
export default function SchemeToggle({ className = '' }) {
  const { scheme, resolved, toggle } = useColorScheme()

  // 'system' shows the scheme it currently resolves to, with a marker dot.
  const Icon = resolved === 'dark' ? LucideIcons.Moon : LucideIcons.Sun

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={NEXT_LABEL[scheme]}
      title={scheme === 'system' ? `System (${resolved})` : `Theme: ${scheme}`}
      className={`
        relative p-2 rounded-full
        text-fg-muted bg-surface/80 backdrop-blur
        border border-line shadow-sm
        hover:bg-surface-2 transition
        ${className}
      `}
    >
      <Icon className="w-5 h-5" />
      {scheme === 'system' && (
        <span
          aria-hidden="true"
          className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-brand ring-2 ring-surface"
        />
      )}
    </button>
  )
}
