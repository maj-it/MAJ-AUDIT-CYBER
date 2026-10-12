// ─────────────────────────────────────────────────────────────
// Couche IA d'MAJ Audit
//  - Ollama (local) par défaut : les données du client ne quittent pas la machine
//  - Gemini (cloud) uniquement si l'utilisateur l'active explicitement
//  - Secours hors-ligne : le rapport ne dépend jamais de l'IA
// ─────────────────────────────────────────────────────────────

const CONFIG_KEY = 'e4c_ai_config'
const DEFAULTS = {
  ollamaBase: import.meta.env.VITE_OLLAMA_BASE || (import.meta.env.DEV ? '/ollama' : 'http://localhost:11434'),
  ollamaModel: import.meta.env.VITE_OLLAMA_MODEL || 'qwen2.5-coder:7b',
  geminiModel: 'gemini-2.0-flash',
  allowCloud: false // inutilisé : le cloud n'est utilisé que si la mission l'autorise explicitement (opts.cloud)
}
import { getScanToken } from './scan.js'

let lastEngine = 'local'
let lastNote = ''
// Message d'information sur la dernière génération (ex. repli sur les règles) ; '' si l'IA a répondu
export const getLastNote = () => lastNote
export const getLastEngine = () => lastEngine

export function getAIConfig() {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setAIConfig(patch) {
  const next = { ...getAIConfig(), ...patch }
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(next)) } catch {}
  return next
}

// Retire les données identifiantes avant tout envoi vers un service cloud
export function anonymize(text = '') {
  return String(text)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[ip]')
    .replace(/\b\d{14}\b/g, '[siret]')
    .replace(/\b\d{9}\b/g, '[siren]')
}

// État des moteurs IA : utilisé pour afficher un statut honnête dans l'interface
export async function aiStatus() {
  const cfg = getAIConfig()
  const status = { ollama: false, models: [], model: cfg.ollamaModel, modelInstalled: false, cloudAllowed: false }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 2500)
    const res = await fetch(`${cfg.ollamaBase}/api/tags`, { signal: ctrl.signal })
    clearTimeout(t)
    if (res.ok) {
      const data = await res.json()
      status.ollama = true
      status.models = (data.models || []).map(m => m.name)
      status.modelInstalled = status.models.some(n => n === cfg.ollamaModel || n.startsWith(cfg.ollamaModel + ':'))
    }
  } catch {}
  return status
}

// IA cloud : passe par le serveur (/api/ai) qui détient la clé ; données anonymisées côté client puis serveur
async function geminiChat(messages) {
  const token = getScanToken()
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-scan-token': token } : {}) },
    body: JSON.stringify({ messages: messages.map(m => ({ role: m.role, content: anonymize(m.content) })) })
  })
  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok) throw new Error(data?.error || `IA cloud indisponible (${res.status})`)
  return data.text || ''
}

// Si le modèle configuré n'est pas installé, utilise un modèle Qwen installé (sinon le premier disponible)
let modelCache = { at: 0, name: null }
async function resolveModel(cfg) {
  if (modelCache.name && Date.now() - modelCache.at < 60000) return modelCache.name
  const st = await aiStatus()
  let name = cfg.ollamaModel
  if (st.ollama && st.models.length && !st.modelInstalled) {
    name = st.models.find(n => /^qwen/i.test(n) && /instruct/i.test(n)) || st.models.find(n => /^qwen/i.test(n)) || st.models[0]
  }
  modelCache = { at: Date.now(), name }
  return name
}

async function ollamaRequest(messages, onChunk) {
  const cfg = getAIConfig()
  const model = await resolveModel(cfg)
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), Number(import.meta.env.VITE_OLLAMA_TIMEOUT_MS) || 150000)
  try {
    const response = await fetch(`${cfg.ollamaBase}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: !!onChunk }),
      signal: ctrl.signal
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Ollama ${response.status}${detail ? ' : ' + detail.slice(0, 120) : ''}`)
    }
    if (!onChunk) {
      const data = await response.json()
      return data.message?.content || ''
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let full = ''
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() // dernière ligne éventuellement incomplète
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const data = JSON.parse(line)
          if (data.message?.content) {
            full += data.message.content
            onChunk(data.message.content, full)
          }
        } catch {}
      }
    }
    return full
  } finally {
    clearTimeout(timeout)
  }
}

