import { useEffect, useState } from 'react'
import * as api from '../../../lib/api'

// Choice lists come from the backend so labels and allowed values have a
// single source of truth (RoleRequirementViewSet.choices).
let cache = null

export default function useRequirementChoices() {
  const [choices, setChoices] = useState(cache)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (cache) return
    let cancelled = false
    api.getRoleRequirementChoices()
      .then((data) => {
        cache = data
        if (!cancelled) setChoices(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load form options.')
      })
    return () => { cancelled = true }
  }, [])

  return { choices, error }
}
