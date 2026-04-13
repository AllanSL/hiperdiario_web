import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api-cnes': {
        target: 'https://apidadosabertos.saude.gov.br',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-cnes/, '')
      },
      '/api-datasus': {
        target: 'https://cnes.datasus.gov.br',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-datasus/, ''),
        headers: {
          'Referer': 'https://cnes.datasus.gov.br/pages/estabelecimentos/consulta.jsp'
        }
      }
    }
  }
})
