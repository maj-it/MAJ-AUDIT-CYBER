import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

const STORAGE_KEY = 'cyberaudit_data'

const loadFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

const saveToStorage = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      audits: state.audits,
      companies: state.companies,
      risks: state.risks,
      scans: state.scans
    }))
  } catch {}
}

const saved = loadFromStorage()

export const useAuditStore = create((set, get) => ({
  // ── State ──
  audits: saved?.audits || [],
  companies: saved?.companies || [
    { id: 'demo-corp', name: 'Demo Corp SA', sector: 'Finance', size: '250 employés', contact: 'rssi@democorp.fr' }
  ],
  risks: saved?.risks || [],
  scans: saved?.scans || [],
  currentAudit: null,

  // Audit d'exemple fictif pour la démo (une seule fois, uniquement si aucun audit n'existe)
  seedDemo: () => {
    if (get().audits.length || get().companies.some(c => c.id === 'demo-tpe')) return
    const now = new Date().toISOString()
    const company = { id: 'demo-tpe', name: 'Atelier Durand (exemple fictif)', sector: 'Artisanat', size: '8 employés', contact: 'contact@exemple.invalid' }
    const R = { 'H.2': 1, 'H.4': 1, 'H.8': 2, 'H.10': 1, 'H.12': 0, 'H.13': 0, 'H.29': 1, 'H.20': 1, 'H.24': 2, 'H.34': 1, 'H.37': 2, 'H.40': 0 }
    const N = { 'H.12': 'Box et imprimante en configuration usine.', 'H.13': 'Pas de double authentification sur la messagerie.', 'H.40': 'Aucune procédure en cas d\'incident.', 'H.37': 'Sauvegarde hebdomadaire sur disque externe, restauration jamais testée.' }
    const audit = { id: 'demo-audit', companyId: company.id, referentialId: 'anssi-tpe', name: 'Audit ANSSI TPE — exemple', mission: { perimetre: 'Ensemble du SI (données fictives)', cloudConsent: true },
      status: 'in_progress', createdAt: now, updatedAt: now, responses: R, notes: N, score: null, domainScores: {}, aiAnalysis: null, actionPlan: [] }
    set(s => {
      const companies = [...s.companies, company], audits = [...s.audits, audit]
      saveToStorage({ ...s, companies, audits })
      return { companies, audits }
    })
  },

  // ── Companies ──
  addCompany: (company) => {
    const newCompany = { id: uuidv4(), ...company }
    set(s => {
      const companies = [...s.companies, newCompany]
      saveToStorage({ ...s, companies })
      return { companies }
    })
    return newCompany
  },

  // ── Audits ──
  createAudit: ({ companyId, referentialId, name, mission = null }) => {
    const audit = {
      id: uuidv4(),
      companyId,
      referentialId,
      name,
      mission,
      status: 'in_progress',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      responses: {},
      notes: {},
      score: null,
      domainScores: {},
      aiAnalysis: null,
      actionPlan: []
    }
    set(s => {
      const audits = [...s.audits, audit]
      saveToStorage({ ...s, audits })
      return { audits, currentAudit: audit }
    })
    return audit
  },

  // Remplace les collections (sync cloud / déconnexion)
  hydrate: (data) => {
    set(s => {
      const next = { audits: data.audits ?? s.audits, companies: data.companies ?? s.companies, risks: data.risks ?? s.risks, scans: data.scans ?? s.scans }
      saveToStorage({ ...s, ...next })
      return { ...next, currentAudit: null }
    })
  },

  updateMission: (auditId, mission) => {
    set(s => {
      const audits = s.audits.map(a => a.id === auditId ? { ...a, mission, updatedAt: new Date().toISOString() } : a)
      const currentAudit = audits.find(a => a.id === auditId) || s.currentAudit
      saveToStorage({ ...s, audits })
      return { audits, currentAudit }
    })
  },

  // ── Sauvegarde / restauration ──
  exportBackup: () => {
    const s = get()
    return JSON.stringify({ app: 'maj-audit', version: 1, exportedAt: new Date().toISOString(),
      audits: s.audits, companies: s.companies, risks: s.risks, scans: s.scans }, null, 2)
  },
  importBackup: (text) => {
    const d = JSON.parse(text)
    if (d.app !== 'maj-audit' || !Array.isArray(d.audits)) throw new Error('Fichier de sauvegarde invalide')
    const merge = (cur, inc) => { const ids = new Set(cur.map(x => x.id)); return [...cur, ...(inc || []).filter(x => !ids.has(x.id))] }
    set(s => {
      const next = { audits: merge(s.audits, d.audits), companies: merge(s.companies, d.companies),
        risks: merge(s.risks, d.risks), scans: merge(s.scans, d.scans) }
      saveToStorage({ ...s, ...next })
      return next
    })
    return d.audits.length
  },

  setCurrentAudit: (auditId) => {
    const audit = get().audits.find(a => a.id === auditId)
    set({ currentAudit: audit || null })
  },

  updateResponse: (auditId, controlId, value, note = '') => {
    set(s => {
      const audits = s.audits.map(a => {
        if (a.id !== auditId) return a
        const responses = { ...a.responses, [controlId]: value }
        const notes = { ...a.notes, [controlId]: note }
        return { ...a, responses, notes, updatedAt: new Date().toISOString() }
      })
      const currentAudit = audits.find(a => a.id === auditId)
      saveToStorage({ ...s, audits })
      return { audits, currentAudit }
    })
  },

  // Preuves issues du scan : proposées (validated:false), appliquées au questionnaire seulement après validation
  applyScanEvidence: (auditId, evidence) => {
    set(s => {
      const audits = s.audits.map(a => {
        if (a.id !== auditId) return a
        const cur = a.evidence || {}
        const next = { ...cur }
        for (const [c, ev] of Object.entries(evidence)) if (!cur[c]?.validated) next[c] = ev
        return { ...a, evidence: next, updatedAt: new Date().toISOString() }
      })
      const currentAudit = audits.find(a => a.id === auditId)
      saveToStorage({ ...s, audits })
      return { audits, currentAudit }
    })
  },

  validateEvidence: (auditId, controlId, note) => {
    set(s => {
      const audits = s.audits.map(a => {
        const ev = a.evidence?.[controlId]
        if (a.id !== auditId || !ev) return a
        return { ...a, updatedAt: new Date().toISOString(),
          responses: { ...a.responses, [controlId]: ev.value },
          notes: { ...a.notes, [controlId]: note },
          evidence: { ...a.evidence, [controlId]: { ...ev, validated: true, validatedAt: new Date().toISOString() } } }
      })
      const currentAudit = audits.find(a => a.id === auditId)
      saveToStorage({ ...s, audits })
      return { audits, currentAudit }
    })
  },

  rejectEvidence: (auditId, controlId) => {
    set(s => {
      const audits = s.audits.map(a => {
        if (a.id !== auditId || !a.evidence?.[controlId]) return a
        const evidence = { ...a.evidence }
        delete evidence[controlId]
        return { ...a, evidence, updatedAt: new Date().toISOString() }
      })
      const currentAudit = audits.find(a => a.id === auditId)
      saveToStorage({ ...s, audits })
      return { audits, currentAudit }
    })
  },

  saveAuditScore: (auditId, score, domainScores, completed = true) => {
    set(s => {
      const audits = s.audits.map(a =>
        a.id === auditId
          ? { ...a, score, domainScores, status: completed ? 'completed' : 'in_progress' }
          : a
      )
      const currentAudit = audits.find(a => a.id === auditId)
      saveToStorage({ ...s, audits })
      return { audits, currentAudit }
    })
  },

  saveAIAnalysis: (auditId, analysis) => {
    set(s => {
      const audits = s.audits.map(a =>
        a.id === auditId ? { ...a, aiAnalysis: analysis, updatedAt: new Date().toISOString() } : a
      )
      saveToStorage({ ...s, audits })
      return { audits }
    })
  },

  saveActionPlan: (auditId, actionPlan) => {
    set(s => {
      const audits = s.audits.map(a =>
        a.id === auditId ? { ...a, actionPlan, updatedAt: new Date().toISOString() } : a
      )
      saveToStorage({ ...s, audits })
      return { audits }
    })
  },

  updateActionItem: (auditId, itemId, patch) => {
    set(s => {
      const audits = s.audits.map(a => a.id !== auditId ? a : { ...a, updatedAt: new Date().toISOString(),
        actionPlan: (a.actionPlan || []).map(x => x.id === itemId ? { ...x, ...patch } : x) })
      saveToStorage({ ...s, audits })
      return { audits }
    })
  },

  removeActionItem: (auditId, itemId) => {
    set(s => {
      const audits = s.audits.map(a => a.id !== auditId ? a : { ...a, updatedAt: new Date().toISOString(),
        actionPlan: (a.actionPlan || []).filter(x => x.id !== itemId) })
      saveToStorage({ ...s, audits })
      return { audits }
    })
  },

  deleteAudit: (auditId) => {
    set(s => {
      const audits = s.audits.filter(a => a.id !== auditId)
      saveToStorage({ ...s, audits })
      return { audits, currentAudit: s.currentAudit?.id === auditId ? null : s.currentAudit }
    })
  },

  // ── Scans externes ──
  addScan: (scan) => {
    const item = { id: uuidv4(), ...scan }
    set(s => {
      const scans = [item, ...s.scans].slice(0, 50)
      saveToStorage({ ...s, scans })
      return { scans }
    })
    return item
  },

  deleteScan: (scanId) => {
    set(s => {
      const scans = s.scans.filter(x => x.id !== scanId)
      saveToStorage({ ...s, scans })
      return { scans }
    })
  },

  // ── Risks ──
  addRisk: (risk) => {
    const newRisk = { id: uuidv4(), ...risk, createdAt: new Date().toISOString() }
    set(s => {
      const risks = [...s.risks, newRisk]
      saveToStorage({ ...s, risks })
      return { risks }
    })
  },

  updateRisk: (riskId, updates) => {
    set(s => {
      const risks = s.risks.map(r => r.id === riskId ? { ...r, ...updates } : r)
      saveToStorage({ ...s, risks })
      return { risks }
    })
  },

  deleteRisk: (riskId) => {
    set(s => {
      const risks = s.risks.filter(r => r.id !== riskId)
      saveToStorage({ ...s, risks })
      return { risks }
    })
  }
}))
