import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base is relative so the build works on GitHub Pages, Vercel or Netlify unchanged.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
})
