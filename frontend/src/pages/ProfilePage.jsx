import { useState, useEffect, useMemo } from 'react'
import * as Icons from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import * as api from '../lib/api'

export default function ProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({ username: '', bio: '' })
  const [formErrors, setFormErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
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
  }, [])

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

  // Info row helper
  const InfoRow = ({ label, value }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-neutral-100 last:border-b-0">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="text-sm font-medium text-black">{value || 'N/A'}</span>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-black">My Profile</h2>
        {!editing && (
          <button
            onClick={startEditing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
          >
            <Icons.Pencil className="w-4 h-4" />
            Edit Profile
          </button>
        )}
      </div>

      {/* Success banner */}
      {saveSuccess && (
        <div className="flex items-center gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-xl p-3">
          <Icons.CheckCircle className="w-5 h-5 flex-shrink-0" />
          Profile updated successfully.
        </div>
      )}

      {/* Profile card — identity */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5 sm:p-6">
        <div className="flex items-start gap-4 sm:gap-5">
          {/* Avatar */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xl sm:text-2xl font-bold shrink-0">
            {initials}
          </div>

          {/* Name & badges */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg sm:text-xl font-semibold text-black truncate">{fullName}</h3>
            <p className="text-sm text-neutral-500 mt-0.5">@{profile.username}</p>
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

            {/* Bio */}
            {!editing && profile.bio && (
              <p className="mt-3 text-sm text-neutral-600 leading-relaxed">{profile.bio}</p>
            )}
            {!editing && !profile.bio && (
              <p className="mt-3 text-sm text-neutral-400 italic">No bio added yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-white rounded-xl border border-neutral-200 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Icons.Pencil className="w-5 h-5 text-neutral-500" />
            <h3 className="font-semibold text-black">Edit Profile</h3>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">
                Username
              </label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                  formErrors.username ? 'border-red-500' : 'border-neutral-200'
                }`}
                placeholder="Enter username"
                minLength={3}
                maxLength={150}
              />
              {formErrors.username && (
                <p className="text-red-500 text-sm mt-1">{formErrors.username}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">
                Bio
              </label>
              <textarea
                name="bio"
                value={formData.bio}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                placeholder="Write a short bio about yourself..."
                rows={3}
                maxLength={500}
              />
              <p className="text-neutral-500 text-xs mt-1">{formData.bio.length}/500 characters</p>
            </div>

            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <Icons.AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{saveError}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={cancelEditing}
                className="px-4 py-2 text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium disabled:opacity-50"
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
            </div>
          </form>
        </div>
      )}

      {/* Details grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Personal Information */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Icons.User className="w-5 h-5 text-neutral-500" />
            <h3 className="font-semibold text-black">Personal Information</h3>
          </div>
          <div>
            <InfoRow label="Full Name" value={fullName} />
            <InfoRow label="Username" value={profile.username} />
            <InfoRow label="Service Number" value={profile.service_number} />
            <InfoRow label="Email" value={profile.email} />
            <InfoRow label="Phone" value={profile.phone_number} />
            {profile.unit && <InfoRow label="Unit" value={profile.unit} />}
          </div>
        </div>

        {/* School & Role */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Icons.Building2 className="w-5 h-5 text-neutral-500" />
            <h3 className="font-semibold text-black">School & Role</h3>
          </div>
          <div>
            <InfoRow label="School" value={profile.school_name} />
            {profile.school_code && <InfoRow label="School Code" value={profile.school_code} />}
            <InfoRow label="Role" value={profile.role_display || profile.role} />
            {profile.rank_display && <InfoRow label="Rank" value={profile.rank_display} />}
          </div>
        </div>
      </div>

      {/* Enrollment (students only) */}
      {profile.enrollment && (
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Icons.GraduationCap className="w-5 h-5 text-neutral-500" />
            <h3 className="font-semibold text-black">Current Enrollment</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-neutral-500 mb-0.5">Course</p>
              <p className="text-sm font-medium text-black">
                {profile.enrollment.course_name}
                {profile.enrollment.course_code && (
                  <span className="text-neutral-400 ml-1">({profile.enrollment.course_code})</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-0.5">Class</p>
              <p className="text-sm font-medium text-black">{profile.enrollment.class_name}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-0.5">Enrolled</p>
              <p className="text-sm font-medium text-black">
                {profile.enrollment.enrollment_date
                  ? new Date(profile.enrollment.enrollment_date).toLocaleDateString()
                  : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Account */}
      <div className="bg-white rounded-xl border border-neutral-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Icons.Clock className="w-5 h-5 text-neutral-500" />
          <h3 className="font-semibold text-black">Account</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Member Since</p>
            <p className="text-sm font-medium text-black">
              {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 mb-0.5">Last Updated</p>
            <p className="text-sm font-medium text-black">
              {profile.updated_at ? new Date(profile.updated_at).toLocaleDateString() : 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
