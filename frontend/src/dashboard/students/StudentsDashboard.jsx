import React from 'react'
import Card from '../../components/Card'

export default function StudentsDashboard() {
  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-black">Students dashboard</h2>
        <p className="text-sm text-gray-500">Your classes, assignments and progress</p>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card title="Enrolled" value={"5 courses"} icon="BookOpen" badge={null} accent="bg-indigo-500" colored={true} />
          <Card title="GPA" value={"3.6"} icon="BarChart2" badge={null} accent="bg-amber-500" colored={true} />
        </div>

        <aside className="lg:col-span-1">
          <div className="rounded-xl p-4 bg-white/95 text-black">
            <h3 className="text-lg font-medium mb-3">Upcoming assignments</h3>
            <ul className="divide-y">
              <li className="py-2 flex justify-between items-center">
                <span>Math homework</span>
                <span className="text-sm text-gray-500">Due Wed</span>
              </li>
              <li className="py-2 flex justify-between items-center">
                <span>Science project</span>
                <span className="text-sm text-gray-500">Due Fri</span>
              </li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  )
}
