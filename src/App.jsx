import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import AuditList from './pages/AuditList.jsx'
import AuditNew from './pages/AuditNew.jsx'
import AuditDetail from './pages/AuditDetail.jsx'
import RiskMap from './pages/RiskMap.jsx'
import Reports from './pages/Reports.jsx'
import AIAssistant from './pages/AIAssistant.jsx'
import Scan from './pages/Scan.jsx'
import Progress from './pages/Progress.jsx'
import Login from './pages/Login.jsx'
import { ollamaChat } from './lib/ollama.js'
import { supabase, cloudEnabled } from './lib/supabase.js'
import { startSync, stopSync, onSyncStatus } from './lib/cloud.js'
import { useAuditStore } from './store/auditStore.js'
import { Bot, X, Send, Loader2, Minimize2 } from 'lucide-react'

export default function App() {
  const [user, setUser] = useState(() => {
    if (cloudEnabled) return null
    try { return JSON.parse(localStorage.getItem('cyberaudit_user')) } catch { return null }
  })
  const [booting, setBooting] = useState(cloudEnabled)
  const [sync, setSync] = useState({ state: 'idle' })

  // Mode SaaS : session Supabase + synchronisation de l'organisation
  useEffect(() => {
    if (!cloudEnabled) return
    const apply = async (session) => {
      if (!session) { stopSync(); setUser(null); setBooting(false); return }
      const u = session.user
      setUser({ id: u.id, email: u.email, name: u.user_metadata?.full_name || u.email.split('@')[0], role: 'Auditeur' })
      try { await startSync(u.id) } catch (e) { console.error('Sync', e) }
      setBooting(false)
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT') apply(session)
    })
    const off = onSyncStatus(setSync)
    return () => { sub.subscription.unsubscribe(); off() }
  }, [])

  const handleLogin = (u) => {
    if (cloudEnabled) return // géré par onAuthStateChange
    localStorage.setItem('cyberaudit_user', JSON.stringify(u))
    if (u.demo) useAuditStore.getState().seedDemo()
    setUser(u)
  }

  const handleLogout = async () => {
    if (cloudEnabled) {
      stopSync()
      await supabase.auth.signOut()
      useAuditStore.getState().hydrate({ audits: [], companies: [], risks: [], scans: [] }) // purge du cache local
    } else {
      localStorage.removeItem('cyberaudit_user')
      setUser(null)
    }
  }

  if (booting) return <div className="min-h-screen bg-navy-950 flex items-center justify-center text-slate-500 text-sm">Chargement…</div>
  if (!user) return <Login onLogin={handleLogin} />

  return (
    <>
      <Layout user={user} onLogout={handleLogout} sync={cloudEnabled ? sync : null}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/audits" element={<AuditList />} />
          <Route path="/audits/new" element={<AuditNew />} />
          <Route path="/audits/:id" element={<AuditDetail />} />
          <Route path="/risks" element={<RiskMap />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/ai" element={<AIAssistant />} />
        </Routes>
      </Layout>
      <FloatingChat user={user} />
    </>
  )
}

function FloatingChat({ user }) {
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `Bonjour ${user.name} ! Je suis votre assistant cybersécurité. Comment puis-je vous aider ?` }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (open) { setUnread(0); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100) }
  }, [open, messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const msg = input.trim()
    setInput('')
    const newMsgs = [...messages, { role: 'user', content: msg }]
    setMessages(newMsgs)
    setLoading(true)
    try {
      const apiMsgs = [
        { role: 'system', content: 'Tu es un expert GRC cybersécurité. Réponds en français, de façon concise et opérationnelle.' },
        ...newMsgs.slice(-6)
      ]
      let full = ''
      await ollamaChat(apiMsgs, (_, acc) => { full = acc })
      setMessages(prev => [...prev, { role: 'assistant', content: full }])
      if (!open) setUnread(u => u + 1)
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ ' + (e?.message || 'IA non disponible.') }])
    }
    setLoading(false)
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && !minimized && (
        <div className="w-80 bg-navy-900 border border-navy-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ height: '420px' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-navy-800 border-b border-navy-700">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm font-semibold text-white">Assistant IA</span>
              <span className="text-xs text-slate-500 font-mono">Qwen2.5</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => setMinimized(true)} className="p-1 text-slate-500 hover:text-white">
                <Minimize2 size={13} />
              </button>
              <button onClick={() => setOpen(false)} className="p-1 text-slate-500 hover:text-white">
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed
                  ${m.role === 'assistant' ? 'bg-navy-800 text-slate-200 rounded-tl-none' : 'bg-cyber-500/20 text-white rounded-tr-none border border-cyber-500/30'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="bg-navy-800 rounded-xl rounded-tl-none px-3 py-2 flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-cyber-400" />
                  <span className="text-xs text-slate-500">Réflexion...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-navy-700 flex gap-2">
            <input className="input text-xs flex-1 py-1.5"
              placeholder="Posez votre question..."
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              disabled={loading} />
            <button className="btn-primary px-2.5 py-1.5" onClick={send} disabled={loading || !input.trim()}>
              <Send size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Bouton flottant */}
      <button
        onClick={() => { setOpen(!open); setMinimized(false) }}
        className="w-13 h-13 w-12 h-12 rounded-full bg-cyber-500 hover:bg-cyber-400 text-navy-950 shadow-lg shadow-cyber-500/30 flex items-center justify-center transition-all hover:scale-110 relative">
        {open ? <X size={20} /> : <Bot size={20} />}
        {unread > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
            {unread}
          </span>
        )}
      </button>
    </div>
  )
}
