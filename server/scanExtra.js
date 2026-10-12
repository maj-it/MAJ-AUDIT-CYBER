// Contrôles avancés (passifs ou quasi passifs) : durcissement TLS, HSTS, cookies, CORS, analyse HTML,
// SPF (limite des 10 requêtes DNS), MTA-STS / TLS-RPT, DNSSEC, obsolescence logicielle,
// énumération de sous-domaines (Certificate Transparency) + détection de sous-domaines orphelins.
import dns from 'node:dns/promises'
import tls from 'node:tls'
import https from 'node:https'

const finding = (o) => ({ status: 'info', severity: 'info', controls: [], ...o })
async function safe(fn, fallback = null) { try { return await fn() } catch { return fallback } }
const txt = async (name) => (await safe(() => dns.resolveTxt(name), [])).map(r => r.join(''))

// ── Score & note ─────────────────────────────────────────────
const PENALTY = { critical: 25, high: 12, medium: 6, low: 2 }
export function computeGrade(findings) {
  let score = 100
  for (const f of findings) {
    if (f.status === 'fail') score -= PENALTY[f.severity] || 5
    else if (f.status === 'warn') score -= Math.ceil((PENALTY[f.severity] || 2) / 2)
  }
  score = Math.max(0, Math.min(100, score))
  const hasCrit = findings.some(f => f.status === 'fail' && f.severity === 'critical')
  let grade = score >= 95 ? 'A+' : score >= 85 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F'
  if (hasCrit && ['A+', 'A', 'B'].includes(grade)) grade = 'C'
  if (findings.some(f => f.status === 'fail' && f.severity === 'high') && ['A+', 'A'].includes(grade)) grade = 'B'
  return { score, grade }
}

// ── Obsolescence logicielle (bannières) ──────────────────────
const EOL = [
  [/Apache\/2\.[01]\b|Apache\/2\.2\b/i, 'Apache ≤ 2.2 (fin de support)'],
  [/nginx\/(0\.|1\.(?:[0-9]|1[0-7])\.)/i, 'nginx < 1.18 (obsolète)'],
  [/PHP\/(?:[1-7]\.|8\.0)/i, 'PHP < 8.1 (fin de support)'],
  [/Microsoft-IIS\/(?:[1-7]\.)/i, 'IIS ≤ 7.x (fin de support)'],
  [/OpenSSL\/(?:0\.|1\.0)/i, 'OpenSSL ≤ 1.0 (fin de support)'],
  [/ASP\.NET.*[12]\.\d/i, 'ASP.NET 1/2 (fin de support)']
]
export function detectEol(strings) {
  const hits = []
  for (const s of strings.filter(Boolean)) for (const [re, label] of EOL) if (re.test(s)) hits.push(`${s} → ${label}`)
  return hits
}

// ── Analyse HTML ─────────────────────────────────────────────
export function analyzeHtml(html, pageHost) {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
  const external = scripts.filter(m => { try { return new URL(m[1], `https://${pageHost}/`).hostname !== pageHost } catch { return false } })
  const noSri = external.filter(m => !/\bintegrity=/i.test(m[0])).map(m => m[1])
  const mixed = [...html.matchAll(/(?:src|href|action)=["'](http:\/\/[^"']+)["']/gi)].map(m => m[1]).filter(u => !/^http:\/\/(www\.w3\.org|schemas\.)/i.test(u))
  const gen = (html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i) || [])[1]
  const pwdHttp = /<form[^>]+action=["']http:\/\//i.test(html) && /type=["']password["']/i.test(html)
  return { externalScripts: external.length, noSri, mixed, generator: gen, pwdHttp }
}

function fetchBody(url, maxBody = 300000, timeout = 7000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout, headers: { 'User-Agent': 'MAJ-Audit/1.0 (scan autorisé)' }, rejectUnauthorized: false }, res => {
      let body = ''
      res.on('data', c => { if (body.length < maxBody) body += c.toString('utf8') })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.on('error', reject)
  })
}

