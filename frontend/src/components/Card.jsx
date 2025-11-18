import React from 'react'
import * as LucideIcons from 'lucide-react'

export default function Card({
  badge,
  title,
  value,
  icon, // optional icon name string (lucide)
  className = '',
  badgeClass = 'bg-white/90 px-2 py-1 rounded-full text-black border border-neutral-200',
  accent = 'bg-indigo-600',
  colored = false,
  children,
}) {
  const IconComp = icon ? LucideIcons[icon] : null

  // map accent token to background / text variants for a modern colored card
  const accentMap = {
    'bg-indigo-600': { bg: 'bg-indigo-50', text: 'text-indigo-800', plate: 'bg-indigo-600' },
    'bg-indigo-500': { bg: 'bg-indigo-50', text: 'text-indigo-800', plate: 'bg-indigo-500' },
    'bg-emerald-500': { bg: 'bg-emerald-50', text: 'text-emerald-800', plate: 'bg-emerald-500' },
    'bg-sky-500': { bg: 'bg-sky-50', text: 'text-sky-800', plate: 'bg-sky-500' },
    'bg-amber-500': { bg: 'bg-amber-50', text: 'text-amber-800', plate: 'bg-amber-500' },
    'bg-pink-500': { bg: 'bg-pink-50', text: 'text-pink-800', plate: 'bg-pink-500' },
    // fallback
    // make the default card light and legible (avoid very dark cards)
    default: { bg: 'bg-white', text: 'text-gray-900', plate: 'bg-indigo-600' },
  }

    const acc = accentMap[accent] || accentMap.default
    const outerBg = colored ? acc.bg : accentMap.default.bg
    // titleText removed to avoid unused var; titles are forced to black per UI requirement
    const plateClass = colored ? acc.plate : accentMap.default.plate

  return (
  <div
    className={`relative rounded-xl p-3 sm:p-4 flex-1 min-w-0 ${outerBg} ${className} border border-neutral-200 hover:shadow-lg transition-shadow duration-200`}
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

        <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold my-3 sm:my-4 text-black truncate">{value ?? '-'}</h1>
        <h2 className="capitalize text-sm sm:text-sm md:text-base font-medium text-black truncate">{title}</h2>
        {children ? (
          <div className="mt-2 text-xs text-neutral-500">{children}</div>
        ) : null}
    </div>
  )
}
