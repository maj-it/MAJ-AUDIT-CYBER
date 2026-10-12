import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getAuditor } from './auditor.js'
import { approvedAudit, companyLabel } from './review.js'
import { buildOfflineAnalysis } from './ollama.js'
import { crosswalkView, CROSSWALK_NOTE } from './crosswalk.js'
import { getMaturityLevel, getScoreColor, computeAuditScore, normalizeDomainScores } from './scoring.js'

function addLogo() {} // logo supprimé

function colorFromScore(score) {
  if (score >= 80) return [0, 201, 212]
  if (score >= 60) return [34, 197, 94]
  if (score >= 40) return [234, 179, 8]
  if (score >= 20) return [249, 115, 22]
  return [239, 68, 68]
}

function drawGauge(doc, x, y, r, score, label) {
  const color = colorFromScore(score)
  doc.setDrawColor(30, 58, 120)
  doc.setLineWidth(3)
  doc.circle(x, y, r)
  doc.setTextColor(...color)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(`${score}%`, x, y + 2, { align: 'center' })
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.text(label, x, y + 7, { align: 'center' })
}

function drawBar(doc, x, y, w, h, score, label) {
  const color = colorFromScore(score)
  doc.setFillColor(22, 45, 94)
  doc.roundedRect(x, y, w, h, 1, 1, 'F')
  const filled = Math.max(2, (score / 100) * w)
  doc.setFillColor(...color)
  doc.roundedRect(x, y, filled, h, 1, 1, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text(label.length > 70 ? label.slice(0, 70) + '…' : label, x, y - 1.5)
  doc.setTextColor(...color)
  doc.setFont('helvetica', 'bold')
  doc.text(`${score}%`, x + w + 2, y + h - 0.5)
}

// Fond sombre + bande cyan sur chaque page ajoutée automatiquement par autoTable (sinon pages blanches)
function paintPage(doc, W) {
  doc.setFillColor(6, 13, 31)
  doc.rect(0, 0, W, 297, 'F')
  doc.setFillColor(0, 201, 212)
  doc.rect(0, 0, 6, 297, 'F')
}
function tableDark(doc, W, opts) {
  const start = doc.internal.getNumberOfPages()
  autoTable(doc, {
    ...opts,
    margin: { left: 15, right: 15, top: 20, bottom: 14 },
    willDrawPage: (d) => { if (d.pageNumber > start) paintPage(doc, W) }
  })
}

const LEVEL_LABEL = { 0: 'Non implémenté', 1: 'Partiel', 2: 'Implémenté', 3: 'Optimisé' }
const CRIT_LABEL = { high: 'Élevée', medium: 'Moyenne', low: 'Faible' }
const CRIT_ORDER = { high: 0, medium: 1, low: 2 }

// Écarts : contrôles non implémentés (0) ou partiels (1), criticité décroissante
function buildFindings(referential, responses, notes) {
  const rows = []
  for (const d of referential.domains) {
    for (const c of d.controls) {
      const v = Number(responses?.[c.id])
      if (responses?.[c.id] === undefined || Number.isNaN(v) || v > 1) continue
      rows.push({ id: c.id, name: c.name, domain: d.name, crit: c.criticality || 'medium', level: v, note: (notes?.[c.id] || '').trim() })
    }
  }
  return rows.sort((a, b) => (CRIT_ORDER[a.crit] - CRIT_ORDER[b.crit]) || (a.level - b.level))
}

export function exportAuditPDF(audit, referential, company) {
  audit = approvedAudit(audit) // seules les suggestions IA validées entrent dans le rapport
  // Recalcule si scores manquants
  let { score, domainScores, aiAnalysis, actionPlan, responses, notes } = audit
  if (!score || !domainScores || Object.keys(domainScores || {}).length === 0) {
    const computed = computeAuditScore(referential, responses || {})
    score = computed.globalScore
    const flat = {}
    Object.values(computed.domainScores).forEach(d => { flat[d.name] = d.score })
    domainScores = flat
  }

  domainScores = Object.fromEntries(Object.values(normalizeDomainScores(domainScores)).map(d => [d.name, d.score]))
  if (!aiAnalysis?.resume) {
    // le score global passé en 4e argument garantit le même chiffre sur la couverture et dans le résumé
    const offline = buildOfflineAnalysis(referential, responses || {}, domainScores, score)
    aiAnalysis = { ...offline, ...(aiAnalysis || {}), resume: offline.resume }
  }
  const auditor = getAuditor()
  const mission = audit.mission || {}
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const maturity = getMaturityLevel(score)
  const scoreColor = colorFromScore(score)
  let y = 0

  // ── PAGE 1 : COVER ──────────────────────────────────────────
  doc.setFillColor(6, 13, 31)
  doc.rect(0, 0, W, 297, 'F')

  // Bande cyber
  doc.setFillColor(0, 201, 212)
  doc.rect(0, 0, 6, 297, 'F')

  // Logo
  addLogo(doc, 15, 12, 22, 22)

  // Titre
  doc.setTextColor(0, 201, 212)
  doc.setFontSize(26)
  doc.setFont('helvetica', 'bold')
  doc.text("RAPPORT D'AUDIT", 45, 24)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.text('CYBERSÉCURITÉ', 45, 32)

  // Ligne déco
  doc.setFillColor(0, 201, 212)
  doc.rect(45, 35, 120, 0.5, 'F')

  // Infos entreprise
  doc.setFontSize(11)
  doc.setTextColor(200, 220, 255)
  const companyName = companyLabel(company).slice(0, 60)
  doc.text(companyName, 45, 43)
  doc.setFontSize(9)
  doc.setTextColor(100, 130, 180)
  doc.text(`Référentiel : ${referential.name}`, 45, 50)
  doc.text(`Date : ${new Date().toLocaleDateString('fr-FR')}`, 45, 56)
  if (company?.siret) doc.text(`SIRET : ${company.siret}`, 45, 62)

  doc.text(`Auditeur : ${auditor.name} — ${auditor.org} (${auditor.site})`, 45, 68)
  const mline = [mission.perimetre && `Périmètre : ${mission.perimetre}`, mission.interlocuteur && `Interlocuteur : ${mission.interlocuteur}`].filter(Boolean).join('  |  ')
  if (mline) doc.text(doc.splitTextToSize(mline, W - 60).slice(0, 2), 45, 74)
  if (mission.dateDebut) doc.text(`Période : ${mission.dateDebut}${mission.dateFin ? ' → ' + mission.dateFin : ''}${mission.autorise ? '  |  Autorisation écrite du client attestée' : ''}`, 45, 84)

  y = 92

  // ── Score global (grande jauge) ──
  doc.setFillColor(10, 22, 40)
  doc.roundedRect(15, y, W - 30, 45, 4, 4, 'F')
  doc.setFillColor(...scoreColor)
  doc.rect(15, y, 3, 45, 'F')

  // Cercle score
  drawGauge(doc, 50, y + 22, 16, score, maturity.level)

  // Texte droite
  doc.setTextColor(0, 201, 212)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Score Global de Conformité', 78, y + 12)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Niveau de maturité : ${maturity.level}`, 78, y + 20)
  doc.text(maturity.description, 78, y + 27)

  // Badges stats
  const stats = [
    { label: 'Domaines', value: referential.domains.length },
    { label: 'Contrôles', value: referential.domains.reduce((a, d) => a + d.controls.length, 0) },
    { label: 'Répondus', value: Object.keys(responses || {}).length },
  ]
  stats.forEach((s, i) => {
    const bx = 78 + i * 38
    doc.setFillColor(22, 45, 94)
    doc.roundedRect(bx, y + 32, 34, 9, 2, 2, 'F')
    doc.setTextColor(0, 201, 212)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(String(s.value), bx + 17, y + 38, { align: 'center' })
    doc.setFontSize(6)
    doc.setTextColor(148, 163, 184)
    doc.text(s.label, bx + 17, y + 42, { align: 'center' })
  })

  y += 55

  // ── Résumé exécutif IA ──
  if (aiAnalysis?.resume) {
    doc.setFillColor(15, 32, 68)
    // la police doit être réglée AVANT splitTextToSize, sinon les lignes sont coupées avec la mauvaise largeur
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    const resumeLines = doc.splitTextToSize(aiAnalysis.resume, W - 50)
    const resumeH = resumeLines.length * 5 + 14
    doc.roundedRect(15, y, W - 30, resumeH, 3, 3, 'F')
    doc.setTextColor(0, 201, 212)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('RÉSUMÉ EXÉCUTIF', 22, y + 8)
    doc.setTextColor(200, 220, 255)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(resumeLines, 22, y + 14)
    y += resumeH + 8
  }

  // ── Risque global badge ──
  if (aiAnalysis?.risque_global) {
    const riskColors = { Critique: [239,68,68], Élevé: [249,115,22], Moyen: [234,179,8], Faible: [34,197,94] }
    const rc = riskColors[aiAnalysis.risque_global] || [100,130,180]
    doc.setFillColor(...rc)
    doc.roundedRect(15, y, 60, 10, 2, 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(`Risque Global : ${aiAnalysis.risque_global}`, 45, y + 6.5, { align: 'center' })

    if (aiAnalysis.niveau_maturite) {
      doc.setFillColor(22, 45, 94)
      doc.roundedRect(82, y, 70, 10, 2, 2, 'F')
      doc.setTextColor(0, 201, 212)
      doc.text(`Maturité : ${aiAnalysis.niveau_maturite}`, 117, y + 6.5, { align: 'center' })
    }
    y += 18
  }

  // ── Méthode et limites (honnêteté sur la portée de l'évaluation) ──
  doc.setTextColor(148, 163, 184)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.text(doc.splitTextToSize(
    "Méthode : évaluation déclarative fondée sur un entretien et sur les réponses du client, notées de 0 (non implémenté) à 3 (optimisé). " +
    "Elle ne constitue ni un test d'intrusion ni une certification, et les mesures n'ont pas toutes été vérifiées techniquement.",
    W - 40), 20, Math.min(y + 4, 262))

  // ── PAGE 2 : SCORES PAR DOMAINE ──────────────────────────────
  doc.addPage()
  doc.setFillColor(6, 13, 31)
  doc.rect(0, 0, W, 297, 'F')
  doc.setFillColor(0, 201, 212)
  doc.rect(0, 0, 6, 297, 'F')

  addLogo(doc, 15, 10, 12, 12)
  doc.setTextColor(0, 201, 212)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('SCORES PAR DOMAINE', 32, 19)
  doc.setFillColor(0, 201, 212)
  doc.rect(32, 21, 100, 0.4, 'F')

  y = 30

  // Barres de score par domaine
  const domainEntries = Object.entries(domainScores)
  domainEntries.forEach(([name, ds], i) => {
    if (y > 270) { doc.addPage(); doc.setFillColor(6,13,31); doc.rect(0,0,W,297,'F'); y = 20 }
    drawBar(doc, 15, y + 5, W - 50, 5, ds, name)
    y += 14
  })

  y += 8

  // ── Tableau domaines ──
  if (y < 230) {
    const domainRows = domainEntries.map(([name, ds]) => [
      name,
      `${ds}%`,
      getMaturityLevel(ds).level,
    ])

    tableDark(doc, W, {
      startY: y,
      head: [['Domaine', 'Score', 'Maturité']],
      body: domainRows,
      theme: 'grid',
      headStyles: { fillColor: [10, 22, 40], textColor: [0, 201, 212], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { textColor: [220, 230, 255], fontSize: 8.5, fillColor: [10, 18, 35] },
      alternateRowStyles: { fillColor: [15, 28, 55] },
      columnStyles: { 1: { halign: 'center', fontStyle: 'bold' }, 2: { halign: 'center' } },
      margin: { left: 15, right: 15 }
    })
    y = doc.lastAutoTable.finalY + 12
  }

  // ── Points forts / Faiblesses ──
  if (aiAnalysis?.points_forts?.length || aiAnalysis?.faiblesses_critiques?.length) {
    if (y > 220) { doc.addPage(); doc.setFillColor(6,13,31); doc.rect(0,0,W,297,'F'); y = 20 }

    const halfW = (W - 35) / 2
    const pf = aiAnalysis.points_forts || []
    const fc = aiAnalysis.faiblesses_critiques || []
    const maxLines = Math.max(pf.length, fc.length)
    const boxH = maxLines * 9 + 14

    // Points forts
    doc.setFillColor(10, 40, 20)
    doc.roundedRect(15, y, halfW, boxH, 3, 3, 'F')
    doc.setFillColor(34, 197, 94)
    doc.rect(15, y, 3, boxH, 'F')
    doc.setTextColor(34, 197, 94)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('+ POINTS FORTS', 22, y + 8)
    doc.setTextColor(200, 240, 210)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    pf.forEach((p, i) => {
      const lines = doc.splitTextToSize(`• ${p}`, halfW - 10)
      doc.text(lines, 22, y + 14 + i * 9)
    })

    // Faiblesses
    doc.setFillColor(40, 10, 10)
    doc.roundedRect(20 + halfW, y, halfW, boxH, 3, 3, 'F')
    doc.setFillColor(239, 68, 68)
    doc.rect(20 + halfW, y, 3, boxH, 'F')
    doc.setTextColor(239, 68, 68)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('- FAIBLESSES CRITIQUES', 27 + halfW, y + 8)
    doc.setTextColor(255, 200, 200)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    fc.forEach((f, i) => {
      const lines = doc.splitTextToSize(`• ${f}`, halfW - 10)
      doc.text(lines, 27 + halfW, y + 14 + i * 9)
    })

    y += boxH + 12
  }

  // ── CONSTATS DÉTAILLÉS : contrôles en écart ─────────────────
  const findings = buildFindings(referential, responses, notes)
  if (findings.length) {
    doc.addPage()
    paintPage(doc, W)
    doc.setTextColor(0, 201, 212)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('CONSTATS DÉTAILLÉS', 15, 19)
    doc.setFillColor(0, 201, 212)
    doc.rect(15, 21, 100, 0.4, 'F')
    doc.setTextColor(148, 163, 184)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`${findings.length} contrôle(s) non implémenté(s) ou partiel(s), classés par criticité.`, 15, 26)

    const levelColors = { 0: [239, 68, 68], 1: [234, 179, 8] }
    tableDark(doc, W, {
      startY: 30,
      head: [['ID', 'Contrôle', 'Criticité', 'État', 'Constat / note']],
      body: findings.map(f => [f.id, `${f.name}\n(${f.domain})`, CRIT_LABEL[f.crit] || f.crit, LEVEL_LABEL[f.level], f.note || '—']),
      theme: 'grid',
      headStyles: { fillColor: [10, 22, 40], textColor: [0, 201, 212], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { textColor: [220, 230, 255], fontSize: 7.5, fillColor: [10, 18, 35] },
      alternateRowStyles: { fillColor: [15, 28, 55] },
      columnStyles: {
        0: { cellWidth: 12, fontStyle: 'bold', textColor: [0, 201, 212] },
        1: { cellWidth: 62 },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 'auto' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const f = findings[data.row.index]
          if (f && levelColors[f.level]) data.cell.styles.textColor = levelColors[f.level]
        }
      }
    })
  }

  // ── PREUVES DU SCAN EXTERNE (uniquement celles validées par l'auditeur) ──
  const proofs = Object.entries(audit.evidence || {}).filter(([, ev]) => ev.validated)
  if (proofs.length) {
    doc.addPage()
    paintPage(doc, W)
    doc.setTextColor(0, 201, 212); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text('PREUVES DU SCAN EXTERNE', 15, 19)
    doc.setFillColor(0, 201, 212); doc.rect(15, 21, 100, 0.4, 'F')
    doc.setTextColor(148, 163, 184); doc.setFontSize(8); doc.setFont('helvetica', 'normal')
    doc.text(`${proofs.length} contrôle(s) constaté(s) par analyse non intrusive, puis validé(s) par l'auditeur.`, 15, 26)
    const ST = { ok: 'Conforme', warn: 'Alerte', fail: 'Échec' }
    const nameOf = (id) => referential.domains.flatMap(d => d.controls).find(c => c.id === id)?.name || ''
    tableDark(doc, W, {
      startY: 30,
      head: [['ID', 'Contrôle', 'Domaine scanné / date', 'Constats relevés']],
      body: proofs.map(([id, ev]) => [id, nameOf(id), `${ev.domain}\n${new Date(ev.scannedAt).toLocaleDateString('fr-FR')}`,
        ev.items.map(i => `${ST[i.status] || i.status} : ${i.title}${i.detail ? ' — ' + i.detail.slice(0, 120) : ''}`).join('\n')]),
      theme: 'grid',
      headStyles: { fillColor: [10, 22, 40], textColor: [0, 201, 212], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { textColor: [220, 230, 255], fontSize: 7.5, fillColor: [10, 18, 35] },
      alternateRowStyles: { fillColor: [15, 28, 55] },
      columnStyles: { 0: { cellWidth: 12, fontStyle: 'bold', textColor: [0, 201, 212] }, 1: { cellWidth: 50 }, 2: { cellWidth: 32 }, 3: { cellWidth: 'auto' } }
    })
  }

  // ── COUVERTURE DES AUTRES RÉFÉRENTIELS (estimation indicative) ──
  const xw = crosswalkView(referential.id, responses)
  if (xw.frameworks.some(f => f.estimated !== null)) {
    doc.addPage()
    paintPage(doc, W)
    doc.setTextColor(0, 201, 212); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text('COUVERTURE DES AUTRES RÉFÉRENTIELS', 15, 19)
    doc.setFillColor(0, 201, 212); doc.rect(15, 21, 100, 0.4, 'F')
    doc.setTextColor(148, 163, 184); doc.setFontSize(8); doc.setFont('helvetica', 'normal')
    const intro = doc.splitTextToSize(`Estimation indicative, non certifiante : les réponses de cet audit sont projetées par thème sur les autres référentiels. ${CROSSWALK_NOTE}`, W - 30)
    doc.text(intro, 15, 26)
    tableDark(doc, W, {
      startY: 26 + intro.length * 4 + 4,
      head: [['Référentiel', 'Couverture estimée', 'Mesures couvertes par les réponses']],
      body: xw.frameworks.map(f => [f.label + (f.key === xw.source ? ' (audité)' : ''), f.estimated === null ? '—' : f.estimated + ' %', `${f.covered} / ${f.controls}`]),
      theme: 'grid',
      headStyles: { fillColor: [10, 22, 40], textColor: [0, 201, 212], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { textColor: [220, 230, 255], fontSize: 8, fillColor: [10, 18, 35] },
      alternateRowStyles: { fillColor: [15, 28, 55] },
      columnStyles: { 1: { halign: 'center', fontStyle: 'bold' }, 2: { halign: 'center' } }
    })
    tableDark(doc, W, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Thème', 'Score']],
      body: xw.themes.filter(t => t.score !== null).map(t => [t.name, t.score + ' %']),
      theme: 'grid',
      headStyles: { fillColor: [10, 22, 40], textColor: [0, 201, 212], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { textColor: [220, 230, 255], fontSize: 7.5, fillColor: [10, 18, 35] },
      alternateRowStyles: { fillColor: [15, 28, 55] },
      columnStyles: { 1: { cellWidth: 20, halign: 'center', fontStyle: 'bold' } }
    })
  }

  // ── PAGE 3 : PLAN D'ACTIONS ──────────────────────────────────
  if (actionPlan?.length) {
    doc.addPage()
    doc.setFillColor(6, 13, 31)
    doc.rect(0, 0, W, 297, 'F')
    doc.setFillColor(0, 201, 212)
    doc.rect(0, 0, 6, 297, 'F')

    addLogo(doc, 15, 10, 12, 12)
    doc.setTextColor(0, 201, 212)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text("PLAN D'ACTIONS", 32, 19)
    doc.setFillColor(0, 201, 212)
    doc.rect(32, 21, 80, 0.4, 'F')

    const priorityColors = { P1: [239,68,68], P2: [249,115,22], P3: [234,179,8] }

    tableDark(doc, W, {
      startY: 28,
      head: [['ID', 'Contrôle', 'Action', 'Resp.', 'Prio.', 'Délai', 'Coût']],
      body: actionPlan.map(a => [a.id, a.controle, a.action, a.responsable, a.priorite, a.echeance ? `${a.delai}\navant le ${new Date(a.echeance).toLocaleDateString('fr-FR')}` : a.delai, a.cout]),
      theme: 'grid',
      headStyles: { fillColor: [10, 22, 40], textColor: [0, 201, 212], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { textColor: [220, 230, 255], fontSize: 7.5, fillColor: [10, 18, 35] },
      alternateRowStyles: { fillColor: [15, 28, 55] },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 18, fontStyle: 'bold', textColor: [0, 201, 212] },
        2: { cellWidth: 65 },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 12, halign: 'center' },
        5: { cellWidth: 26, halign: 'center' },
        6: { cellWidth: 16, halign: 'center' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const c = priorityColors[data.cell.raw]
          if (c) { data.cell.styles.fillColor = c; data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = 'bold' }
        }
      }
    })
  }

  // ── Recommandations IA ──
  if (aiAnalysis?.recommandations?.length) {
    doc.addPage()
    doc.setFillColor(6, 13, 31)
    doc.rect(0, 0, W, 297, 'F')
    doc.setFillColor(0, 201, 212)
    doc.rect(0, 0, 6, 297, 'F')

    addLogo(doc, 15, 10, 12, 12)
    doc.setTextColor(0, 201, 212)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    // « IA » seulement si l'analyse vient réellement d'un modèle et a été validée (approvedAudit retire le reste)
    doc.text(String(aiAnalysis.source || '').startsWith('ia') ? 'RECOMMANDATIONS (ASSISTÉES PAR IA)' : 'RECOMMANDATIONS PRIORITAIRES', 32, 19)
    doc.setFillColor(0, 201, 212)
    doc.rect(32, 21, 100, 0.4, 'F')

    tableDark(doc, W, {
      startY: 28,
      head: [['Priorité', 'Action recommandée', 'Délai', 'Impact attendu']],
      body: (aiAnalysis.recommandations || []).map(r => [r.priorite, r.action, r.delai, r.impact]),
      theme: 'grid',
      headStyles: { fillColor: [10, 22, 40], textColor: [0, 201, 212], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { textColor: [220, 230, 255], fontSize: 8.5, fillColor: [10, 18, 35] },
      alternateRowStyles: { fillColor: [15, 28, 55] },
      columnStyles: { 0: { cellWidth: 16, halign: 'center' }, 1: { cellWidth: 90 }, 2: { cellWidth: 25, halign: 'center' } }
    })
  }

  // ── Footer toutes pages ──
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFillColor(10, 22, 40)
    doc.rect(0, 287, W, 10, 'F')
    doc.setFillColor(0, 201, 212)
    doc.rect(0, 287, W, 0.5, 'F')
    addLogo(doc, 8, 288.5, 7, 7)
    doc.setTextColor(100, 130, 180)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text('MAJ Audit — MAJ-IT — Rapport Confidentiel', 18, 293)
    doc.text(`Page ${i} / ${pageCount}`, W - 15, 293, { align: 'right' })
  }

  doc.save(`audit-${referential.id}-${(company?.name || 'rapport').replace(/\s/g,'_')}-${new Date().toISOString().slice(0,10)}.pdf`)
}
