import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
        // Fetch schools list
        const schoolsData = await api.getSchools('page_size=5')
        const schools = schoolsData?.results || []
        setRecentSchools(schools)

        // Fetch school admins count
        const adminsData = await api.getSchoolAdmins('page_size=1')
        const totalAdmins = adminsData?.count || 0

        // Calculate stats from schools data
        const totalSchools = schoolsData?.count || schools.length
        const activeSchools = schools.filter(s => s.is_active).length

        setStats({
          total_schools: totalSchools,
          active_schools: activeSchools,
          total_users: totalAdmins,
          total_students: 0,
          total_instructors: 0,
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-black">Super Admin Dashboard</h2>
          <p className="text-sm text-gray-500">Manage schools, themes, and system-wide settings</p>
        </div>
        <Link
          to="/superadmin/schools/new"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2"
        >
          <Building2 className="w-4 h-4" />
          Add School
        </Link>
      </header>

      {/* Stats Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Link to="/superadmin/schools" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
          <Card title="Total Schools" value={stats.total_schools} icon="Building2" accent="bg-blue-500" colored={true} />
        </Link>
        <Link to="/superadmin/schools" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
          <Card title="Active Schools" value={stats.active_schools} icon="Activity" accent="bg-emerald-500" colored={true} />
        </Link>
        <Link to="/superadmin/admins" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
          <Card title="School Admins" value={stats.total_users} icon="Users" accent="bg-sky-500" colored={true} />
        </Link>
        <Link to="/superadmin/themes" className="block focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-lg">
          <Card title="Themes" value={stats.total_schools} icon="Palette" accent="bg-amber-500" colored={true} />
        </Link>
      </section>

      {/* Recent Schools & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Schools */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
          <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
            <h3 className="font-semibold text-black">Recent Schools</h3>
            <Link to="/superadmin/schools" className="text-sm text-indigo-600 hover:text-indigo-700">
              View All
            </Link>
          </div>
          <div className="p-4">
            {recentSchools.length === 0 ? (
              <p className="text-neutral-500 text-center py-4">No schools created yet</p>
            ) : (
              <div className="space-y-3">
                {recentSchools.map((school) => (
                  <Link
                    key={school.id}
                    to={`/superadmin/schools/${school.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-50 transition"
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
                      <p className="font-medium text-black truncate">{school.short_name || school.name}</p>
                      <p className="text-sm text-neutral-500">{school.code}</p>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs rounded-full flex-shrink-0 font-medium ${
                        school.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
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
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
          <div className="p-4 border-b border-neutral-200">
            <h3 className="font-semibold text-black">Quick Actions</h3>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <Link
              to="/superadmin/schools/new"
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-neutral-200 hover:border-indigo-300 hover:bg-indigo-50 transition"
            >
              <Building2 className="w-8 h-8 text-indigo-600" />
              <span className="text-sm font-medium text-neutral-700">Add School</span>
            </Link>
            <Link
              to="/superadmin/themes"
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-neutral-200 hover:border-purple-300 hover:bg-purple-50 transition"
            >
              <Palette className="w-8 h-8 text-purple-600" />
              <span className="text-sm font-medium text-neutral-700">Manage Themes</span>
            </Link>
            <Link
              to="/superadmin/admins"
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-neutral-200 hover:border-green-300 hover:bg-green-50 transition"
            >
              <UserCog className="w-8 h-8 text-green-600" />
              <span className="text-sm font-medium text-neutral-700">Manage Admins</span>
            </Link>
            <Link
              to="/superadmin/stats"
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-neutral-200 hover:border-orange-300 hover:bg-orange-50 transition"
            >
              <BarChart3 className="w-8 h-8 text-orange-600" />
              <span className="text-sm font-medium text-neutral-700">System Stats</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
