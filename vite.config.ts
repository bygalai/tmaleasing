import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'supabase'
            if (id.includes('@tanstack/react-virtual')) return 'virtual'
            if (id.includes('react-router')) return 'router'
            if (id.includes('react-dom') || id.includes('/react/')) return 'react-vendor'
          }
        },
      },
    },
  },
})