// opts.cloud : autorise le secours cloud (uniquement si la mission l'a consenti)
export async function ollamaChat(messages, onChunk = null, opts = {}) {
  const cfg = getAIConfig()
  let ollamaError
  try {
    const out = await ollamaRequest(messages, onChunk)
    lastEngine = 'local'
    return out
  } catch (e) {
    ollamaError = e
  }
  if (opts.cloud) {
    const result = await geminiChat(messages)
    lastEngine = 'cloud'
    if (onChunk) onChunk(result, result)
    return result
  }
  throw new Error(
    `IA indisponible (${ollamaError?.message || 'Ollama injoignable'}). ` +
    `Lancez Ollama (ollama serve) avec le modèle ${cfg.ollamaModel}.`
  )
}

// ── Utilitaires ──────────────────────────────────────────────

function extractJSON(text) {
  const clean = String(text || '').replace(/```json|```/g, '').trim()
  try { return JSON.parse(clean) } catch {}
  const m = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (m) { try { return JSON.parse(m[1]) } catch {} }
  return null
}

const isNonConform = v => v === 0 || v === '0' || v === 'non_conforme'
const isPartial = v => v === 1 || v === '1' || v === 'partiel'

function indexControls(referential) {
  const map = {}
  for (const d of referential.domains || []) {
    for (const c of d.controls) map[c.id] = { ...c, domain: d.name }
  }
  return map
}

const DELAI = { P1: '30 jours', P2: '90 jours', P3: '6 mois' }
const EFFORT = { high: 'Moyen', medium: 'Moyen', low: 'Faible' }

// ── Secours hors-ligne (aucune IA nécessaire) ────────────────

export function buildOfflineActionPlan(referential, responses) {
  const idx = indexControls(referential)
  const owner = referential.id === 'anssi-tpe' ? 'Dirigeant / prestataire IT' : 'RSSI'
  const items = Object.entries(responses)
    .filter(([id, v]) => idx[id] && (isNonConform(v) || isPartial(v)))
    .map(([id, v]) => {
      const c = idx[id]
      const crit = c.criticality || 'medium'
      const nc = isNonConform(v)
      const priorite = nc ? (crit === 'low' ? 'P2' : 'P1') : (crit === 'high' ? 'P2' : 'P3')
      return { id, c, nc, priorite, crit, w: c.weight || 1 }
    })
    .sort((a, b) => a.priorite.localeCompare(b.priorite) || b.w - a.w)
    .slice(0, 15)

  return items.map((it, i) => ({
    id: `PA-${String(i + 1).padStart(3, '0')}`,
    controle: it.id,
    action: `${it.nc ? 'Mettre en place' : 'Compléter'} : ${it.c.name}. ${it.c.description || ''}`.trim(),
    responsable: owner,
    priorite: it.priorite,
    delai: DELAI[it.priorite],
    effort: EFFORT[it.crit],
    cout: it.crit === 'high' ? '< 5k€' : 'Sans coût',
    statut: 'A faire',
    source: 'regles'
  }))
}

