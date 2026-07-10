// Shared, cached access to notice/notification endpoints.
// NavBar and StudentsDashboard both need this data; routing their fetches
// through queryClient.fetchQuery dedupes concurrent requests and serves
// results from cache while fresh, instead of each component hitting the
// API independently.
import { queryClient } from './queryClient'
import * as api from './api'

// Short staleTime so polling consumers still pick up new notices quickly.
const STALE_MS = 30 * 1000

export function fetchMyClassNotices() {
  return queryClient.fetchQuery({
    queryKey: ['notices', 'class'],
    queryFn: () => api.getMyClassNotices(),
    staleTime: STALE_MS,
  })
}

export function fetchUrgentNotices() {
  return queryClient.fetchQuery({
    queryKey: ['notices', 'urgent'],
    queryFn: () => api.getUrgentNotices(),
    staleTime: STALE_MS,
  })
}

export function fetchActiveNotices() {
  return queryClient.fetchQuery({
    queryKey: ['notices', 'active'],
    queryFn: () => api.getActiveNotices(),
    staleTime: STALE_MS,
  })
}

export function fetchUnreadPersonalNotifications() {
  return queryClient.fetchQuery({
    queryKey: ['personal-notifications', 'unread'],
    queryFn: () => api.getUnreadPersonalNotifications(),
    staleTime: STALE_MS,
  })
}

// Call when notices are created/updated/deleted so the next fetch bypasses
// the cache (used by 'notices:changed' event handlers).
export function invalidateNotices() {
  queryClient.invalidateQueries({ queryKey: ['notices'] })
  queryClient.invalidateQueries({ queryKey: ['personal-notifications'] })
}
