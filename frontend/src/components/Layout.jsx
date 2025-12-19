import React, { useState } from 'react'
import { Outlet, Link } from 'react-router-dom'
import Menu from './Menu'
import NavBar from './NavBar'
import useAuth from '../hooks/useAuth'
import ToastProvider from './ToastProvider'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { user } = useAuth()
  const role = user?.role || 'student'

  return (
    <ToastProvider>
      <div className="min-h-screen flex text-gray-900 dark:text-gray-100">
        {/* Mobile Sidebar Overlay (drawer) */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar - Desktop: always visible, Mobile: drawer */}
        <aside
          className={`
            fixed md:static inset-y-0 left-0 z-50
            transition-transform duration-300 ease-in-out
            overflow-y-auto text-white p-4 shadow-lg
            backdrop-blur-sm bg-gradient-to-b from-[#0ea5a4]/80 to-[#166534]/80
            ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0
            ${collapsed ? 'md:w-20' : 'md:w-64'}
            w-64
          `}
          aria-label="Sidebar navigation"
        >
          <Link to="/dashboard" className="flex items-center gap-2 mb-6" onClick={() => setMobileMenuOpen(false)}>
            <div className="w-8 h-8 bg-indigo-500 rounded flex items-center justify-center text-white font-bold">S</div>
            <span className={`${collapsed ? 'md:hidden' : ''} font-semibold text-lg`}>School Management System</span>
          </Link>
          <Menu role={role} collapsed={collapsed} onMobileMenuClick={() => setMobileMenuOpen(false)} />
        </aside>

        {/* Main area */}
        <div className="flex-1 min-h-screen flex flex-col w-full md:w-auto">
          <header className="sticky top-0 z-40 shadow-sm bg-white/5 text-white backdrop-blur-sm border-b border-white/5">
            <NavBar
              collapsed={collapsed}
              onToggle={() => {
                // On mobile: toggle drawer, on desktop: toggle collapse
                if (window.innerWidth < 768) {
                  setMobileMenuOpen((s) => !s)
                } else {
                  setCollapsed((s) => !s)
                }
              }}
            />
          </header>
          <main className="p-4 sm:p-6 flex-1 overflow-auto">
            {/* Clean content area — no rounded panel or shadow */}
            <div className="max-w-7xl mx-auto w-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
