import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleScan } from './server/scanHandler.js'
import { handleAi } from './server/aiHandler.js'

// POST /api/scan et /api/ai en développement (npm run dev) : exécutés sur la machine de l'auditeur, sans jeton.
// GEMINI_API_KEY (sans préfixe VITE_) n'est jamais envoyée au navigateur.
const serverApis = () => ({
  name: 'e4c-server-apis',
  configureServer(server) {
    server.middlewares.use('/api/scan', (req, res) => handleScan(req, res, { requireToken: false }))
    server.middlewares.use('/api/ai', (req, res) => handleAi(req, res, { requireToken: false }))
  }
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const k of ['GEMINI_API_KEY', 'GEMINI_MODEL']) if (env[k] && !process.env[k]) process.env[k] = env[k]
  return {
    plugins: [react(), serverApis()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/ollama': {
          target: process.env.OLLAMA_URL || 'http://localhost:11434',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ollama/, ''),
          // Ollama renvoie 403 si l'Origin du navigateur n'est pas dans OLLAMA_ORIGINS : on le retire.
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin')
              proxyReq.removeHeader('referer')
            })
          }
        }
      }
    }
  }
})
