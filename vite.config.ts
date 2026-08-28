import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El repositorio se publica en https://<usuario>.github.io/incipit/
// `base` se puede sobrescribir con BASE_PATH (útil para dominios propios: BASE_PATH=/).
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/incipit/',
  build: { outDir: 'dist', sourcemap: false },
})
