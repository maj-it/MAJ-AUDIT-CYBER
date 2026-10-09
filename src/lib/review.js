// Vue « validée » d'un audit : les suggestions IA non validées n'entrent ni dans le PDF ni dans l'Excel.
export function approvedAudit(audit) {
  return {
    ...audit,
    actionPlan: (audit.actionPlan || []).filter(a => a.validated !== false),
    aiAnalysis: audit.aiAnalysis?.validated === false ? null : audit.aiAnalysis
  }
}
