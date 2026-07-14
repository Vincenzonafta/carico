import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VERCEL ? '/' : '/carico/', // Vercel serve da root, GitHub Pages sotto /carico/
  plugins: [react()],
})
