const BASE = 'https://recherche-entreprises.api.gouv.fr'

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

// Variantes de requête : « maj-it » doit aussi retrouver « MAJ IT » ou « MAJIT »
export function queryVariants(raw) {
  const q = String(raw || '').trim().replace(/\s+/g, ' ')
  const digits = q.replace(/[\s.]/g, '')
  if (/^\d{9}$|^\d{14}$/.test(digits)) return [digits] // SIREN / SIRET
  const set = new Set([q, strip(q), q.replace(/[-_.]/g, ' '), q.replace(/[-_.\s]/g, ''), strip(q).replace(/[-_.]/g, ' ')])
  return [...set].filter(v => v.length >= 2).slice(0, 4)
}

const mapResult = (e) => ({
  siren: e.siren,
  siret: e.siege?.siret || '',
  name: e.nom_complet || e.nom_raison_sociale,
  enseigne: e.siege?.nom_commercial || e.siege?.liste_enseignes?.[0] || '',
  naf: e.activite_principale,
  naf_label: e.libelle_activite_principale || e.siege?.libelle_activite_principale || '',
  adresse: e.siege?.adresse || '',
  ville: e.siege?.libelle_commune || e.siege?.commune || '',
  cp: e.siege?.code_postal || '',
  effectif: e.tranche_effectif_salarie || '',
  forme_juridique: e.nature_juridique || '',
  date_creation: e.date_creation || '',
  statut: e.etat_administratif === 'A' ? 'Actif' : 'Fermé'
})

async function fetchQuery(q) {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}&page=1&per_page=10`)
  if (res.status === 400 || res.status === 404) return []
  if (!res.ok) throw new Error(`Annuaire des entreprises indisponible (${res.status})`)
  const data = await res.json()
  return data.results || []
}

// Lance toutes les variantes en parallèle, fusionne par SIREN, actifs en premier
export async function searchEntreprises(query) {
  const variants = queryVariants(query)
  if (!variants.length || String(query || '').trim().length < 3) return []
  const settled = await Promise.allSettled(variants.map(fetchQuery))
  const ok = settled.filter(s => s.status === 'fulfilled')
  if (!ok.length) throw settled[0].reason
  const seen = new Map()
  for (const s of ok) for (const e of s.value) if (!seen.has(e.siren)) seen.set(e.siren, mapResult(e))
  return [...seen.values()].sort((a, b) => (a.statut === 'Actif' ? 0 : 1) - (b.statut === 'Actif' ? 0 : 1)).slice(0, 10)
}
