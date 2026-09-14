import React, { useState, useEffect } from 'react'
import { Link } from 'react-router'
import Card from '../../components/Card'
import { Building2, Users, Palette, BarChart3, School, Activity, UserCog } from 'lucide-react'
import * as api from '../../lib/api'

export default function SuperadminDashboard() {
  const [stats, setStats] = useState({
    total_schools: 0,
    active_schools: 0,
    total_users: 0,
    total_students: 0,
    total_instructors: 0,
  })
  const [loading, setLoading] = useState(true)
  const [recentSchools, setRecentSchools] = useState([])

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const [schoolsData, summary] = await Promise.all([
          api.getSchools('page_size=5'),
          api.getSuperadminDashboardSummary().catch(() => null),
        ])
        const schools = schoolsData?.results || []
        setRecentSchools(schools)

        const counts = summary?.counts || {}

        setStats({
          total_schools: counts.total_schools ?? (schoolsData?.count || schools.length),
          active_schools: counts.active_schools ?? schools.filter(s => s.is_active).length,
          total_users: counts.total_admins ?? 0,
          total_students: counts.total_students ?? 0,
          total_instructors: counts.total_instructors ?? 0,
        })
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-edge-indigo-600"></div>
      </div>
    )
  }

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-fg">Super Admin Dashboard</h2>
          <p className="text-sm text-fg-soft">Manage schools, themes, and system-wide settings</p>
        </div>
        <Link
          to="/superadmin/schools/new"
          className="px-4 py-2 bg-fill-indigo-600 text-white rounded-lg hover:bg-fill-indigo-700 transition flex items-center gap-2"
        >
          <Building2 className="w-4 h-4" />
          Add School
        </Link>
      </header>

      {/* Stats Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Link to="/superadmin/schools" className="block focus:outline-none focus:ring-2 focus:ring-edge-indigo-200 rounded-lg">
          <Card title="Total Schools" value={stats.total_schools} icon="Building2" accent="bg-fill-blue-500" colored={true} />
        </Link>
        <Link to="/superadmin/schools" className="block focus:outline-none focus:ring-2 focus:ring-edge-indigo-200 rounded-lg">
          <Card title="Active Schools" value={stats.active_schools} icon="Activity" accent="bg-fill-emerald-500" colored={true} />
        </Link>
        <Link to="/superadmin/admins" className="block focus:outline-none focus:ring-2 focus:ring-edge-indigo-200 rounded-lg">
          <Card title="School Admins" value={stats.total_users} icon="Users" accent="bg-fill-sky-500" colored={true} />
        </Link>
        <Link to="/superadmin/themes" className="block focus:outline-none focus:ring-2 focus:ring-edge-indigo-200 rounded-lg">
          <Card title="Themes" value={stats.total_schools} icon="Palette" accent="bg-fill-amber-500" colored={true} />
        </Link>
      </section>

      {/* Recent Schools & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Schools */}
        <div className="bg-surface rounded-xl shadow-sm border border-line">
          <div className="p-4 border-b border-line flex items-center justify-between">
            <h3 className="font-semibold text-fg">Recent Schools</h3>
            <Link to="/superadmin/schools" className="text-sm text-mark-indigo-600 hover:text-mark-indigo-700">
              View All
            </Link>
          </div>
          <div className="p-4">
            {recentSchools.length === 0 ? (
              <p className="text-fg-soft text-center py-4">No schools created yet</p>
            ) : (
              <div className="space-y-3">
                {recentSchools.map((school) => (
                  <Link
                    key={school.id}
                    to={`/superadmin/schools/${school.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-canvas transition"
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: school.primary_color || '#1976D2' }}
                    >
                      {school.logo ? (
                        <img src={school.logo} alt={school.name} className="w-8 h-8 rounded object-contain" />
                      ) : (
                        <School className="w-5 h-5 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-fg truncate">{school.short_name || school.name}</p>
                      <p className="text-sm text-fg-soft">{school.code}</p>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs rounded-full flex-shrink-0 font-medium ${
                        school.is_active
                          ? 'bg-fill-green-100 text-mark-green-700'
                          : 'bg-fill-red-100 text-mark-red-700'
                      }`}
                    >
                      {school.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-surface rounded-xl shadow-sm border border-line">
          <div className="p-4 border-b border-line">
            <h3 className="font-semibold text-fg">Quick Actions</h3>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <Link
              to="/superadmin/schools/new"
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-line hover:border-edge-indigo-300 hover:bg-fill-indigo-50 transition"
            >
              <Building2 className="w-8 h-8 text-mark-indigo-600" />
              <span className="text-sm font-medium text-fg-body">Add School</span>
            </Link>
            <Link
              to="/superadmin/themes"
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-line hover:border-edge-purple-300 hover:bg-fill-purple-50 transition"
            >
              <Palette className="w-8 h-8 text-mark-purple-600" />
              <span className="text-sm font-medium text-fg-body">Manage Themes</span>
            </Link>
            <Link
              to="/superadmin/admins"
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-line hover:border-edge-green-300 hover:bg-fill-green-50 transition"
            >
              <UserCog className="w-8 h-8 text-mark-green-600" />
              <span className="text-sm font-medium text-fg-body">Manage Admins</span>
            </Link>
            <Link
              to="/superadmin/stats"
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-line hover:border-edge-orange-300 hover:bg-fill-orange-50 transition"
            >
              <BarChart3 className="w-8 h-8 text-mark-orange-600" />
              <span className="text-sm font-medium text-fg-body">System Stats</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
