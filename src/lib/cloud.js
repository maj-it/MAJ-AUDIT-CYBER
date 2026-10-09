// Synchronisation du store local (zustand) avec Supabase, isolée par organisation (RLS).
import { supabase } from './supabase.js'
import { useAuditStore } from '../store/auditStore.js'

const KINDS = { company: 'companies', audit: 'audits', risk: 'risks', scan: 'scans' }
const stamp = (x) => x?.updatedAt || x?.createdAt || x?.scannedAt || ''

let orgId = null
let synced = new Map()   // "kind:id" -> JSON
let unsub = null
let timer = null
let status = { state: 'idle', error: '' }
const listeners = new Set()
const setStatus = (s) => { status = { ...status, ...s }; listeners.forEach(l => l(status)) }
export const onSyncStatus = (fn) => { listeners.add(fn); fn(status); return () => listeners.delete(fn) }

const snapshot = () => {
  const s = useAuditStore.getState(), m = new Map()
  for (const [kind, key] of Object.entries(KINDS)) for (const x of s[key]) m.set(`${kind}:${x.id}`, JSON.stringify(x))
  return m
}

export async function getOrgId(userId) {
  const { data, error } = await supabase.from('members').select('org_id').eq('user_id', userId).limit(1).single()
  if (error) throw error
  return data.org_id
}

async function pull() {
  const { data, error } = await supabase.from('records').select('id,kind,data').eq('org_id', orgId).limit(10000)
  if (error) throw error
  return data
}

function merge(localList, remoteList) {
  const byId = new Map(localList.map(x => [x.id, x]))
  for (const r of remoteList) {
    const l = byId.get(r.id)
    if (!l || stamp(r) >= stamp(l)) byId.set(r.id, r)
  }
  return [...byId.values()]
}

async function push(upserts, deletes) {
  if (upserts.length) {
    const { error } = await supabase.from('records').upsert(upserts, { onConflict: 'id' })
    if (error) throw error
  }
  for (const id of deletes) {
    const { error } = await supabase.from('records').delete().eq('id', id).eq('org_id', orgId)
    if (error) throw error
  }
}

async function flush() {
  try {
    setStatus({ state: 'syncing', error: '' })
    const cur = snapshot(), ups = [], dels = []
    for (const [k, json] of cur) if (synced.get(k) !== json) {
      const [kind, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)]
      ups.push({ id, org_id: orgId, kind, data: JSON.parse(json), updated_at: new Date().toISOString() })
    }
    for (const k of synced.keys()) if (!cur.has(k)) dels.push(k.slice(k.indexOf(':') + 1))
    await push(ups, dels)
    synced = cur
    setStatus({ state: 'ok' })
  } catch (e) { setStatus({ state: 'error', error: e.message }) }
}

export async function startSync(userId) {
  stopSync()
  setStatus({ state: 'syncing', error: '' })
  orgId = await getOrgId(userId)
  const remote = await pull()
  const st = useAuditStore.getState()
  const next = {}
  for (const [kind, key] of Object.entries(KINDS)) {
    next[key] = merge(st[key], remote.filter(r => r.kind === kind).map(r => r.data))
  }
  useAuditStore.getState().hydrate(next)
  synced = new Map(remote.map(r => [`${r.kind}:${r.id}`, JSON.stringify(r.data)]))
  await flush() // pousse ce qui n'existait qu'en local
  unsub = useAuditStore.subscribe(() => { clearTimeout(timer); timer = setTimeout(flush, 1500) })
}

export function stopSync() {
  unsub?.(); unsub = null; clearTimeout(timer); orgId = null; synced = new Map()
  setStatus({ state: 'idle' })
}
