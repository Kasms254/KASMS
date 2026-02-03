import React, { useState, useEffect } from 'react'
import { Users, UserCheck, UserX, TrendingUp } from 'lucide-react'
import * as api from '../../lib/api'

export default function SystemStats() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadStats() {
      setLoading(true)
      setError(null)
      try {
        const data = await api.getUserStats()
        setStats(data)
      } catch (err) {
        console.error('Failed to load system stats:', err)
        setError(err.message || 'Failed to load stats')
      } finally {
        setLoading(false)
      }
    }
    loadStats()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Error: {error}</p>
      </div>
    )
  }

  const roles = [
    { key: 'admins', label: 'Admins', color: 'bg-indigo-500', lightBg: 'bg-indigo-50', textColor: 'text-indigo-700' },
    { key: 'instructors', label: 'Instructors', color: 'bg-blue-500', lightBg: 'bg-blue-50', textColor: 'text-blue-700' },
    { key: 'students', label: 'Students', color: 'bg-emerald-500', lightBg: 'bg-emerald-50', textColor: 'text-emerald-700' },
    { key: 'commandants', label: 'Commandants', color: 'bg-purple-500', lightBg: 'bg-purple-50', textColor: 'text-purple-700' },
  ]

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-black">System Statistics</h2>
          <p className="text-sm text-gray-500">User breakdown across all schools</p>
        </div>
      </header>

      {/* Overall Stats */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-600">Total Users</p>
              <p className="text-3xl font-bold text-black mt-2">{stats?.total_users ?? 0}</p>
            </div>
            <div className="bg-indigo-600 p-3 rounded-lg">
              <Users className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-600">Active Users</p>
              <p className="text-3xl font-bold text-black mt-2">{stats?.active_users ?? 0}</p>
            </div>
            <div className="bg-green-600 p-3 rounded-lg">
              <UserCheck className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-600">Inactive Users</p>
              <p className="text-3xl font-bold text-black mt-2">{(stats?.total_users ?? 0) - (stats?.active_users ?? 0)}</p>
            </div>
            <div className="bg-red-600 p-3 rounded-lg">
              <UserX className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </section>

      {/* By Role Breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h3 className="text-lg font-semibold text-black mb-6">Users by Role</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {roles.map((role) => (
            <div key={role.key} className={`rounded-lg p-4 ${role.lightBg}`}>
              <p className="text-sm font-medium text-gray-600 mb-4">{role.label}</p>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${role.textColor}`}>Total</span>
                    <span className="text-lg font-bold text-black">{stats?.by_role?.[role.key] ?? 0}</span>
                  </div>
                  <div className={`h-2 ${role.color} rounded-full opacity-30`}></div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${role.textColor}`}>Active</span>
                    <span className="text-lg font-bold text-black">{stats?.active_by_role?.[role.key] ?? 0}</span>
                  </div>
                  <div className={`h-2 ${role.color} rounded-full`}></div>
                </div>
                {stats?.by_role?.[role.key] > 0 && (
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${role.textColor}`}>Active Rate</span>
                      <span className={`text-xs font-semibold ${role.textColor}`}>
                        {Math.round((stats?.active_by_role?.[role.key] ?? 0) / (stats?.by_role?.[role.key] ?? 1) * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 mt-6 overflow-hidden">
        <div className="p-6 border-b border-neutral-200">
          <h3 className="text-lg font-semibold text-black">Detailed Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Role</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Total Users</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Active</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Inactive</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Active %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {roles.map((role) => {
                const total = stats?.by_role?.[role.key] ?? 0
                const active = stats?.active_by_role?.[role.key] ?? 0
                const inactive = total - active
                const activePercent = total > 0 ? Math.round((active / total) * 100) : 0

                return (
                  <tr key={role.key} className="hover:bg-neutral-50 transition">
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${role.lightBg} ${role.textColor}`}>
                        {role.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-black">{total}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-green-700">{active}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-red-700">{inactive}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-neutral-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${role.color}`}
                            style={{ width: `${activePercent}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-semibold text-black whitespace-nowrap">{activePercent}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
