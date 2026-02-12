import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Upload, Save, Building2, Palette, X, UserCog, Eye, EyeOff, AlertCircle } from 'lucide-react'
import * as api from '../../lib/api'
import {
  validateLogoFile,
  sanitizeInput,
  sanitizeName,
  sanitizeSchoolCode,
  sanitizePhone,
  sanitizeHexColor,
  sanitizeNumeric,
  FIELD_LIMITS,
} from '../../lib/validators'
import useToast from '../../hooks/useToast'

export default function SchoolForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditing = Boolean(id)
  const formRef = useRef(null)
  const toast = useToast()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [logoPreview, setLogoPreview] = useState(null)
  const [logoFile, setLogoFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, feedback: [], label: '', color: '' })
  const [adminId, setAdminId] = useState(null) // Track existing admin for edit mode
  const [adminUserId, setAdminUserId] = useState(null) // Track the admin's user ID for updates

  const [form, setForm] = useState({
    // School fields
    name: '',
    short_name: '',
    code: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    primary_color: '#1976D2',
    secondary_color: '#424242',
    accent_color: '#FFC107',
    max_students: 5000,
    max_instructors: 500,
    is_active: true,
    // Admin fields (only for create)
    admin_first_name: '',
    admin_last_name: '',
    admin_email: '',
    admin_phone: '',
    admin_svc_number: '',
    admin_password: '',
    admin_password2: '',
  })

  // Calculate password strength (returns score 0..4 and feedback items)
  const calculatePasswordStrength = (password) => {
    const feedback = []
    let score = 0
    if (!password) return { score: 0, feedback, label: '', color: '' }

    if (password.length >= 8) {
      score += 1
      feedback.push({ met: true, text: 'At least 8 characters' })
    } else {
      feedback.push({ met: false, text: 'At least 8 characters' })
    }

    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) {
      score += 1
      feedback.push({ met: true, text: 'Contains uppercase and lowercase' })
    } else {
      feedback.push({ met: false, text: 'Contains uppercase and lowercase' })
    }

    if (/\d/.test(password)) {
      score += 1
      feedback.push({ met: true, text: 'Contains numbers' })
    } else {
      feedback.push({ met: false, text: 'Contains numbers' })
    }

    if (/[^a-zA-Z0-9]/.test(password)) {
      score += 1
      feedback.push({ met: true, text: 'Contains special characters' })
    } else {
      feedback.push({ met: false, text: 'Contains special characters' })
    }

    let label = ''
    let color = ''
    if (score <= 1) {
      label = 'Weak'
      color = 'bg-red-500'
    } else if (score === 2) {
      label = 'Fair'
      color = 'bg-yellow-500'
    } else if (score === 3) {
      label = 'Good'
      color = 'bg-blue-500'
    } else {
      label = 'Strong'
      color = 'bg-green-500'
    }

    return { score, feedback, label, color }
  }

  useEffect(() => {
    if (isEditing) {
      setLoading(true)
      Promise.all([
        api.getSchool(id),
        api.getSchoolAdminsBySchool(id).catch(() => [])
      ])
        .then(async ([data, adminsData]) => {
          setForm((prev) => ({
            ...prev,
            name: data.name || '',
            short_name: data.short_name || '',
            code: data.code || '',
            email: data.email || '',
            phone: data.phone || '',
            address: data.address || '',
            city: data.city || '',
            primary_color: data.primary_color || '#1976D2',
            secondary_color: data.secondary_color || '#424242',
            accent_color: data.accent_color || '#FFC107',
            max_students: data.max_students || 5000,
            max_instructors: data.max_instructors || 500,
            is_active: data.is_active !== false,
          }))
          if (data.logo) {
            setLogoPreview(data.logo)
          }
          // Load the primary admin's details
          const admins = Array.isArray(adminsData) ? adminsData : (adminsData?.results || [])
          if (admins.length > 0) {
            const admin = admins.find(a => a.is_primary) || admins[0]
            setAdminId(admin.id)
            // admin.user is an integer ID, fetch full user details
            const userId = typeof admin.user === 'number' ? admin.user : null
            if (userId) {
              setAdminUserId(userId)
              try {
                const userData = await api.getUser(userId)
                setForm((prev) => ({
                  ...prev,
                  admin_first_name: userData.first_name || '',
                  admin_last_name: userData.last_name || '',
                  admin_email: userData.email || admin.user_email || '',
                  admin_phone: userData.phone_number || '',
                  admin_svc_number: userData.svc_number || '',
                }))
              } catch {
                // Fallback to flat fields on admin object
                setForm((prev) => ({
                  ...prev,
                  admin_email: admin.user_email || '',
                }))
              }
            }
          }
        })
        .catch((err) => {
          toast.error(err.message || 'Failed to load school. Redirecting...')
          setTimeout(() => navigate('/superadmin/schools'), 2000)
        })
        .finally(() => setLoading(false))
    }
  }, [id, isEditing, navigate])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target

    // Handle checkbox separately
    if (type === 'checkbox') {
      setForm((prev) => ({ ...prev, [name]: checked }))
      if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }))
      return
    }

    // Sanitize based on field type
    let sanitizedValue = value

    switch (name) {
      // Numeric-only fields
      case 'admin_svc_number':
        sanitizedValue = sanitizeNumeric(value, FIELD_LIMITS.SERVICE_NUMBER)
        break

      // Phone fields
      case 'phone':
      case 'admin_phone':
        sanitizedValue = sanitizePhone(value, FIELD_LIMITS.PHONE)
        break

      // Name fields (letters, spaces, hyphens, apostrophes)
      case 'admin_first_name':
      case 'admin_last_name':
        sanitizedValue = sanitizeName(value, FIELD_LIMITS.NAME)
        break

      // School code (uppercase alphanumeric + underscore)
      case 'code':
        sanitizedValue = sanitizeSchoolCode(value, FIELD_LIMITS.SCHOOL_CODE)
        break

      // Color fields (hex validation)
      case 'primary_color':
      case 'secondary_color':
      case 'accent_color':
        // Only sanitize if it looks like they're typing a hex code
        if (value.startsWith('#') || /^[a-fA-F0-9]+$/.test(value)) {
          sanitizedValue = sanitizeHexColor(value) || value
        }
        break

      // School name
      case 'name':
        sanitizedValue = sanitizeInput(value, { maxLength: FIELD_LIMITS.SCHOOL_NAME })
        break

      // Short name
      case 'short_name':
        sanitizedValue = sanitizeInput(value, { maxLength: FIELD_LIMITS.SHORT_NAME })
        break

      // Address (allow newlines)
      case 'address':
        sanitizedValue = sanitizeInput(value, { maxLength: FIELD_LIMITS.ADDRESS, allowNewlines: true })
        break

      // City
      case 'city':
        sanitizedValue = sanitizeInput(value, { maxLength: FIELD_LIMITS.CITY })
        break

      // Email fields - trim only, let HTML5 validation handle format
      case 'email':
      case 'admin_email':
        sanitizedValue = value.trim().slice(0, FIELD_LIMITS.EMAIL)
        break

      // Password fields - don't sanitize (allow special chars), just limit length
      case 'admin_password':
      case 'admin_password2':
        sanitizedValue = value.slice(0, FIELD_LIMITS.PASSWORD_MAX)
        if (name === 'admin_password') {
          setPasswordStrength(calculatePasswordStrength(sanitizedValue))
        }
        break

      // Number fields
      case 'max_students':
      case 'max_instructors':
        // Keep as-is for number inputs
        sanitizedValue = value
        break

      // Default: apply general sanitization
      default:
        sanitizedValue = sanitizeInput(value)
    }

    setForm((prev) => ({ ...prev, [name]: sanitizedValue }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }))
    }
  }

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate the file
    const validation = await validateLogoFile(file)
    if (!validation.valid) {
      toast.error(validation.error)
      e.target.value = '' // Reset file input
      return
    }

    setLogoFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setLogoPreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const removeLogo = () => {
    setLogoFile(null)
    setLogoPreview(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})

    // Client-side validation for password
    if (!isEditing && (!form.admin_password || form.admin_password.length < 8)) {
      toast.error('Password must be at least 8 characters long')
      setSaving(false)
      return
    }
    if (form.admin_password && form.admin_password.length < 8) {
      toast.error('Password must be at least 8 characters long')
      setSaving(false)
      return
    }
    if (form.admin_password && form.admin_password !== form.admin_password2) {
      toast.error('Passwords do not match')
      setSaving(false)
      return
    }

    try {
      let schoolId = id

      if (isEditing) {
        // Update existing school
        await api.updateSchool(id, {
          name: form.name,
          short_name: form.short_name,
          code: form.code,
          email: form.email,
          phone: form.phone,
          address: form.address,
          city: form.city,
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          accent_color: form.accent_color,
          max_students: form.max_students,
          max_instructors: form.max_instructors,
          is_active: form.is_active,
        })
        // Update the admin's user account if one exists
        if (adminUserId) {
          const userPayload = {
            first_name: form.admin_first_name,
            last_name: form.admin_last_name,
            email: form.admin_email,
            phone_number: form.admin_phone,
            svc_number: form.admin_svc_number,
          }

          try {
            // Update basic user fields via PATCH
            await api.partialUpdateUser(adminUserId, userPayload)

            // If admin entered a new password, call the reset password endpoint
            if (form.admin_password) {
              try {
                await api.resetUserPassword(adminUserId, form.admin_password)
              } catch (pwErr) {
                toast.error('School saved but failed to update admin password: ' + (pwErr.message || 'Unknown error'))
                setSaving(false)
                return
              }
            }
          } catch (adminErr) {
            toast.error('School saved but failed to update admin: ' + (adminErr.message || 'Unknown error'))
            setSaving(false)
            return
          }
        }
        toast.success('School updated successfully')
      } else {
        // Create new school with admin using the combined endpoint
        const payload = {
          school_code: form.code,
          school_name: form.name,
          school_short_name: form.short_name,
          school_email: form.email,
          school_phone: form.phone,
          school_address: form.address,
          school_city: form.city,
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          accent_color: form.accent_color,
          max_students: form.max_students,
          max_instructors: form.max_instructors,
          admin_username: form.admin_svc_number, // Use svc_number as username
          admin_email: form.admin_email,
          admin_first_name: form.admin_first_name,
          admin_last_name: form.admin_last_name,
          admin_phone: form.admin_phone,
          admin_svc_number: form.admin_svc_number,
          admin_password: form.admin_password,
          admin_password2: form.admin_password2,
        }
        const result = await api.createSchoolWithAdmin(payload)
        schoolId = result.school?.id
        toast.success('School and admin created successfully')
      }

      // Upload logo if selected
      if (logoFile && schoolId) {
        try {
          await api.uploadSchoolLogo(schoolId, logoFile)
        } catch (logoErr) {
          toast.error('School saved but logo upload failed. You can upload it later.')
          setSaving(false)
          return
        }
      }

      // Navigate after a short delay so user sees success message
      setTimeout(() => navigate('/superadmin/schools'), 1000)
    } catch (err) {
      // Improved error parsing & friendly messages (map backend field keys -> UI fields)
      let errorMessage = 'Failed to save school. Please check the form and try again.'

      const data = err?.data || null
      if (data && typeof data === 'object') {
        const fieldErrors = {}
        const fieldLabels = {
          school_code: 'School Code',
          school_name: 'School Name',
          school_email: 'School Email',
          admin_email: 'Admin Email',
          admin_svc_number: 'Service Number',
          admin_password: 'Password',
          admin_password2: 'Confirm password',
          admin_username: 'Username',
        }

        const messages = []
        Object.entries(data).forEach(([k, v]) => {
          const raw = Array.isArray(v) ? v.join(' ') : String(v)
          // Make common backend messages more user-friendly
          let friendly = raw
            .replace(/this field/gi, fieldLabels[k] || 'This field')
            .replace(/a user with this username already exists/gi, 'This username is already taken. Please choose another')
            .replace(/a user with this email already exists/gi, 'An account with this email already exists')
            .replace(/a user with this svc_number already exists/gi, 'This service number is already registered')
            .replace(/enter a valid email/gi, 'Please enter a valid email address')
            .replace(/this password is too common/gi, 'This password is too common. Please choose a stronger one')
            .replace(/this password is entirely numeric/gi, 'Password cannot be all numbers')

          fieldErrors[k] = friendly
          const label = fieldLabels[k] || k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
          messages.push(`${label}: ${friendly}`)
        })

        setErrors(fieldErrors)

        if (messages.length > 0) {
          errorMessage = messages.length === 1
            ? messages[0]
            : `Please fix the following errors:\n• ${messages.slice(0, 4).join('\n• ')}${messages.length > 4 ? `\n• ...and ${messages.length - 4} more` : ''}`
        }
      } else {
        // Fallback to network / generic friendly messages
        let msg = err?.message || ''
        if (msg.includes('Network') || msg.includes('fetch')) {
          msg = 'Unable to connect to the server. Please check your internet connection and try again.'
        } else if (msg.includes('500') || msg.includes('Internal Server')) {
          msg = 'Something went wrong on our end. Please try again later or contact support.'
        } else if (msg.includes('401') || msg.includes('Unauthorized')) {
          msg = 'Your session has expired. Please log in again.'
        } else if (msg.includes('403') || msg.includes('Forbidden')) {
          msg = 'You do not have permission to perform this action.'
        } else if (msg) {
          // use the original message if present
        } else {
          msg = errorMessage
        }
        errorMessage = msg
      }

      toast.error(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6" ref={formRef}>
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/superadmin/schools')}
            className="p-2 hover:bg-neutral-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-600" />
          </button>
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-black">
              {isEditing ? 'Edit School' : 'Create New School'}
            </h2>
            <p className="text-xs sm:text-sm text-neutral-500">
              {isEditing ? 'Update school details and theme' : 'Add a new school with its primary administrator'}
            </p>
          </div>
        </div>
      </header>

      {/* Error Summary Banner */}
      {Object.keys(errors).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">
                Please fix the following errors:
              </p>
              <ul className="mt-2 text-sm text-red-700 list-disc list-inside space-y-1">
                {Object.entries(errors).slice(0, 5).map(([key, value]) => (
                  <li key={key}>
                    {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}: {value}
                  </li>
                ))}
                {Object.keys(errors).length > 5 && (
                  <li className="text-red-600">...and {Object.keys(errors).length - 5} more errors</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      <form id="school-form" onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-neutral-500" />
            <h3 className="font-semibold text-black">School Information</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">
                School Name *
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                  errors.name || errors.school_name ? 'border-red-500' : 'border-neutral-200'
                }`}
                placeholder="e.g. Kenya Army Combat Engineering School"
              />
              {(errors.name || errors.school_name) && <p className="text-red-500 text-sm mt-1">{errors.name || errors.school_name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">
                Short Name
              </label>
              <input
                type="text"
                name="short_name"
                value={form.short_name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="e.g. KACEME"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">
                School Code *
              </label>
              <input
                type="text"
                name="code"
                value={form.code}
                onChange={handleChange}
                required
                className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 font-mono uppercase ${
                  errors.code || errors.school_code ? 'border-red-500' : 'border-neutral-200'
                }`}
                placeholder="e.g. KACEME"
              />
              {(errors.code || errors.school_code) && <p className="text-red-500 text-sm mt-1">{errors.code || errors.school_code}</p>}
              <p className="text-neutral-500 text-xs mt-1">Uppercase letters, numbers, and underscores only</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">
                School Email *
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                  errors.email || errors.school_email ? 'border-red-500' : 'border-neutral-200'
                }`}
                placeholder="admin@school.edu"
              />
              {(errors.email || errors.school_email) && <p className="text-red-500 text-sm mt-1">{errors.email || errors.school_email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">
                School Phone *
              </label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="+254 700 000 000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">
                City *
              </label>
              <input
                type="text"
                name="city"
                value={form.city}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="e.g. Nairobi"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-600 mb-1">
                Address *
              </label>
              <textarea
                name="address"
                value={form.address}
                onChange={handleChange}
                required
                rows={2}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="Full postal address"
              />
            </div>
          </div>
        </div>

        {/* Admin Information - Show when creating or when editing with an existing admin */}
        {(!isEditing || adminId) && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <UserCog className="w-5 h-5 text-neutral-500" />
              <h3 className="font-semibold text-black">Primary Administrator</h3>
            </div>
            <p className="text-sm text-neutral-500 mb-4">
              {isEditing ? 'Update the primary administrator details for this school.' : 'This user will be created as the primary admin for this school.'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  name="admin_first_name"
                  value={form.admin_first_name}
                  onChange={handleChange}
                  required
                  className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                    errors.admin_first_name ? 'border-red-500' : 'border-neutral-200'
                  }`}
                />
                {errors.admin_first_name && <p className="text-red-500 text-sm mt-1">{errors.admin_first_name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  name="admin_last_name"
                  value={form.admin_last_name}
                  onChange={handleChange}
                  required
                  className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                    errors.admin_last_name ? 'border-red-500' : 'border-neutral-200'
                  }`}
                />
                {errors.admin_last_name && <p className="text-red-500 text-sm mt-1">{errors.admin_last_name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Service Number *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  name="admin_svc_number"
                  value={form.admin_svc_number}
                  onChange={handleChange}
                  required
                  className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 font-mono ${
                    errors.admin_svc_number ? 'border-red-500' : 'border-neutral-200'
                  }`}
                  placeholder="e.g. 12345678"
                />
                {errors.admin_svc_number && <p className="text-red-500 text-sm mt-1">{errors.admin_svc_number}</p>}
                <p className="text-neutral-500 text-xs mt-1">Numbers only - used for login</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Admin Email *
                </label>
                <input
                  type="email"
                  name="admin_email"
                  value={form.admin_email}
                  onChange={handleChange}
                  required
                  className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                    errors.admin_email ? 'border-red-500' : 'border-neutral-200'
                  }`}
                />
                {errors.admin_email && <p className="text-red-500 text-sm mt-1">{errors.admin_email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  Admin Phone *
                </label>
                <input
                  type="tel"
                  name="admin_phone"
                  value={form.admin_phone}
                  onChange={handleChange}
                  required
                  className={`w-full px-3 py-2 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                    errors.admin_phone ? 'border-red-500' : 'border-neutral-200'
                  }`}
                  placeholder="+254 700 000 000"
                />
                {errors.admin_phone && <p className="text-red-500 text-sm mt-1">{errors.admin_phone}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  {isEditing ? 'New Password' : 'Password *'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="admin_password"
                    value={form.admin_password}
                    onChange={handleChange}
                    required={!isEditing}
                    minLength={8}
                    className={`w-full px-3 py-2 pr-10 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                      errors.admin_password ? 'border-red-500' : 'border-neutral-200'
                    }`}
                    placeholder={isEditing ? 'Leave blank to keep current' : ''}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.admin_password && <p className="text-red-500 text-sm mt-1">{errors.admin_password}</p>}
                {isEditing && <p className="text-neutral-500 text-xs mt-1">Leave blank to keep the current password</p>}
                {form.admin_password && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-neutral-700">Password strength:</span>
                      <span className={`text-xs font-medium ${
                        passwordStrength.label === 'Weak' ? 'text-red-600' :
                        passwordStrength.label === 'Fair' ? 'text-yellow-600' :
                        passwordStrength.label === 'Good' ? 'text-blue-600' :
                        'text-green-600'
                      }`}>{passwordStrength.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                          style={{ width: `${(passwordStrength.score / 4) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-neutral-600 space-y-1">
                      {passwordStrength.feedback.map((item, idx) => (
                        <div key={idx} className={`flex items-center gap-2 ${item.met ? 'text-neutral-700' : 'text-neutral-500'}`}>
                          <span className={`w-3 h-3 rounded-full ${item.met ? 'bg-green-500' : 'bg-neutral-300'} inline-block`} />
                          <span>{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">
                  {isEditing ? 'Confirm New Password' : 'Confirm Password *'}
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="admin_password2"
                    value={form.admin_password2}
                    onChange={handleChange}
                    required={!isEditing}
                    minLength={8}
                    className={`w-full px-3 py-2 pr-10 border rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                      errors.admin_password2 || (form.admin_password2 && form.admin_password !== form.admin_password2) ? 'border-red-500' : 'border-neutral-200'
                    }`}
                    placeholder={isEditing ? 'Leave blank to keep current' : ''}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.admin_password2 && <p className="text-red-500 text-sm mt-1">{errors.admin_password2}</p>}
                {form.admin_password2 && form.admin_password !== form.admin_password2 && (
                  <p className="text-red-500 text-sm mt-1">Passwords do not match</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Theme Customization */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-neutral-500" />
            <h3 className="font-semibold text-black">Theme Customization</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Logo Upload */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-600 mb-2">
                School Logo
              </label>
              <div className="flex items-start gap-4">
                {logoPreview ? (
                  <div className="relative">
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="w-24 h-24 object-contain rounded-lg border border-neutral-200 bg-neutral-50"
                    />
                    <button
                      type="button"
                      onClick={removeLogo}
                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="w-24 h-24 border-2 border-dashed border-neutral-300 rounded-lg flex items-center justify-center bg-neutral-50">
                    <Building2 className="w-8 h-8 text-neutral-400" />
                  </div>
                )}
                <div>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="hidden"
                    />
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition">
                      <Upload className="w-4 h-4" />
                      Upload Logo
                    </span>
                  </label>
                  <p className="text-neutral-500 text-xs mt-2">PNG, JPG up to 2MB. Recommended: 200x200px</p>
                </div>
              </div>
            </div>

            {/* Color Pickers */}
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">
                Primary Color (Sidebar Top)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  name="primary_color"
                  value={form.primary_color}
                  onChange={handleChange}
                  className="w-12 h-12 rounded-lg cursor-pointer border-2 border-neutral-200"
                />
                <input
                  type="text"
                  name="primary_color"
                  value={form.primary_color}
                  onChange={handleChange}
                  className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg font-mono uppercase text-black"
                  placeholder="#1976D2"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">
                Secondary Color (Sidebar Bottom)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  name="secondary_color"
                  value={form.secondary_color}
                  onChange={handleChange}
                  className="w-12 h-12 rounded-lg cursor-pointer border-2 border-neutral-200"
                />
                <input
                  type="text"
                  name="secondary_color"
                  value={form.secondary_color}
                  onChange={handleChange}
                  className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg font-mono uppercase text-black"
                  placeholder="#424242"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">
                Accent Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  name="accent_color"
                  value={form.accent_color}
                  onChange={handleChange}
                  className="w-12 h-12 rounded-lg cursor-pointer border-2 border-neutral-200"
                />
                <input
                  type="text"
                  name="accent_color"
                  value={form.accent_color}
                  onChange={handleChange}
                  className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg font-mono uppercase text-black"
                  placeholder="#FFC107"
                />
              </div>
            </div>

            {/* Preview */}
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-2">
                Sidebar Preview
              </label>
              <div
                className="h-32 rounded-lg flex items-center justify-center text-white"
                style={{
                  background: `linear-gradient(to bottom, ${form.primary_color}, ${form.secondary_color})`,
                }}
              >
                <div className="text-center">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Preview" className="w-10 h-10 mx-auto rounded" />
                  ) : (
                    <Building2 className="w-10 h-10 mx-auto" />
                  )}
                  <p className="mt-2 font-medium">{form.short_name || form.name || 'School Name'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Limits */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-6">
          <h3 className="font-semibold text-black mb-4">Subscription Limits</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">
                Max Students
              </label>
              <input
                type="number"
                name="max_students"
                value={form.max_students}
                onChange={handleChange}
                min={1}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">
                Max Instructors
              </label>
              <input
                type="number"
                name="max_instructors"
                value={form.max_instructors}
                onChange={handleChange}
                min={1}
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>
        </div>

        {/* Status & Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="is_active"
                checked={form.is_active}
                onChange={handleChange}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-neutral-700">School is active</span>
            </label>

            <div className="flex gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => navigate('/superadmin/schools')}
                className="flex-1 sm:flex-none px-4 py-2 text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || (form.admin_password && form.admin_password !== form.admin_password2)}
                className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {isEditing ? 'Update School' : 'Create School & Admin'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
