import { QueryClient } from '@tanstack/react-query'

// Shared React Query client. Lives in its own module (not main.jsx) so that
// non-component code (e.g. noticesCache.js) can import it without creating
// a circular dependency through the app entry point.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
    },
  },
})
