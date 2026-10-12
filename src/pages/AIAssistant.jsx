import { useState, useRef, useEffect } from 'react'
import { ollamaChat, aiStatus } from '../lib/ollama.js'
import { Bot, Send, Loader2, User, Trash2 } from 'lucide-react'

const SYSTEM_PROMPT = `Tu es un expert en cybersécurité et conformité GRC (Governance, Risk & Compliance). 
Tu maîtrises parfaitement les référentiels ISO 27001:2022, NIST CSF 2.0, RGPD, ANSSI, CIS Controls.
Tu aides les RSSI, auditeurs et consultants à comprendre et appliquer ces référentiels.
Réponds en français, de manière concise, structurée et opérationnelle.
Utilise des exemples pratiques adaptés aux PME et ETI.`

const QUICK_PROMPTS = [
  'Comment implémenter le contrôle A.8.2 (droits d\'accès privilégiés) ?',
  'Quelles sont les preuves à fournir pour la certification ISO 27001 ?',
  'Comment rédiger une politique de mot de passe conforme ANSSI ?',
  'Quelle différence entre ISO 27001 et NIST CSF ?',
  'Comment gérer une violation de données RGPD (72h) ?',
  'Quels outils pour un SIEM open source accessible à une PME ?',
]

export default function AIAssistant() {
  const [ai, setAi] = useState(null)
  useEffect(() => { aiStatus().then(setAi) }, [])
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Bonjour ! Je suis votre assistant cybersécurité, alimenté par votre IA locale. Je peux vous aider sur ISO 27001, NIST CSF, RGPD, et tous les sujets GRC. Que puis-je faire pour vous ?'
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState('')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const send = async (text) => {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')

    const newMessages = [...messages, { role: 'user', content: msg }]
    setMessages(newMessages)
    setLoading(true)
    setStreaming('')

    try {
      const apiMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...newMessages.slice(-10) // keep last 10 for context
      ]

      let full = ''
      await ollamaChat(apiMessages, (chunk, accumulated) => {
        full = accumulated
        setStreaming(accumulated)
      })

      setMessages(prev => [...prev, { role: 'assistant', content: full }])
    } catch (e) {
      const up = (await aiStatus()).ollama
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ ${e?.message || 'IA indisponible'}\n${up ? 'Ollama répond mais la requête a échoué (modèle absent ou trop lent ?).' : 'Ollama est injoignable depuis l\'application (tester : curl localhost:11434/api/tags).'}`
      }])
    }

    setStreaming('')
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Assistant IA Cybersécurité</h1>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-2 h-2 rounded-full ${ai?.ollama ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-xs text-slate-500 font-mono">{ai == null ? '…' : ai.ollama ? `${ai.modelInstalled ? ai.model : (ai.models.find(n => /^qwen/i.test(n)) || ai.models[0] || 'aucun modèle')} via Ollama` : 'Ollama injoignable'}</span>
          </div>
        </div>
        <button className="btn-ghost flex items-center gap-2 text-xs" onClick={() => setMessages([messages[0]])}>
          <Trash2 size={14} /> Vider
        </button>
      </div>

      {/* Quick prompts */}
      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK_PROMPTS.map((p, i) => (
          <button key={i}
            className="text-xs px-3 py-1.5 rounded-full bg-navy-800 border border-navy-600 text-slate-400 hover:border-cyber-500/50 hover:text-white transition-colors"
            onClick={() => send(p)}>
            {p.length > 45 ? p.slice(0, 45) + '…' : p}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5
              ${msg.role === 'assistant' ? 'bg-cyber-500/20 text-cyber-400' : 'bg-navy-700 text-slate-300'}`}>
              {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
            </div>
            <div className={`max-w-[80%] px-4 py-3 rounded-xl text-sm leading-relaxed
              ${msg.role === 'assistant'
                ? 'bg-navy-800 text-slate-200 rounded-tl-none'
                : 'bg-cyber-500/20 text-white rounded-tr-none border border-cyber-500/30'}`}>
              <MessageContent content={msg.content} />
            </div>
          </div>
        ))}

        {/* Streaming */}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-cyber-500/20 text-cyber-400 flex-shrink-0 mt-0.5">
              <Bot size={16} />
            </div>
            <div className="max-w-[80%] px-4 py-3 rounded-xl rounded-tl-none bg-navy-800 text-slate-200 text-sm">
              {streaming ? (
                <MessageContent content={streaming} />
              ) : (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs font-mono">Qwen2.5 réfléchit...</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-4 flex gap-3 items-end">
        <textarea
          ref={inputRef}
          className="input flex-1 resize-none"
          rows={2}
          placeholder="Posez votre question sur ISO 27001, RGPD, NIST, sécurité..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={loading}
        />
        <button
          className="btn-primary flex items-center gap-2 h-10 flex-shrink-0"
          onClick={() => send()}
          disabled={loading || !input.trim()}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
      <div className="text-xs text-slate-600 mt-1.5 text-center">Entrée pour envoyer — Shift+Entrée pour saut de ligne</div>
    </div>
  )
}

// Simple markdown-like renderer
function MessageContent({ content }) {
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*)/g)
  return (
    <div className="space-y-1">
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const code = part.slice(3, -3).replace(/^\w+\n/, '')
          return <pre key={i} className="bg-navy-900 rounded p-3 text-xs font-mono text-cyber-300 overflow-x-auto my-2">{code}</pre>
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={i} className="bg-navy-900 rounded px-1.5 py-0.5 text-xs font-mono text-cyber-300">{part.slice(1, -1)}</code>
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
        }
        return <span key={i} className="whitespace-pre-wrap">{part}</span>
      })}
    </div>
  )
}
