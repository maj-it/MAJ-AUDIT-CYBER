import { useState } from 'react'
import { useAuditStore } from '../store/auditStore.js'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'

const CATEGORIES = ['Réseau', 'Accès', 'Données', 'Physique', 'Humain', 'Conformité', 'Continuité', 'Tiers']

const getCriticality = (impact, probability) => {
  const score = impact * probability
  if (score >= 16) return { label: 'Critique', color: '#ef4444', bg: 'bg-red-500/20', badge: 'badge-critical' }
  if (score >= 9)  return { label: 'Élevé',    color: '#f97316', bg: 'bg-orange-500/20', badge: 'badge-high' }
  if (score >= 4)  return { label: 'Moyen',    color: '#eab308', bg: 'bg-yellow-500/20', badge: 'badge-medium' }
  return              { label: 'Faible',   color: '#22c55e', bg: 'bg-green-500/20', badge: 'badge-low' }
}

const INITIAL_RISKS = [
  { id: 'r1', name: 'Absence de MFA sur les accès admin', category: 'Accès', impact: 5, probability: 4 },
  { id: 'r2', name: 'Pas de PRA documenté et testé', category: 'Continuité', impact: 5, probability: 3 },
  { id: 'r3', name: 'Sauvegardes non testées', category: 'Données', impact: 4, probability: 3 },
  { id: 'r4', name: 'Vulnérabilités non patchées (>90j)', category: 'Réseau', impact: 4, probability: 4 },
  { id: 'r5', name: 'Sensibilisation phishing insuffisante', category: 'Humain', impact: 3, probability: 4 },
]

export default function RiskMap() {
  const { risks, addRisk, deleteRisk } = useAuditStore()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'Réseau', impact: 3, probability: 3, description: '' })

  // Use store risks or demo risks if empty
  const displayRisks = risks.length > 0 ? risks : INITIAL_RISKS

  const handleAdd = () => {
    if (!form.name) return
    addRisk(form)
    setForm({ name: '', category: 'Réseau', impact: 3, probability: 3, description: '' })
    setShowForm(false)
  }

  // Build 5x5 matrix
  const matrix = Array.from({ length: 5 }, (_, impactIdx) =>
    Array.from({ length: 5 }, (_, probIdx) => ({
      impact: 5 - impactIdx,
      probability: probIdx + 1,
      risks: displayRisks.filter(r => r.impact === 5 - impactIdx && r.probability === probIdx + 1)
    }))
  )

  const cellColor = (i, p) => {
    const s = i * p
    if (s >= 16) return 'bg-red-500/30 border-red-500/40'
    if (s >= 9)  return 'bg-orange-500/20 border-orange-500/30'
    if (s >= 4)  return 'bg-yellow-500/15 border-yellow-500/20'
    return 'bg-green-500/10 border-green-500/15'
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cartographie des Risques</h1>
          <p className="text-sm text-slate-500 mt-1">Criticité = Impact × Probabilité</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} /> Ajouter un Risque
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card space-y-3">
          <div className="text-sm font-semibold text-white">Nouveau Risque</div>
          <input className="input" placeholder="Description du risque *" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Catégorie</label>
              <select className="select" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Impact (1-5)</label>
              <select className="select" value={form.impact} onChange={e => setForm(p => ({ ...p, impact: Number(e.target.value) }))}>
                {[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Probabilité (1-5)</label>
              <select className="select" value={form.probability} onChange={e => setForm(p => ({ ...p, probability: Number(e.target.value) }))}>
                {[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={handleAdd}>Ajouter</button>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {[{l:'Critique',c:'badge-critical'},{l:'Élevé',c:'badge-high'},{l:'Moyen',c:'badge-medium'},{l:'Faible',c:'badge-low'}].map(l => (
          <span key={l.l} className={l.c}>{l.l}</span>
        ))}
      </div>

      {/* Matrix */}
      <div className="card overflow-auto">
        <div className="text-sm font-semibold text-white mb-4">Matrice Impact × Probabilité</div>
        <div className="min-w-[480px]">
          {/* Header probability */}
          <div className="flex ml-16 mb-1">
            <div className="text-xs text-slate-500 text-center w-full">Probabilité →</div>
          </div>
          <div className="flex ml-16 mb-1">
            {[1,2,3,4,5].map(p => (
              <div key={p} className="flex-1 text-center text-xs text-slate-500 font-mono">{p}</div>
            ))}
          </div>

          {matrix.map((row, rowIdx) => (
            <div key={rowIdx} className="flex items-stretch gap-1 mb-1">
              {/* Impact label */}
              <div className="w-16 flex items-center justify-end pr-2 text-xs text-slate-500 font-mono flex-shrink-0">
                {rowIdx === 0 && <span className="rotate-[-90deg] whitespace-nowrap text-slate-400">Impact</span>}
                {row[0].impact}
              </div>
              {row.map((cell, colIdx) => (
                <div key={colIdx}
                  className={`flex-1 min-h-[52px] rounded border ${cellColor(cell.impact, cell.probability)} p-1 relative`}>
                  <div className="text-center text-xs font-mono text-slate-500 mb-0.5">{cell.impact * cell.probability}</div>
                  {cell.risks.map(r => (
                    <div key={r.id} className="text-xs text-white leading-tight truncate" title={r.name}>
                      ⬤ {r.name.slice(0, 18)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Risk list */}
      <div className="card">
        <div className="text-sm font-semibold text-white mb-3">Registre des Risques</div>
        <div className="space-y-2">
          {displayRisks.map(risk => {
            const crit = getCriticality(risk.impact, risk.probability)
            return (
              <div key={risk.id} className="flex items-center justify-between px-3 py-2.5 bg-navy-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <AlertTriangle size={14} style={{ color: crit.color }} />
                  <div>
                    <div className="text-sm text-white">{risk.name}</div>
                    <div className="text-xs text-slate-500">{risk.category}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs">
                    <div className="text-slate-400">I:{risk.impact} × P:{risk.probability}</div>
                    <div className="font-mono font-bold" style={{ color: crit.color }}>= {risk.impact * risk.probability}</div>
                  </div>
                  <span className={crit.badge}>{crit.label}</span>
                  {risks.find(r => r.id === risk.id) && (
                    <button onClick={() => deleteRisk(risk.id)} className="p-1 text-slate-600 hover:text-red-400">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
