// Fonction serverless Vercel : POST /api/scan
// Variable d'environnement requise : SCAN_TOKEN (jeton partagé, envoyé dans l'en-tête x-scan-token)
import { handleScan } from '../server/scanHandler.js'

export const config = { maxDuration: 30 }

export default function handler(req, res) {
  return handleScan(req, res, { requireToken: true })
}
