// Proxy IA côté serveur : les clés (ANTHROPIC_API_KEY ou GEMINI_API_KEY, sans préfixe VITE_) ne quittent jamais le serveur.
// Anthropic est prioritaire s'il est configuré, sinon Gemini.
import { readJson } from './scanHandler.js'

const MAX_MESSAGES = 6
const MAX_CHARS = 24000

// Défense en profondeur : masque aussi côté serveur les identifiants évidents
const anonymize = (t = '') => String(t)
  .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
  .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[ip]')
  .replace(/\b\d{14}\b/g, '[siret]')
  .replace(/\b\d{9}\b/g, '[siren]')

function send(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

export async function handleAi(req, res, { requireToken = false } = {}) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non autorisée' })
  if (requireToken) {
    const expected = process.env.SCAN_TOKEN
    if (!expected) return send(res, 503, { error: 'SCAN_TOKEN non configuré côté serveur : IA cloud désactivée.' })
    if (req.headers['x-scan-token'] !== expected) return send(res, 401, { error: 'Jeton invalide.' })
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  if (!anthropicKey && !geminiKey) return send(res, 503, { error: 'Aucune clé IA (ANTHROPIC_API_KEY ou GEMINI_API_KEY) côté serveur : IA cloud indisponible.' })
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : await readJson(req)
    const msgs = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : []
    if (!msgs.length) return send(res, 400, { error: 'Aucun message.' })
    if (msgs.reduce((n, m) => n + String(m?.content || '').length, 0) > MAX_CHARS) return send(res, 413, { error: 'Contenu trop volumineux.' })
    const system = msgs.filter(m => m.role === 'system').map(m => anonymize(m.content)).join('\n')
    const turns = msgs.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', text: anonymize(m.content) }))

    if (anthropicKey) {
      // L'API Anthropic exige des tours alternés commençant par « user » : on fusionne les tours consécutifs
      const merged = []
      for (const t of turns) {
        const last = merged[merged.length - 1]
        if (last && last.role === t.role) last.content += '\n\n' + t.text
        else merged.push({ role: t.role, content: t.text })
      }
      while (merged.length && merged[0].role !== 'user') merged.shift()
      if (!merged.length) return send(res, 400, { error: 'Aucun message utilisateur.' })
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
          max_tokens: 2048,
          temperature: 0.3,
          ...(system ? { system } : {}),
          messages: merged
        })
      })
      if (!r.ok) return send(res, 502, { error: `Anthropic a répondu ${r.status}.` })
      const data = await r.json()
      return send(res, 200, { text: (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('') })
    }

    const contents = turns.map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] }))
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        contents,
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        generationConfig: { maxOutputTokens: 2048, temperature: 0.3 }
      })
    })
    if (!r.ok) return send(res, 502, { error: `Gemini a répondu ${r.status}.` })
    const data = await r.json()
    send(res, 200, { text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' })
  } catch (e) {
    send(res, e.status || 500, { error: e.message || 'Erreur IA' })
  }
}
