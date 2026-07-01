import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  FileText, Building2, Send, Eye, Archive, Loader,
  TrendingUp, Calendar, ArrowRight, BarChart3,
} from 'lucide-react'
import { getCOTDashboard } from '../../lib/api'

const MAROON = '#7B1A1A'
const MAROON_LIGHT = '#f9f0f0'

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function StatCard({ label, description, value, icon: Icon }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-4 hover:shadow-md transition-shadow">
      <div className="rounded-lg p-2.5 shrink-0" style={{ backgroundColor: MAROON_LIGHT }}>
        <Icon size={22} style={{ color: MAROON }} />
      </div>
      <div className="min-w-0">
        <div className="text-3xl font-bold text-gray-900">{value ?? 0}</div>
        <div className="text-sm font-semibold text-gray-700 mt-0.5">{label}</div>
        {description && <div className="text-xs text-gray-400 mt-0.5">{description}</div>}
      </div>
    </div>
  )
}

const STATUS_CONFIG = {
  submitted: { label: 'SUBMITTED', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  reviewed:  { label: 'REVIEWED',  bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  archived:  { label: 'ARCHIVED',  bg: 'bg-gray-100',   text: 'text-gray-500',   border: 'border-gray-200' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-wide border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  )
}

function SchoolAvatar({ name }) {
  return (
    <div
      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
      style={{ backgroundColor: MAROON }}
    >
      {(name || 'S').charAt(0).toUpperCase()}
    </div>
  )
}

export default function COTDashboard() {
  const { data, isPending, error } = useQuery({
    queryKey: ['cot-dashboard'],
    queryFn: getCOTDashboard,
    staleTime: 3 * 60 * 1000,
  })

  if (isPending) return (
    <div className="flex items-center justify-center py-24">
      <Loader className="animate-spin" size={32} style={{ color: MAROON }} />
    </div>
  )

  if (error) return (
    <div className="p-6 text-red-700 bg-red-50 border border-red-200 rounded-xl">
      Failed to load dashboard: {error.message}
    </div>
  )

  const byStatus = data?.by_status || {}
  const bySchool = data?.by_school || []
  const recent = data?.recent_submissions || []
  const total = data?.total_reports ?? 0

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chief of Training Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Overview of school reports across all institutions
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 bg-white border border-gray-200 rounded-lg px-3 py-2">
          <Calendar size={13} />
          <span>All time</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Reports"
          description="All time reports"
          value={total}
          icon={FileText}
        />
        <StatCard
          label="Submitted"
          description="Reports submitted"
          value={byStatus.submitted ?? 0}
          icon={Send}
        />
        <StatCard
          label="Reviewed"
          description="Reports reviewed"
          value={byStatus.reviewed ?? 0}
          icon={Eye}
        />
        <StatCard
          label="Archived"
          description="Reports archived"
          value={byStatus.archived ?? 0}
          icon={Archive}
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Submissions */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} style={{ color: MAROON }} />
              <h2 className="font-semibold text-gray-900">Recent Submissions</h2>
            </div>
            <Link
              to="/cot/reports"
              className="flex items-center gap-1 text-xs font-medium hover:underline"
              style={{ color: MAROON }}
            >
              View all reports <ArrowRight size={12} />
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <FileText size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No submitted reports yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/cot/reports/${r.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <SchoolAvatar name={r.school_name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{r.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {r.school_name}
                        {r.school_code && <span className="text-gray-400"> ({r.school_code})</span>}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDate(r.reporting_period_start)} – {formatDate(r.reporting_period_end)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusBadge status={r.status} />
                      <p className="text-xs text-gray-400 mt-1">{formatDate(r.submitted_at)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Reports by School */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <Building2 size={16} style={{ color: MAROON }} />
            <h2 className="font-semibold text-gray-900">Reports by School</h2>
          </div>

          {bySchool.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Building2 size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No school data available</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {bySchool.map((s) => (
                <li
                  key={s.school_code}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <SchoolAvatar name={s.school_name} />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{s.school_name}</p>
                      <p className="text-xs text-gray-400">{s.school_code}</p>
                    </div>
                  </div>
                  <span
                    className="text-sm font-bold px-3 py-1 rounded-full"
                    style={{ backgroundColor: MAROON_LIGHT, color: MAROON }}
                  >
                    {s.report_count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Reporting Summary */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <BarChart3 size={16} style={{ color: MAROON }} />
          <h2 className="font-semibold text-gray-900">Reporting Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-semibold">Metric</th>
                <th className="text-right px-5 py-3 font-semibold">Total</th>
                <th className="text-right px-5 py-3 font-semibold">Submitted</th>
                <th className="text-right px-5 py-3 font-semibold">Reviewed</th>
                <th className="text-right px-5 py-3 font-semibold">Archived</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <tr className="hover:bg-gray-50">
                <td className="px-5 py-3.5 font-medium text-gray-800">School Reports</td>
                <td className="px-5 py-3.5 text-right font-bold text-gray-900">{total}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-amber-700">{byStatus.submitted ?? 0}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-emerald-700">{byStatus.reviewed ?? 0}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-gray-500">{byStatus.archived ?? 0}</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="px-5 py-3.5 font-medium text-gray-800">Schools Reporting</td>
                <td className="px-5 py-3.5 text-right font-bold text-gray-900">{bySchool.length}</td>
                <td className="px-5 py-3.5 text-right text-gray-400" colSpan={3}>
                  <span className="text-xs">
                    {bySchool.map(s => s.school_name).join(', ') || '—'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
