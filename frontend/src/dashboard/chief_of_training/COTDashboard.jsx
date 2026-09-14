import { Link } from 'react-router'
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

function StatCard({ label, description, value}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-5 flex items-start gap-4 hover:shadow-md transition-shadow">
      <div className="rounded-lg p-2.5 shrink-0" style={{ backgroundColor: MAROON_LIGHT }}>
        <Icon size={22} style={{ color: MAROON }} />
      </div>
      <div className="min-w-0">
        <div className="text-3xl font-bold text-fg">{value ?? 0}</div>
        <div className="text-sm font-semibold text-fg-body mt-0.5">{label}</div>
        {description && <div className="text-xs text-fg-faint mt-0.5">{description}</div>}
      </div>
    </div>
  )
}

const STATUS_CONFIG = {
  submitted: { label: 'SUBMITTED', bg: 'bg-fill-amber-50', text: 'text-mark-amber-700', border: 'border-edge-amber-200' },
  reviewed:  { label: 'REVIEWED',  bg: 'bg-fill-emerald-50', text: 'text-mark-emerald-700', border: 'border-edge-emerald-200' },
  archived:  { label: 'ARCHIVED',  bg: 'bg-surface-2',   text: 'text-fg-soft',   border: 'border-line' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, bg: 'bg-surface-2', text: 'text-fg-muted', border: 'border-line' }
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
    <div className="p-6 text-mark-red-700 bg-fill-red-50 border border-edge-red-200 rounded-xl">
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
          <h1 className="text-2xl font-bold text-fg">Chief of Training Dashboard</h1>
          <p className="text-sm text-fg-soft mt-1">
            Overview of school reports across all institutions
          </p>
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
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-hair">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} style={{ color: MAROON }} />
              <h2 className="font-semibold text-fg">Recent Submissions</h2>
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
            <div className="flex flex-col items-center justify-center py-12 text-fg-faint">
              <FileText size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No submitted reports yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-hair">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/cot/reports/${r.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-canvas transition-colors"
                  >
                    <SchoolAvatar name={r.school_name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg truncate">{r.title}</p>
                      <p className="text-xs text-fg-soft mt-0.5">
                        {r.school_name}
                        {r.school_code && <span className="text-fg-faint"> ({r.school_code})</span>}
                      </p>
                      <p className="text-xs text-fg-faint">
                        {formatDate(r.reporting_period_start)} – {formatDate(r.reporting_period_end)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusBadge status={r.status} />
                      <p className="text-xs text-fg-faint mt-1">{formatDate(r.submitted_at)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Reports by School */}
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-hair">
            <Building2 size={16} style={{ color: MAROON }} />
            <h2 className="font-semibold text-fg">Reports by School</h2>
          </div>

          {bySchool.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-fg-faint">
              <Building2 size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No school data available</p>
            </div>
          ) : (
            <ul className="divide-y divide-hair">
              {bySchool.map((s) => (
                <li
                  key={s.school_code}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-canvas transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <SchoolAvatar name={s.school_name} />
                    <div>
                      <p className="text-sm font-semibold text-fg">{s.school_name}</p>
                      <p className="text-xs text-fg-faint">{s.school_code}</p>
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
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-hair">
          <BarChart3 size={16} style={{ color: MAROON }} />
          <h2 className="font-semibold text-fg">Reporting Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas text-xs text-fg-soft uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-semibold">Metric</th>
                <th className="text-right px-5 py-3 font-semibold">Total</th>
                <th className="text-right px-5 py-3 font-semibold">Submitted</th>
                <th className="text-right px-5 py-3 font-semibold">Reviewed</th>
                <th className="text-right px-5 py-3 font-semibold">Archived</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">
              <tr className="hover:bg-canvas">
                <td className="px-5 py-3.5 font-medium text-fg">School Reports</td>
                <td className="px-5 py-3.5 text-right font-bold text-fg">{total}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-mark-amber-700">{byStatus.submitted ?? 0}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-mark-emerald-700">{byStatus.reviewed ?? 0}</td>
                <td className="px-5 py-3.5 text-right font-semibold text-fg-soft">{byStatus.archived ?? 0}</td>
              </tr>
              <tr className="hover:bg-canvas">
                <td className="px-5 py-3.5 font-medium text-fg">Schools Reporting</td>
                <td className="px-5 py-3.5 text-right font-bold text-fg">{bySchool.length}</td>
                <td className="px-5 py-3.5 text-right text-fg-faint" colSpan={3}>
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
