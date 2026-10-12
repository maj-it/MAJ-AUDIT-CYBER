import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuditStore } from '../store/auditStore.js'
import { REFERENTIALS } from '../data/index.js'
import { computeAuditScore, getScoreColor } from '../lib/scoring.js'
import { companyLabel } from '../lib/review.js'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const LV = ['Non implémenté', 'Partiel', 'Implémenté', 'Optimisé']
const fmt = (d) => new Date(d).toLocaleDateString('fr-FR')

function Delta({ v, unit = ' pts' }) {
  if (v === 0 || v === null) return <span className="text-slate-500 inline-flex items-center gap-1"><Minus size={12} /> stable</span>
  const up = v > 0
  return <span className={`inline-flex items-center gap-1 font-mono font-bold ${up ? 'text-green-400' : 'text-red-400'}`}>
    {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{up ? '+' : ''}{v}{unit}
  </span>
}

export default function Progress() {
  const { audits, companies } = useAuditStore()
  const groups = useMemo(() => {
    const g = {}
    for (const a of audits) (g[`${a.companyId}|${a.referentialId}`] ||= []).push(a)
    return Object.entries(g).filter(([, l]) => l.length >= 2)
      .map(([k, l]) => ({ key: k, audits: [...l].sort((x, y) => x.createdAt.localeCompare(y.createdAt)) }))
  }, [audits])

  const [key, setKey] = useState('')
  const group = groups.find(g => g.key === key) || groups[0]
  const [beforeId, setBeforeId] = useState('')
  const [afterId, setAfterId] = useState('')

  if (!group) {
    return (
      <div className="space-y-4 max-w-3xl">
        <h1 className="text-2xl font-bold text-white">Suivi dans le temps</h1>
        <div className="card text-sm text-slate-400">
          Il faut au moins deux audits du même client avec le même référentiel pour comparer une évolution.
          Créez un second audit (par exemple six mois après le premier) depuis « Nouvel Audit », puis revenez ici : vous verrez le score avant/après, les contrôles corrigés et les régressions.
        </div>
      </div>
    )
  }

  const list = group.audits
  const before = list.find(a => a.id === beforeId) || list[0]
  const after = list.find(a => a.id === afterId) || list[list.length - 1]
  const ref = REFERENTIALS[after.referentialId]
  const company = companies.find(c => c.id === after.companyId)

  const sb = computeAuditScore(ref, before.responses || {})
  const sa = computeAuditScore(ref, after.responses || {})

  const rows = ref.domains.flatMap(d => d.controls.map(c => ({
    id: c.id, name: c.name, domain: d.name, criticality: c.criticality,
    b: before.responses?.[c.id], a: after.responses?.[c.id]
  })))
  const num = (v) => (v === undefined || v === null ? null : Number(v))
  const fixed = rows.filter(r => num(r.b) !== null && num(r.a) !== null && r.a > r.b)
  const regress = rows.filter(r => num(r.b) !== null && num(r.a) !== null && r.a < r.b)
  const stillOpen = rows.filter(r => num(r.a) !== null && r.a <= 1 && !(num(r.b) !== null && r.a > r.b))
  const todayStr = new Date().toISOString().slice(0, 10)
  const plan = after.actionPlan || []
  const done = plan.filter(a => a.statut === 'Fait').length
  const late = plan.filter(a => a.echeance && a.statut !== 'Fait' && a.echeance < todayStr).length

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Suivi dans le temps</h1>
        <p className="text-sm text-slate-500 mt-1">Comparaison de deux audits du même client sur le même référentiel : progression du score, contrôles corrigés, régressions et avancement du plan d'actions.</p>
      </div>

      <div className="card flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-slate-500">Client / référentiel</label>
          <select className="select" value={group.key} onChange={e => { setKey(e.target.value); setBeforeId(''); setAfterId('') }}>
            {groups.map(g => {
              const c = companies.find(x => x.id === g.audits[0].companyId)
              return <option key={g.key} value={g.key}>{companyLabel(c)} — {REFERENTIALS[g.audits[0].referentialId]?.name}</option>
            })}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Audit de départ</label>
          <select className="select" value={before.id} onChange={e => setBeforeId(e.target.value)}>
            {list.map(a => <option key={a.id} value={a.id}>{a.name} — {fmt(a.createdAt)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Audit récent</label>
          <select className="select" value={after.id} onChange={e => setAfterId(e.target.value)}>
            {list.map(a => <option key={a.id} value={a.id}>{a.name} — {fmt(a.createdAt)}</option>)}
          </select>
        </div>
      </div>

      {before.id === after.id ? (
        <div className="card text-sm text-yellow-300">Choisissez deux audits différents.</div>
      ) : (
        <>
          <div className="card flex flex-wrap items-center justify-around gap-6 text-center">
            <div><div className="text-xs text-slate-500">{fmt(before.createdAt)}</div>
              <div className="text-4xl font-mono font-bold" style={{ color: getScoreColor(sb.globalScore) }}>{sb.globalScore}%</div></div>
            <div className="text-lg"><Delta v={sa.globalScore - sb.globalScore} /></div>
            <div><div className="text-xs text-slate-500">{fmt(after.createdAt)}</div>
              <div className="text-4xl font-mono font-bold" style={{ color: getScoreColor(sa.globalScore) }}>{sa.globalScore}%</div></div>
            <div className="text-xs text-slate-400 text-left space-y-1">
              <div><strong className="text-green-400">{fixed.length}</strong> contrôle(s) amélioré(s)</div>
              <div><strong className="text-red-400">{regress.length}</strong> régression(s)</div>
              <div><strong className="text-yellow-400">{stillOpen.length}</strong> écart(s) encore ouvert(s)</div>
            </div>
          </div>

          <div className="card">
            <div className="text-sm font-semibold text-white mb-3">Évolution par domaine</div>
            <div className="space-y-2">
              {ref.domains.map(d => {
                const b = sb.domainScores[d.id]?.score, a = sa.domainScores[d.id]?.score
                if (b === undefined && a === undefined) return null
                return (
                  <div key={d.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-300 flex-1">{d.name}</span>
                    <span className="font-mono text-slate-500 w-10 text-right">{b ?? '—'}%</span>
                    <span className="text-slate-600">→</span>
                    <span className="font-mono font-bold w-10 text-right" style={{ color: getScoreColor(a ?? 0) }}>{a ?? '—'}%</span>
                    <span className="w-24 text-right">{b !== undefined && a !== undefined ? <Delta v={a - b} unit="" /> : ''}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <ControlList title="Contrôles corrigés" color="text-green-400" rows={fixed} />
          <ControlList title="Régressions" color="text-red-400" rows={regress} />
          <ControlList title="Écarts encore ouverts (non implémenté / partiel)" color="text-yellow-400" rows={stillOpen} noDelta />

          <div className="card">
            <div className="text-sm font-semibold text-white mb-2">Plan d'actions de l'audit récent</div>
            {plan.length ? (
              <>
                <div className="progress-bar"><div className="progress-fill bg-cyber-500" style={{ width: `${Math.round(done / plan.length * 100)}%` }} /></div>
                <div className="text-xs text-slate-400 mt-2">{done}/{plan.length} actions faites{late ? <span className="text-red-400"> — {late} en retard</span> : ''}.
                  {' '}Échéances et statuts se règlent dans <Link className="text-cyber-400 hover:underline" to={`/audits/${after.id}`}>l'audit</Link>, onglet Plan d'Actions.</div>
              </>
            ) : <div className="text-xs text-slate-500">Aucun plan d'actions sur cet audit.</div>}
          </div>
        </>
      )}
      <div className="text-[10px] text-slate-600">Client : {companyLabel(company)}</div>
    </div>
  )
}

function ControlList({ title, color, rows, noDelta }) {
  if (!rows.length) return null
  return (
    <div className="card">
      <div className={`text-sm font-semibold mb-3 ${color}`}>{title} ({rows.length})</div>
      <div className="space-y-1.5">
        {rows.slice(0, 40).map(r => (
          <div key={r.id} className="flex items-start gap-3 text-xs">
            <span className="font-mono text-cyber-400 w-14 flex-shrink-0">{r.id}</span>
            <span className="text-slate-300 flex-1">{r.name}</span>
            <span className="text-slate-500 whitespace-nowrap">{noDelta ? LV[r.a] : `${LV[r.b]} → ${LV[r.a]}`}</span>
          </div>
        ))}
        {rows.length > 40 && <div className="text-[10px] text-slate-500">… et {rows.length - 40} autre(s)</div>}
      </div>
    </div>
  )
}
