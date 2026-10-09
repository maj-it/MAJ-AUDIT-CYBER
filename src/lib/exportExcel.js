import * as XLSX from 'xlsx'
import { approvedAudit } from './review.js'
import { getMaturityLevel, normalizeDomainScores } from './scoring.js'

export function exportAuditExcel(audit, referential, company) {
  audit = approvedAudit(audit)
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Résumé ──
  const summaryData = [
    ['RAPPORT D\'AUDIT CYBERSÉCURITÉ', '', '', ''],
    ['', '', '', ''],
    ['Référentiel', referential.name, '', ''],
    ['Entreprise', company?.name || 'N/A', '', ''],
    ['Date', new Date().toLocaleDateString('fr-FR'), '', ''],
    ['Score Global', `${audit.score || 0}%`, '', ''],
    ['Niveau de Maturité', getMaturityLevel(audit.score || 0).level, '', ''],
    ['Risque Global', audit.aiAnalysis?.risque_global || 'N/A', '', ''],
    ['', '', '', ''],
    ['SCORES PAR DOMAINE', '', '', ''],
    ['Domaine', 'Score', 'Maturité', 'Réponses'],
    ...Object.values(normalizeDomainScores(audit.domainScores)).map(d => [
      d.name,
      `${d.score}%`,
      getMaturityLevel(d.score).level,
      `${d.answered}/${d.total}`
    ])
  ]

  const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
  ws1['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 15 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Résumé')

  // ── Sheet 2: Réponses détaillées ──
  const detailHeaders = ['Domaine', 'ID Contrôle', 'Nom du Contrôle', 'Criticité', 'Réponse', 'Score %', 'Note']
  const detailRows = []

  for (const domain of referential.domains) {
    for (const control of domain.controls) {
      const raw = audit.responses?.[control.id]
      const note = audit.notes?.[control.id] || ''
      let label = 'Non répondu'
      let pct = 0

      if (raw !== undefined && raw !== null) {
        const n = Number(raw)
        if (!isNaN(n)) {
          const matLabels = ['Non implémenté', 'Partiellement implémenté', 'Implémenté', 'Optimisé']
          label = matLabels[n] || 'N/A'
          pct = [0, 33, 67, 100][n] || 0
        } else {
          const compLabels = { non_conforme: 'Non Conforme', partiel: 'Partiellement Conforme', conforme: 'Conforme', na: 'Non Applicable' }
          label = compLabels[raw] || raw
          pct = { non_conforme: 0, partiel: 50, conforme: 100, na: 0 }[raw] || 0
        }
      }

      detailRows.push([domain.name, control.id, control.name, control.criticality, label, pct, note])
    }
  }

  const ws2 = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows])
  ws2['!cols'] = [{ wch: 25 }, { wch: 12 }, { wch: 45 }, { wch: 12 }, { wch: 28 }, { wch: 10 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Réponses Détaillées')

  // ── Sheet 3: Plan d'actions ──
  if (audit.actionPlan?.length) {
    const actionHeaders = ['ID', 'Contrôle', 'Action', 'Responsable', 'Priorité', 'Délai', 'Effort', 'Coût', 'Statut']
    const actionRows = audit.actionPlan.map(a => [
      a.id, a.controle, a.action, a.responsable, a.priorite, a.delai, a.effort, a.cout, a.statut
    ])
    const ws3 = XLSX.utils.aoa_to_sheet([actionHeaders, ...actionRows])
    ws3['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 60 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, ws3, 'Plan d\'Actions')
  }

  // ── Sheet 4: Analyse IA ──
  if (audit.aiAnalysis) {
    const aiData = [
      ['ANALYSE IA — ' + referential.name],
      [''],
      ['Résumé Exécutif', audit.aiAnalysis.resume || ''],
      ['Niveau de Maturité', audit.aiAnalysis.niveau_maturite || ''],
      ['Risque Global', audit.aiAnalysis.risque_global || ''],
      [''],
      ['POINTS FORTS'],
      ...(audit.aiAnalysis.points_forts || []).map(p => ['', '• ' + p]),
      [''],
      ['FAIBLESSES CRITIQUES'],
      ...(audit.aiAnalysis.faiblesses_critiques || []).map(f => ['', '• ' + f]),
      [''],
      ['RECOMMANDATIONS'],
      ['Priorité', 'Action', 'Délai', 'Impact'],
      ...(audit.aiAnalysis.recommandations || []).map(r => [r.priorite, r.action, r.delai, r.impact])
    ]
    const ws4 = XLSX.utils.aoa_to_sheet(aiData)
    ws4['!cols'] = [{ wch: 25 }, { wch: 80 }, { wch: 15 }, { wch: 40 }]
    XLSX.utils.book_append_sheet(wb, ws4, 'Analyse IA')
  }

  XLSX.writeFile(wb, `audit-${referential.id}-${company?.name?.replace(/\s/g, '_') || 'rapport'}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
