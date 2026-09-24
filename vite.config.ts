import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

const host = '0.0.0.0'
const port = Number(process.env.PORT ?? 8443)

export default defineConfig({
  plugins: [react(), reactRouter(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: { host, port, strictPort: true },
  preview: { host, port },
})
