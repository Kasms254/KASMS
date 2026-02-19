import React from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import useAuth from '../hooks/useAuth'
import * as LucideIcons from 'lucide-react'
import Tooltip from './Tooltip'

const menuItems = [
  {
    title: 'MENU',
    items: [
      {
        icon: 'Home',
        label: 'Home',
        href: '/dashboard',
        visible: ['superadmin', 'admin', 'instructor', 'student'],
      },
      // Superadmin-only items
      {
        icon: 'Building2',
        label: 'Schools',
        href: '/superadmin/schools',
        visible: ['superadmin'],
      },
      {
        icon: 'UserCog',
        label: 'Admins',
        href: '/superadmin/admins',
        visible: ['superadmin'],
      },
      {
        icon: 'BarChart3',
        label: 'System Stats',
        href: '/superadmin/stats',
        visible: ['superadmin'],
      },
      // Admin items
      {
        icon: 'User',
        label: 'Add User',
        href: '/dashboard/add/user',
        visible: ['admin'],
      },
      {
        icon: 'Users',
        label: 'Students',
        href: '/dashboard/students',
        visible: ['instructor'],
      },
      {
        icon: 'BookOpen',
        label: 'Courses',
        href: '/list/courses',
        visible: ['admin'],
      },
      {
        icon: 'Layers',
        label: 'Classes',
        href: '/list/classes',
        visible: ['admin', 'instructor'],
      },
      {
        icon: 'FileText',
        label: 'Assignments',
        href: '/list/assignments',
        visible: ['admin'],
      },
      {
        icon: 'Building',
        label: 'Departments',
        href: '/list/departments',
        visible: ['admin'],
      },
      {
        icon: 'UserPlus',
        label: 'Dept. Members',
        href: '/list/department-members',
        visible: ['admin'],
      },
      {
        icon: 'LayoutDashboard',
        label: 'HOD Dashboard',
        href: '/dashboard/hod',
        visible: ['instructor'],
      },
      {
        icon: 'ClipboardCheck',
        label: 'Edit Requests',
        href: '/list/edit-requests',
        visible: ['instructor'],
      },
      // {
      //   icon: 'Book',
      //   label: 'Lessons',
      //   href: '/list/lessons',
      //   visible: ['instructor'],
      // },
      {
        icon: 'Award',
        label: 'Certificates',
        href: '/list/certificates',
        visible: ['admin'],
      },
      {
        icon: 'Image',
        label: 'Certificate Templates',
        href: '/list/certificate-templates',
        visible: ['admin'],
      },
      {
        icon: 'Award',
        label: 'My Certificates',
        href: '/list/my-certificates',
        visible: ['student'],
      },
     
      {
        icon: 'Clipboard',
        label: 'Exams',
        href: '/list/exams',
        visible: ['instructor',],
      },
      {
        icon: 'BarChart2',
        label: 'Results',
        href: '/list/results',
        visible: ['instructor', 'student',],
      },
      {
        icon: 'FileBarChart',
        label: 'Exam Reports',
        href: '/list/exam-reports',
        visible: ['admin', 'instructor'],
      },
      
       {
        icon: 'TrendingUp',
        label: 'Analytics',
        href: '/analytics',
        visible: ['admin', 'instructor'],
      },
      {
        icon: 'QrCode',
        label: 'Attendance Sessions',
        href: '/list/attendance-sessions',
        visible: ['instructor'],
      },
      {
        icon: 'UserCheck',
        label: 'My Attendance',
        href: '/list/my-attendance',
        visible: ['student'],
      },
      {
        icon: 'BarChart',
        label: 'Attendance Reports',
        href: '/list/attendance-reports',
        visible: ['admin', 'instructor'],
      },
      
      {
        icon: 'Megaphone',
        label: 'Class notices',
        href: '/list/class-notices',
        visible: ['instructor'],
      },
      // {
      //   icon: 'MessageCircle',
      //   label: 'Messages',
      //   href: '/list/messages',
      //   visible: ['admin', 'instructor', 'student',],
      // },
      {
        icon: 'Megaphone',
        label: 'Notices',
        href: '/list/notices',
        visible: ['admin'],
      },
      {
        icon: 'Bell',
        label: 'Notifications',
        href: '/list/notifications',
        visible: ['admin', 'instructor', 'student'],
      },
      {
        icon: 'LogOut',
        label: 'Logout',
        href: '/logout',
        visible: ['superadmin', 'admin', 'instructor', 'student'],
      },
    ],
  },
]

