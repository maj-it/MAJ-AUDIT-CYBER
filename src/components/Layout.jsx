import { NavLink } from 'react-router-dom'
import { useEffect, useState as useS } from 'react'
import { aiStatus } from '../lib/ollama.js'
import { LayoutDashboard, ClipboardList, Plus, AlertTriangle, FileText, Bot, Menu, X, LogOut, Globe, TrendingUp } from 'lucide-react'
import { useState } from 'react'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/audits', icon: ClipboardList, label: 'Audits' },
  { to: '/audits/new', icon: Plus, label: 'Nouvel Audit' },
  { to: '/scan', icon: Globe, label: 'Scan externe' },
  { to: '/progress', icon: TrendingUp, label: 'Suivi dans le temps' },
  { to: '/risks', icon: AlertTriangle, label: 'Cartographie Risques' },
  { to: '/reports', icon: FileText, label: 'Rapports' },
  { to: '/ai', icon: Bot, label: 'Assistant IA' },
]

export default function Layout({ children, user, onLogout, sync }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden md:flex w-60 flex-col bg-navy-900 border-r border-navy-700 flex-shrink-0">
        <SidebarContent user={user} onLogout={onLogout} sync={sync} />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-60 bg-navy-900 border-r border-navy-700 flex flex-col">
            <SidebarContent user={user} onLogout={onLogout} onClose={() => setMobileOpen(false)} sync={sync} />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-navy-900 border-b border-navy-700">
          <button onClick={() => setMobileOpen(true)} className="text-slate-400"><Menu size={20} /></button>
          <span className="font-bold text-sm text-white">MAJ Audit</span>
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}

function SidebarContent({ user, onLogout, onClose, sync }) {
  const [ai, setAi] = useS(null)
  useEffect(() => {
    let alive = true
    const tick = () => aiStatus().then(s => alive && setAi(s))
    tick(); const t = setInterval(tick, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return (
    <>
      <div className="px-5 py-5 border-b border-navy-700 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div>
            <div className="font-bold text-white text-sm leading-tight">MAJ Audit</div>
            <div className="text-xs text-slate-500 font-mono">Audit & Conformité</div>
          </div>
        </div>
        {onClose && <button onClick={onClose} className="text-slate-400 md:hidden"><X size={18} /></button>}
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        <div className="text-xs text-slate-600 uppercase tracking-widest px-3 mb-3 font-semibold">Navigation</div>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} onClick={onClose}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon size={16} />{label}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-navy-700">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-cyber-500/20 flex items-center justify-center text-xs font-bold text-cyber-400">
              {user?.name?.[0] || 'U'}
            </div>
            <div>
              <div className="text-xs font-medium text-white">{user?.name || 'Utilisateur'}</div>
              <div className="text-xs text-slate-500">{user?.role || 'RSSI'}</div>
            </div>
          </div>
          <button onClick={onLogout} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors" title="Déconnexion">
            <LogOut size={14} />
          </button>
        </div>
        <div className="mt-3 px-2">
          <div className="text-xs text-slate-600 font-mono">v1.1 • MAJ-IT</div>
          <div className={`text-xs font-mono mt-1 ${ai?.ollama ? 'text-green-400' : 'text-slate-500'}`} title={ai?.models?.join(', ') || ''}>
            ● {ai == null ? 'IA…' : ai.ollama ? `IA locale : ${ai.modelInstalled ? ai.model : (ai.models.find(n => /^qwen/i.test(n)) || ai.models[0] || 'aucun modèle')}` : 'IA hors-ligne (mode règles)'}
          </div>
          {sync && <div className={`text-xs font-mono mt-1 ${sync.state === 'error' ? 'text-red-400' : sync.state === 'syncing' ? 'text-yellow-400' : 'text-green-400'}`} title={sync.error || ''}>
            ● {sync.state === 'error' ? 'Synchro en erreur' : sync.state === 'syncing' ? 'Synchronisation…' : 'Cloud synchronisé'}
          </div>}
        </div>
      </div>
    </>
  )
}