// ── Contrôles sur la réponse HTTPS finale ────────────────────
export function checkHeadersDeep(h) {
  const out = []
  const hsts = h['strict-transport-security']
  if (hsts) {
    const age = Number((hsts.match(/max-age=(\d+)/i) || [])[1] || 0)
    const sub = /includeSubDomains/i.test(hsts), pre = /preload/i.test(hsts)
    const weak = age < 15552000
    out.push(finding({ id: 'hsts-quality', category: 'En-têtes HTTP', title: weak ? `HSTS trop court (max-age=${age})` : `HSTS robuste (max-age=${age}${sub ? ', includeSubDomains' : ''}${pre ? ', preload' : ''})`,
      status: weak ? 'warn' : sub ? 'ok' : 'info', severity: weak ? 'low' : 'info', detail: hsts,
      recommendation: weak || !sub ? 'Utiliser max-age ≥ 31536000 avec includeSubDomains (puis preload).' : undefined, controls: ['H.18', 'A.8.24'] }))
  }
  out.push(finding({ id: 'hdr-permissions', category: 'En-têtes HTTP', title: h['permissions-policy'] ? 'Permissions-Policy présent' : 'Permissions-Policy absent',
    status: h['permissions-policy'] ? 'ok' : 'warn', severity: h['permissions-policy'] ? 'info' : 'low',
    detail: h['permissions-policy'] ? String(h['permissions-policy']).slice(0, 160) : 'Les API du navigateur (caméra, micro, géolocalisation) ne sont pas restreintes.',
    recommendation: h['permissions-policy'] ? undefined : 'Ajouter Permissions-Policy: camera=(), microphone=(), geolocation=().', controls: ['A.8.9'] }))
  const acao = h['access-control-allow-origin'], acac = String(h['access-control-allow-credentials'] || '').toLowerCase() === 'true'
  if (acao === '*' || (acao && acac && acao !== 'null' && false)) {
    out.push(finding({ id: 'cors', category: 'En-têtes HTTP', title: acac ? 'CORS permissif avec identifiants' : 'CORS ouvert à toutes les origines (*)',
      status: 'warn', severity: acac ? 'high' : 'low', detail: `Access-Control-Allow-Origin: ${acao}`,
      recommendation: 'Restreindre CORS aux origines nécessaires.', controls: ['A.8.26', 'H.18'] }))
  }
  const cookies = [].concat(h['set-cookie'] || [])
  if (cookies.length) {
    const bad = cookies.map(c => {
      const miss = []
      if (!/;\s*secure/i.test(c)) miss.push('Secure')
      if (!/;\s*httponly/i.test(c)) miss.push('HttpOnly')
      if (!/;\s*samesite=/i.test(c)) miss.push('SameSite')
      return miss.length ? `${c.split('=')[0]} (manque ${miss.join(', ')})` : null
    }).filter(Boolean)
    out.push(finding({ id: 'cookies', category: 'En-têtes HTTP', title: bad.length ? `Cookies sans attributs de sécurité (${bad.length}/${cookies.length})` : 'Cookies correctement protégés',
      status: bad.length ? 'warn' : 'ok', severity: bad.length ? 'medium' : 'info', detail: bad.join(' | ') || `${cookies.length} cookie(s) avec Secure/HttpOnly/SameSite.`,
      recommendation: bad.length ? 'Poser Secure, HttpOnly et SameSite=Lax/Strict sur les cookies de session.' : undefined, controls: ['H.18', 'A.8.26', 'A.8.5'] }))
  }
  const eol = detectEol([h['server'], h['x-powered-by'], h['x-aspnet-version']])
  if (eol.length) out.push(finding({ id: 'eol-software', category: 'Obsolescence', title: 'Logiciel serveur obsolète détecté', status: 'fail', severity: 'high',
    detail: eol.join(' | '), recommendation: 'Mettre à jour vers une version supportée et appliquer les correctifs de sécurité.', controls: ['H.40', 'A.8.8'] }))
  return out
}

