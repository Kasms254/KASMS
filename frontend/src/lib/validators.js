/**
 * Validation and sanitization utilities
 */

// ======================
// INPUT SANITIZATION
// ======================

/**
 * Comprehensive input sanitization for text fields
 * Removes: XSS vectors, SQL injection patterns, path traversal, template injection
 * @param {string} value - Input value to sanitize
 * @param {object} options - Sanitization options
 * @param {number} options.maxLength - Maximum allowed length (default: 255)
 * @param {boolean} options.allowNewlines - Allow newline characters (default: false)
 * @returns {string} - Sanitized string
 */
export function sanitizeInput(value, options = {}) {
  if (typeof value !== 'string') return value
  if (!value) return ''

  const { maxLength = 255, allowNewlines = false } = options

  let sanitized = value

  // 1. Remove null bytes and control characters (except newlines/tabs if allowed)
  /* eslint-disable-next-line no-control-regex */
  const controlCharsWithNewlines = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g
  /* eslint-disable-next-line no-control-regex */
  const controlCharsAll = /[\x00-\x1F\x7F]/g
  sanitized = sanitized.replace(allowNewlines ? controlCharsWithNewlines : controlCharsAll, '')

  // 2. Remove script tags and event handlers (XSS)
  sanitized = sanitized
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*\s(on\w+)=['"][^'"]*['"]/gi, '') // Remove event handlers
    .replace(/<[^>]+>/g, '') // Remove all HTML tags

  // 3. Remove JavaScript protocol handlers
  sanitized = sanitized
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:/gi, '')

  // 4. Remove path traversal attempts
  sanitized = sanitized
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\/g, '')
    .replace(/\.\.$/g, '')

  // 5. Remove SQL injection patterns (common keywords in suspicious context)
  sanitized = sanitized
    .replace(/(\b)(union|select|insert|update|delete|drop|truncate|exec|execute)(\s+)/gi, '$1$3')
    .replace(/--/g, '') // SQL comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Block comments

  // 6. Remove template injection patterns
  sanitized = sanitized
    .replace(/\{\{[\s\S]*?\}\}/g, '') // Handlebars/Angular
    .replace(/\$\{[\s\S]*?\}/g, '') // Template literals
    .replace(/<%([\s\S]*?)%>/g, '') // EJS/ERB

  // 7. Decode and re-sanitize URL encoded threats
  try {
    const decoded = decodeURIComponent(sanitized)
    if (decoded !== sanitized) {
      // If decoding changed the string, recursively sanitize
      // but avoid infinite loops by limiting recursion
      if (!options._decoded) {
        return sanitizeInput(decoded, { ...options, _decoded: true })
      }
    }
  } catch (e) {
    // Invalid URL encoding, continue with current value
  }

  // 8. Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ')

  // 9. Trim and limit length
  sanitized = sanitized.trim().slice(0, maxLength)

  return sanitized
}

/**
 * Sanitize input for names (first name, last name, etc.)
 * Allows: letters, spaces, hyphens, apostrophes
 * @param {string} value - Name to sanitize
 * @param {number} maxLength - Maximum length (default: 50)
 * @returns {string} - Sanitized name
 */
