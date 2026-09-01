import { useState, useEffect, useMemo } from 'react'
import * as Icons from 'lucide-react'
import { Navigate, useNavigate } from 'react-router'
import useAuth from '../hooks/useAuth'
import * as api from '../lib/api'
import TOTPSettings from '../components/TOTPSettings'

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'User' },
  { id: 'account', label: 'Account', icon: 'Clock' },
  { id: 'security', label: 'Security', icon: 'ShieldCheck' },
]

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-neutral-100 last:border-b-0">
      <span className="text-sm text-neutral-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-black text-right break-words min-w-0">{value || 'N/A'}</span>
    </div>
  )
}

function Card({ icon, title, children, className = '' }) {
  const Icon = Icons[icon]
  return (
    <section className={`bg-white rounded-xl border border-neutral-200 p-4 sm:p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="w-5 h-5 text-neutral-500" />}
        <h3 className="font-semibold text-black">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs text-neutral-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-black">{value || 'N/A'}</p>
    </div>
  )
}

export default function ProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  // Edit state — username/bio are edited in place in the identity band
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({ username: '', bio: '' })
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    // Alumni have no profile endpoint access (see core/middleware.py's
    // alumni allowlist — /api/profile/me/ isn't in it, and never will be:
    // the Alumni Dashboard is intentionally certificates-only) — skip the
    // doomed request entirely rather than firing it and rendering an error.
    if (user?.is_alumni) return
    let mounted = true
    async function fetchProfile() {
      setLoading(true)
      setError(null)
      try {
        const data = await api.getProfile()
        if (mounted) {
          setProfile(data)
          setFormData({ username: data.username || '', bio: data.bio || '' })
        }
      } catch (err) {
        if (mounted) setError(err?.message || 'Failed to load profile')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    fetchProfile()
    return () => { mounted = false }
  }, [user])

  const initials = useMemo(() => {
    if (!profile) return 'U'
    const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
    if (!name) return (profile.username || 'U')[0].toUpperCase()
    return name.split(' ').map(s => s[0] || '').slice(0, 2).join('').toUpperCase()
  }, [profile])

  const fullName = profile
    ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.username
    : ''

  function startEditing() {
    setFormData({ username: profile?.username || '', bio: profile?.bio || '' })
    setFormErrors({})
    setSaveError(null)
    setSaveSuccess(false)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setFormErrors({})
    setSaveError(null)
  }

  function handleChange(e) {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (formErrors[name]) setFormErrors(prev => ({ ...prev, [name]: null }))
  }

  async function handleSave(e) {
    e.preventDefault()

    // Validate
    const errors = {}
    if (!formData.username || formData.username.trim().length < 3) {
      errors.username = 'Username must be at least 3 characters'
    }
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const payload = {}
      if (formData.username !== profile.username) payload.username = formData.username
      if (formData.bio !== (profile.bio || '')) payload.bio = formData.bio

      if (Object.keys(payload).length === 0) {
        setEditing(false)
        setSaving(false)
        return
      }

      const updated = await api.updateProfile(payload)
      setProfile(updated)
      setEditing(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      if (err?.data) {
        const msgs = []
        for (const [key, val] of Object.entries(err.data)) {
          const msg = Array.isArray(val) ? val.join(', ') : val
          msgs.push(`${key}: ${msg}`)
        }
        setSaveError(msgs.length ? msgs.join('; ') : (err?.message || 'Failed to update profile'))
      } else {
        setSaveError(err?.message || 'Failed to update profile')
      }
    } finally {
      setSaving(false)
    }
  }

  // Alumni have no profile page — send them back to the one thing they do
  // have (see the effect above for why the fetch is skipped too).
  if (user?.is_alumni) {
    return <Navigate to="/dashboard/alumni" replace />
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3" />
          <p className="text-sm text-neutral-500">Loading profile...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <Icons.AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-red-800 mb-1">Failed to load profile</p>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 text-sm bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      {/* Success banner */}
      {saveSuccess && (
        <div className="flex items-center gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-xl p-3">
          <Icons.CheckCircle className="w-5 h-5 flex-shrink-0" />
          Profile updated successfully.
        </div>
      )}

      {/* Identity band — spans the full content width. Scoped <form> so the
          inline username/bio fields submit on Enter without wrapping the whole
          page (TOTPSettings renders its own form). */}
      <form onSubmit={handleSave} className="bg-white rounded-xl border border-neutral-200 p-4 sm:p-5 lg:p-6">
        {/* Actions drop below the identity block until lg, so the avatar and
            name keep a usable width on phones and tablets */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-5">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            {/* Avatar */}
            <div className="w-14 h-14 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-full bg-indigo-600 flex items-center justify-center text-white text-lg sm:text-2xl lg:text-3xl font-bold shrink-0">
              {initials}
            </div>

            {/* Name, badges, bio */}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl lg:text-2xl font-semibold text-black break-words">{fullName}</h2>

            {editing ? (
              <div className="mt-2 max-w-sm">
                <label htmlFor="username" className="block text-xs font-medium text-neutral-500 mb-1">
                  Username
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">@</span>
                  <input
                    id="username"
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    className={`w-full pl-7 pr-3 py-2 border rounded-lg text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                      formErrors.username ? 'border-red-500' : 'border-neutral-200'
                    }`}
                    placeholder="Enter username"
                    minLength={3}
                    maxLength={150}
                  />
                </div>
                {formErrors.username && (
                  <p className="text-red-500 text-xs mt-1">{formErrors.username}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-neutral-500 mt-0.5">@{profile.username}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-100">
                {profile.role_display || profile.role}
              </span>
              {profile.rank_display && (
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-100">
                  {profile.rank_display}
                </span>
              )}
              {profile.school_name && (
                <span className="text-xs font-medium px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-100">
                  {profile.school_name}
                </span>
              )}
            </div>

            {/* Bio — edited in place, no separate form card */}
            {editing ? (
              <div className="mt-3 max-w-2xl">
                <label htmlFor="bio" className="block text-xs font-medium text-neutral-500 mb-1">
                  Bio
                </label>
                <textarea
                  id="bio"
                  name="bio"
                  value={formData.bio}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-black text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                  placeholder="Write a short bio about yourself..."
                  rows={3}
                  maxLength={500}
                />
                <p className="text-neutral-500 text-xs mt-1">{formData.bio.length}/500 characters</p>
              </div>
            ) : profile.bio ? (
              <p className="mt-3 text-sm text-neutral-600 leading-relaxed max-w-2xl">{profile.bio}</p>
            ) : (
              <p className="mt-3 text-sm text-neutral-400 italic">No bio added yet.</p>
            )}

            {saveError && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 max-w-2xl">
                <div className="flex items-start gap-2">
                  <Icons.AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{saveError}</p>
                </div>
              </div>
              )}
            </div>
          </div>

          {/* Actions — full-width tap targets on phone/tablet, inline from lg */}
          <div className="flex items-center gap-2 lg:shrink-0">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="flex-1 lg:flex-none px-4 py-2.5 lg:py-2 text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 lg:py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Icons.Save className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startEditing}
                className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 lg:py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
              >
                <Icons.Pencil className="w-4 h-4" />
                Edit Profile
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Tabs */}
      <div className="border-b border-neutral-200">
        <div className="flex gap-1 -mb-px overflow-x-auto" role="tablist">
          {TABS.map((t) => {
            const Icon = Icons[t.icon]
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                onClick={() => setActiveTab(t.id)}
                className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                  activeTab === t.id
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          <Card icon="User" title="Personal Information">
            <InfoRow label="Full Name" value={fullName} />
            <InfoRow label="Username" value={profile.username} />
            <InfoRow label="Service Number" value={profile.service_number} />
            <InfoRow label="Email" value={profile.email} />
            <InfoRow label="Phone" value={profile.phone_number} />
            {profile.unit && <InfoRow label="Unit" value={profile.unit} />}
          </Card>

          <Card icon="Building2" title="School & Role">
            <InfoRow label="School" value={profile.school_name} />
            {profile.school_code && <InfoRow label="School Code" value={profile.school_code} />}
            <InfoRow label="Role" value={profile.role_display || profile.role} />
            {profile.rank_display && <InfoRow label="Rank" value={profile.rank_display} />}
          </Card>

          {profile.enrollment && (
            <Card icon="GraduationCap" title="Current Enrollment">
              <InfoRow
                label="Course"
                value={
                  profile.enrollment.course_code
                    ? `${profile.enrollment.course_name} (${profile.enrollment.course_code})`
                    : profile.enrollment.course_name
                }
              />
              <InfoRow label="Class" value={profile.enrollment.class_name} />
              <InfoRow
                label="Enrolled"
                value={
                  profile.enrollment.enrollment_date
                    ? new Date(profile.enrollment.enrollment_date).toLocaleDateString()
                    : null
                }
              />
            </Card>
          )}
        </div>
      )}

      {/* Account */}
      {activeTab === 'account' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <Card icon="Clock" title="Account">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Stat
                label="Member Since"
                value={profile.created_at ? new Date(profile.created_at).toLocaleDateString() : null}
              />
              <Stat
                label="Last Updated"
                value={profile.updated_at ? new Date(profile.updated_at).toLocaleDateString() : null}
              />
            </div>
          </Card>
        </div>
      )}

      {/* Security */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <TOTPSettings user={user} />
        </div>
      )}
    </div>
  )
}
