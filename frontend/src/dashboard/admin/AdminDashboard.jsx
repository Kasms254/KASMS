import React from 'react'
import { Link } from 'react-router-dom'
import UserCard from '../../components/UserCard'
import Card from '../../components/Card'
import Calendar from '../../components/Calendar'

export default function AdminDashboard() {
  // No test/sample events provided; calendar will start empty.

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-black">Admin dashboard</h2>
        <p className="text-sm text-gray-500">Overview of school metrics</p>
      </header>

      {/* Cards grid - modern layout */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        <Link to="/dashboard/students" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
          <UserCard type="student" count={null} />
        </Link>

        <Link to="/dashboard/instructors" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
          <UserCard type="instructors" count={null} />
        </Link>

        <UserCard type="subject" count={null} />
        <Card title="Active classes" value={null} icon="Layers" className="" badge={null} accent="bg-pink-500" colored={true} />
      </section>

      {/* Calendar + Recent activity area */}
      {/* prepare sample events in a stable way */}
      { /** eventsMemo is stable across renders */ }
      <section className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Calendar />
        </div>

        <div className="bg-white rounded-xl p-4 border border-neutral-200">
          <h3 className="text-lg font-medium mb-3 text-black">Recent activity</h3>
          <div className="text-sm text-neutral-500">No recent activity</div>
        </div>
      </section>
    </div>
  )
}
