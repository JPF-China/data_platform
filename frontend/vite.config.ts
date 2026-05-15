import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        bigscreen: resolve(__dirname, 'bigscreen.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre'
          if (id.includes('node_modules/recharts')) return 'charts'
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react'
          return undefined
        },
      },
    },
  },
})
