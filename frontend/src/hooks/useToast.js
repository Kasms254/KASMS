import { useContext } from 'react'
import { ToastContext } from '../context/toastContext'

export default function useToast() {
  return useContext(ToastContext)
}
