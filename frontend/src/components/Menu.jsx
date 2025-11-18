import React from 'react'
import { Link, useLocation } from 'react-router-dom'
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
        visible: ['admin', 'instructor', 'student',],
      },
      {
        icon: 'User',
        label: 'Add User',
        // href: '/list/instructors',
        visible: ['admin'],
      },
      {
        icon: 'Users',
        label: 'Students',
        href: '/list/students',
        visible: ['admin', 'instructor'],
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
        icon: 'Book',
        label: 'Lessons',
        href: '/list/lessons',
        visible: ['admin', 'instructor'],
      },
      {
        icon: 'Award',
        label: 'Add Certificate',
        href: '/add/certificate',
        visible: ['admin', 'instructor'],
      },
      {
        icon: 'TrendingUp',
        label: 'Add Analytics',
        href: '/analytics',
        visible: ['admin', 'instructor'],
      },
      {
        icon: 'Clipboard',
        label: 'Exams',
        href: '/list/exams',
        visible: ['admin', 'instructor', 'student',],
      },
      {
        icon: 'FileText',
        label: 'Assignments',
        href: '/list/assignments',
        visible: ['admin', 'instructor', 'student',],
      },
      {
        icon: 'BarChart2',
        label: 'Results',
        href: '/list/results',
        visible: ['admin', 'instructor', 'student',],
      },
      {
        icon: 'CheckSquare',
        label: 'Attendance',
        href: '/list/attendance',
        visible: ['admin', 'instructor', 'student',],
      },
      {
        icon: 'Calendar',
        label: 'Events',
        href: '/list/events',
        visible: ['admin', 'instructor', 'student',],
      },
      // {
      //   icon: 'MessageCircle',
      //   label: 'Messages',
      //   href: '/list/messages',
      //   visible: ['admin', 'instructor', 'student',],
      // },
      {
        icon: 'Bell',
        label: 'Announcements',
        href: '/list/announcements',
        visible: ['admin', 'instructor', 'student',],
      },
    ],
  },
  {
    title: 'OTHER',
    items: [
      // {
      //   icon: 'User',
      //   label: 'Profile',
      //   href: '/profile',
      //   visible: ['admin', 'instructor', 'student',],
      // },
      // {
      //   icon: 'Settings',
      //   label: 'Settings',
      //   href: '/settings',
      //   visible: ['admin', 'instructor', 'student',],
      // },
      {
        icon: 'LogOut',
        label: 'Logout',
        href: '/logout',
        visible: ['admin', 'instructor', 'student',],
      },
    ],
  },
]

export default function Menu({ role = 'admin', collapsed = false }) {
  const location = useLocation()
  return (
    <nav className="mt-4 text-sm">
      {menuItems.map((section) => (
        <div className="flex flex-col gap-2" key={section.title}>
          <span className={`${collapsed ? 'hidden' : 'text-gray-300 font-medium my-3 hidden lg:block'}`}>{section.title}</span>
          {section.items.map((item) => (
            item.visible.includes(role) ? (
              collapsed ? (
                <Tooltip key={item.label} content={item.label} placement="right">
                  <Link
                    to={item.href}
                    title={item.label}
                    aria-label={item.label}
                    className={`group relative flex items-center justify-center gap-3 text-white py-2 px-2 rounded-md transition-all duration-150 transform hover:scale-[1.02] hover:bg-white/10 no-underline ${
                      location.pathname === item.href ? 'bg-white/10 ring-1 ring-white/20' : ''
                    }`}
                  >
                    {(() => {
                      const Icon = LucideIcons[item.icon] || LucideIcons.FileText
                      return <Icon className="w-6 h-6 text-white" strokeWidth={1.5} />
                    })()}
                  </Link>
                </Tooltip>
              ) : (
                <Link
                  to={item.href}
                  key={item.label}
                  title={item.label}
                  aria-label={item.label}
                  className={`group relative flex items-center justify-start gap-3 text-white py-2 px-2 rounded-md transition-all duration-150 transform hover:scale-[1.02] hover:bg-white/10 no-underline ${
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
            ) : null
          ))}
        </div>
      ))}
    </nav>
  )
}
