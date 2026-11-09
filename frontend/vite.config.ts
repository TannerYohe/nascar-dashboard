import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The FastAPI dev server (uv run fastapi dev) listens on 8000.
    proxy: { '/api': 'http://localhost:8000' },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
