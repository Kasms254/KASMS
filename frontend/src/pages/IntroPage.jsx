import { useEffect, useLayoutEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight } from 'lucide-react'
import useAuth from '../hooks/useAuth'

// Background gradients for the splash. Kept as inline styles rather than Tailwind
// arbitrary values because these are multi-stop gradients that become unreadable
// once escaped into class names.
const CANVAS =
  'linear-gradient(180deg, #fdfbfb 0%, #ffffff 42%, #fdf7f8 100%)'

const AMBIENT_GLOW =
  'radial-gradient(ellipse 80% 55% at 50% 30%, rgba(159,18,57,0.07), transparent 70%)'

export default function IntroPage() {
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState(false)
  const { user, logout } = useAuth()

  // If the user lands on the public intro page while still authenticated
  // (e.g. back-navigating from the dashboard), invalidate the session immediately.
  // useLayoutEffect fires before the browser paints, so logout() + setUser(null)
  // is committed before the forward button can navigate away.
  useLayoutEffect(() => {
    if (user) {
      logout()
    }
  }, [user, logout])

  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 80)
    return () => clearTimeout(timer)
  }, [])

  // Staggered reveal. Under prefers-reduced-motion the global rule in index.css
  // collapses the duration, so this resolves to an instant paint.
  const reveal = (delay) =>
    `transition-all duration-700 ${delay} ${
      loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
    }`

  return (
    <div
      className="relative min-h-screen flex flex-col overflow-hidden text-gray-900"
      style={{ background: CANVAS }}
    >
      {/* Ambient warmth behind the crest */}
      <div
        className="pointer-events-none absolute inset-0 animate-[brand-breathe_9s_ease-in-out_infinite]"
        style={{ background: AMBIENT_GLOW }}
        aria-hidden="true"
      />

      {/* Hero */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 md:px-12 py-16">
        <div className="w-full max-w-xl text-center">
          {/* Crest */}
          <div className={`flex items-center justify-center ${reveal('delay-[80ms]')}`}>
            <div className="w-28 h-28 md:w-32 md:h-32 rounded-full bg-white p-4 shadow-xl shadow-red-900/10 ring-1 ring-red-900/10">
              <img src="/ka.png" alt="" className="w-full h-full object-contain" aria-hidden="true" />
            </div>
          </div>

          {/* Wordmark */}
          <h1
            className={`mt-9 text-4xl sm:text-5xl md:text-6xl font-semibold leading-none ${reveal('delay-[160ms]')}`}
          >
            <span className="inline-block tracking-[0.24em] -mr-[0.24em] text-transparent bg-clip-text bg-gradient-to-r from-red-900 to-rose-800">
              ELIMUKA
            </span>
          </h1>

          {/* Rule with centre mark */}
          <div className={`mt-7 flex items-center justify-center gap-3 ${reveal('delay-[220ms]')}`} aria-hidden="true">
            <span className="h-px w-16 sm:w-24 bg-gradient-to-r from-transparent to-red-900/25" />
            <span className="w-1.5 h-1.5 rotate-45 bg-red-900/40" />
            <span className="h-px w-16 sm:w-24 bg-gradient-to-l from-transparent to-red-900/25" />
          </div>

          <p
            className={`mt-7 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.32em] text-red-900/70 ${reveal('delay-[280ms]')}`}
          >
            Training Platform
          </p>

          <p
            className={`mt-6 text-sm sm:text-base leading-relaxed text-gray-600 max-w-md mx-auto ${reveal('delay-[340ms]')}`}
          >
            A platform designed to streamline training and enhance the learning experience.
          </p>

          {/* Primary action */}
          <div className={`mt-10 ${reveal('delay-[400ms]')}`}>
            <button
              onClick={() => navigate('/login')}
              className="group inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-red-900 to-rose-800 px-9 py-3.5 text-sm font-semibold text-white shadow-xl shadow-red-900/20 transition-all duration-300 hover:from-red-800 hover:to-rose-700 hover:shadow-2xl hover:shadow-red-900/25 hover:scale-[1.03] active:scale-100"
            >
              Log In
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className={`relative z-10 border-t border-red-900/10 ${reveal('delay-[460ms]')}`}>
        <div className="px-6 md:px-12 lg:px-20 py-6 text-center">
          <p className="text-xs text-gray-500">
            © {new Date().getFullYear()} KACS. All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
