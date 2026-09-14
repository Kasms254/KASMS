import React from 'react'
import * as LucideIcons from 'lucide-react'

export default function Card({
  badge,
  title,
  value,
  icon, // optional icon name string (lucide)
  className = '',
  badgeClass = 'bg-surface/90 px-2 py-1 rounded-full text-fg border border-line',
  accent = 'bg-fill-indigo-600',
  colored = false,
  children,
}) {
  const IconComp = icon ? LucideIcons[icon] : null

  // map accent token to background / text variants for a modern colored card
  const accentMap = {
    'bg-fill-indigo-600': { bg: 'bg-fill-indigo-50', text: 'text-mark-indigo-800', plate: 'bg-fill-indigo-600' },
    'bg-fill-indigo-500': { bg: 'bg-fill-indigo-50', text: 'text-mark-indigo-800', plate: 'bg-fill-indigo-500' },
    'bg-fill-emerald-500': { bg: 'bg-fill-emerald-50', text: 'text-mark-emerald-800', plate: 'bg-fill-emerald-500' },
    'bg-fill-sky-500': { bg: 'bg-fill-sky-50', text: 'text-mark-sky-800', plate: 'bg-fill-sky-500' },
    'bg-fill-amber-500': { bg: 'bg-fill-amber-50', text: 'text-mark-amber-800', plate: 'bg-fill-amber-500' },
    'bg-fill-pink-500': { bg: 'bg-fill-pink-50', text: 'text-mark-pink-800', plate: 'bg-fill-pink-500' },
    'bg-surface-5': { bg: 'bg-canvas', text: 'text-fg-body', plate: 'bg-surface-5' },
    // fallback
    // make the default card light and legible (avoid very dark cards)
    default: { bg: 'bg-surface', text: 'text-fg', plate: 'bg-fill-indigo-600' },
  }

    const acc = accentMap[accent] || accentMap.default
    const outerBg = colored ? acc.bg : accentMap.default.bg
    // titleText removed to avoid unused var; titles are forced to black per UI requirement
    const plateClass = colored ? acc.plate : accentMap.default.plate

  return (
  <div
    className={`relative rounded-xl p-3 sm:p-4 flex-1 min-w-0 ${outerBg} ${className} border border-line hover:shadow-lg transition-shadow duration-200`}
  >
      {/* accent stripe */}
  <div className={`absolute top-0 left-0 h-1 w-12 md:w-16 ${plateClass} rounded-tl-xl`} />

        <div className="flex justify-between items-start gap-3">
        {badge ? <span className={`${badgeClass} text-[10px] md:text-xs`}>{badge}</span> : <span />}
        {IconComp ? (
          <span className={`w-9 h-9 md:w-11 md:h-11 flex items-center justify-center rounded-xl ${plateClass} text-white shrink-0`}> 
            <IconComp className="w-4 h-4 md:w-5 md:h-5" strokeWidth={1.5} />
          </span>
        ) : null}
      </div>

        <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold my-3 sm:my-4 text-fg line-clamp-2" title={value}>{value ?? '-'}</h1>
        <h2 className="capitalize text-sm sm:text-sm md:text-base font-medium text-fg truncate" title={title}>{title}</h2>
        {children ? (
          <div className="mt-2 text-xs text-fg-soft">{children}</div>
        ) : null}
    </div>
  )
}
