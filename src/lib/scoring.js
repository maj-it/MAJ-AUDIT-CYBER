export const MATURITY_LABELS = {
  0: { label: 'Non implémenté', short: 'N/A', color: '#ef4444', pct: 0 },
  1: { label: 'Partiellement implémenté', short: 'Partiel', color: '#f97316', pct: 33 },
  2: { label: 'Implémenté', short: 'OK', color: '#22c55e', pct: 67 },
  3: { label: 'Optimisé', short: 'Optimisé', color: '#00c9d4', pct: 100 }
}

export const COMPLIANCE_LABELS = {
  'non_conforme': { label: 'Non Conforme', color: '#ef4444', pct: 0 },
  'partiel':      { label: 'Partiellement Conforme', color: '#f97316', pct: 50 },
  'conforme':     { label: 'Conforme', color: '#22c55e', pct: 100 },
  'na':           { label: 'Non Applicable', color: '#64748b', pct: null }
}

export const MATURITY_LEVELS = [
  { min: 0,  max: 20,  level: 'Initial',   color: '#ef4444', description: 'Processus ad hoc, imprévisibles' },
  { min: 20, max: 40,  level: 'Répétable', color: '#f97316', description: 'Processus répétables mais non formalisés' },
  { min: 40, max: 60,  level: 'Défini',    color: '#eab308', description: 'Processus documentés et standardisés' },
  { min: 60, max: 80,  level: 'Géré',      color: '#22c55e', description: 'Processus mesurés et contrôlés' },
  { min: 80, max: 101, level: 'Optimisé',  color: '#00c9d4', description: 'Amélioration continue' }
]

export function getScoreColor(score) {
  if (score >= 80) return '#00c9d4'
  if (score >= 60) return '#22c55e'
  if (score >= 40) return '#eab308'
  if (score >= 20) return '#f97316'
  return '#ef4444'
}

export function getMaturityLevel(score) {
  return MATURITY_LEVELS.find(l => score >= l.min && score < l.max) || MATURITY_LEVELS[0]
}

export function scoreValue(value, mode = 'maturity') {
  if (value === null || value === undefined) return null
  if (mode === 'maturity') {
    const v = Number(value)
    return MATURITY_LABELS[v]?.pct ?? null
  }
  if (mode === 'compliance') {
    return COMPLIANCE_LABELS[value]?.pct ?? null
  }
  return null
}

export function computeAuditScore(referential, responses, mode = 'maturity') {
  if (!referential || !referential.domains) return { globalScore: 0, domainScores: {}, maturity: MATURITY_LEVELS[0], stats: {} }
  const domainScores = {}
  let totalWeightedScore = 0
  let totalWeight = 0

  for (const domain of referential.domains) {
    let domainWeightedScore = 0
    let domainWeight = 0
    let answered = 0

    for (const control of domain.controls) {
      const raw = responses[control.id]
      const pct = scoreValue(raw, mode)
      if (pct === null) continue
      const w = control.weight || 1
      domainWeightedScore += pct * w
      domainWeight += w
      answered++
    }

    if (domainWeight > 0) {
      const ds = Math.round(domainWeightedScore / domainWeight)
      domainScores[domain.id] = {
        score: ds,
        name: domain.name,
        answered,
        total: domain.controls.length,
        color: getScoreColor(ds)
      }
      totalWeightedScore += ds * (domain.weight || 1)
      totalWeight += (domain.weight || 1)
    } else {
      domainScores[domain.id] = {
        score: 0,
        name: domain.name,
        answered: 0,
        total: domain.controls.length,
        color: '#64748b'
      }
    }
  }

  const globalScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 0
  const maturity = getMaturityLevel(globalScore)

  const allResponses = Object.values(responses || {})
  const stats = { non_conforme: 0, partiel: 0, conforme: 0, na: 0, total: 0 }
  allResponses.forEach(v => {
    const n = Number(v)
    if (n === 0) stats.non_conforme++
    else if (n === 1) stats.partiel++
    else if (n >= 2) stats.conforme++
    stats.total++
  })

  return { globalScore, domainScores, maturity, stats }
}

export function computeCompletion(referential, responses) {
  if (!referential || !referential.domains) return { total: 0, answered: 0, pct: 0 }
  const total = referential.domains.reduce((acc, d) => acc + d.controls.length, 0)
  const answered = Object.keys(responses || {}).filter(k => responses[k] !== null && responses[k] !== undefined).length
  return { total, answered, pct: total > 0 ? Math.round((answered / total) * 100) : 0 }
}

// Accepte l'ancien format {nom: score} et le format {id: {name, score, ...}}
export function normalizeDomainScores(ds) {
  const out = {}
  for (const [k, v] of Object.entries(ds || {})) {
    if (v && typeof v === 'object') out[k] = v
    else if (typeof v === 'number') out[k] = { name: k, score: v, answered: 0, total: 0, color: getScoreColor(v) }
  }
  return out
}

export function getRadarData(domainScores) {
  domainScores = normalizeDomainScores(domainScores)
  if (!domainScores || typeof domainScores !== 'object') return []
  const entries = Object.values(domainScores)
  if (!entries || entries.length === 0) return []
  return entries.map(d => {
    if (!d || typeof d !== 'object') return { subject: '?', fullName: '?', score: 0, fullMark: 100 }
    return {
      subject: d.name && d.name.length > 15 ? d.name.substring(0, 15) + '…' : (d.name || '?'),
      fullName: d.name || '?',
      score: d.score || 0,
      fullMark: 100
    }
  })
}

export function criticityBadge(criticality) {
  const map = { critical: 'badge-critical', high: 'badge-high', medium: 'badge-medium', low: 'badge-low' }
  return map[criticality] || 'badge-info'
}

export function criticityLabel(criticality) {
  const map = { critical: 'Critique', high: 'Élevé', medium: 'Moyen', low: 'Faible' }
  return map[criticality] || criticality
}