export async function checkPageContent(finalUrl, domain) {
  const r = await safe(() => fetchBody(finalUrl))
  if (!r || !/html/i.test(String(r.headers['content-type'] || ''))) return []
  const host = new URL(finalUrl).hostname
  const a = analyzeHtml(r.body, host)
  const out = []
  if (a.externalScripts) {
    out.push(finding({ id: 'sri', category: 'Contenu web', title: a.noSri.length ? `${a.noSri.length}/${a.externalScripts} script(s) tiers sans SRI` : 'Scripts tiers protégés par SRI',
      status: a.noSri.length ? 'warn' : 'ok', severity: a.noSri.length ? 'low' : 'info', detail: a.noSri.slice(0, 5).join(' | ') || 'Tous les scripts tiers portent un attribut integrity.',
      recommendation: a.noSri.length ? 'Ajouter integrity + crossorigin sur les scripts tiers, ou les héberger localement.' : undefined, controls: ['A.8.30', 'A.5.21'] }))
  }
  if (a.mixed.length) out.push(finding({ id: 'mixed', category: 'Contenu web', title: `Contenu mixte HTTP sur page HTTPS (${a.mixed.length})`, status: 'warn', severity: 'medium',
    detail: a.mixed.slice(0, 4).join(' | '), recommendation: 'Charger toutes les ressources en HTTPS.', controls: ['H.18', 'A.8.24'] }))
  if (a.pwdHttp) out.push(finding({ id: 'form-http', category: 'Contenu web', title: 'Formulaire de mot de passe envoyé en HTTP', status: 'fail', severity: 'critical',
    detail: 'Un formulaire contenant un champ mot de passe poste vers une URL http://.', recommendation: 'Poster uniquement en HTTPS.', controls: ['H.18', 'A.8.24', 'A.8.5'] }))
  if (a.generator) {
    const eol = detectEol([a.generator])
    out.push(finding({ id: 'generator', category: 'Contenu web', title: `Technologie identifiée : ${a.generator}`, status: eol.length ? 'warn' : 'info', severity: eol.length ? 'medium' : 'info',
      detail: eol.join(' | ') || 'Balise meta generator visible : facilite le ciblage par version.', recommendation: 'Masquer la balise generator et maintenir le CMS à jour.', controls: ['H.40', 'A.8.8'] }))
  }
  return out
}

// ── TLS : versions supportées ────────────────────────────────
function tlsProbe(host, minVersion, maxVersion) {
  return new Promise(resolve => {
    const s = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, minVersion, maxVersion, ciphers: 'ALL:@SECLEVEL=0', timeout: 5000 },
      () => { const p = s.getProtocol(); s.destroy(); resolve(p) })
    s.on('timeout', () => { s.destroy(); resolve(null) })
    s.on('error', () => resolve(null))
  })
}
export async function checkTlsVersions(domain) {
  const [v10, v11, v13] = await Promise.all([
    tlsProbe(domain, 'TLSv1', 'TLSv1'), tlsProbe(domain, 'TLSv1.1', 'TLSv1.1'), tlsProbe(domain, 'TLSv1.3', 'TLSv1.3')
  ])
  const legacy = [v10 && 'TLS 1.0', v11 && 'TLS 1.1'].filter(Boolean)
  const out = []
  if (legacy.length) out.push(finding({ id: 'tls-legacy', category: 'TLS', title: `Protocoles obsolètes acceptés : ${legacy.join(', ')}`, status: 'fail', severity: 'high',
    detail: 'Le serveur accepte des versions de TLS dépréciées (RFC 8996).', recommendation: 'Désactiver TLS 1.0/1.1 ; n\'autoriser que TLS 1.2 et 1.3.', controls: ['H.18', 'H.21', 'A.8.24'] }))
  out.push(finding({ id: 'tls13', category: 'TLS', title: v13 ? 'TLS 1.3 supporté' : 'TLS 1.3 non supporté', status: v13 ? 'ok' : 'warn', severity: v13 ? 'info' : 'low',
    detail: v13 ? 'Négociation TLS 1.3 réussie.' : 'Le serveur ne négocie pas TLS 1.3.', recommendation: v13 ? undefined : 'Activer TLS 1.3.', controls: ['A.8.24'] }))
  return out
}

