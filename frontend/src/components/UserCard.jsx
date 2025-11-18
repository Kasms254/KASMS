import React from 'react'
import Card from './Card'

const typeMap = {
  admin: { title: 'Admins', accent: 'bg-indigo-600', icon: 'Shield' },
  teacher: { title: 'Instructors', accent: 'bg-emerald-500', icon: 'BookOpen' },
  student: { title: 'Students', accent: 'bg-sky-500', icon: 'Users' },
  subject: { title: 'Subject', accent: 'bg-amber-500', icon: 'Home' },
}

export default function UserCard({ type = 'student', count = null }) {
  // Accept a few common synonyms/plurals (e.g. "instructors") and normalize
  const aliases = {
    instructors: 'teacher',
    instructor: 'teacher',
    students: 'student',
    subject: 'subject',
  }

  const key = aliases[type] || type
  const cfg = typeMap[key] || typeMap.student
  return (
    <Card
      badge="2024/25"
      title={cfg.title}
      value={count}
      className=""
      badgeClass="bg-white/5 text-black"
      accent={cfg.accent}
      icon={cfg.icon}
      colored={true}
    />
  )
}