export function buildOfflineAnalysis(referential, responses, domainScores = {}, globalScore = null) {
  const idx = indexControls(referential)
  const scores = Object.entries(domainScores)
  // le score global officiel (pondéré) prime sur la moyenne simple des domaines : même chiffre partout
  const avg = Number.isFinite(globalScore) ? Math.round(globalScore) : (scores.length ? Math.round(scores.reduce((a, [, s]) => a + s, 0) / scores.length) : 0)
  const nc = Object.entries(responses).filter(([id, v]) => idx[id] && isNonConform(v))
  const ncHigh = nc.filter(([id]) => idx[id].criticality === 'high')
  const sorted = [...scores].sort((a, b) => a[1] - b[1])
  const strong = sorted.filter(([, s]) => s >= 70).map(([n, s]) => `${n} (${s}%)`)
  const weak = sorted.filter(([, s]) => s < 60).slice(0, 4).map(([n, s]) => `${n} (${s}%)`)
  const risque = ncHigh.length >= 5 || avg < 30 ? 'Critique' : ncHigh.length >= 2 || avg < 50 ? 'Élevé' : avg < 70 ? 'Moyen' : 'Faible'
  const niveau = avg >= 80 ? 'Optimisé' : avg >= 60 ? 'Géré' : avg >= 40 ? 'Défini' : avg >= 20 ? 'Répétable' : 'Initial'
  const plan = buildOfflineActionPlan(referential, responses)

  return {
    resume: `Audit ${referential.name} : score global ${avg}%, ${nc.length} contrôle(s) non conforme(s) dont ${ncHigh.length} de criticité élevée. ` +
      (weak.length ? `Domaines à traiter en priorité : ${weak.join(', ')}.` : 'Aucun domaine sous le seuil de 60 %.'),
    points_forts: strong.length ? strong : ['Aucun domaine au-dessus de 70 % pour le moment'],
    faiblesses_critiques: ncHigh.slice(0, 5).map(([id]) => `${id} — ${idx[id].name}`),
    niveau_maturite: niveau,
    risque_global: risque,
    recommandations: plan.slice(0, 6).map(p => ({
      priorite: p.priorite, action: p.action.split('. ')[0], delai: p.delai,
      impact: `Réduit l'exposition liée à ${p.controle}`
    })),
    source: 'regles'
  }
}

function offlineExplain(c) {
  return {
    objectif: c.description || c.name,
    preuves_attendues: ['Documentation / procédure', 'Capture de configuration', 'Entretien avec le responsable'],
    risques_si_absent: ['Non-conformité au référentiel', 'Exposition accrue aux incidents de sécurité'],
    mise_en_oeuvre: c.question ? `Question d'entretien : ${c.question}` : 'Documenter la mesure, désigner un responsable et vérifier son application.',
    exemple_pratique: 'Voir la fiche détaillée du référentiel.',
    source: 'regles'
  }
}

// ── Fonctions appelées par l'interface ───────────────────────

export async function analyzeAuditResponses(referential, responses, domainScores, ctx = {}) {
  const offline = buildOfflineAnalysis(referential, responses, domainScores, ctx.globalScore)
  const idx = indexControls(referential)
  const lowDomains = Object.entries(domainScores).filter(([, s]) => s < 60).map(([d, s]) => `${d}: ${s}%`).join(', ')
  const nonConform = Object.entries(responses).filter(([id, v]) => idx[id] && isNonConform(v))
    .map(([id]) => `${id} ${idx[id].name}`).join('; ')

  const prompt = `Tu es consultant en cybersécurité et conformité. Analyse les résultats d'un audit ${referential.name}.
${contextLine(ctx)}

DOMAINES FAIBLES (< 60%) : ${lowDomains || 'Aucun'}
CONTRÔLES NON CONFORMES : ${nonConform || 'Aucun'}
SCORE GLOBAL : ${Number.isFinite(ctx.globalScore) ? Math.round(ctx.globalScore) : (Object.values(domainScores).length ? Math.round(Object.values(domainScores).reduce((a, b) => a + b, 0) / Object.values(domainScores).length) : 0)}%

Réponds UNIQUEMENT avec ce JSON (sans markdown) :
{"resume":"2-3 phrases","points_forts":["..."],"faiblesses_critiques":["..."],"niveau_maturite":"Initial|Répétable|Défini|Géré|Optimisé","risque_global":"Critique|Élevé|Moyen|Faible","recommandations":[{"priorite":"P1","action":"...","delai":"...","impact":"..."}]}`

  lastNote = ''
  try {
    const parsed = extractJSON(await ollamaChat([{ role: 'user', content: prompt }], null, { cloud: !!ctx.cloud }))
    if (parsed && parsed.resume) return { ...offline, ...parsed, source: lastEngine === 'cloud' ? 'ia-cloud' : 'ia-local', validated: false }
    lastNote = 'Réponse de l\'IA inexploitable : synthèse générée par les règles.'
  } catch (e) {
    lastNote = `IA indisponible ou trop lente (${String(e?.message || e).slice(0, 90)}) : synthèse générée par les règles.`
  }
  return { ...offline, validated: true }
}

