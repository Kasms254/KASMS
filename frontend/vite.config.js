import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Disable source maps in production to hide source code
    sourcemap: false,
    minify: 'oxc', // Vite 8's default minifier (Rolldown/Oxc replaced esbuild)
    rolldownOptions: {
      output: {
        // Rolldown dropped the object form of manualChunks; groups replace it.
        codeSplitting: {
          groups: [
            {
              name: 'vendor',
              test: /[\\/]node_modules[\\/](react|react-dom|react-router)[\\/]/,
              includeDependenciesRecursively: true,
            },
          ],
        },
        // Remove ALL console methods and debugger statements in production.
        // Replaces the old esbuild.drop option; minification only runs on build,
        // so dev keeps its console output.
        minify: {
          compress: { dropConsole: true, dropDebugger: true },
        },
      },
    },
  },
})