export function sanitizeName(value, maxLength = 50) {
  if (typeof value !== 'string') return value
  if (!value) return ''

  return value
    .replace(/[^a-zA-Z\s\-']/g, '') // Only letters, spaces, hyphens, apostrophes
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim()
    .slice(0, maxLength)
}

/**
 * Sanitize input for school codes (uppercase alphanumeric + underscore)
 * @param {string} value - Code to sanitize
 * @param {number} maxLength - Maximum length (default: 20)
 * @returns {string} - Sanitized code
 */
export function sanitizeSchoolCode(value, maxLength = 20) {
  if (typeof value !== 'string') return value
  if (!value) return ''

  return value
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '') // Only uppercase letters, numbers, underscore
    .slice(0, maxLength)
}

/**
 * Sanitize phone number (digits only, with optional leading +)
 * @param {string} value - Phone number to sanitize
 * @param {number} maxLength - Maximum length (default: 15)
 * @returns {string} - Sanitized phone number
 */
export function sanitizePhone(value, maxLength = 15) {
  if (typeof value !== 'string') return value
  if (!value) return ''

  const hasPlus = value.startsWith('+')
  const digits = value.replace(/\D/g, '').slice(0, hasPlus ? maxLength - 1 : maxLength)

  return hasPlus ? `+${digits}` : digits
}

/**
 * Sanitize hex color value
 * @param {string} value - Color value to sanitize
 * @returns {string} - Valid hex color or empty string
 */
export function sanitizeHexColor(value) {
  if (typeof value !== 'string') return ''
  if (!value) return ''

  // Remove non-hex characters
  const hex = value.replace(/[^a-fA-F0-9#]/g, '')

  // Ensure starts with #
  const withHash = hex.startsWith('#') ? hex : `#${hex}`

  // Validate format: #RGB or #RRGGBB
  if (/^#[a-fA-F0-9]{6}$/.test(withHash)) {
    return withHash.toUpperCase()
  }
  if (/^#[a-fA-F0-9]{3}$/.test(withHash)) {
    // Expand shorthand to full hex
    const r = withHash[1]
    const g = withHash[2]
    const b = withHash[3]
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }

  return ''
}

/**
 * Sanitize numeric input (service numbers, IDs)
 * @param {string} value - Value to sanitize
 * @param {number} maxLength - Maximum length (default: 15)
 * @returns {string} - Digits only
 */
export function sanitizeNumeric(value, maxLength = 15) {
  if (typeof value !== 'string') return value
  if (!value) return ''

  return value.replace(/\D/g, '').slice(0, maxLength)
}

// ======================
// VALIDATION FUNCTIONS
// ======================

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {{valid: boolean, error?: string}}
 */
export function validateEmail(email) {
  if (!email) {
    return { valid: false, error: 'Email is required' }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' }
  }

  if (email.length > 254) {
    return { valid: false, error: 'Email is too long' }
  }

  return { valid: true }
}

/**
 * Validate phone number format
 * @param {string} phone - Phone to validate
 * @returns {{valid: boolean, error?: string}}
 */
export function validatePhone(phone) {
  if (!phone) {
    return { valid: false, error: 'Phone number is required' }
  }

  const digitsOnly = phone.replace(/\D/g, '')
  if (digitsOnly.length < 7) {
    return { valid: false, error: 'Phone number too short (min 7 digits)' }
  }
  if (digitsOnly.length > 15) {
    return { valid: false, error: 'Phone number too long (max 15 digits)' }
  }

  return { valid: true }
}

/**
 * Validate hex color format
 * @param {string} color - Color to validate
 * @returns {{valid: boolean, error?: string}}
 */
export function validateHexColor(color) {
  if (!color) {
    return { valid: false, error: 'Color is required' }
  }

  if (!/^#[a-fA-F0-9]{6}$/.test(color) && !/^#[a-fA-F0-9]{3}$/.test(color)) {
    return { valid: false, error: 'Invalid hex color format (use #RRGGBB)' }
  }

  return { valid: true }
}

/**
 * Validate school code format
 * @param {string} code - Code to validate
 * @returns {{valid: boolean, error?: string}}
 */
export function validateSchoolCode(code) {
  if (!code) {
    return { valid: false, error: 'School code is required' }
  }

  if (!/^[A-Z0-9_]+$/.test(code)) {
    return { valid: false, error: 'Only uppercase letters, numbers, and underscores allowed' }
  }

  if (code.length < 2) {
    return { valid: false, error: 'School code too short (min 2 characters)' }
  }

  if (code.length > 20) {
    return { valid: false, error: 'School code too long (max 20 characters)' }
  }

  return { valid: true }
}

// ======================
// FIELD CONSTRAINTS
// ======================

export const FIELD_LIMITS = {
  SCHOOL_NAME: 100,
  SHORT_NAME: 20,
  SCHOOL_CODE: 20,
  EMAIL: 254,
  PHONE: 15,
  ADDRESS: 500,
  CITY: 50,
  NAME: 50,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  SERVICE_NUMBER: 15,
}

// ======================
// FILE VALIDATION
// ======================

// Logo upload constraints
export const LOGO_CONSTRAINTS = {
  MAX_SIZE_MB: 2,
  MAX_SIZE_BYTES: 2 * 1024 * 1024,
  ALLOWED_TYPES: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'],
  ALLOWED_EXTENSIONS: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
  MAX_DIMENSION: 200,
  MIN_DIMENSION: 50,
}

/**
 * Validates a logo file for upload
 * @param {File} file - The file to validate
 * @returns {Promise<{valid: boolean, error?: string, sanitizedName?: string}>}
 */
export async function validateLogoFile(file) {
  if (!file) {
    return { valid: false, error: 'No file provided' }
  }

  // Check file type by MIME type
  if (!LOGO_CONSTRAINTS.ALLOWED_TYPES.includes(file.type.toLowerCase())) {
    return {
      valid: false,
      error: 'Invalid file type. Allowed: PNG, JPG, GIF, WEBP',
    }
  }

  // Check file extension
  const fileName = file.name.toLowerCase()
  const hasValidExtension = LOGO_CONSTRAINTS.ALLOWED_EXTENSIONS.some((ext) =>
    fileName.endsWith(ext)
  )
  if (!hasValidExtension) {
    return {
      valid: false,
      error: `Invalid file extension. Allowed: ${LOGO_CONSTRAINTS.ALLOWED_EXTENSIONS.join(', ')}`,
    }
  }

  // Check file size
  if (file.size > LOGO_CONSTRAINTS.MAX_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${LOGO_CONSTRAINTS.MAX_SIZE_MB}MB`,
    }
  }

  // Check if file is empty
  if (file.size === 0) {
    return { valid: false, error: 'File is empty' }
  }

  // Validate actual image content and dimensions
  try {
    const dimensions = await getImageDimensions(file)

    if (
      dimensions.width > LOGO_CONSTRAINTS.MAX_DIMENSION ||
      dimensions.height > LOGO_CONSTRAINTS.MAX_DIMENSION
    ) {
      return {
        valid: false,
        error: `Image too large. Maximum: ${LOGO_CONSTRAINTS.MAX_DIMENSION}x${LOGO_CONSTRAINTS.MAX_DIMENSION}px`,
      }
    }

    if (
      dimensions.width < LOGO_CONSTRAINTS.MIN_DIMENSION ||
      dimensions.height < LOGO_CONSTRAINTS.MIN_DIMENSION
    ) {
      return {
        valid: false,
        error: `Image too small. Minimum: ${LOGO_CONSTRAINTS.MIN_DIMENSION}x${LOGO_CONSTRAINTS.MIN_DIMENSION}px`,
      }
    }
  } catch (e) {
    return { valid: false, error: 'Invalid image file. Could not read image data.' }
  }

  // Sanitize filename
  const sanitizedName = sanitizeFileName(file.name)

  return { valid: true, sanitizedName }
}

/**
 * Gets image dimensions by loading it in memory
 * @param {File} file - Image file
 * @returns {Promise<{width: number, height: number}>}
 */
export function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.width, height: img.height })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}

/**
 * Sanitizes a filename to prevent path traversal and special character issues
 * @param {string} fileName - Original filename
 * @returns {string} - Sanitized filename
 */
export function sanitizeFileName(fileName) {
  const lastDot = fileName.lastIndexOf('.')
  const ext = lastDot !== -1 ? fileName.slice(lastDot).toLowerCase() : ''
  const name = lastDot !== -1 ? fileName.slice(0, lastDot) : fileName

  // Remove path traversal attempts and special characters
  const sanitized = name
    .replace(/\.\./g, '') // Remove path traversal
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // Remove invalid filename chars
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .replace(/[^\w\-]/g, '') // Keep only word chars and dashes
    .slice(0, 100) // Limit length

  const finalName = sanitized || `logo_${Date.now()}`

  return `${finalName}${ext}`
}

/**
 * Creates a sanitized File object with clean filename
 * @param {File} originalFile - Original file
 * @param {string} sanitizedName - Sanitized filename
 * @returns {File} - New file with sanitized name
 */
export function createSanitizedFile(originalFile, sanitizedName) {
  return new File([originalFile], sanitizedName, { type: originalFile.type })
}
