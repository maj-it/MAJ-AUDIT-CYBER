import { useAuditStore } from '../store/auditStore.js'
import { useNavigate } from 'react-router-dom'
import { exportAuditPDF } from '../lib/exportPDF.js'
import { exportAuditExcel } from '../lib/exportExcel.js'
import { getScoreColor, getMaturityLevel, normalizeDomainScores } from '../lib/scoring.js'
import { useRef } from 'react'
import { FileDown, FileText, Table2, ChevronRight } from 'lucide-react'
import { REFERENTIALS } from '../data/index.js'


export default function Reports() {
  const { audits, companies } = useAuditStore()
  const navigate = useNavigate()

  const { exportBackup, importBackup } = useAuditStore.getState()
  const fileRef = useRef(null)
  const doExport = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `maj-audit-sauvegarde-${new Date().toISOString().slice(0,10)}.json`; a.click()
  }
  const doImport = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    try { const n = importBackup(await f.text()); alert(`${n} audit(s) importé(s)`) } catch (err) { alert(err.message) }
    e.target.value = ''
  }
  const completed = audits.filter(a => a.score != null)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Rapports</h1>
        <p className="text-sm text-slate-500 mt-1">Exportez vos audits en PDF ou Excel</p>
        <div className="flex gap-2 mt-3">
          <button className="btn-ghost text-xs" onClick={doExport}>Sauvegarde JSON (export)</button>
          <button className="btn-ghost text-xs" onClick={() => fileRef.current?.click()}>Restaurer (import)</button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={doImport} />
        </div>
      </div>

      {completed.length === 0 ? (
        <div className="card text-center py-16 text-slate-600">
          <FileText size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm mb-3">Aucun audit complété disponible</p>
          <button className="btn-primary" onClick={() => navigate('/audits/new')}>Créer un audit</button>
        </div>
      ) : (
        <div className="space-y-3">
          {completed.map(audit => {
            const ref = REFERENTIALS[audit.referentialId]
            const company = companies.find(c => c.id === audit.companyId)
            const score = audit.score
            const maturity = getMaturityLevel(score)

            return (
              <div key={audit.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-mono font-bold flex-shrink-0"
                      style={{ background: (ref?.color || '#64748b') + '20', color: ref?.color || '#64748b' }}>
                      {ref?.badge || audit.referentialId?.toUpperCase().slice(0, 3)}
                    </div>
                    <div>
                      <div className="font-medium text-white">{audit.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {company?.name} — {new Date(audit.updatedAt).toLocaleDateString('fr-FR')}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="font-mono font-bold text-sm" style={{ color: getScoreColor(score) }}>{score}%</span>
                        <span className="text-xs text-slate-500">{maturity.level}</span>
                        {audit.aiAnalysis && <span className="badge-info">Analyse IA incluse</span>}
                        {audit.actionPlan?.length > 0 && <span className="badge-info">{audit.actionPlan.length} actions</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-ghost flex items-center gap-2 text-xs"
                      onClick={() => navigate(`/audits/${audit.id}`)}>
                      <ChevronRight size={14} /> Ouvrir
                    </button>
                    <button
                      className="btn-primary flex items-center gap-2 text-xs"
                      onClick={() => exportAuditPDF(audit, ref, company)}>
                      <FileDown size={14} /> PDF
                    </button>
                    <button
                      className="btn-ghost flex items-center gap-2 text-xs"
                      onClick={() => exportAuditExcel(audit, ref, company)}>
                      <Table2 size={14} /> Excel
                    </button>
                  </div>
                </div>

                {/* Domain scores preview */}
                {audit.domainScores && Object.keys(audit.domainScores).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-navy-700 grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.values(normalizeDomainScores(audit.domainScores)).slice(0, 6).map(d => (
                      <div key={d.name} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                        <span className="text-xs text-slate-400 truncate">{d.name}</span>
                        <span className="text-xs font-mono font-semibold ml-auto" style={{ color: d.color }}>{d.score}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
