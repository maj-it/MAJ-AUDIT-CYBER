// Client du scan externe (POST /api/scan) + application des constats au questionnaire
const TOKEN_KEY = 'e4c_scan_token'

export const getScanToken = () => { try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' } }
export const setScanToken = (t) => { try { localStorage.setItem(TOKEN_KEY, t) } catch {} }

export async function runExternalScan({ domain, ports, probes, subs, authorized }) {
  const token = getScanToken()
  const res = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-scan-token': token } : {}) },
    body: JSON.stringify({ domain, ports, probes, subs, authorized })
  })
  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`)
  return data
}

const SEV_IMPACT = { critical: 5, high: 4, medium: 3, low: 2, info: 1 }

// Constat en échec/alerte → risque de la cartographie
export function findingToRisk(f, domain) {
  return {
    name: `${f.title} (${domain})`,
    category: f.category === 'Messagerie' ? 'Messagerie' : 'Réseau',
    impact: SEV_IMPACT[f.severity] || 3,
    probability: f.status === 'fail' ? 4 : 3,
    description: [f.detail, f.recommendation && `Recommandation : ${f.recommendation}`].filter(Boolean).join(' — ')
  }
}

// Constats → valeurs du questionnaire (0 non implémenté, 1 partiel, 2 implémenté)
// Un contrôle n'est coché "implémenté" que si TOUS ses constats sont OK.
export function findingsToResponses(findings, referential) {
  const ids = new Set(referential.domains.flatMap(d => d.controls.map(c => c.id)))
  const byControl = {}
  for (const f of findings) {
    if (f.status === 'info') continue
    for (const c of f.controls || []) {
      if (!ids.has(c)) continue
      ;(byControl[c] ||= []).push(f)
    }
  }
  const out = {}
  for (const [c, fs] of Object.entries(byControl)) {
    const fails = fs.filter(f => f.status === 'fail')
    const warns = fs.filter(f => f.status === 'warn')
    const value = fails.length ? 0 : warns.length ? 1 : 2
    const bad = [...fails, ...warns].map(f => f.title)
    out[c] = { value, note: `Scan externe : ${bad.length ? bad.join(' ; ') : 'aucun écart détecté'}` }
  }
  return out
}
