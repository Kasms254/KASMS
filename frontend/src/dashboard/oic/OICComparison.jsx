import React, { useState, useEffect, useCallback } from 'react'
import * as Icons from 'lucide-react'
import { getOICComparisonPerformance, getOICComparisonAttendance } from '../../lib/api'
import useToast from '../../hooks/useToast'
import EmptyState from '../../components/EmptyState'

function PctBar({ value, colorClass = 'bg-fill-indigo-500', label }) {
  const pct = Math.min(parseFloat(value) || 0, 100)
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-surface-2 rounded-full h-5 overflow-hidden relative">
        <div
          className={`${colorClass} h-5 rounded-full transition-all duration-500 flex items-center`}
          style={{ width: `${pct}%`, minWidth: pct > 0 ? '2rem' : 0 }}
        >
          {pct > 8 && (
            <span className="text-[10px] text-white font-medium px-2">{pct.toFixed(1)}%</span>
          )}
        </div>
        {pct <= 8 && (
          <span className="absolute right-2 top-0 h-5 flex items-center text-[10px] text-fg-soft">{pct.toFixed(1)}%</span>
        )}
      </div>
      {label && <span className="text-xs text-fg-soft w-10 text-right flex-shrink-0">{pct.toFixed(0)}%</span>}
    </div>
  )
}