export default function Menu({ role = 'admin', collapsed = false, onMobileMenuClick }) {
  const location = useLocation()
  const navigate = useNavigate()
  const auth = useAuth()
  const [logoutModalOpen, setLogoutModalOpen] = React.useState(false)

  async function handleLogout() {
    setLogoutModalOpen(false)
    try {
      await auth.logout()
    } catch { /* ignore logout errors */ }
    navigate('/')
    if (onMobileMenuClick) onMobileMenuClick()
  }

  return (
    <nav className="mt-4 text-sm">
      {menuItems.map((section) => (
        <div className="flex flex-col gap-2" key={section.title}>
          <span className={`${collapsed ? 'hidden' : 'text-gray-300 font-medium my-3 hidden lg:block'}`}>{section.title}</span>
          {section.items.map((item) => {
            if (!item.visible.includes(role)) return null

            // collapsed view: show icon only inside a Tooltip
            if (collapsed) {
              return (
                <Tooltip key={item.label} content={item.label} placement="right">
                  {item.href === '/logout' ? (
                    <button
                      title={item.label}
                      aria-label={item.label}
                      onClick={() => setLogoutModalOpen(true)}
                      className="group relative flex items-center justify-center gap-3 text-red-300 py-2 px-2 rounded-md transition-all duration-150 transform hover:scale-[1.02] hover:bg-red-500/20 hover:text-red-200 no-underline"
                    >
                      {(() => {
                        const Icon = LucideIcons[item.icon] || LucideIcons.FileText
                        return <Icon className="w-6 h-6 text-red-300 group-hover:text-red-200" strokeWidth={1.5} />
                      })()}
                    </button>
                  ) : (
                    <Link
                      to={item.href}
                      key={item.label}
                      title={item.label}
                      aria-label={item.label}
                      onClick={() => { if (onMobileMenuClick) onMobileMenuClick() }}
                      className={`group relative flex items-center justify-center gap-3 text-white py-2 px-2 rounded-md transition-all duration-150 transform hover:scale-[1.02] hover:bg-white/10 no-underline ${
                        location.pathname === item.href ? 'bg-white/10 ring-1 ring-white/20' : ''
                      }`}
                    >
                      {(() => {
                        const Icon = LucideIcons[item.icon] || LucideIcons.FileText
                        return <Icon className="w-6 h-6 text-white" strokeWidth={1.5} />
                      })()}
                    </Link>
                  )}
                </Tooltip>
              )
            }

            // expanded view: show icon + label
            if (item.href === '/logout') {
              return (
                <button
                  key={item.label}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => setLogoutModalOpen(true)}
                  className="group relative flex items-center justify-start gap-3 text-red-300 py-2 px-3 md:px-2 rounded-md transition-all duration-150 transform hover:scale-[1.02] hover:bg-red-500/20 hover:text-red-200 no-underline"
                >
                  {(() => {
                    const Icon = LucideIcons[item.icon] || LucideIcons.FileText
                    return <Icon className="w-6 h-6 text-red-300 group-hover:text-red-200" strokeWidth={1.5} />
                  })()}

                  <span className={`${'block'}`}>{item.label}</span>
                </button>
              )
            }

            return (
              <Link
                to={item.href}
                key={item.label}
                title={item.label}
                aria-label={item.label}
                onClick={() => { if (onMobileMenuClick) onMobileMenuClick() }}
                className={`group relative flex items-center justify-start gap-3 text-white py-2 px-3 md:px-2 rounded-md transition-all duration-150 transform hover:scale-[1.02] hover:bg-white/10 no-underline ${
                  location.pathname === item.href ? 'bg-white/10 ring-1 ring-white/20' : ''
                }`}
              >
                {(() => {
                  const Icon = LucideIcons[item.icon] || LucideIcons.FileText
                  return <Icon className="w-6 h-6 text-white" strokeWidth={1.5} />
                })()}

                <span className={`${'block'}`}>{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}

      {/* Logout Confirmation Modal */}
      {logoutModalOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setLogoutModalOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative z-10 w-full max-w-md">
            <div className="bg-white rounded-xl p-6 shadow-2xl ring-1 ring-black/5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <LucideIcons.LogOut className="w-5 h-5 text-red-600" />
                </div>
                <h4 className="text-lg font-semibold text-black">Confirm Logout</h4>
              </div>
              <p className="text-sm text-neutral-600 mb-6">Are you sure you want to logout? You will need to sign in again to access your account.</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setLogoutModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700 transition"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </nav>
  )
}
