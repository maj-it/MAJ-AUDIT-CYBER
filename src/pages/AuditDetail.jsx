import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuditStore } from '../store/auditStore.js'
import { computeAuditScore, computeCompletion, getMaturityLevel, getScoreColor, getRadarData, criticityBadge, criticityLabel, MATURITY_LABELS } from '../lib/scoring.js'
import { analyzeAuditResponses, generateActionPlan, explainControl } from '../lib/ollama.js'
import { exportAuditPDF } from '../lib/exportPDF.js'
import { exportAuditExcel } from '../lib/exportExcel.js'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import { Bot, FileDown, ChevronDown, ChevronRight, Info, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { REFERENTIALS } from '../data/index.js'


export default function AuditDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { audits, companies, updateResponse, saveAuditScore, saveAIAnalysis, saveActionPlan, updateActionItem, removeActionItem } = useAuditStore()

  const audit = audits.find(a => a.id === id)
  const referential = audit ? REFERENTIALS[audit.referentialId] : null
  const company = audit ? companies.find(c => c.id === audit.companyId) : null

  const [expandedDomain, setExpandedDomain] = useState(referential?.domains[0]?.id)
  const [aiLoading, setAiLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [controlExplanation, setControlExplanation] = useState(null)
  const [explainLoading, setExplainLoading] = useState(null)
  const [notice, setNotice] = useState('')
  const [activeTab, setActiveTab] = useState('audit') // audit | results | actions | analysis

  // Sauvegarde continue du score (hook déclaré avant tout return conditionnel)
  useEffect(() => {
    if (!audit || !referential || !Object.keys(audit.responses || {}).length) return
    const r = computeAuditScore(referential, audit.responses)
    const c = computeCompletion(referential, audit.responses)
    saveAuditScore(audit.id, r.globalScore, r.domainScores, c.pct === 100)
  }, [audit?.responses])

  if (!audit || !referential) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <div className="text-center">
          <p>Audit introuvable.</p>
          <button className="mt-3 btn-ghost" onClick={() => navigate('/audits')}>← Retour</button>
        </div>
      </div>
    )
  }

  const { globalScore, domainScores, maturity, stats } = computeAuditScore(referential, audit.responses)
  const completion = computeCompletion(referential, audit.responses)
  const radarData = getRadarData(domainScores)

  const aiCtx = () => ({ sector: company?.sector, size: company?.size, perimetre: audit.mission?.perimetre, cloud: !!audit.mission?.cloudConsent })

  const handleAnalyze = async () => {
    setAiLoading(true)
    try {
      const flatScores = Object.fromEntries(Object.values(domainScores).map(d => [d.name, d.score]))
      const analysis = await analyzeAuditResponses(referential, audit.responses, flatScores, aiCtx())
      saveAIAnalysis(audit.id, analysis)
      setActiveTab('analysis')
    } catch (e) {
      setNotice('Analyse impossible : ' + e.message)
    }
    setAiLoading(false)
  }

  const handleActionPlan = async () => {
    setActionLoading(true)
    try {
      const plan = await generateActionPlan(referential, audit.responses, aiCtx())
      saveActionPlan(audit.id, plan)
      setActiveTab('actions')
    } catch (e) {
      setNotice('Plan d\'actions impossible : ' + e.message)
    }
    setActionLoading(false)
  }

  const handleExplainControl = async (control) => {
    if (explainLoading === control.id) return
    setExplainLoading(control.id)
    try {
      const explanation = await explainControl(control.id, control.name, control.description, { question: control.question })
      setControlExplanation({ id: control.id, ...explanation })
    } catch (e) {
      setControlExplanation({ id: control.id, objectif: control.description, preuves_attendues: [], risques_si_absent: [], mise_en_oeuvre: '', exemple_pratique: '' })
    }
    setExplainLoading(null)
  }

  const TABS = [
    { id: 'audit', label: 'Questionnaire' },
    { id: 'results', label: 'Résultats' },
    { id: 'actions', label: 'Plan d\'Actions' },
    { id: 'analysis', label: 'Analyse IA' },
  ]

  return (
    <div className="space-y-5">
      {notice && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{notice}</div>}
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <button className="hover:text-cyber-500" onClick={() => navigate('/audits')}>Audits</button>
            <ChevronRight size={12} />
            <span className="text-slate-300">{audit.name}</span>
          </div>
          <h1 className="text-xl font-bold text-white">{audit.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="badge-info">{referential.name}</span>
            <span className="text-xs text-slate-500">{company?.name}</span>
          </div>
          {audit.mission?.perimetre && <div className="text-xs text-slate-500 mt-1">Périmètre : {audit.mission.perimetre}{audit.mission.interlocuteur ? ` — ${audit.mission.interlocuteur}` : ''}</div>}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost flex items-center gap-2 text-xs" onClick={() => exportAuditPDF(audit, referential, company)}>
            <FileDown size={14} /> PDF
          </button>
          <button className="btn-ghost flex items-center gap-2 text-xs" onClick={() => exportAuditExcel(audit, referential, company)}>
            <FileDown size={14} /> Excel
          </button>
          <button className="btn-primary flex items-center gap-2 text-xs" onClick={handleAnalyze} disabled={aiLoading}>
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
            Analyser avec IA
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="card-sm">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-slate-400">Progression du questionnaire</span>
          <span className="font-mono text-cyber-400">{completion.answered}/{completion.total} contrôles</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill bg-cyber-500" style={{ width: `${completion.pct}%` }} />
        </div>
        {completion.pct === 100 && (
          <div className="flex items-center gap-2 mt-2 text-xs text-green-400">
            <CheckCircle2 size={12} /> Questionnaire complété — Score : <span className="font-mono font-bold">{globalScore}%</span> ({maturity.level})
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-navy-700 gap-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px
              ${activeTab === t.id ? 'border-cyber-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Questionnaire */}
      {activeTab === 'audit' && (
        <div className="space-y-3">
          {referential.domains.map(domain => {
            const ds = domainScores[domain.id]
            const isOpen = expandedDomain === domain.id
            const answered = domain.controls.filter(c => audit.responses[c.id] !== undefined && audit.responses[c.id] !== null).length

            return (
              <div key={domain.id} className="card overflow-hidden">
                <button className="w-full flex items-center justify-between" onClick={() => setExpandedDomain(isOpen ? null : domain.id)}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-bold flex-shrink-0"
                      style={{ background: referential.color + '20', color: referential.color }}>
                      {domain.id}
                    </div>
                    <div className="text-left">
                      <div className="font-medium text-white text-sm">{domain.name}</div>
                      <div className="text-xs text-slate-500">{answered}/{domain.controls.length} réponses</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {ds && <span className="font-mono text-sm font-bold" style={{ color: ds.color }}>{ds.score}%</span>}
                    {isOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-4 space-y-3 border-t border-navy-700 pt-4">
                    {domain.controls.map(control => (
                      <ControlRow
                        key={control.id}
                        control={control}
                        value={audit.responses[control.id]}
                        note={audit.notes[control.id] || ''}
                        onChange={(v, n) => updateResponse(audit.id, control.id, v, n)}
                        onExplain={() => handleExplainControl(control)}
                        explainLoading={explainLoading === control.id}
                        explanation={controlExplanation?.id === control.id ? controlExplanation : null}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Tab: Results */}
      {activeTab === 'results' && (
        <div className="space-y-4">
          {/* Score global */}
          <div className="card flex items-center gap-6">
            <div className="text-center">
              <div className="text-5xl font-mono font-bold" style={{ color: getScoreColor(globalScore) }}>{globalScore}%</div>
              <div className="text-sm text-slate-400 mt-1">{maturity.level}</div>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-3">
              <StatBox label="Conformes" value={stats.conforme} color="text-green-400" />
              <StatBox label="Partiels" value={stats.partiel} color="text-yellow-400" />
              <StatBox label="Non Conformes" value={stats.non_conforme} color="text-red-400" />
              <StatBox label="Répondus" value={stats.total} color="text-cyber-400" />
            </div>
          </div>

          {/* Radar */}
          <div className="card">
            <div className="text-sm font-semibold text-white mb-3">Radar Maturité</div>
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#1e3a78" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Radar dataKey="score" stroke={referential.color} fill={referential.color} fillOpacity={0.15} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Domain scores */}
          <div className="card">
            <div className="text-sm font-semibold text-white mb-3">Scores par Domaine</div>
            <div className="space-y-3">
              {Object.values(domainScores).map(d => (
                <div key={d.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{d.name}</span>
                    <span className="font-mono font-bold" style={{ color: d.color }}>{d.score}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${d.score}%`, background: d.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Plan d'Actions */}
      {activeTab === 'actions' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-slate-400">Plan d'actions : les suggestions IA doivent être validées pour figurer dans le rapport</div>
            <button className="btn-primary flex items-center gap-2 text-xs" onClick={handleActionPlan} disabled={actionLoading}>
              {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
              Générer le Plan
            </button>
          </div>
          {(audit.actionPlan || []).some(a => a.validated === false) && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-yellow-300">
              <span>{audit.actionPlan.filter(a => a.validated === false).length} suggestion(s) IA à relire : non incluses dans le PDF/Excel tant qu'elles ne sont pas validées.</span>
              <button className="btn-ghost text-xs" onClick={() => audit.actionPlan.filter(a => a.validated === false).forEach(a => updateActionItem(audit.id, a.id, { validated: true }))}>Tout valider</button>
            </div>
          )}
          {audit.actionPlan?.length > 0 ? (
            <div className="space-y-2">
              {audit.actionPlan.map(action => (
                <div key={action.id} className="card-sm flex items-start gap-4">
                  <div className="font-mono text-xs text-slate-500 w-14 flex-shrink-0 mt-0.5">{action.id}</div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-cyber-400">{action.controle}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-mono
                        ${action.priorite === 'P1' ? 'badge-critical' : action.priorite === 'P2' ? 'badge-high' : 'badge-medium'}`}>
                        {action.priorite}
                      </span>
                    </div>
                    <div className="text-sm text-white">{action.action}</div>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
                      <span>👤 {action.responsable}</span>
                      <span>⏱ {action.delai}</span>
                      <span>💪 {action.effort}</span>
                      <span>💰 {action.cout}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {action.validated === false ? (
                      <>
                        <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-yellow-500/10 text-yellow-300 border border-yellow-500/30">
                          Suggestion IA {action.source === 'ia-cloud' ? '(cloud)' : '(locale)'}
                        </span>
                        <div className="flex gap-1">
                          <button className="btn-ghost text-xs px-2 py-0.5" onClick={() => updateActionItem(audit.id, action.id, { validated: true })}>Valider</button>
                          <button className="btn-ghost text-xs px-2 py-0.5" onClick={() => removeActionItem(audit.id, action.id)}>Rejeter</button>
                        </div>
                      </>
                    ) : (
                      <span className="badge-info text-xs">{action.statut}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card text-center py-12 text-slate-500">
              <Bot size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Cliquez sur "Générer le Plan" pour que l'IA analyse les non-conformités</p>
            </div>
          )}
        </div>
      )}

      {/* Tab: Analyse IA */}
      {activeTab === 'analysis' && (
        <div className="space-y-4">
          {audit.aiAnalysis ? (
            <>
              {audit.aiAnalysis.validated === false && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-yellow-300">
                  <span>Analyse générée par IA {audit.aiAnalysis.source === 'ia-cloud' ? '(cloud)' : '(locale)'} : relisez-la. Le PDF utilise le résumé automatique tant qu'elle n'est pas validée.</span>
                  <button className="btn-ghost text-xs" onClick={() => saveAIAnalysis(audit.id, { ...audit.aiAnalysis, validated: true })}>Valider l'analyse</button>
                </div>
              )}
              <div className="card">
                <div className="text-xs text-cyber-500 font-mono uppercase tracking-wider mb-2">Résumé Exécutif</div>
                <p className="text-sm text-slate-300 leading-relaxed">{audit.aiAnalysis.resume}</p>
                <div className="flex gap-3 mt-3">
                  <span className="badge-info">Maturité : {audit.aiAnalysis.niveau_maturite}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-mono
                    ${audit.aiAnalysis.risque_global === 'Critique' ? 'badge-critical' :
                      audit.aiAnalysis.risque_global === 'Élevé' ? 'badge-high' :
                      audit.aiAnalysis.risque_global === 'Moyen' ? 'badge-medium' : 'badge-low'}`}>
                    Risque {audit.aiAnalysis.risque_global}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card border-green-500/20">
                  <div className="text-xs font-mono uppercase tracking-wider text-green-400 mb-3 flex items-center gap-2">
                    <CheckCircle2 size={12} /> Points Forts
                  </div>
                  <ul className="space-y-2">
                    {(audit.aiAnalysis.points_forts || []).map((p, i) => (
                      <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                        <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span> {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="card border-red-500/20">
                  <div className="text-xs font-mono uppercase tracking-wider text-red-400 mb-3 flex items-center gap-2">
                    <AlertCircle size={12} /> Faiblesses Critiques
                  </div>
                  <ul className="space-y-2">
                    {(audit.aiAnalysis.faiblesses_critiques || []).map((f, i) => (
                      <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                        <span className="text-red-400 mt-0.5 flex-shrink-0">✗</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {audit.aiAnalysis.recommandations?.length > 0 && (
                <div className="card">
                  <div className="text-xs font-mono uppercase tracking-wider text-cyber-400 mb-3">Recommandations IA</div>
                  <div className="space-y-3">
                    {audit.aiAnalysis.recommandations.map((r, i) => (
                      <div key={i} className="flex items-start gap-3 py-2 border-b border-navy-700 last:border-0">
                        <span className={`text-xs px-2 py-1 rounded font-mono flex-shrink-0 mt-0.5
                          ${r.priorite === 'P1' ? 'badge-critical' : r.priorite === 'P2' ? 'badge-high' : 'badge-medium'}`}>
                          {r.priorite}
                        </span>
                        <div>
                          <div className="text-sm text-white">{r.action}</div>
                          <div className="text-xs text-slate-500 mt-1">⏱ {r.delai} — Impact : {r.impact}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card text-center py-12 text-slate-500">
              <Bot size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Cliquez sur "Analyser avec IA" pour générer l'analyse Qwen2.5</p>
              <button className="mt-4 btn-primary flex items-center gap-2 mx-auto" onClick={handleAnalyze} disabled={aiLoading}>
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                Analyser avec IA
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ControlRow({ control, value, note, onChange, onExplain, explainLoading, explanation }) {
  const [showNote, setShowNote] = useState(false)
  const [localNote, setLocalNote] = useState(note)

  const matOptions = [
    { v: 0, label: 'Non implémenté', color: 'text-red-400' },
    { v: 1, label: 'Partiel', color: 'text-orange-400' },
    { v: 2, label: 'Implémenté', color: 'text-green-400' },
    { v: 3, label: 'Optimisé', color: 'text-cyber-400' },
  ]

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 py-2 px-3 rounded-lg bg-navy-800/50">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-xs font-mono text-cyber-400">{control.id}</span>
            <span className={criticityBadge(control.criticality)}>{criticityLabel(control.criticality)}</span>
          </div>
          <div className="text-sm font-medium text-white leading-tight">{control.name}</div>
          <div className="text-xs text-slate-500 mt-1 line-clamp-2">{control.description}</div>
          {control.question && (
            <div className="text-xs text-cyber-300 mt-1.5 italic">💬 {control.question}</div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-3">
            {matOptions.map(opt => (
              <button key={opt.v}
                onClick={() => onChange(opt.v, localNote)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border
                  ${Number(value) === opt.v
                    ? `${opt.color} border-current bg-current/10`
                    : 'text-slate-500 border-navy-600 hover:border-slate-500'}`}>
                {opt.v} — {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1 flex-shrink-0">
          <button
            onClick={onExplain}
            className="p-1.5 rounded hover:bg-navy-700 text-slate-500 hover:text-cyber-400 transition-colors"
            title="Expliquer ce contrôle (IA)">
            {explainLoading ? <Loader2 size={14} className="animate-spin text-cyber-400" /> : <Info size={14} />}
          </button>
          <button
            onClick={() => setShowNote(!showNote)}
            className={`p-1.5 rounded hover:bg-navy-700 transition-colors text-xs ${localNote ? 'text-yellow-400' : 'text-slate-500'}`}
            title="Ajouter une note">
            📝
          </button>
        </div>
      </div>

      {/* Explication IA */}
      {explanation && (
        <div className="ml-3 p-3 bg-navy-800 border border-cyber-500/20 rounded-lg text-xs space-y-2">
          <div><span className="text-cyber-400 font-semibold">Objectif :</span> <span className="text-slate-300">{explanation.objectif}</span></div>
          {explanation.preuves_attendues?.length > 0 && (
            <div>
              <span className="text-cyber-400 font-semibold">Preuves attendues :</span>
              <span className="text-slate-300"> {explanation.preuves_attendues.join(', ')}</span>
            </div>
          )}
          {explanation.mise_en_oeuvre && (
            <div><span className="text-cyber-400 font-semibold">Mise en œuvre :</span> <span className="text-slate-300">{explanation.mise_en_oeuvre}</span></div>
          )}
          {explanation.exemple_pratique && (
            <div><span className="text-yellow-400 font-semibold">Exemple :</span> <span className="text-slate-400">{explanation.exemple_pratique}</span></div>
          )}
        </div>
      )}

      {/* Note */}
      {showNote && (
        <div className="ml-3">
          <textarea
            className="input text-xs resize-none"
            rows={2}
            placeholder="Note, observation, preuve disponible..."
            value={localNote}
            onChange={e => setLocalNote(e.target.value)}
            onBlur={() => onChange(value, localNote)}
          />
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, color }) {
  return (
    <div className="bg-navy-800 rounded-lg p-3 text-center">
      <div className={`text-2xl font-mono font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}