// ── Messagerie avancée ───────────────────────────────────────
export async function spfLookupCount(domain, depth = 0, seen = new Set()) {
  if (depth > 6 || seen.has(domain)) return 0
  seen.add(domain)
  const spf = (await txt(domain)).find(t => /^v=spf1/i.test(t))
  if (!spf) return 0
  let n = 0
  for (const tok of spf.split(/\s+/).slice(1)) {
    const m = tok.replace(/^[+\-~?]/, '')
    if (/^(a|mx|ptr|exists)(:|\/|$)/i.test(m)) n++
    else if (/^include:/i.test(m)) { n++; n += await spfLookupCount(m.slice(8), depth + 1, seen) }
    else if (/^redirect=/i.test(m)) { n++; n += await spfLookupCount(m.slice(9), depth + 1, seen) }
  }
  return n
}
export async function checkMailDeep(domain, hasMx) {
  const out = []
  const n = await safe(() => spfLookupCount(domain), 0)
  if (n > 10) out.push(finding({ id: 'spf-lookups', category: 'Messagerie', title: `SPF : ${n} requêtes DNS (limite 10)`, status: 'fail', severity: 'medium',
    detail: 'Au-delà de 10 mécanismes déclenchant une requête DNS, le SPF est invalide (permerror) et ignoré par les destinataires.',
    recommendation: 'Aplatir le SPF ou réduire les include.', controls: ['H.24', 'A.5.14'] }))
  if (hasMx) {
    const [mta, rpt] = await Promise.all([txt(`_mta-sts.${domain}`), txt(`_smtp._tls.${domain}`)])
    const hasMta = mta.some(t => /^v=STSv1/i.test(t)), hasRpt = rpt.some(t => /^v=TLSRPTv1/i.test(t))
    out.push(finding({ id: 'mta-sts', category: 'Messagerie', title: hasMta ? 'MTA-STS publié' : 'MTA-STS absent', status: hasMta ? 'ok' : 'info', severity: 'info',
      detail: hasMta ? 'Chiffrement SMTP imposé aux expéditeurs compatibles.' : 'Recommandé : MTA-STS impose TLS pour le courrier entrant.', controls: ['H.24', 'A.5.14'] }))
    out.push(finding({ id: 'tls-rpt', category: 'Messagerie', title: hasRpt ? 'TLS-RPT publié' : 'TLS-RPT absent', status: hasRpt ? 'ok' : 'info', severity: 'info',
      detail: hasRpt ? 'Rapports d\'échec TLS SMTP activés.' : 'Recommandé avec MTA-STS pour recevoir les rapports d\'échec TLS.', controls: ['A.8.16'] }))
  }
  return out
}

// ── DNSSEC (via DNS-over-HTTPS) ──────────────────────────────
function doh(name, type) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: 'application/dns-json' }, timeout: 6000 }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => { try { resolve(JSON.parse(b)) } catch (e) { reject(e) } })
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) }); req.on('error', reject)
  })
}
export async function checkDnssec(domain) {
  const r = await safe(() => doh(domain, 'DS'))
  if (!r) return []
  const signed = (r.Answer || []).some(a => a.type === 43)
  return [finding({ id: 'dnssec', category: 'DNS', title: signed ? 'DNSSEC activé' : 'DNSSEC non activé', status: signed ? 'ok' : 'info', severity: 'info',
    detail: signed ? 'Enregistrement DS présent chez le registre.' : 'Pas d\'enregistrement DS : les réponses DNS ne sont pas signées (usurpation/empoisonnement de cache possibles).',
    recommendation: signed ? undefined : 'Activer DNSSEC chez le registrar si le DNS le supporte.', controls: ['H.18', 'A.8.20'] })]
}

