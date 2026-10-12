import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuditStore } from '../store/auditStore.js'
import { searchEntreprises } from '../lib/sirene.js'
import { isNonDiffusible } from '../lib/review.js'
import { ShieldCheck, ArrowRight, Building2, Search, Loader2, CheckCircle2 } from 'lucide-react'
import { REFERENTIALS as REF_MAP, countControls } from '../data/index.js'

const REFERENTIALS = Object.values(REF_MAP).map(r => ({ ...r, controls: countControls(r) }))

export default function AuditNew() {
  const navigate = useNavigate()
  const { companies, createAudit, addCompany } = useAuditStore()

  const [step, setStep] = useState(1)
  const [selected, setSelected] = useState(null)
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [auditName, setAuditName] = useState('')
  const [showNewCompany, setShowNewCompany] = useState(false)
  const [mission, setMission] = useState({ perimetre: '', interlocuteur: '', dateDebut: new Date().toISOString().slice(0,10), dateFin: '', autorise: false, cloudConsent: false })

  // Sirene search
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedSirene, setSelectedSirene] = useState(null)
  const [newCompany, setNewCompany] = useState({ name: '', sector: '', size: '', contact: '', siret: '', naf: '', adresse: '' })
  const debounceRef = useRef(null)
  const [searchState, setSearchState] = useState('') // '' | 'empty' | 'error'

  useEffect(() => {
    if (search.length < 3) { setSuggestions([]); setSearchState(''); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await searchEntreprises(search)
        setSuggestions(results)
        setSearchState(results.length ? '' : 'empty')
      } catch { setSuggestions([]); setSearchState('error') }
      setSearching(false)
    }, 400)
  }, [search])

  const handleSelectSirene = (entreprise) => {
    setSelectedSirene(entreprise)
    setNewCompany({
      name: isNonDiffusible(entreprise.name) ? '' : entreprise.name, // non diffusible : à saisir à la main
      sector: entreprise.naf_label,
      size: formatEffectif(entreprise.effectif),
      contact: '',
      siret: entreprise.siret,
      naf: entreprise.naf,
      adresse: `${entreprise.adresse} ${entreprise.cp} ${entreprise.ville}`.trim()
    })
    setSuggestions([])
    setSearch('')
  }

  const handleAddCompany = () => {
    if (!newCompany.name) return
    const c = addCompany(newCompany)
    setCompanyId(c.id)
    setShowNewCompany(false)
    setSelectedSirene(null)
    setNewCompany({ name: '', sector: '', size: '', contact: '', siret: '', naf: '', adresse: '' })
  }

  const handleCreateAudit = () => {
    if (!selected || !companyId || !mission.autorise) return
    const ref = REFERENTIALS.find(r => r.id === selected)
    const name = auditName || `Audit ${ref.name} — ${new Date().toLocaleDateString('fr-FR')}`
    const audit = createAudit({ companyId, referentialId: selected, name, mission })
    navigate(`/audits/${audit.id}`)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Nouvel Audit</h1>
        <p className="text-sm text-slate-500 mt-1">Sélectionnez un référentiel et configurez votre audit</p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {[1,2,3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
              ${step >= s ? 'bg-cyber-500 text-navy-950' : 'bg-navy-700 text-slate-500'}`}>{s}</div>
            {s < 3 && <div className={`h-0.5 w-16 transition-colors ${step > s ? 'bg-cyber-500' : 'bg-navy-700'}`} />}
          </div>
        ))}
        <span className="text-sm text-slate-400 ml-2">
          {step === 1 ? 'Référentiel' : step === 2 ? 'Entreprise' : 'Confirmation'}
        </span>
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-3">
          <div className="text-sm font-medium text-slate-300">Choisissez le référentiel d'audit</div>
          {REFERENTIALS.map(ref => (
            <div key={ref.id}
              className={`card cursor-pointer transition-all hover:border-cyber-500/50 ${selected === ref.id ? 'border-cyber-500 bg-navy-800' : ''}`}
              onClick={() => setSelected(ref.id)}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold font-mono flex-shrink-0 mt-0.5"
                    style={{ background: ref.color + '20', color: ref.color }}>
                    {ref.badge || ref.id.toUpperCase().slice(0,3)}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{ref.name}</div>
                    <div className="text-xs text-slate-400 mt-1">{ref.description}</div>
                    <div className="flex gap-3 mt-2">
                      <span className="badge-info">{ref.domains.length} domaines</span>
                      <span className="badge-info">{ref.controls} contrôles</span>
                    </div>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-1 transition-colors
                  ${selected === ref.id ? 'border-cyber-500 bg-cyber-500' : 'border-navy-600'}`} />
              </div>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <button className="btn-primary flex items-center gap-2" disabled={!selected} onClick={() => setStep(2)}>
              Suivant <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="text-sm font-medium text-slate-300">Sélectionnez l'entreprise auditée</div>

          {companies.map(c => (
            <div key={c.id}
              className={`card cursor-pointer transition-all hover:border-cyber-500/50 ${companyId === c.id ? 'border-cyber-500 bg-navy-800' : ''}`}
              onClick={() => setCompanyId(c.id)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building2 size={18} className="text-slate-400" />
                  <div>
                    <div className="font-medium text-white">{c.name}</div>
                    <div className="text-xs text-slate-500">{c.sector} — {c.size}</div>
                    {c.siret && <div className="text-xs text-slate-600 font-mono">SIRET : {c.siret}</div>}
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors
                  ${companyId === c.id ? 'border-cyber-500 bg-cyber-500' : 'border-navy-600'}`} />
              </div>
            </div>
          ))}

          {showNewCompany ? (
            <div className="card space-y-4">
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <Building2 size={16} className="text-cyber-400" /> Nouvelle entreprise
              </div>

              {/* Recherche Sirene */}
              <div className="relative">
                <div className="flex items-center gap-2 input">
                  {searching ? <Loader2 size={14} className="text-cyber-400 animate-spin flex-shrink-0" /> : <Search size={14} className="text-slate-500 flex-shrink-0" />}
                  <input
                    className="bg-transparent outline-none flex-1 text-sm text-white placeholder-slate-500"
                    placeholder="Nom, enseigne, SIREN ou SIRET (annuaire des entreprises)…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                {searchState && !searching && (
                  <div className="mt-2 text-xs bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 space-y-2">
                    <div className="text-slate-400">
                      {searchState === 'error'
                        ? "L'annuaire des entreprises ne répond pas."
                        : "Aucun résultat. Un entrepreneur individuel, une enseigne ou une entreprise récente n'apparaissent pas toujours : essayez le SIREN/SIRET, ou saisissez la fiche à la main."}
                    </div>
                    <button className="btn-ghost text-xs" onClick={() => { setNewCompany(p => ({ ...p, name: search })); setSearch(''); setSearchState('') }}>
                      Créer « {search} » manuellement
                    </button>
                  </div>
                )}
                {suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-navy-800 border border-navy-600 rounded-lg shadow-xl overflow-hidden">
                    {suggestions.map((s, i) => (
                      <button key={i} className="w-full text-left px-4 py-3 hover:bg-navy-700 border-b border-navy-700 last:border-0 transition-colors"
                        onClick={() => handleSelectSirene(s)}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-white">{s.name}{s.enseigne && <span className="text-xs text-cyber-400 ml-2">({s.enseigne})</span>}</div>
                            <div className="text-xs text-slate-400 mt-0.5">{s.naf_label}</div>
                            <div className="text-xs text-slate-500">{s.adresse} {s.cp} {s.ville}</div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-xs font-mono text-cyber-400">{s.siret}</div>
                            <span className={`text-xs ${s.statut === 'Actif' ? 'text-green-400' : 'text-red-400'}`}>{s.statut}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Fiche auto-remplie */}
              {selectedSirene && (
                <div className="bg-cyber-500/10 border border-cyber-500/30 rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-cyber-400 font-semibold mb-2">
                    <CheckCircle2 size={12} /> Données INSEE chargées automatiquement
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div><span className="text-slate-500">SIRET :</span> <span className="text-white font-mono">{selectedSirene.siret}</span></div>
                    <div><span className="text-slate-500">NAF :</span> <span className="text-white">{selectedSirene.naf}</span></div>
                    <div><span className="text-slate-500">Statut :</span> <span className="text-green-400">{selectedSirene.statut}</span></div>
                    <div><span className="text-slate-500">Effectif :</span> <span className="text-white">{formatEffectif(selectedSirene.effectif)}</span></div>
                    <div className="col-span-2"><span className="text-slate-500">Adresse :</span> <span className="text-white">{selectedSirene.adresse} {selectedSirene.cp} {selectedSirene.ville}</span></div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-slate-400 mb-1 block">Nom *</label>
                  <input className="input" value={newCompany.name} onChange={e => setNewCompany(p => ({...p, name: e.target.value}))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Secteur / NAF</label>
                  <input className="input" value={newCompany.sector} onChange={e => setNewCompany(p => ({...p, sector: e.target.value}))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Taille</label>
                  <input className="input" value={newCompany.size} onChange={e => setNewCompany(p => ({...p, size: e.target.value}))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">SIRET</label>
                  <input className="input font-mono" value={newCompany.siret} onChange={e => setNewCompany(p => ({...p, siret: e.target.value}))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Contact RSSI</label>
                  <input className="input" placeholder="rssi@entreprise.fr" value={newCompany.contact} onChange={e => setNewCompany(p => ({...p, contact: e.target.value}))} />
                </div>
              </div>

              <div className="flex gap-2">
                <button className="btn-primary" onClick={handleAddCompany}>Ajouter</button>
                <button className="btn-ghost" onClick={() => { setShowNewCompany(false); setSelectedSirene(null) }}>Annuler</button>
              </div>
            </div>
          ) : (
            <button className="btn-ghost w-full flex items-center justify-center gap-2 border-dashed"
              onClick={() => setShowNewCompany(true)}>
              + Nouvelle entreprise (recherche INSEE)
            </button>
          )}

          <div className="space-y-2">
            <div className="text-sm text-slate-400">Nom de l'audit (optionnel)</div>
            <input className="input" placeholder={`Audit ${REFERENTIALS.find(r => r.id === selected)?.name} — ${new Date().toLocaleDateString('fr-FR')}`}
              value={auditName} onChange={e => setAuditName(e.target.value)} />
          </div>

          <div className="flex justify-between pt-2">
            <button className="btn-ghost" onClick={() => setStep(1)}>← Retour</button>
            <button className="btn-primary flex items-center gap-2" disabled={!companyId} onClick={() => setStep(3)}>
              Suivant <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <div className="text-sm font-semibold text-white">Récapitulatif</div>
            {(() => {
              const ref = REFERENTIALS.find(r => r.id === selected)
              const company = companies.find(c => c.id === companyId)
              return (
                <div className="space-y-3">
                  {[
                    ['Référentiel', ref?.name],
                    ['Entreprise', company?.name],
                    ['SIRET', company?.siret || 'Non renseigné'],
                    ['Secteur', company?.sector || 'Non renseigné'],
                    ['Contrôles', `${ref?.controls} contrôles`],
                    ['Nom audit', auditName || `Audit ${ref?.name} — ${new Date().toLocaleDateString('fr-FR')}`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between py-2 border-b border-navy-700 last:border-0">
                      <span className="text-sm text-slate-400">{label}</span>
                      <span className="text-sm font-medium text-white">{value}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
          <div className="card space-y-3">
            <div className="text-sm font-semibold text-white">Fiche de mission</div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Périmètre audité</label>
              <textarea className="input" rows={2} placeholder="Ex : SI du siège, 12 postes, 1 serveur de fichiers, messagerie, site web"
                value={mission.perimetre} onChange={e => setMission(m => ({ ...m, perimetre: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Interlocuteur client</label>
                <input className="input" value={mission.interlocuteur} onChange={e => setMission(m => ({ ...m, interlocuteur: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Début</label>
                <input type="date" className="input" value={mission.dateDebut} onChange={e => setMission(m => ({ ...m, dateDebut: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Fin</label>
                <input type="date" className="input" value={mission.dateFin} onChange={e => setMission(m => ({ ...m, dateFin: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-start gap-2 text-xs text-slate-400 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={mission.cloudConsent} onChange={e => setMission(m => ({ ...m, cloudConsent: e.target.checked }))} />
              Le client accepte l'usage d'une IA cloud en secours (données anonymisées : jamais le nom de l'entreprise). Sinon, tout reste en local.
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={mission.autorise} onChange={e => setMission(m => ({ ...m, autorise: e.target.checked }))} />
              J'atteste disposer de l'autorisation écrite du client pour auditer ce périmètre.
            </label>
          </div>
          <div className="flex justify-between pt-2">
            <button className="btn-ghost" onClick={() => setStep(2)}>← Retour</button>
            <button className="btn-primary flex items-center gap-2 text-base px-6 py-2.5" disabled={!mission.autorise} onClick={handleCreateAudit}>
              <ShieldCheck size={18} /> Démarrer l'Audit
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function formatEffectif(code) {
  const map = {
    'NN': 'Non renseigné', '00': '0 salarié', '01': '1-2', '02': '3-5', '03': '6-9',
    '11': '10-19', '12': '20-49', '21': '50-99', '22': '100-199',
    '31': '200-249', '32': '250-499', '41': '500-999', '42': '1000-1999',
    '51': '2000-4999', '52': '5000-9999', '53': '10000+'
  }
  return map[code] || code || 'Non renseigné'
}
