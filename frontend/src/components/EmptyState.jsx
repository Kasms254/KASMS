import React from 'react'
import * as LucideIcons from 'lucide-react'

export default function EmptyState({
  icon = 'Inbox',
  title = 'No data available',
  description = 'Get started by adding your first item.',
  actionLabel,
  onAction,
  variant = 'default' // 'default' | 'minimal'
}) {
  const Icon = LucideIcons[icon] || LucideIcons.Inbox

  if (variant === 'minimal') {
    return (
      <div className="text-center py-8">
        <Icon className="w-8 h-8 mx-auto text-neutral-400 mb-2" />
        <p className="text-sm text-neutral-500">{title}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-indigo-600" strokeWidth={1.5} />
      </div>

      <h3 className="text-lg font-medium text-neutral-800 mb-2">{title}</h3>

      {description && (
        <p className="text-sm text-neutral-500 text-center max-w-md mb-6">
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition"
        >
          <LucideIcons.Plus className="w-4 h-4" />
          {actionLabel}
        </button>
      )}
    </div>
  )
}
