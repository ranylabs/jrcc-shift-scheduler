import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/jrcc-shift-scheduler/',
  plugins: [react()],
})