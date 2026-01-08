import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // build: {
  //   // Disable source maps in production to hide source code
  //   sourcemap: false,
  //   minify: 'esbuild', // esbuild is faster than terser
  //   rollupOptions: {
  //     output: {
  //       manualChunks: {
  //         vendor: ['react', 'react-dom', 'react-router-dom'],
  //       },
  //     },
  //   },
  // },
  // esbuild: {
  //   // Remove ALL console methods and debugger statements in production
  //   drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  // },
})
