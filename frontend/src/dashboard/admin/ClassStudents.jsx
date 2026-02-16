import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as api from '../../lib/api'
import useToast from '../../hooks/useToast'
import { getRankSortIndex } from '../../lib/rankOrder'

function normalizeRank(raw) {
  if (!raw) return ''
  const key = String(raw).toLowerCase().trim()
  // reuse a small mapping present in AdminStudents
  const map = {
    'general': 'general',
    'lieutenant_general': 'lieutenant_general',
    'major_general': 'major_general',
    'brigadier': 'brigadier',
    'colonel': 'colonel',
    'lieutenant_colonel': 'lieutenant_colonel',
    'major': 'major',
    'captain': 'captain',
    'lieutenant': 'lieutenant',
    'warrant_officer_i': 'warrant_officer_i',
    'warrant_officer_ii': 'warrant_officer_ii',
    'senior_sergeant': 'senior_sergeant',
    'sergeant': 'sergeant',
    'corporal': 'corporal',
    'lance_corporal': 'lance_corporal',
    'private': 'private',
  }
  return map[key] || key
}

function getRankDisplay(raw) {
  if (!raw) return ''
  const normalized = normalizeRank(raw)
  const labels = {
    general: 'General', lieutenant_general: 'Lieutenant General', major_general: 'Major General', brigadier: 'Brigadier', colonel: 'Colonel', lieutenant_colonel: 'Lieutenant Colonel', major: 'Major', captain: 'Captain', lieutenant: 'Lieutenant', warrant_officer_i: 'Warrant Officer I', warrant_officer_ii: 'Warrant Officer II', senior_sergeant: 'Senior Sergeant', sergeant: 'Sergeant', corporal: 'Corporal', lance_corporal: 'Lance Corporal', private: 'Private'
  }
  return labels[normalized] || raw
}

export default function ClassStudents(){
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    let mounted = true
    setLoading(true)
    api.getClassEnrolledStudents(id).then((data)=>{
      if (!mounted) return
      const list = Array.isArray(data) ? data : (data && data.results) ? data.results : []
      const mapped = list.map((u) => ({
        id: u.id,
        name: u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim(),
        svc_number: u.svc_number != null ? String(u.svc_number) : '',
        email: u.email,
        phone_number: u.phone_number,
        rank: normalizeRank(u.rank || u.rank_display),
      }))
      mapped.sort((a,b)=> getRankSortIndex(a.rank) - getRankSortIndex(b.rank))
      setStudents(mapped)
    }).catch((err)=>{
      toast?.error?.('Failed to load students for class')
    }).finally(()=>{ if (mounted) setLoading(false) })
    return ()=>{ mounted = false }
  }, [id])

  return (
    <div className="w-full px-3 sm:px-4 md:px-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-black">Class Students</h2>
          <p className="text-sm text-neutral-500">Students enrolled in this class</p>
        </div>
        <div>
          <button onClick={()=>navigate('/list/classes')} className="px-3 py-1 bg-neutral-100 rounded">Back to classes</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
        {loading ? <div className="text-neutral-600">Loading...</div> : (
          students.length === 0 ? <div className="text-neutral-600">No students found for this class.</div> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500">
                  <th className="py-2">Service No</th>
                  <th className="py-2">Rank</th>
                  <th className="py-2">Name</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Phone</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id} className="border-t">
                    <td className="py-2">{s.svc_number}</td>
                    <td className="py-2">{getRankDisplay(s.rank)}</td>
                    <td className="py-2 text-black">{s.name}</td>
                    <td className="py-2">{s.email}</td>
                    <td className="py-2">{s.phone_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  )
}
