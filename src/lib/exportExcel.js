import * as XLSX from 'xlsx'
import { approvedAudit, companyLabel } from './review.js'
import { getMaturityLevel, normalizeDomainScores, computeAuditScore } from './scoring.js'
import { crosswalkView, CROSSWALK_NOTE } from './crosswalk.js'
import { getAuditor } from './auditor.js'

export function exportAuditExcel(audit, referential, company) {
  audit = approvedAudit(audit)
  const wb = XLSX.utils.book_new()
  const auditor = getAuditor()
  const mission = audit.mission || {}

  // Recalcule si les scores enregistrés sont absents (même logique que le PDF)
  let score = audit.score
  let domainScores = audit.domainScores
  if (score == null || !domainScores || !Object.keys(domainScores).length) {
    const c = computeAuditScore(referential, audit.responses || {})
    score = c.globalScore
    domainScores = c.domainScores
  }

  // ── Sheet 1: Résumé ──
  const summaryData = [
    ['RAPPORT D\'AUDIT CYBERSÉCURITÉ', '', '', ''],
    ['', '', '', ''],
    ['Référentiel', referential.name, '', ''],
    ['Entreprise', companyLabel(company), '', ''],
    ...(company?.siret ? [['SIRET', company.siret, '', '']] : []),
    ['Date', new Date().toLocaleDateString('fr-FR'), '', ''],
    ['Auditeur', `${auditor.name} — ${auditor.org} (${auditor.site})`, '', ''],
    ...(mission.perimetre ? [['Périmètre', mission.perimetre, '', '']] : []),
    ...(mission.interlocuteur ? [['Interlocuteur', mission.interlocuteur, '', '']] : []),
    ...(mission.dateDebut ? [['Période', `${mission.dateDebut}${mission.dateFin ? ' → ' + mission.dateFin : ''}`, '', '']] : []),
    ...(mission.autorise ? [['Autorisation', 'Autorisation écrite du client attestée', '', '']] : []),
    ['Score Global', `${score ?? 0}%`, '', ''],
    ['Niveau de Maturité', getMaturityLevel(score || 0).level, '', ''],
    ['Risque Global', audit.aiAnalysis?.risque_global || 'N/A', '', ''],
    ['Méthode', 'Évaluation déclarative (entretien et réponses du client, notées de 0 à 3) : ni test d\'intrusion ni certification.', '', ''],
    ['', '', '', ''],
    ['SCORES PAR DOMAINE', '', '', ''],
    ['Domaine', 'Score', 'Maturité', 'Réponses'],
    ...Object.values(normalizeDomainScores(domainScores)).map(d => [
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
  ws2['!autofilter'] = { ref: `A1:G${detailRows.length + 1}` } // filtres Excel pour trier par réponse / criticité
  XLSX.utils.book_append_sheet(wb, ws2, 'Réponses Détaillées')

  // ── Preuves du scan externe (validées uniquement) ──
  const proofs = Object.entries(audit.evidence || {}).filter(([, ev]) => ev.validated)
  if (proofs.length) {
    const rows = proofs.flatMap(([id, ev]) => ev.items.map(i => [id, ev.domain, new Date(ev.scannedAt).toLocaleDateString('fr-FR'), i.status === 'ok' ? 'Conforme' : i.status === 'fail' ? 'Échec' : 'Alerte', i.title, i.detail]))
    const wsP = XLSX.utils.aoa_to_sheet([['Contrôle', 'Domaine scanné', 'Date', 'Résultat', 'Constat', 'Détail'], ...rows])
    wsP['!cols'] = [{ wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 50 }, { wch: 70 }]
    XLSX.utils.book_append_sheet(wb, wsP, 'Preuves scan')
  }

  // ── Sheet 3: Plan d'actions ──
  if (audit.actionPlan?.length) {
    const actionHeaders = ['ID', 'Contrôle', 'Action', 'Responsable', 'Priorité', 'Délai', 'Effort', 'Coût', 'Statut', 'Échéance']
    const actionRows = audit.actionPlan.map(a => [
      a.id, a.controle, a.action, a.responsable, a.priorite, a.delai, a.effort, a.cout, a.statut, a.echeance || ''
    ])
    const ws3 = XLSX.utils.aoa_to_sheet([actionHeaders, ...actionRows])
    ws3['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 60 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, ws3, 'Plan d\'Actions')
  }

  // ── Sheet 4: Analyse IA ──
  if (audit.aiAnalysis) {
    const fromAI = String(audit.aiAnalysis.source || '').startsWith('ia')
    const aiData = [
      [(fromAI ? 'ANALYSE (ASSISTÉE PAR IA) — ' : 'SYNTHÈSE — ') + referential.name],
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
    XLSX.utils.book_append_sheet(wb, ws4, fromAI ? 'Analyse IA' : 'Synthèse')
  }

  // ── Couverture estimée des autres référentiels ──
  const xw = crosswalkView(referential.id, audit.responses || {})
  if (xw.frameworks.some(f => f.estimated !== null)) {
    const rows = [['Estimation indicative, non certifiante. ' + CROSSWALK_NOTE], [],
      ['Référentiel', 'Couverture estimée (%)', 'Mesures couvertes', 'Mesures rattachées'],
      ...xw.frameworks.map(f => [f.label + (f.key === xw.source ? ' (audité)' : ''), f.estimated ?? '', f.covered, f.controls]), [],
      ['Thème', 'Score (%)'], ...xw.themes.filter(t => t.score !== null).map(t => [t.name, t.score])]
    const wsX = XLSX.utils.aoa_to_sheet(rows)
    wsX['!cols'] = [{ wch: 45 }, { wch: 22 }, { wch: 18 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, wsX, 'Autres référentiels')
  }

  XLSX.writeFile(wb, `audit-${referential.id}-${company?.name?.replace(/\s/g, '_') || 'rapport'}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
