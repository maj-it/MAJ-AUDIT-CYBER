// Fonction serverless Vercel : POST /api/ai (variables : ANTHROPIC_API_KEY ou GEMINI_API_KEY, SCAN_TOKEN)
import { handleAi } from '../server/aiHandler.js'

export const config = { maxDuration: 30 }

export default function handler(req, res) {
  return handleAi(req, res, { requireToken: true })
}
