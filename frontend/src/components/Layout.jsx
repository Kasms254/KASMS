import React, { useState } from 'react'
import { Outlet, Link } from 'react-router-dom'
import Menu from './Menu'
import NavBar from './NavBar'
import ToastProvider from './ToastProvider'

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <ToastProvider>
      <div className="min-h-screen flex text-gray-900 dark:text-gray-100">
      {/* Sidebar */}
      <aside
        className={`transition-all duration-300 overflow-hidden text-white p-4 shadow-lg backdrop-blur-sm bg-gradient-to-b from-[#0ea5a4]/80 to-[#166534]/80 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
        aria-label="Sidebar navigation"
      >
  <Link to="/dashboard" className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-indigo-500 rounded flex items-center justify-center text-white font-bold">S</div>
          <span className={`${collapsed ? 'hidden' : 'font-semibold text-lg'}`}>School Management System</span>
        </Link>
        <Menu role="admin" collapsed={collapsed} />
      </aside>

      {/* Main area */}
      <div className="flex-1 min-h-screen flex flex-col">
        <header className="sticky top-0 z-40 shadow-sm bg-white/5 text-white backdrop-blur-sm border-b border-white/5">
          <NavBar user={{ name: 'John Doe', role: 'admin' }} collapsed={collapsed} onToggle={() => setCollapsed((s) => !s)} />
        </header>
        <main className="p-6 flex-1 overflow-auto">
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
