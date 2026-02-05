import { useMemo } from 'react'
import { toSentenceCase, transformToSentenceCase } from '../lib/textTransform'

/**
 * Hook to transform a single text value to sentence case
 * @param {string} text - The text to transform
 * @param {Object} options - Transformation options
 * @returns {string} The sentence-cased text
 */
export function useSentenceCase(text, options = {}) {
  return useMemo(() => {
    return toSentenceCase(text, options.preserveAcronyms)
  }, [text, options.preserveAcronyms])
}

/**
 * Hook to transform an entire data object/array to sentence case
 * @param {any} data - The data to transform
 * @param {Object} options - Transformation options
 * @returns {any} The transformed data
 */
export function useSentenceCaseData(data, options = {}) {
  return useMemo(() => {
    return transformToSentenceCase(data, options)
  }, [data, options.preserveAcronyms, options.excludeKeys])
}

/**
 * Hook to transform specific fields in data
 * @param {Object} data - The object to transform
 * @param {string[]} fields - Fields to transform
 * @param {Object} options - Transformation options
 * @returns {Object} The transformed object
 */
export function useSentenceCaseFields(data, fields, options = {}) {
  return useMemo(() => {
    if (!data) return data

    const transformed = { ...data }
    fields.forEach(field => {
      if (field in transformed && typeof transformed[field] === 'string') {
        transformed[field] = toSentenceCase(transformed[field], options.preserveAcronyms)
      }
    })
    return transformed
  }, [data, fields, options.preserveAcronyms])
}
