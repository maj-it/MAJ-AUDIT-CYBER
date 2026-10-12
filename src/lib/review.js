// L'annuaire officiel renvoie « [NON-DIFFUSIBLE] » pour les entreprises qui ont demandé la non-diffusion de leurs données
export const isNonDiffusible = (name) => /non[\s-]*diffusible/i.test(String(name || ''))
export const companyLabel = (company) =>
  !company?.name || isNonDiffusible(company.name) ? 'Entreprise auditée (raison sociale non communiquée)' : company.name

// Vue « validée » d'un audit : les suggestions IA non validées n'entrent ni dans le PDF ni dans l'Excel.
export function approvedAudit(audit) {
  return {
    ...audit,
    actionPlan: (audit.actionPlan || []).filter(a => a.validated !== false),
    aiAnalysis: audit.aiAnalysis?.validated === false ? null : audit.aiAnalysis
  }
}
