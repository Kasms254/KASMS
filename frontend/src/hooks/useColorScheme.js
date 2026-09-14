import { useContext } from 'react'
import { ColorSchemeContext } from '../context/colorSchemeContext'

export default function useColorScheme() {
  const context = useContext(ColorSchemeContext)
  if (!context) {
    throw new Error('useColorScheme must be used within a ColorSchemeProvider')
  }
  return context
}
