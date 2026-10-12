// Gestionnaire HTTP partagé (middleware Vite en local, fonction serverless sur Vercel)
import { runScan } from './scan.js'

export function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', c => { data += c; if (data.length > 10000) { reject(new Error('Corps trop volumineux')); req.destroy() } })
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { reject(new Error('JSON invalide')) } })
    req.on('error', reject)
  })
}

function send(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

// requireToken : en production (Vercel), un jeton est obligatoire pour éviter qu'un tiers utilise le scanner
export async function handleScan(req, res, { requireToken = false } = {}) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée' })
  if (requireToken) {
    const expected = process.env.SCAN_TOKEN
    if (!expected) return send(res, 503, { error: 'SCAN_TOKEN non configuré côté serveur : scanner désactivé.' })
    if (req.headers['x-scan-token'] !== expected) return send(res, 401, { error: 'Jeton de scan invalide.' })
  }
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : await readJson(req)
    if (body.authorized !== true) {
      return send(res, 400, { error: "Autorisation écrite du propriétaire du domaine non confirmée : scan refusé." })
    }
    const result = await runScan({ domain: body.domain, ports: !!body.ports, probes: !!body.probes, subs: !!body.subs })
    send(res, 200, result)
  } catch (e) {
    send(res, e.status || 500, { error: e.message || 'Erreur de scan' })
  }
}
