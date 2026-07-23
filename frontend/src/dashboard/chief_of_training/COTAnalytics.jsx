import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LabelList, AreaChart, Area,
} from 'recharts'
import {
  Building2, BookOpen, GraduationCap, Users, Loader, PlayCircle,
  Gauge, BarChart3, Layers, TrendingUp, Trophy, ArrowRightLeft,
} from 'lucide-react'
import { getCOTAnalytics } from '../../lib/api'

const MAROON = '#7B1A1A'
const MAROON_LIGHT = '#f9f0f0'

// Validated categorical palette (dataviz skill) — each school keeps its hue
// across every chart on the page, so identity never depends on position.
const SCHOOL_COLORS = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
]
const OTHER_COLOR = '#9ca3af'

function perfColor(pct) {
  if (pct == null) return '#9ca3af'
  if (pct >= 76) return '#059669'
  if (pct >= 50) return '#d97706'
  return '#dc2626'
}

function perfTextClass(pct) {
  if (pct == null) return 'text-gray-400'
  if (pct >= 76) return 'text-emerald-600'
  if (pct >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function fmt(n) {
  return (n ?? 0).toLocaleString()
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Accepts 'YYYY-MM' (or a fuller ISO date/datetime) and formats it as e.g.
// "Aug 25" without touching the Date/Intl machinery, so it can never render
// "Invalid Date".
function monthLabel(ym) {
  if (typeof ym !== 'string') return ''
  const parts = ym.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  if (!year || !month || month < 1 || month > 12) return ym
  return `${MONTH_NAMES[month - 1]} ${String(year).slice(-2)}`
}

/* ── Small building blocks ─────────────────────────────────────────────── */

function KpiCard({ label, value, sub, icon: Icon }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3 hover:shadow-md transition-shadow">
      <div className="rounded-lg p-2 shrink-0" style={{ backgroundColor: MAROON_LIGHT }}>
        <Icon size={20} style={{ color: MAROON }} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-gray-900 leading-tight">{value}</div>
        <div className="text-xs font-semibold text-gray-700 mt-0.5">{label}</div>
        {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

function SectionCard({ title, description, icon: Icon, actions, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-4 border-b border-gray-100">
        <div className="flex items-start gap-2">
          {Icon && <Icon size={16} className="mt-0.5 shrink-0" style={{ color: MAROON }} />}
          <div>
            <h2 className="font-semibold text-gray-900 leading-tight">{title}</h2>
            {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
          </div>
        </div>
        {actions}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="flex rounded-lg border border-gray-300 overflow-hidden bg-white shrink-0 self-start">
      {options.map((o, i) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${i > 0 ? 'border-l border-gray-300' : ''} ${
            value === o.value ? 'text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
          style={value === o.value ? { backgroundColor: MAROON } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── Tooltips ──────────────────────────────────────────────────────────── */

function SchoolTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[180px]">
      <p className="font-bold text-gray-900 text-sm">{d.school_name}</p>
      {d.school_code && <p className="text-[11px] text-gray-400 mb-2">{d.school_code}</p>}
      <div className="flex justify-between items-center gap-6 text-xs">
        <span className="text-gray-500">{payload[0].name}</span>
        <span className="font-bold text-gray-900">
          {unit === '%' ? (d._value == null ? '—' : `${d._value}%`) : fmt(d._value)}
        </span>
      </div>
    </div>
  )
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3">
      <p className="font-bold text-gray-900 text-sm">{monthLabel(label)}</p>
      <p className="text-xs text-gray-500 mt-1">
        <span className="font-bold" style={{ color: MAROON }}>{fmt(payload[0].value)}</span> graduates
      </p>
    </div>
  )
}

/* ── Per-school output chart ───────────────────────────────────────────── */

const SCHOOL_METRICS = [
  { value: 'active_students', label: 'Students', unit: '', domainMax: null },
  { value: 'courses', label: 'Courses', unit: '', domainMax: null },
  { value: 'running_classes', label: 'Running', unit: '', domainMax: null },
  { value: 'avg_performance', label: 'Avg %', unit: '%', domainMax: 100 },
]

function OutputBySchool({ schools, colorMap }) {
  const [metric, setMetric] = useState('active_students')
  const cfg = SCHOOL_METRICS.find(m => m.value === metric)

  const data = useMemo(() => (
    [...schools]
      .map(s => ({ ...s, _value: s[metric] }))
      .sort((a, b) => (b._value ?? -1) - (a._value ?? -1))
  ), [schools, metric])

  const height = Math.max(220, data.length * 46)

  return (
    <SectionCard
      title="Output by School"
      description="Compare training throughput and performance across schools"
      icon={BarChart3}
      actions={<Segmented options={SCHOOL_METRICS} value={metric} onChange={setMetric} />}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 4 }} barSize={26}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
          <XAxis
            type="number"
            domain={cfg.domainMax ? [0, cfg.domainMax] : [0, 'dataMax']}
            tickFormatter={v => (cfg.unit === '%' ? `${v}%` : v)}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            type="category" dataKey="school_name" width={130}
            tick={{ fontSize: 12, fill: '#374151', fontWeight: 500 }}
            axisLine={false} tickLine={false}
            tickFormatter={v => (v?.length > 18 ? v.slice(0, 17) + '…' : v)}
          />
          <Tooltip content={<SchoolTooltip unit={cfg.unit} />} cursor={{ fill: 'rgba(123,26,26,0.05)' }} />
          <Bar dataKey="_value" name={cfg.label} radius={[0, 5, 5, 0]} background={{ fill: '#f9fafb', radius: [0, 5, 5, 0] }}>
            {data.map(s => (
              <Cell
                key={s.school_id}
                fill={cfg.unit === '%' ? perfColor(s._value) : (colorMap[s.school_code] || OTHER_COLOR)}
              />
            ))}
            <LabelList
              dataKey="_value"
              position="right"
              formatter={v => (v == null ? '—' : cfg.unit === '%' ? `${v}%` : fmt(v))}
              style={{ fontSize: 12, fontWeight: 700, fill: '#374151' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </SectionCard>
  )
}

/* ── Cross-school course comparison ────────────────────────────────────── */

function CourseComparison({ courses, colorMap }) {
  const [metric, setMetric] = useState('students')
  const comparable = useMemo(() => courses.filter(c => c.multi_school), [courses])
  const list = comparable.length ? comparable : courses
  const [selected, setSelected] = useState(list[0]?.course ?? null)

  const course = list.find(c => c.course === selected) || list[0]
  const unit = metric === 'students' ? '' : '%'

  const data = useMemo(() => {
    if (!course) return []
    return [...course.schools]
      .map(s => ({ ...s, _value: metric === 'students' ? s.students : s.avg_performance }))
      .sort((a, b) => (b._value ?? -1) - (a._value ?? -1))
  }, [course, metric])

  if (!course) {
    return (
      <SectionCard title="Course Comparison Across Schools" icon={ArrowRightLeft}>
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <ArrowRightLeft size={30} className="mb-2 opacity-30" />
          <p className="text-sm">No course data available yet.</p>
        </div>
      </SectionCard>
    )
  }

  const height = Math.max(200, data.length * 44)

  return (
    <SectionCard
      title="Course Comparison Across Schools"
      description={comparable.length
        ? 'The same course, compared side-by-side wherever it is taught'
        : 'No course is currently shared across schools — showing all courses'}
      icon={ArrowRightLeft}
      actions={(
        <Segmented
          options={[{ value: 'students', label: 'Enrollment' }, { value: 'performance', label: 'Avg %' }]}
          value={metric}
          onChange={setMetric}
        />
      )}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,15rem)_1fr] gap-4">
        {/* Course selector */}
        <div className="border border-gray-100 rounded-lg overflow-hidden max-h-[340px] overflow-y-auto">
          <ul className="divide-y divide-gray-50">
            {list.map(c => {
              const isSel = c.course === course.course
              return (
                <li key={c.course}>
                  <button
                    onClick={() => setSelected(c.course)}
                    className={`w-full text-left px-3 py-2.5 transition-colors ${isSel ? '' : 'hover:bg-gray-50'}`}
                    style={isSel ? { backgroundColor: MAROON_LIGHT } : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-semibold truncate ${isSel ? '' : 'text-gray-800'}`}
                        style={isSel ? { color: MAROON } : undefined}>
                        {c.course}
                      </span>
                      {c.multi_school && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ backgroundColor: MAROON_LIGHT, color: MAROON }}>
                          {c.school_count} schools
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{fmt(c.total_students)} students</div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Selected course chart */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{course.course}</p>
              <p className="text-[11px] text-gray-400">
                {fmt(course.total_students)} students · {course.school_count} {course.school_count === 1 ? 'school' : 'schools'}
                {course.avg_performance != null && <> · avg {course.avg_performance}%</>}
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, left: 4, bottom: 4 }} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
              <XAxis
                type="number"
                domain={metric === 'performance' ? [0, 100] : [0, 'dataMax']}
                tickFormatter={v => (unit === '%' ? `${v}%` : v)}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                type="category" dataKey="school_name" width={130}
                tick={{ fontSize: 12, fill: '#374151', fontWeight: 500 }}
                axisLine={false} tickLine={false}
                tickFormatter={v => (v?.length > 18 ? v.slice(0, 17) + '…' : v)}
              />
              <Tooltip content={<SchoolTooltip unit={unit} />} cursor={{ fill: 'rgba(123,26,26,0.05)' }} />
              <Bar dataKey="_value" name={metric === 'students' ? 'Enrollment' : 'Avg %'} radius={[0, 5, 5, 0]} background={{ fill: '#f9fafb', radius: [0, 5, 5, 0] }}>
                {data.map(s => (
                  <Cell
                    key={s.school_code}
                    fill={metric === 'performance' ? perfColor(s._value) : (colorMap[s.school_code] || OTHER_COLOR)}
                  />
                ))}
                <LabelList
                  dataKey="_value"
                  position="right"
                  formatter={v => (v == null ? '—' : unit === '%' ? `${v}%` : fmt(v))}
                  style={{ fontSize: 12, fontWeight: 700, fill: '#374151' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </SectionCard>
  )
}

/* ── Top courses by enrollment ─────────────────────────────────────────── */

function TopCourses({ courses, colorMap }) {
  const data = useMemo(() => (
    [...courses]
      .sort((a, b) => b.total_students - a.total_students)
      .slice(0, 8)
  ), [courses])

  const max = Math.max(1, ...data.map(c => c.total_students))

  return (
    <SectionCard
      title="Top Courses by Enrollment"
      description="Largest training outputs system-wide, broken down by school"
      icon={Trophy}
    >
      <ul className="space-y-4">
        {data.map((c, idx) => {
          const schools = [...c.schools].sort((a, b) => b.students - a.students)
          return (
            <li key={c.course}>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-gray-300 w-4 text-right shrink-0 [font-variant-numeric:tabular-nums]">{idx + 1}</span>
                  <span className="text-sm font-semibold text-gray-800 truncate">{c.course}</span>
                  {c.multi_school && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: MAROON_LIGHT, color: MAROON }}>
                      {c.school_count} schools
                    </span>
                  )}
                </div>
                <span className="text-sm font-bold text-gray-900 shrink-0 [font-variant-numeric:tabular-nums]">{fmt(c.total_students)}</span>
              </div>

              {/* Proportional bar segmented by school (each school in its colour) */}
              <div className="ml-6">
                <div
                  className="flex h-2.5 rounded-full overflow-hidden bg-gray-100"
                  style={{ width: `${Math.max((c.total_students / max) * 100, 8)}%` }}
                >
                  {schools.map(s => (
                    <div
                      key={s.school_code}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{ flexGrow: Math.max(s.students, 0.001), backgroundColor: colorMap[s.school_code] || OTHER_COLOR, outline: '1px solid #fff' }}
                      title={`${s.school_name}: ${fmt(s.students)}`}
                    />
                  ))}
                </div>

                {/* Labelled school chips — schools shown explicitly, not by colour alone */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                  {schools.map(s => (
                    <span key={s.school_code} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorMap[s.school_code] || OTHER_COLOR }} />
                      <span className="font-medium">{s.school_name}</span>
                      <span className="text-gray-400">· {fmt(s.students)}</span>
                    </span>
                  ))}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}

/* ── Graduate output trend ─────────────────────────────────────────────── */

function OutputTrend({ trend }) {
  const total = trend.reduce((s, t) => s + t.graduates, 0)
  return (
    <SectionCard
      title="Graduate Output Trend"
      description={`${fmt(total)} graduates over the last 12 months`}
      icon={TrendingUp}
    >
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={trend} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
          <defs>
            <linearGradient id="gradOutput" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={MAROON} stopOpacity={0.28} />
              <stop offset="100%" stopColor={MAROON} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<TrendTooltip />} />
          <Area type="monotone" dataKey="graduates" stroke={MAROON} strokeWidth={2} fill="url(#gradOutput)" dot={{ r: 3, fill: MAROON }} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </SectionCard>
  )
}

/* ── School breakdown table (the accessible table view) ────────────────── */

function SchoolTable({ schools, colorMap }) {
  const cols = ['School', 'Courses', 'Students', 'Instructors', 'Running', 'Completed', 'Graduates', 'Avg %']
  return (
    <SectionCard title="School Breakdown" description="Full figures behind the charts" icon={Layers}>
      <div className="overflow-x-auto -mx-4 sm:-mx-5">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <th className="text-left px-4 py-3 font-semibold">{cols[0]}</th>
              {cols.slice(1).map(c => (
                <th key={c} className="text-right px-4 py-3 font-semibold whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 [font-variant-numeric:tabular-nums]">
            {schools.map(s => (
              <tr key={s.school_id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorMap[s.school_code] || OTHER_COLOR }} />
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{s.school_name}</div>
                      <div className="text-[11px] text-gray-400">{s.school_code}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-gray-700">{fmt(s.courses)}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(s.active_students)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{fmt(s.instructors)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{fmt(s.running_classes)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{fmt(s.completed_classes)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{fmt(s.graduates)}</td>
                <td className={`px-4 py-3 text-right font-semibold ${perfTextClass(s.avg_performance)}`}>
                  {s.avg_performance == null ? '—' : `${s.avg_performance}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function COTAnalytics() {
  const { data, isPending, error } = useQuery({
    queryKey: ['cot-analytics'],
    queryFn: getCOTAnalytics,
    staleTime: 3 * 60 * 1000,
  })

  const bySchool = data?.by_school || []
  const overview = data?.overview || {}
  const courses = data?.course_comparison || []
  const trend = data?.output_trend || []

  // Assign each school a stable colour, reused across every chart.
  const colorMap = useMemo(() => {
    const map = {}
    ;(data?.by_school || []).forEach((s, i) => { map[s.school_code] = SCHOOL_COLORS[i] || OTHER_COLOR })
    return map
  }, [data])

  if (isPending) return (
    <div className="flex items-center justify-center py-24">
      <Loader className="animate-spin" size={32} style={{ color: MAROON }} />
    </div>
  )

  if (error) return (
    <div className="p-6 text-red-700 bg-red-50 border border-red-200 rounded-xl">
      Failed to load analytics: {error.message}
    </div>
  )

  const hasData = bySchool.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Training Output Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Consumption of output across all schools enrollment, throughput, and course performance.
          </p>
        </div>
        
      </div>

      {!hasData ? (
        <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center py-16 text-gray-400">
          <BarChart3 size={36} className="mb-3 opacity-30" />
          <p className="text-sm">No school data available yet.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <KpiCard label="Schools" value={fmt(overview.total_schools)} sub="Running training" icon={Building2} />
            <KpiCard label="Courses" value={fmt(overview.total_courses)} sub="Across all schools" icon={BookOpen} />
            <KpiCard label="Students in Training" value={fmt(overview.active_students)} sub="Active enrollment" icon={Users} />
            <KpiCard label="Running Classes" value={fmt(overview.running_classes)} sub={`of ${fmt(overview.total_classes)} total`} icon={PlayCircle} />
            <KpiCard label="Graduates" value={fmt(overview.graduates)} sub="Output produced" icon={GraduationCap} />
            <KpiCard label="Avg Performance" value={overview.avg_performance == null ? '—' : `${overview.avg_performance}%`} sub="Submitted exams" icon={Gauge} />
          </div>

          <OutputBySchool schools={bySchool} colorMap={colorMap} />
          <CourseComparison courses={courses} colorMap={colorMap} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopCourses courses={courses} colorMap={colorMap} />
            <OutputTrend trend={trend} />
          </div>

          <SchoolTable schools={bySchool} colorMap={colorMap} />
        </>
      )}
    </div>
  )
}
