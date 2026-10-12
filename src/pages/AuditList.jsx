import { useNavigate } from 'react-router-dom'
import { useAuditStore } from '../store/auditStore.js'
import { getScoreColor, getMaturityLevel, computeCompletion } from '../lib/scoring.js'
import { Plus, Trash2, ChevronRight, ClipboardList } from 'lucide-react'
import { REFERENTIALS } from '../data/index.js'


export default function AuditList() {
  const { audits, companies, deleteAudit } = useAuditStore()
  const navigate = useNavigate()

  const sorted = [...audits].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audits</h1>
          <p className="text-sm text-slate-500 mt-1">{audits.length} audit{audits.length > 1 ? 's' : ''} au total</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => navigate('/audits/new')}>
          <Plus size={16} /> Nouvel Audit
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="card text-center py-16 text-slate-600">
          <ClipboardList size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-base">Aucun audit réalisé</p>
          <button className="mt-4 btn-primary" onClick={() => navigate('/audits/new')}>Créer le premier audit</button>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(audit => {
            const ref = REFERENTIALS[audit.referentialId]
            const company = companies.find(c => c.id === audit.companyId)
            const score = audit.score
            const maturity = score != null ? getMaturityLevel(score) : null
            const comp = computeCompletion(ref, audit.responses)

            return (
              <div key={audit.id}
                className="card flex items-center justify-between hover:border-navy-600 cursor-pointer transition-all group"
                onClick={() => navigate(`/audits/${audit.id}`)}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-mono font-bold flex-shrink-0"
                    style={{ background: (ref?.color || '#64748b') + '20', color: ref?.color || '#64748b' }}>
                    {ref?.badge || audit.referentialId?.toUpperCase().slice(0, 3)}
                  </div>
                  <div>
                    <div className="font-medium text-white text-sm">{audit.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {company?.name} — {new Date(audit.updatedAt).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {score != null ? (
                    <div className="text-right">
                      <div className="font-mono font-bold text-sm" style={{ color: getScoreColor(score) }}>{score}%</div>
                      <div className="text-xs text-slate-500">{maturity?.level} · {audit.status === 'completed' ? 'terminé' : `${comp.answered}/${comp.total} réponses`}</div>
                    </div>
                  ) : (
                    <span className="badge-info">En cours · 0/{comp.total}</span>
                  )}
                  <button
                    className="p-1.5 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    onClick={e => { e.stopPropagation(); if (confirm('Supprimer cet audit ?')) deleteAudit(audit.id) }}>
                    <Trash2 size={14} />
                  </button>
                  <ChevronRight size={16} className="text-slate-600 group-hover:text-cyber-500 transition-colors" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
