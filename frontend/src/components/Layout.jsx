import React, { useState } from 'react'
import { Outlet, Link } from 'react-router-dom'
import Menu from './Menu'
import NavBar from './NavBar'
import useAuth from '../hooks/useAuth'
import useTheme from '../hooks/useTheme'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { user } = useAuth()
  const { theme } = useTheme()
  const role = user?.role || 'student'

  // Dynamic sidebar gradient style using theme colors
  const sidebarStyle = {
    background: `linear-gradient(to bottom, ${theme.primary_color}cc, ${theme.secondary_color}cc)`,
  }

  return (
    <>
      <div className="min-h-screen flex text-gray-900 dark:text-gray-100">
        {/* Mobile/Tablet Sidebar Overlay (drawer) */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar - Desktop: always visible, Mobile/Tablet: drawer */}
        <aside
          className={`
            sidebar fixed inset-y-0 left-0 z-50
            transition-transform duration-300 ease-in-out
            overflow-y-auto text-white p-4 shadow-lg
            backdrop-blur-sm
            ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
            lg:translate-x-0
            ${collapsed ? 'lg:w-20' : 'lg:w-64'}
            w-64
          `}
          style={sidebarStyle}
          aria-label="Sidebar navigation"
        >
          <Link to="/dashboard" className="flex items-center gap-2 mb-6" onClick={() => setMobileMenuOpen(false)}>
            <img
              src={theme.logo_url || '/ka.png'}
              alt={`${theme.school_name || 'School'} logo`}
              className="w-8 h-8 rounded object-contain bg-white/10"
            />
            <span className={`${collapsed ? 'lg:hidden' : ''} font-semibold text-lg`}>
              {theme.school_name || 'KASMS'}
            </span>
          </Link>
          <Menu role={role} collapsed={collapsed} onMobileMenuClick={() => setMobileMenuOpen(false)} />
        </aside>

        {/* Main area */}
        <div className={`flex-1 min-h-screen flex flex-col w-full lg:w-auto transition-all duration-300 ${collapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
          <header className="sticky top-0 z-40 shadow-sm bg-white/5 text-white backdrop-blur-sm border-b border-white/5">
            <NavBar
              collapsed={collapsed}
              onToggle={() => {
                // On mobile/tablet: toggle drawer, on desktop: toggle collapse
                if (window.innerWidth < 1024) {
                  setMobileMenuOpen((s) => !s)
                } else {
                  setCollapsed((s) => !s)
                }
              }}
            />
          </header>
          <main className="p-4 sm:p-6 flex-1 overflow-auto">
            {/* Clean content area — no rounded panel or shadow */}
            <div className="w-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
