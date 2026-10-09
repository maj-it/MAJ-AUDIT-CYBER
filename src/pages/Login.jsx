import { useState } from 'react'
import { ShieldCheck, Lock, User, Eye, EyeOff } from 'lucide-react'
import { supabase, cloudEnabled } from '../lib/supabase.js'

// Comptes de démonstration : uniquement en développement local (jamais dans un build de production).
const USERS = import.meta.env.DEV
  ? [
      { login: 'admin', password: 'easy4cyber', role: 'RSSI', name: 'Admin RSSI' },
      { login: 'auditeur', password: 'audit2026', role: 'Auditeur', name: 'Jean Auditeur' },
    ]
  : []

export default function Login({ onLogin }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [signup, setSignup] = useState(false)
  const [fullName, setFullName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [info, setInfo] = useState('')

  const handleCloud = async () => {
    setLoading(true); setError(''); setInfo('')
    const email = login.trim()
    const { data, error: err } = signup
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, org_name: orgName || undefined } } })
      : await supabase.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
    else if (signup && !data.session) setInfo('Compte créé : confirmez votre adresse e-mail puis connectez-vous.')
    setLoading(false)
  }

  const handleSubmit = () => {
    if (cloudEnabled) return handleCloud()
    setLoading(true)
    setTimeout(() => {
      const user = USERS.find(u => u.login === login && u.password === password)
      if (user) { onLogin(user) }
      else { setError('Identifiants incorrects'); setLoading(false) }
    }, 800)
  }

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-cyber-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">MAJ Audit</h1>
          <p className="text-slate-500 text-sm mt-1 font-mono">Plateforme GRC & Audit Cybersécurité</p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400 font-mono">Système opérationnel</span>
          </div>
        </div>

        <div className="card border-navy-600 shadow-2xl">
          <div className="text-sm font-semibold text-white mb-5 flex items-center gap-2">
            <Lock size={14} className="text-cyber-400" /> Authentification
          </div>

          <div className="space-y-4">
            {cloudEnabled && signup && (
              <>
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">Nom complet</label>
                  <input className="input" value={fullName} onChange={e => setFullName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 block">Organisation (cabinet / entreprise)</label>
                  <input className="input" value={orgName} onChange={e => setOrgName(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">{cloudEnabled ? 'E-mail' : 'Identifiant'}</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className="input pl-9" placeholder="admin" value={login}
                  onChange={e => { setLogin(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">Mot de passe</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className="input pl-9 pr-9" placeholder="••••••••"
                  type={showPwd ? 'text' : 'password'} value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  onClick={() => setShowPwd(!showPwd)}>
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {info && <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">{info}</div>}
            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 mt-2"
              onClick={handleSubmit} disabled={loading || !login || !password}>
              {loading ? (
                <><div className="w-4 h-4 border-2 border-navy-950/30 border-t-navy-950 rounded-full animate-spin" /> Connexion...</>
              ) : (
                <><ShieldCheck size={16} /> {cloudEnabled && signup ? 'Créer mon compte' : 'Se connecter'}</>
              )}
            </button>
          </div>

          {cloudEnabled && (
            <button className="mt-4 w-full text-xs text-slate-500 hover:text-cyber-400" onClick={() => { setSignup(!signup); setError(''); setInfo('') }}>
              {signup ? 'Déjà un compte ? Se connecter' : 'Pas de compte ? Créer le mien'}
            </button>
          )}

          {!cloudEnabled && USERS.length === 0 && (
            <div className="mt-4 text-xs text-slate-500 text-center">Aucun mode de connexion configuré (Supabase requis en production).</div>
          )}
          {!cloudEnabled && USERS.length > 0 && <div className="mt-5 pt-4 border-t border-navy-700">
            <div className="text-xs text-slate-600 text-center mb-2">Comptes de démonstration</div>
            <div className="grid grid-cols-2 gap-2">
              {USERS.map(u => (
                <button key={u.login} className="text-left px-3 py-2 bg-navy-800 rounded-lg hover:bg-navy-700 transition-colors"
                  onClick={() => { setLogin(u.login); setPassword(u.password); setError('') }}>
                  <div className="text-xs font-mono text-cyber-400">{u.login}</div>
                  <div className="text-xs text-slate-500">{u.role}</div>
                </button>
              ))}
            </div>
          </div>}
        </div>

        <div className="text-center mt-6 text-xs text-slate-700 font-mono">
          v1.0.0 • ISO 27001 • NIST CSF • RGPD • Powered by Gemini & Qwen2.5
        </div>
      </div>
    </div>
  )
}
