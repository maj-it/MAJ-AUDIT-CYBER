import { useState } from 'react'
import { useAuditStore } from '../store/auditStore.js'
import { REFERENTIALS } from '../data/index.js'
import { runExternalScan, getScanToken, setScanToken, findingToRisk, findingsToResponses } from '../lib/scan.js'
import { Globe, Loader2, ShieldAlert, CheckCircle2, AlertTriangle, XCircle, Info, Download, Trash2, Plus } from 'lucide-react'

const SEV_BADGE = { critical: 'badge-critical', high: 'badge-high', medium: 'badge-medium', low: 'badge-low', info: 'badge-info' }
const SEV_LABEL = { critical: 'Critique', high: 'Élevé', medium: 'Moyen', low: 'Faible', info: 'Info' }
const STATUS_ICON = {
  ok: <CheckCircle2 size={15} className="text-green-400 flex-shrink-0" />,
  warn: <AlertTriangle size={15} className="text-yellow-400 flex-shrink-0" />,
  fail: <XCircle size={15} className="text-red-400 flex-shrink-0" />,
  info: <Info size={15} className="text-slate-500 flex-shrink-0" />
}
const isLocal = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)

export default function Scan() {
  const { scans, addScan, deleteScan, addRisk, audits, companies, updateResponse } = useAuditStore()
  const [domain, setDomain] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [ports, setPorts] = useState(false)
  const [probes, setProbes] = useState(false)
  const [subs, setSubs] = useState(true)
  const [token, setToken] = useState(getScanToken())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [auditId, setAuditId] = useState('')
  const [notice, setNotice] = useState('')

  const launch = async () => {
    setError(''); setNotice(''); setLoading(true)
    try {
      if (!isLocal) setScanToken(token)
      const data = await runExternalScan({ domain, ports, probes, subs, authorized })
      setResult(data)
      addScan(data)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const addAllRisks = () => {
    const list = (result?.findings || []).filter(f => f.status === 'fail' || (f.status === 'warn' && ['medium', 'high', 'critical'].includes(f.severity)))
    list.forEach(f => addRisk(findingToRisk(f, result.domain)))
    setNotice(`${list.length} risque(s) ajouté(s) à la cartographie.`)
  }

  const audit = audits.find(a => a.id === auditId)
  const mapping = audit && result ? findingsToResponses(result.findings, REFERENTIALS[audit.referentialId]) : {}
  const applyToAudit = () => {
    Object.entries(mapping).forEach(([cid, { value, note }]) => updateResponse(audit.id, cid, value, note))
    setNotice(`${Object.keys(mapping).length} contrôle(s) de l'audit « ${audit.name} » pré-rempli(s) depuis le scan.`)
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `scan-${result.domain}-${result.scannedAt.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const grouped = (result?.findings || []).reduce((acc, f) => { (acc[f.category] ||= []).push(f); return acc }, {})

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Scan externe</h1>
        <p className="text-sm text-slate-500 mt-1">
          Analyse non intrusive d'un domaine : DNS, messagerie (SPF/DMARC/DKIM), TLS, en-têtes HTTP. Les constats alimentent les risques et le questionnaire.
        </p>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[220px] relative">
            <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input pl-9" placeholder="exemple.fr" value={domain}
              onChange={e => setDomain(e.target.value)} onKeyDown={e => e.key === 'Enter' && authorized && domain && !loading && launch()} />
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={launch} disabled={loading || !authorized || !domain.trim()}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
            {loading ? 'Analyse…' : 'Lancer le scan'}
          </button>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-300 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={authorized} onChange={e => setAuthorized(e.target.checked)} />
          <span>
            Je confirme disposer d'une <strong>autorisation écrite</strong> du propriétaire de ce domaine pour effectuer cette analyse
            <span className="text-slate-500"> (art. 323-1 du Code pénal : l'accès non autorisé à un système est une infraction).</span>
          </span>
        </label>

        <div className="flex flex-wrap gap-5 text-xs text-slate-400">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={ports} onChange={e => setPorts(e.target.checked)} />
            Tester les ports TCP courants (RDP, SMB, bases de données…)
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={probes} onChange={e => setProbes(e.target.checked)} />
            Rechercher des fichiers exposés (.git, .env…)
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={subs} onChange={e => setSubs(e.target.checked)} />
            Sous-domaines (certificats publics) + détection de sous-domaines orphelins
          </label>
        </div>

        {!isLocal && (
          <div>
            <label className="text-xs text-slate-500">Jeton de scan (SCAN_TOKEN du serveur)</label>
            <input className="input mt-1" type="password" value={token} onChange={e => setToken(e.target.value)} />
          </div>
        )}
        {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}
      </div>

      {result && (
        <>
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-bold text-white font-mono">{result.domain}</div>
                <div className="text-xs text-slate-500">{new Date(result.scannedAt).toLocaleString('fr-FR')}</div>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                {result.summary.grade && <span className="text-3xl font-bold" style={{ color: result.summary.score >= 75 ? '#22c55e' : result.summary.score >= 60 ? '#eab308' : '#ef4444' }}>{result.summary.grade}<span className="text-xs text-slate-500 ml-1">{result.summary.score}/100</span></span>}
                <span className="badge-low">{result.summary.ok} OK</span>
                <span className="badge-medium">{result.summary.warn} alertes</span>
                <span className="badge-critical">{result.summary.fail} échecs</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={addAllRisks}><Plus size={12} /> Tout ajouter aux risques</button>
              <button className="btn-ghost text-xs flex items-center gap-1.5" onClick={exportJson}><Download size={12} /> Export JSON</button>
              <select className="select text-xs w-auto" value={auditId} onChange={e => setAuditId(e.target.value)}>
                <option value="">Appliquer à un audit…</option>
                {audits.map(a => {
                  const c = companies.find(x => x.id === a.companyId)
                  return <option key={a.id} value={a.id}>{a.name}{c ? ` — ${c.name}` : ''}</option>
                })}
              </select>
              {audit && (
                <button className="btn-primary text-xs" onClick={applyToAudit} disabled={!Object.keys(mapping).length}>
                  Pré-remplir {Object.keys(mapping).length} contrôle(s)
                </button>
              )}
            </div>
            {audit && !Object.keys(mapping).length && (
              <div className="text-xs text-slate-500 mt-2">Aucun contrôle de ce référentiel ne correspond aux constats (utilisez un audit ANSSI ou ISO 27001).</div>
            )}
            {notice && <div className="text-xs text-green-400 mt-3">{notice}</div>}
          </div>

          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat} className="card space-y-2">
              <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold">{cat}</div>
              {list.map(f => (
                <div key={f.id} className="flex items-start gap-3 py-2 px-3 rounded-lg bg-navy-800/50">
                  {STATUS_ICON[f.status]}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white">{f.title}</span>
                      {f.status !== 'ok' && f.status !== 'info' && <span className={SEV_BADGE[f.severity]}>{SEV_LABEL[f.severity]}</span>}
                      {(f.controls || []).map(c => <span key={c} className="text-[10px] font-mono text-cyber-400">{c}</span>)}
                    </div>
                    {f.detail && <div className="text-xs text-slate-500 mt-1 break-words">{f.detail}</div>}
                    {f.recommendation && <div className="text-xs text-yellow-400/90 mt-1">→ {f.recommendation}</div>}
                  </div>
                  {(f.status === 'fail' || f.status === 'warn') && (
                    <button className="text-xs text-slate-500 hover:text-cyber-400 flex-shrink-0" title="Ajouter à la cartographie des risques"
                      onClick={() => { addRisk(findingToRisk(f, result.domain)); setNotice('Risque ajouté à la cartographie.') }}>
                      + risque
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {scans.length > 0 && (
        <div className="card space-y-2">
          <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Historique</div>
          {scans.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-1.5">
              <button className="text-left text-sm text-slate-300 hover:text-cyber-400 font-mono" onClick={() => { setResult(s); setNotice('') }}>
                {s.domain} <span className="text-xs text-slate-600">— {new Date(s.scannedAt).toLocaleString('fr-FR')} — {s.summary.fail} échec(s), {s.summary.warn} alerte(s)</span>
              </button>
              <button className="text-slate-600 hover:text-red-400" onClick={() => deleteScan(s.id)} title="Supprimer"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
