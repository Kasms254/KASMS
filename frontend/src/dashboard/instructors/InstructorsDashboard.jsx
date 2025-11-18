import React from 'react'
import Card from '../../components/Card'

export default function InstructorsDashboard() {
  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-black">Instructors dashboard</h2>
        <p className="text-sm text-gray-500">Your classes and recent activity</p>
      </header>

      {/* Cards grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card title="My classes" value={null} icon="Layers" badge={null} accent="bg-emerald-500" colored={true} />
        <Card title="Upcoming" value={null} icon="Calendar" badge={null} accent="bg-sky-500" colored={true} />
        <Card title="Students" value={null} icon="Users" badge={null} accent="bg-indigo-500" colored={true} />
      </section>

      <section className="mt-4">
        <div className="rounded-xl p-4 bg-white/95 dark:bg-gray-800/80">
          <h3 className="text-lg font-medium mb-3">Recent announcements</h3>
          <ul className="divide-y">
            <li className="py-2">—</li>
          </ul>
        </div>
      </section>
    </div>
  )
}
