/**
 * Text transformation utilities for consistent title case formatting
 */

/**
 * Converts a string to title case (Every Word Capitalized)
 * Handles multiple sentences separated by periods, question marks, or exclamation points
 * Also converts snake_case and kebab-case to readable text (e.g., "lance_corporal" → "Lance Corporal")
 * @param {string} text - The text to convert
 * @param {boolean} preserveAcronyms - If true, preserves all-caps words (e.g., "API", "URL")
 * @returns {string} The title-cased text
 */
export function toSentenceCase(text, preserveAcronyms = false) {
  if (!text || typeof text !== 'string') return text

  // Convert snake_case and kebab-case to spaces
  // e.g., "lance_corporal" → "lance corporal", "senior-officer" → "senior officer"
  text = text.replace(/[_-]/g, ' ')

  // List of common acronyms to preserve (expand as needed)
  const commonAcronyms = ['API', 'URL', 'HTML', 'CSS', 'JS', 'ID', 'QR', 'PDF', 'CSV', 'JSON', 'SMS', 'GPS']

  // Small words that shouldn't be capitalized in title case (unless first/last word)
  const smallWords = ['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'yet', 'so', 'in', 'on', 'at', 'by', 'to', 'from', 'of', 'with', 'as']

  // Split by sentence endings (., !, ?)
  const sentences = text.split(/([.!?]\s+)/g)

  return sentences.map((sentence, index) => {
    // Skip separators (., !, ? with spaces)
    if (index % 2 === 1) return sentence

    // Trim whitespace
    const trimmed = sentence.trim()
    if (!trimmed) return sentence

    // Split into words
    const words = trimmed.split(/\s+/)

    return words.map((word, wordIndex) => {
      // Check if it's an acronym (all uppercase, 2+ chars)
      if (preserveAcronyms && word.length > 1 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) {
        // Check if it's in our known acronyms list
        if (commonAcronyms.includes(word.toUpperCase())) {
          return word
        }
      }

      const lowerWord = word.toLowerCase()

      // Small words in the middle: keep lowercase (unless first or last word)
      if (wordIndex !== 0 && wordIndex !== words.length - 1 && smallWords.includes(lowerWord)) {
        return lowerWord
      }

      // TITLE CASE: Capitalize every word (except small words in the middle)
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    }).join(' ')
  }).join('')
}

/**
 * Recursively transforms all string values in an object/array to title case
 * @param {any} data - The data to transform (object, array, or primitive)
 * @param {Object} options - Transformation options
 * @param {boolean} options.preserveAcronyms - Whether to preserve acronyms
 * @param {string[]} options.excludeKeys - Keys to exclude from transformation (e.g., ['password', 'token'])
 * @returns {any} The transformed data
 */
export function transformToSentenceCase(data, options = {}) {
  const { preserveAcronyms = false, excludeKeys = ['password', 'token', 'refresh', 'access', 'svc_number', 'email'] } = options

  // Handle null/undefined
  if (data == null) return data

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => transformToSentenceCase(item, options))
  }

  // Handle objects
  if (typeof data === 'object') {
    const transformed = {}
    for (const [key, value] of Object.entries(data)) {
      // Skip excluded keys
      if (excludeKeys.includes(key)) {
        transformed[key] = value
        continue
      }

      transformed[key] = transformToSentenceCase(value, options)
    }
    return transformed
  }

  // Handle strings
  if (typeof data === 'string') {
    // Skip URLs and file paths (e.g., /media/school_logos/..., http://...)
    if (/^(https?:\/\/|\/media\/|\/static\/)/.test(data) || /\.\w{2,4}$/.test(data)) {
      return data
    }
    return toSentenceCase(data, preserveAcronyms)
  }

  // Return other primitives as-is
  return data
}

/**
 * Transforms only specific fields in an object to sentence case
 * Useful when you want fine-grained control over which fields to transform
 * @param {Object} data - The object to transform
 * @param {string[]} fields - Array of field names to transform
 * @param {Object} options - Transformation options
 * @returns {Object} The transformed object
 */
export function transformFields(data, fields, options = {}) {
  if (!data || typeof data !== 'object') return data

  const transformed = { ...data }

  fields.forEach(field => {
    if (field in transformed && typeof transformed[field] === 'string') {
      transformed[field] = toSentenceCase(transformed[field], options.preserveAcronyms)
    }
  })

  return transformed
}

/**
 * Creates a transformer function for specific fields (useful for mapping)
 * @param {string[]} fields - Fields to transform
 * @param {Object} options - Transformation options
 * @returns {Function} Transformer function
 */
export function createFieldTransformer(fields, options = {}) {
  return (data) => transformFields(data, fields, options)
}

/**
 * CSS class utility for sentence case (lightweight alternative)
 * Use this in your Tailwind config for pure CSS transformation
 */
export const sentenceCaseClass = 'first-letter:uppercase lowercase'
