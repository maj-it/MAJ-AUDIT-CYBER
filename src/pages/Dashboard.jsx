import { useAuditStore } from '../store/auditStore.js'
import { getMaturityLevel, getScoreColor, getRadarData } from '../lib/scoring.js'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, AlertTriangle, ClipboardList, TrendingUp, Plus, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LineChart, Line, CartesianGrid, Legend
} from 'recharts'
import { REFERENTIALS } from '../data/index.js'


function AnimatedScore({ target, color }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!target) return
    let current = 0
    const step = target / 40
    const interval = setInterval(() => {
      current = Math.min(current + step, target)
      setVal(Math.round(current))
      if (current >= target) clearInterval(interval)
    }, 30)
    return () => clearInterval(interval)
  }, [target])
  return <span style={{ color }}>{val}%</span>
}

export default function Dashboard() {
  const { audits, risks } = useAuditStore()
  const navigate = useNavigate()

  const completed = audits.filter(a => a.status === 'completed' && a.score != null)
  const avgScore = completed.length
    ? Math.round(completed.reduce((acc, a) => acc + (a.score || 0), 0) / completed.length) : 0
  const criticalRisks = risks.filter(r => (r.impact * r.probability) >= 16).length
  const lastAudit = [...audits].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0]
  const radarData = lastAudit?.domainScores ? getRadarData(lastAudit.domainScores) : []
  const maturity = getMaturityLevel(avgScore)

  const barData = completed.slice(-6).map(a => ({
    name: REFERENTIALS[a.referentialId]?.name?.split(' ')[0] || a.referentialId,
    score: a.score,
    fill: getScoreColor(a.score)
  }))

  // Évolution temporelle
  const evolutionData = [...completed]
    .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt))
    .map(a => ({
      date: new Date(a.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      score: a.score,
      ref: REFERENTIALS[a.referentialId]?.name?.split(' ')[0]
    }))

  const stats = [
    { label: 'Audits Totaux', value: audits.length, icon: ClipboardList, color: 'text-cyber-400', bg: 'bg-cyber-500/10', animated: false },
    { label: 'Score Moyen', value: avgScore, icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10', animated: true },
    { label: 'Risques Critiques', value: criticalRisks, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', animated: false },
    { label: 'Niveau Maturité', value: maturity.level, icon: ShieldCheck, color: 'text-indigo-400', bg: 'bg-indigo-500/10', animated: false },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard RSSI</h1>
          <p className="text-sm text-slate-500 mt-1">Vue globale de la posture de sécurité</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => navigate('/audits/new')}>
          <Plus size={16} /> Nouvel Audit
        </button>
      </div>

      {/* KPIs animés */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="card flex items-start gap-4">
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0`}>
              <s.icon size={18} className={s.color} />
            </div>
            <div>
              <div className={`text-2xl font-bold font-mono ${s.color}`}>
                {s.animated
                  ? <AnimatedScore target={s.value} color={getScoreColor(s.value)} />
                  : s.value}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="text-sm font-semibold text-white mb-4">Radar de Maturité</div>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#1e3a78" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Radar dataKey="score" stroke="#00c9d4" fill="#00c9d4" fillOpacity={0.15} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex flex-col items-center justify-center text-slate-600">
              <ShieldCheck size={40} className="mb-3 opacity-30" />
              <p className="text-sm">Aucun audit complété</p>
              <button className="mt-3 text-cyber-500 text-xs hover:underline" onClick={() => navigate('/audits/new')}>Créer un audit →</button>
            </div>
          )}
        </div>

        <div className="card">
          <div className="text-sm font-semibold text-white mb-4">Scores par Référentiel</div>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData} margin={{ left: -20 }}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0a1628', border: '1px solid #162d5e', borderRadius: '8px' }}
                  formatter={(v) => [`${v}%`, 'Score']} />
                <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-slate-600 text-sm">Aucune donnée</div>
          )}
        </div>
      </div>

      {/* Évolution temporelle */}
      {evolutionData.length > 1 && (
        <div className="card">
          <div className="text-sm font-semibold text-white mb-4">Évolution de la Conformité</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={evolutionData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a78" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0a1628', border: '1px solid #162d5e', borderRadius: '8px' }}
                formatter={(v) => [`${v}%`, 'Score']} />
              <Line type="monotone" dataKey="score" stroke="#00c9d4" strokeWidth={2} dot={{ fill: '#00c9d4', r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Audits récents */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-white">Audits Récents</div>
          <button className="text-xs text-cyber-500 hover:underline flex items-center gap-1" onClick={() => navigate('/audits')}>
            Tous <ChevronRight size={12} />
          </button>
        </div>
        {audits.length === 0 ? (
          <div className="text-center py-8 text-slate-600">
            <ClipboardList size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucun audit réalisé</p>
          </div>
        ) : (
          <div className="space-y-2">
            {[...audits].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5).map(audit => {
              const ref = REFERENTIALS[audit.referentialId]
              const score = audit.score
              const mat = score !== null ? getMaturityLevel(score) : null
              return (
                <div key={audit.id}
                  className="flex items-center justify-between px-4 py-3 bg-navy-800 rounded-lg hover:bg-navy-700 cursor-pointer transition-colors group"
                  onClick={() => navigate(`/audits/${audit.id}`)}>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full" style={{ background: ref?.color || '#64748b' }} />
                    <div>
                      <div className="text-sm font-medium text-white">{audit.name}</div>
                      <div className="text-xs text-slate-500">{ref?.name} — {new Date(audit.updatedAt).toLocaleDateString('fr-FR')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {score !== null ? (
                      <>
                        <span className="font-mono font-bold text-sm" style={{ color: getScoreColor(score) }}>{score}%</span>
                        <span className="text-xs text-slate-500">{mat?.level}</span>
                      </>
                    ) : <span className="badge-info">En cours</span>}
                    <ChevronRight size={14} className="text-slate-600 group-hover:text-cyber-500 transition-colors" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
