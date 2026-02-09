import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, ClipboardList, BarChart3, ArrowRight, Target, Shield, Award } from 'lucide-react'

export default function IntroPage() {
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 100)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToSection = (id) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const features = [
    {
      icon: Users,
      title: 'Student Management',
      description: 'Efficiently manage student records, enrollment, and academic progress with our comprehensive tools.',
      color: 'bg-gradient-to-br from-red-900 to-rose-800',
    },
    {
      icon: ClipboardList,
      title: 'Examinations Management',
      description: 'Create, schedule, and manage examinations with automated grading and result generation.',
      color: 'bg-gradient-to-br from-red-800 to-rose-700',
    },
    {
      icon: BarChart3,
      title: 'Analytics & Reports',
      description: 'Get detailed insights on attendance, performance trends, and comprehensive academic reports.',
      color: 'bg-gradient-to-br from-red-900 to-red-800',
    },
  ]

  const aboutItems = [
    {
      icon: Target,
      title: 'Our Mission',
      description: 'To provide a seamless and efficient school management experience that empowers instructors, students, and administrators to achieve academic excellence.',
    },
    {
      icon: Shield,
      title: 'Our Values',
      description: 'We uphold integrity, discipline, and excellence in everything we do. Our system is built on the principles of reliability, security, and user-centric design.',
    },
    {
      icon: Award,
      title: 'Our Commitment',
      description: 'We are committed to continuous improvement and innovation, ensuring that KASMS remains at the forefront of educational technology solutions.',
    },
  ]

  return (
    <div className="min-h-screen bg-white relative">
      {/* Fixed Navbar */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 px-6 md:px-12 lg:px-20 py-4 transition-all duration-300 ${
          scrolled ? 'bg-white/95 backdrop-blur-sm shadow-md' : 'bg-transparent'
        }`}
      >
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-red-900 to-rose-800 rounded-full p-1 shadow-lg">
              <div className="w-full h-full bg-white rounded-full p-0.5">
                <img src="/ka.png" alt="KASMS Logo" className="w-full h-full object-contain" />
              </div>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-red-900 font-bold text-lg tracking-tight">KASMS</h1>
              <p className="text-gray-500 text-xs">School Management</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8">
            <button
              onClick={() => scrollToSection('home')}
              className="text-gray-700 hover:text-red-900 font-medium text-sm transition-colors"
            >
              Home
            </button>
            <button
              onClick={() => scrollToSection('about')}
              className="text-gray-700 hover:text-red-900 font-medium text-sm transition-colors"
            >
              About Us
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="text-gray-700 hover:text-red-900 font-medium text-sm transition-colors"
            >
              Features
            </button>
          </nav>

          {/* Login button */}
          <button
            onClick={() => navigate('/login')}
            className="px-5 py-2 bg-gradient-to-r from-red-900 to-rose-800 hover:from-red-800 hover:to-rose-700 rounded-full text-white text-sm font-medium transition-all duration-300 hover:scale-105 shadow-md hover:shadow-lg"
          >
            Log In
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section id="home" className="min-h-screen relative overflow-hidden flex items-center">
        {/* Faded background logo */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          <img
            src="/ka.png"
            alt=""
            className="w-[600px] h-[600px] md:w-[800px] md:h-[800px] object-contain opacity-[0.08] select-none"
          />
        </div>

        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-red-50/50 via-transparent to-rose-50/30 pointer-events-none" />

        <div className="relative z-10 px-6 md:px-12 lg:px-20 pt-24 pb-16 w-full">
          <div className="max-w-4xl mx-auto text-center">
            {/* Main heading */}
            <h2
              className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6 transition-all duration-700 delay-100 ${
                loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              Kenya Army{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-900 to-rose-700">
                School Management
              </span>{' '}
              System
            </h2>

            {/* Description */}
            <p
              className={`text-gray-600 text-base md:text-lg lg:text-xl max-w-2xl mx-auto mb-10 leading-relaxed transition-all duration-700 delay-200 ${
                loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              A Comprehensive Platform For Managing Classes, Students, Instructors,
              Examinations, and Academic Results With Efficiency and Precision.
            </p>

            {/* CTA Button */}
            <div
              className={`transition-all duration-700 delay-300 ${
                loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <button
                onClick={() => navigate('/login')}
                className="group inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-red-900 to-rose-800 hover:from-red-800 hover:to-rose-700 text-white font-semibold text-base rounded-full shadow-xl hover:shadow-2xl hover:shadow-red-900/20 transition-all duration-300 hover:scale-105"
              >
                Get Started
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* About Us Section */}
      <section id="about" className="py-20 bg-gray-50">
        <div className="px-6 md:px-12 lg:px-20">
          <div className="max-w-6xl mx-auto">
            {/* Section Header */}
            <div className="text-center mb-16">
              <h3 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                About <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-900 to-rose-700">KASMS</span>
              </h3>
              <p className="text-gray-600 max-w-2xl mx-auto">
                The Kenya Army School Management System is designed to streamline training operations
                and enhance the learning experience for military training institutions.
              </p>
            </div>

            {/* About Items */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {aboutItems.map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.title}
                    className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 text-center group"
                  >
                    <div className="w-16 h-16 bg-gradient-to-br from-red-900 to-rose-800 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300">
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <h4 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h4>
                    <p className="text-gray-500 leading-relaxed">{item.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="px-6 md:px-12 lg:px-20">
          <div className="max-w-6xl mx-auto">
            {/* Section Header */}
            <div className="text-center mb-16">
              <h3 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Our <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-900 to-rose-700">Features</span>
              </h3>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Powerful tools designed to simplify school management and enhance productivity.
              </p>
            </div>

            {/* Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {features.map((feature) => {
                const Icon = feature.icon
                return (
                  <div
                    key={feature.title}
                    className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 text-center group"
                  >
                    <div className={`w-16 h-16 ${feature.color} rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <h4 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h4>
                    <p className="text-gray-500 leading-relaxed">{feature.description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-white border-t border-gray-100">
        <div className="px-6 md:px-12 lg:px-20">
          <div className="max-w-6xl mx-auto text-center">
            <p className="text-gray-500 text-sm">
              © {new Date().getFullYear()} KASMS — All Rights Reserved
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