export default function OICComparison() {
  const toast = useToast()
  const [tab, setTab] = useState('performance')

  const [perfData, setPerfData] = useState(null)
  const [attendData, setAttendData] = useState(null)
  const [loading, setLoading] = useState(false)

  const reportError = useCallback((msg) => {
    if (!msg) return
    if (toast?.error) return toast.error(msg)
    if (toast?.showToast) return toast.showToast(msg, { type: 'error' })
  }, [toast])

  useEffect(() => {
    if (tab === 'performance' && !perfData) {
      setLoading(true)
      getOICComparisonPerformance()
        .then(d => setPerfData(d))
        .catch(err => reportError(err?.message || 'Failed to load performance data'))
        .finally(() => setLoading(false))
    }
    if (tab === 'attendance' && !attendData) {
      setLoading(true)
      getOICComparisonAttendance()
        .then(d => setAttendData(d))
        .catch(err => reportError(err?.message || 'Failed to load attendance data'))
        .finally(() => setLoading(false))
    }
  }, [tab, perfData, attendData, reportError])

  const perfClasses = perfData?.classes || []
  const attendClasses = attendData?.classes || []

  // Determine max value for relative bar scaling
  const maxPerf = perfClasses.reduce((m, c) => Math.max(m, c.average_percentage || 0), 0)
  const maxAttend = attendClasses.reduce((m, c) => Math.max(m, c.attendance_rate || 0), 0)

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-lg sm:text-xl font-semibold text-fg">Class Comparison</h2>
        <p className="text-xs sm:text-sm text-fg-soft mt-1">Compare performance and attendance across your assigned classes.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-line">
        {[
          { key: 'performance', label: 'Exam Performance', icon: 'BarChart2' },
          { key: 'attendance', label: 'Attendance', icon: 'UserCheck' },
        ].map(t => {
          const Icon = Icons[t.icon]
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap transition border-b-2 -mb-px ${
                tab === t.key ? 'border-edge-indigo-600 text-mark-indigo-600' : 'border-transparent text-fg-soft hover:text-fg'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="bg-surface rounded-xl border border-line p-6">
          <EmptyState icon="Loader2" title="Loading comparison data..." variant="minimal" />
        </div>
      ) : (
        <>
          {/* PERFORMANCE TAB */}
          {tab === 'performance' && (
            <>
              {perfClasses.length === 0 ? (
                <div className="bg-surface rounded-xl border border-line p-6">
                  <EmptyState icon="BarChart2" title="No performance data" description="Exam results are not yet available for your classes." variant="minimal" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-surface rounded-xl border border-line p-3">
                      <div className="text-xs text-fg-soft">Total Classes</div>
                      <div className="text-2xl font-semibold text-fg mt-1">{perfData?.total_classes ?? perfClasses.length}</div>
                    </div>
                    <div className="bg-surface rounded-xl border border-line p-3">
                      <div className="text-xs text-fg-soft">Best Avg Score</div>
                      <div className="text-2xl font-semibold text-mark-emerald-600 mt-1">
                        {maxPerf > 0 ? `${maxPerf.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    <div className="bg-surface rounded-xl border border-line p-3">
                      <div className="text-xs text-fg-soft">Overall Avg</div>
                      <div className="text-2xl font-semibold text-mark-indigo-600 mt-1">
                        {perfClasses.length > 0
                          ? `${(perfClasses.reduce((s, c) => s + (c.average_percentage || 0), 0) / perfClasses.length).toFixed(1)}%`
                          : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Bar chart */}
                  <div className="bg-surface rounded-xl border border-line p-4">
                    <h3 className="text-sm font-semibold text-fg mb-4">Average Score by Class</h3>
                    <div className="space-y-4">
                      {[...perfClasses].sort((a, b) => (b.average_percentage || 0) - (a.average_percentage || 0)).map((c, i) => (
                        <div key={c.class_id || i}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="min-w-0">
                              <span className="text-xs font-medium text-fg truncate block">{c.class_name}</span>
                              <span className="text-[10px] text-fg-faint">{c.course_name || ''} · {c.enrolled_students ?? c.total_results ?? 0} students</span>
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              <span className={`text-xs font-semibold ${(c.pass_rate || 0) >= 50 ? 'text-mark-emerald-600' : 'text-mark-red-600'}`}>
                                {c.pass_rate != null ? `${c.pass_rate}% pass` : ''}
                              </span>
                            </div>
                          </div>
                          <PctBar
                            value={c.average_percentage}
                            colorClass={(c.average_percentage || 0) >= 75 ? 'bg-fill-emerald-500' : (c.average_percentage || 0) >= 50 ? 'bg-fill-indigo-500' : 'bg-fill-red-400'}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Table */}
                  <div className="bg-surface rounded-xl border border-line overflow-hidden">
                    <div className="px-4 py-3 border-b border-hair">
                      <span className="text-sm font-medium text-fg">Detailed Breakdown</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-canvas">
                          <tr>
                            {['Class', 'Course', 'Students', 'Results', 'Avg %', 'Pass Rate'].map(h => (
                              <th key={h} className="text-left px-4 py-2 text-xs font-medium text-fg-soft">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-hair">
                          {perfClasses.map((c, i) => (
                            <tr key={c.class_id || i} className="hover:bg-canvas transition">
                              <td className="px-4 py-2 font-medium text-fg">{c.class_name}</td>
                              <td className="px-4 py-2 text-fg-soft">{c.course_name || '—'}</td>
                              <td className="px-4 py-2 text-fg-muted">{c.enrolled_students ?? '—'}</td>
                              <td className="px-4 py-2 text-fg-muted">{c.total_results ?? '—'}</td>
                              <td className="px-4 py-2">
                                <span className={`text-sm font-semibold ${(c.average_percentage || 0) >= 50 ? 'text-mark-green-600' : 'text-mark-red-600'}`}>
                                  {c.average_percentage != null ? `${c.average_percentage}%` : '—'}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                <span className={`text-sm font-semibold ${(c.pass_rate || 0) >= 50 ? 'text-mark-green-600' : 'text-mark-red-600'}`}>
                                  {c.pass_rate != null ? `${c.pass_rate}%` : '—'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ATTENDANCE TAB */}
          {tab === 'attendance' && (
            <>
              {attendClasses.length === 0 ? (
                <div className="bg-surface rounded-xl border border-line p-6">
                  <EmptyState icon="UserCheck" title="No attendance data" description="Attendance sessions are not yet recorded for your classes." variant="minimal" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-surface rounded-xl border border-line p-3">
                      <div className="text-xs text-fg-soft">Total Classes</div>
                      <div className="text-2xl font-semibold text-fg mt-1">{attendData?.total_classes ?? attendClasses.length}</div>
                    </div>
                    <div className="bg-surface rounded-xl border border-line p-3">
                      <div className="text-xs text-fg-soft">Best Attendance</div>
                      <div className="text-2xl font-semibold text-mark-emerald-600 mt-1">
                        {maxAttend > 0 ? `${maxAttend.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    <div className="bg-surface rounded-xl border border-line p-3">
                      <div className="text-xs text-fg-soft">Overall Avg</div>
                      <div className="text-2xl font-semibold text-mark-indigo-600 mt-1">
                        {attendClasses.length > 0
                          ? `${(attendClasses.reduce((s, c) => s + (c.attendance_rate || 0), 0) / attendClasses.length).toFixed(1)}%`
                          : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Bar chart */}
                  <div className="bg-surface rounded-xl border border-line p-4">
                    <h3 className="text-sm font-semibold text-fg mb-4">Attendance Rate by Class</h3>
                    <div className="space-y-4">
                      {[...attendClasses].sort((a, b) => (b.attendance_rate || 0) - (a.attendance_rate || 0)).map((c, i) => (
                        <div key={c.class_id || i}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="min-w-0">
                              <span className="text-xs font-medium text-fg truncate block">{c.class_name}</span>
                              <span className="text-[10px] text-fg-faint">{c.course_name || ''} · {c.enrolled_students ?? 0} students · {c.total_sessions ?? 0} sessions</span>
                            </div>
                          </div>
                          <PctBar
                            value={c.attendance_rate}
                            colorClass={(c.attendance_rate || 0) >= 75 ? 'bg-fill-emerald-500' : (c.attendance_rate || 0) >= 50 ? 'bg-fill-amber-400' : 'bg-fill-red-400'}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Table */}
                  <div className="bg-surface rounded-xl border border-line overflow-hidden">
                    <div className="px-4 py-3 border-b border-hair">
                      <span className="text-sm font-medium text-fg">Detailed Breakdown</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-canvas">
                          <tr>
                            {['Class', 'Course', 'Students', 'Sessions', 'Attendance Rate'].map(h => (
                              <th key={h} className="text-left px-4 py-2 text-xs font-medium text-fg-soft">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-hair">
                          {attendClasses.map((c, i) => (
                            <tr key={c.class_id || i} className="hover:bg-canvas transition">
                              <td className="px-4 py-2 font-medium text-fg">{c.class_name}</td>
                              <td className="px-4 py-2 text-fg-soft">{c.course_name || '—'}</td>
                              <td className="px-4 py-2 text-fg-muted">{c.enrolled_students ?? '—'}</td>
                              <td className="px-4 py-2 text-fg-muted">{c.total_sessions ?? '—'}</td>
                              <td className="px-4 py-2">
                                <span className={`text-sm font-semibold ${(c.attendance_rate || 0) >= 75 ? 'text-mark-green-600' : (c.attendance_rate || 0) >= 50 ? 'text-mark-amber-600' : 'text-mark-red-600'}`}>
                                  {c.attendance_rate != null ? `${c.attendance_rate}%` : '—'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
