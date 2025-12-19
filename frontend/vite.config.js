import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // build: {
  //   minify: 'terser',
  //   terserOptions: {
  //     compress: {
  //       // Remove console logs in production builds for security
  //       drop_console: true,
  //       drop_debugger: true,
  //     },
  //   },
  // },
})
