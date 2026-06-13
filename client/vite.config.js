import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // relative base so one build works both served by our Node server ('/')
  // and on a GitHub Pages project subpath ('/<repo>/')
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT) || 3000,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
