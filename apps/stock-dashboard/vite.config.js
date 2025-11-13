import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pulse from 'vite-plugin-pulse'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), pulse(), tailwindcss()],
  define: {
    // Provide process.env for browser environment
    'process.env': {}
  }
})
