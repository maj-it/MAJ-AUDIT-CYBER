// Correspondance thématique entre référentiels (table établie par MAJ-IT, non officielle : voir data/crosswalk.json)
import cw from '../data/crosswalk.json'

export const FRAMEWORKS = [
  { key: 'anssi', label: 'ANSSI' },
  { key: 'iso27001', label: 'ISO 27001' },
  { key: 'nis2', label: 'NIS2' },
  { key: 'rgpd', label: 'RGPD' },
  { key: 'nist', label: 'NIST CSF' }
]
export const CROSSWALK_NOTE = cw.note
export const sourceKey = (referentialId) => (referentialId === 'anssi-tpe' || referentialId === 'anssi' ? 'anssi' : referentialId)

// Score (0-100) d'un thème d'après les réponses de l'audit ; null si le référentiel audité ne couvre pas ce thème
export function crosswalkView(referentialId, responses = {}) {
  const src = sourceKey(referentialId)
  const themes = cw.themes.map(t => {
    const ids = t.map[src] || []
    const vals = ids.map(i => responses[i]).filter(v => v !== undefined && v !== null).map(Number)
    const score = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length / 3 * 100) : null
    return { id: t.id, name: t.name, map: t.map, score, answered: vals.length, total: ids.length }
  })
  const frameworks = FRAMEWORKS.map(f => {
    let num = 0, den = 0, controls = 0
    for (const t of themes) {
      const n = t.map[f.key].length
      controls += n
      if (t.score === null || !n) continue
      num += t.score * n; den += n
    }
    return { ...f, controls, estimated: den ? Math.round(num / den) : null, covered: den }
  })
  return { themes, frameworks, source: src }
}