export async function explainControl(controlId, controlName, controlDescription, extra = {}) {
  const fallback = offlineExplain({ name: controlName, description: controlDescription, ...extra })
  const prompt = `Tu es consultant en cybersécurité. Explique le contrôle ${controlId} - "${controlName}".
Description officielle : ${controlDescription}

Réponds UNIQUEMENT en JSON :
{"objectif":"1 phrase","preuves_attendues":["...","...","..."],"risques_si_absent":["...","..."],"mise_en_oeuvre":"2-3 phrases","exemple_pratique":"exemple concret d'une PME"}`
  try {
    const parsed = extractJSON(await ollamaChat([{ role: 'user', content: prompt }]))
    if (parsed && parsed.objectif) return { ...fallback, ...parsed, source: 'ia' }
  } catch {}
  return fallback
}

const ENUM = {
  responsable: ['RSSI', 'DSI', 'DPO', 'Direction', 'RH', 'Prestataire IT', 'Dirigeant / prestataire IT'],
  effort: ['Faible', 'Moyen', 'Élevé'],
  cout: ['Sans coût', '< 5k€', '5-20k€', '> 20k€']
}

// Contexte transmis au modèle : jamais de nom d'entreprise ; le périmètre n'est jamais envoyé au cloud
function contextLine(ctx = {}) {
  const parts = []
  if (ctx.sector) parts.push(`secteur : ${anonymize(ctx.sector)}`)
  if (ctx.size) parts.push(`taille : ${anonymize(ctx.size)}`)
  if (ctx.perimetre && !ctx.cloud) parts.push(`périmètre : ${ctx.perimetre}`)
  return parts.length ? `CONTEXTE CLIENT (${parts.join(' ; ')}). Adapte les actions à cette taille et ce secteur.` : ''
}

export async function generateActionPlan(referential, responses, ctx = {}) {
  const base = buildOfflineActionPlan(referential, responses).map(b => ({ ...b, validated: true }))
  lastNote = ''
  if (!base.length) return base
  // L'IA locale (souvent sur CPU) ne reformule que les 5 actions les plus prioritaires : plus rapide, plus fiable
  const head = base.slice(0, 5)
  const prompt = `Consultant GRC. Reformule et complète ce plan d'actions pour l'audit ${referential.name}.
${contextLine(ctx)}
Garde exactement les mêmes champs "id", "controle", "priorite", "delai". Rends "action" concrète (1-2 phrases, réaliste pour la taille du client) et ajuste "responsable", "effort", "cout".
Valeurs possibles : responsable = RSSI|DSI|DPO|Direction|RH|Prestataire IT ; effort = Faible|Moyen|Élevé ; cout = Sans coût|< 5k€|5-20k€|> 20k€.
N'invente aucun identifiant : n'utilise que ceux fournis.

PLAN :
${JSON.stringify(head.map(({ id, controle, action, priorite, delai }) => ({ id, controle, action, priorite, delai })))}

Réponds UNIQUEMENT avec le tableau JSON.`
  try {
    const parsed = extractJSON(await ollamaChat([{ role: 'user', content: prompt }], null, { cloud: !!ctx.cloud }))
    if (Array.isArray(parsed) && parsed.length) {
      const byId = Object.fromEntries(base.map(b => [b.id, b]))
      const source = lastEngine === 'cloud' ? 'ia-cloud' : 'ia-local'
      const ai = new Map()
      for (const p of parsed) {
        const b = p && byId[p.id]
        if (!b || p.controle !== b.controle) continue // identifiant ou contrôle inventé : rejeté
        const action = typeof p.action === 'string' ? p.action.trim().slice(0, 500) : ''
        if (action.length < 15) continue
        ai.set(p.id, {
          ...b, action, source, validated: false,
          responsable: ENUM.responsable.includes(p.responsable) ? p.responsable : b.responsable,
          effort: ENUM.effort.includes(p.effort) ? p.effort : b.effort,
          cout: ENUM.cout.includes(p.cout) ? p.cout : b.cout
        })
      }
      if (ai.size) return base.map(b => ai.get(b.id) || b) // priorité, délai et contrôle restent ceux des règles
    }
    lastNote = 'Réponse de l\'IA inexploitable : plan généré par les règles.'
  } catch (e) {
    lastNote = `IA indisponible ou trop lente (${String(e?.message || e).slice(0, 90)}) : plan généré par les règles.`
  }
  return base
}
