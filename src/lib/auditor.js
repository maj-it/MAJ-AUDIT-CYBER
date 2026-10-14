// Identité de l'auditeur affichée dans les rapports (modifiable via localStorage 'majaudit_auditor')
const DEFAULT = { name: 'Babette Flore Majeu', org: 'MAJ-IT', site: 'maj-it.eu' }
export function getAuditor() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem('majaudit_auditor') || '{}') } } catch { return DEFAULT }
}
export function setAuditor(a) { try { localStorage.setItem('majaudit_auditor', JSON.stringify(a)) } catch {} }