// ── Sous-domaines (Certificate Transparency) + orphelins ─────
const SENSITIVE = /(^|[.-])(dev|test|staging|stage|preprod|uat|admin|vpn|jenkins|gitlab|grafana|kibana|phpmyadmin|backup|old|intranet|internal|sso|jira|rdp)([.-]|$)/i
const TAKEOVER = [/github\.io$/i, /herokuapp\.com$/i, /azurewebsites\.net$/i, /cloudapp\.net$/i, /s3[.-][a-z0-9-]*\.?amazonaws\.com$/i, /netlify\.app$/i, /surge\.sh$/i, /ghost\.io$/i, /pantheonsite\.io$/i, /readme\.io$/i, /myshopify\.com$/i]

function ctLookup(domain) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`, { timeout: 12000, headers: { 'User-Agent': 'MAJ-Audit/1.0' } }, res => {
      let b = ''; res.on('data', c => { if (b.length < 4e6) b += c }); res.on('end', () => { try { resolve(JSON.parse(b)) } catch (e) { reject(e) } })
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) }); req.on('error', reject)
  })
}
export async function checkSubdomains(domain) {
  const rows = await safe(() => ctLookup(domain))
  if (!Array.isArray(rows)) return [finding({ id: 'subs-na', category: 'Sous-domaines', title: 'Énumération des sous-domaines indisponible', status: 'info', detail: 'Le service Certificate Transparency (crt.sh) n\'a pas répondu.' })]
  const names = new Set()
  for (const r of rows) for (const n of String(r.name_value || '').split('\n')) {
    const x = n.trim().toLowerCase().replace(/^\*\./, '')
    if (x.endsWith('.' + domain) && x !== domain) names.add(x)
  }
  const subs = [...names].sort().slice(0, 60)
  const out = [finding({ id: 'subs-list', category: 'Sous-domaines', title: `${names.size} sous-domaine(s) observé(s) dans les certificats publics`, status: 'info',
    detail: subs.slice(0, 25).join(', ') + (names.size > 25 ? ' …' : ''), evidence: { subdomains: subs }, controls: ['H.1', 'A.5.9'] })]
  const sens = subs.filter(s => SENSITIVE.test(s.slice(0, -domain.length - 1)))
  if (sens.length) out.push(finding({ id: 'subs-sensitive', category: 'Sous-domaines', title: `Sous-domaines sensibles exposés (${sens.length})`, status: 'warn', severity: 'medium',
    detail: sens.slice(0, 10).join(', '), recommendation: 'Vérifier que ces environnements (dev, admin, VPN…) sont nécessaires, authentifiés et non indexés.', controls: ['H.1', 'H.23', 'A.8.31'] }))
  const orphans = []
  await Promise.all(subs.slice(0, 40).map(async s => {
    const cn = await safe(() => dns.resolveCname(s), [])
    for (const target of cn) {
      if (!TAKEOVER.some(re => re.test(target))) continue
      const alive = (await safe(() => dns.resolve4(target), [])).length
      if (!alive) orphans.push(`${s} → ${target}`)
    }
  }))
  if (orphans.length) out.push(finding({ id: 'subs-takeover', category: 'Sous-domaines', title: `Risque de prise de contrôle de sous-domaine (${orphans.length})`, status: 'fail', severity: 'high',
    detail: orphans.join(' | '), recommendation: 'Supprimer les enregistrements CNAME pointant vers des services désactivés.', controls: ['H.1', 'A.8.20', 'A.5.9'] }))
  return out
}
