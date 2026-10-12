// Identité de l'auditeur affichée dans les rapports (modifiable via localStorage 'e4c_auditor')
const DEFAULT = { name: 'Babette Flore Majeu', org: 'MAJ-IT', site: 'maj-it.eu' }
export function getAuditor() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem('e4c_auditor') || '{}') } } catch { return DEFAULT }
}
export function setAuditor(a) { try { localStorage.setItem('e4c_auditor', JSON.stringify(a)) } catch {} }
