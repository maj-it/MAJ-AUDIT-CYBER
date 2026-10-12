// ─────────────────────────────────────────────────────────────
// Scan externe non intrusif d'un domaine (Node.js, aucune dépendance)
//   DNS / messagerie (SPF, DMARC, DKIM) / TLS / en-têtes HTTP
//   + options (autorisation écrite requise) : ports TCP courants, fichiers exposés
// Chaque constat est relié à des mesures ANSSI (H.x) et ISO 27001 (A.x.y).
// ─────────────────────────────────────────────────────────────
import dns from 'node:dns/promises'
import net from 'node:net'
import tls from 'node:tls'
import http from 'node:http'
import https from 'node:https'
import { computeGrade, checkHeadersDeep, checkPageContent, checkTlsVersions, checkMailDeep, checkDnssec, checkSubdomains } from './scanExtra.js'

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i
const DKIM_SELECTORS = ['default', 'google', 'selector1', 'selector2', 'k1', 'k2', 's1', 's2', 'mail', 'dkim', 'smtp', 'mandrill', 'mxvault']

const RISKY_PORTS = {
  21: ['FTP', 'high'], 23: ['Telnet', 'critical'], 445: ['SMB', 'critical'], 1433: ['MSSQL', 'high'],
  3306: ['MySQL', 'high'], 3389: ['RDP', 'critical'], 5432: ['PostgreSQL', 'high'], 5900: ['VNC', 'high'],
  6379: ['Redis', 'high'], 27017: ['MongoDB', 'high']
}
const COMMON_PORTS = { 22: 'SSH', 25: 'SMTP', 80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 8080: 'HTTP-alt', 8443: 'HTTPS-alt' }

export function normalizeDomain(input) {
  const d = String(input || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/^www\./, '')
  return DOMAIN_RE.test(d) ? d : null
}

function isPrivateIP(ip) {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase()
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:')
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

const finding = (o) => ({ status: 'info', severity: 'info', controls: [], ...o })

async function safe(fn, fallback = null) { try { return await fn() } catch { return fallback } }
const txt = async (name) => (await safe(() => dns.resolveTxt(name), [])).map(r => r.join(''))

// ── DNS & messagerie ─────────────────────────────────────────
async function checkDns(domain, ctx) {
  const out = []
  const [a, aaaa, mx, ns, caa] = await Promise.all([
    safe(() => dns.resolve4(domain), []), safe(() => dns.resolve6(domain), []),
    safe(() => dns.resolveMx(domain), []), safe(() => dns.resolveNs(domain), []),
    safe(() => dns.resolveCaa(domain), [])
  ])
  ctx.ips = a
  ctx.hasMx = mx.length > 0
  out.push(finding({
    id: 'dns-records', category: 'DNS', title: 'Enregistrements DNS',
    status: a.length || aaaa.length ? 'ok' : 'warn',
    detail: `A: ${a.join(', ') || '—'} | AAAA: ${aaaa.length} | MX: ${mx.map(m => m.exchange).join(', ') || '—'} | NS: ${ns.join(', ') || '—'}`,
    evidence: { a, aaaa, mx, ns }
  }))
  out.push(finding({
    id: 'dns-caa', category: 'DNS', title: 'Enregistrement CAA (autorités de certification autorisées)',
    status: caa.length ? 'ok' : 'warn', severity: caa.length ? 'info' : 'low',
    detail: caa.length ? 'CAA présent.' : 'Aucun enregistrement CAA : n\'importe quelle autorité peut émettre un certificat.',
    recommendation: caa.length ? undefined : 'Publier un enregistrement CAA limitant les autorités autorisées.',
    controls: ['A.8.24']
  }))
  return out
}

async function checkMail(domain, ctx) {
  const out = []
  if (!ctx.hasMx) {
    out.push(finding({ id: 'mail-none', category: 'Messagerie', title: 'Pas de MX : domaine sans messagerie entrante', status: 'info', detail: 'SPF/DMARC restent recommandés pour empêcher l\'usurpation du domaine.' }))
  }
  // SPF
  const spf = (await txt(domain)).find(t => /^v=spf1/i.test(t))
  if (!spf) {
    out.push(finding({ id: 'mail-spf', category: 'Messagerie', title: 'SPF absent', status: 'fail', severity: 'high',
      detail: 'Aucun enregistrement SPF : le domaine peut être usurpé dans des e-mails.', recommendation: 'Publier un enregistrement SPF se terminant par -all (ou ~all).', controls: ['H.24', 'A.5.14'] }))
  } else {
    const weak = /[+?]all\b/i.test(spf) || !/\ball\b/i.test(spf)
    out.push(finding({ id: 'mail-spf', category: 'Messagerie', title: weak ? 'SPF permissif' : 'SPF présent', status: weak ? 'warn' : 'ok', severity: weak ? 'medium' : 'info',
      detail: spf, recommendation: weak ? 'Terminer le SPF par -all ou ~all (éviter +all et ?all).' : undefined, controls: ['H.24', 'A.5.14'] }))
  }
  // DMARC
  const dmarc = (await txt(`_dmarc.${domain}`)).find(t => /^v=DMARC1/i.test(t))
  if (!dmarc) {
    out.push(finding({ id: 'mail-dmarc', category: 'Messagerie', title: 'DMARC absent', status: 'fail', severity: 'high',
      detail: 'Aucune politique DMARC : aucune consigne donnée aux destinataires face aux e-mails usurpés.', recommendation: 'Publier _dmarc avec p=none puis monter progressivement à quarantine/reject.', controls: ['H.24', 'A.5.14'] }))
  } else {
    const p = (dmarc.match(/;\s*p=(\w+)/i) || [])[1]?.toLowerCase()
    const strong = p === 'quarantine' || p === 'reject'
    out.push(finding({ id: 'mail-dmarc', category: 'Messagerie', title: `DMARC présent (p=${p || '?'})`, status: strong ? 'ok' : 'warn', severity: strong ? 'info' : 'medium',
      detail: dmarc, recommendation: strong ? undefined : 'Passer la politique DMARC à quarantine puis reject après analyse des rapports.', controls: ['H.24', 'A.5.14'] }))
    const sp = (dmarc.match(/;\s*sp=(\w+)/i) || [])[1]?.toLowerCase()
    if (strong && sp === 'none') {
      out.push(finding({ id: 'mail-dmarc-sp', category: 'Messagerie', title: 'DMARC : sous-domaines non protégés (sp=none)', status: 'warn', severity: 'low',
        detail: dmarc, recommendation: 'Passer sp=quarantine (ou retirer sp) pour protéger aussi les sous-domaines contre l\'usurpation.', controls: ['H.24', 'A.5.14'] }))
    }
  }
  // DKIM (sélecteurs courants uniquement : résultat non concluant si absent)
  if (ctx.hasMx) {
    const found = []
    await Promise.all(DKIM_SELECTORS.map(async s => {
      const r = await txt(`${s}._domainkey.${domain}`)
      if (r.some(t => /\bp=[A-Za-z0-9+\/=]{20,}/.test(t))) found.push(s) // p= vide = clé révoquée
    }))
    out.push(finding({ id: 'mail-dkim', category: 'Messagerie', title: found.length ? `DKIM détecté (${found.join(', ')})` : 'DKIM non détecté (sélecteurs courants)',
      status: found.length ? 'ok' : 'info', severity: 'info',
      detail: found.length ? 'Clé DKIM publiée.' : 'Non concluant : le sélecteur peut être personnalisé. À confirmer avec l\'hébergeur de messagerie.', controls: ['H.24'] }))
  }
  return out
}

// ── TLS ──────────────────────────────────────────────────────
function tlsInfo(host, port = 443, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout }, () => {
      const cert = sock.getPeerCertificate()
      const info = { protocol: sock.getProtocol(), cipher: sock.getCipher()?.name, authorized: sock.authorized, authError: sock.authorizationError, cert }
      sock.end(); resolve(info)
    })
    sock.on('timeout', () => { sock.destroy(); reject(new Error('timeout')) })
    sock.on('error', reject)
  })
}

async function checkTls(domain) {
  const info = await safe(() => tlsInfo(domain))
  if (!info) {
    return [finding({ id: 'tls-conn', category: 'TLS', title: 'HTTPS (443) non joignable', status: 'fail', severity: 'high',
      detail: 'Aucune connexion TLS possible sur le port 443.', recommendation: 'Activer HTTPS avec un certificat valide.', controls: ['H.18', 'A.8.24'] })]
  }
  const out = []
  const until = info.cert?.valid_to ? new Date(info.cert.valid_to) : null
  const days = until ? Math.floor((until - Date.now()) / 86400000) : null
  const bad = !info.authorized || (days !== null && days < 0)
  out.push(finding({ id: 'tls-cert', category: 'TLS',
    title: bad ? 'Certificat TLS invalide ou expiré' : days !== null && days < 30 ? `Certificat TLS expire dans ${days} j` : 'Certificat TLS valide',
    status: bad ? 'fail' : days !== null && days < 30 ? 'warn' : 'ok', severity: bad ? 'high' : days !== null && days < 30 ? 'medium' : 'info',
    detail: `Émetteur: ${info.cert?.issuer?.O || info.cert?.issuer?.CN || '?'} | Expire: ${until ? until.toISOString().slice(0, 10) : '?'}${info.authError ? ' | Erreur: ' + info.authError : ''}`,
    recommendation: bad || (days !== null && days < 30) ? 'Renouveler le certificat et automatiser son renouvellement.' : undefined, controls: ['H.18', 'A.8.24'] }))
  const oldProto = ['TLSv1', 'TLSv1.1', 'SSLv3'].includes(info.protocol)
  out.push(finding({ id: 'tls-proto', category: 'TLS', title: `Protocole négocié : ${info.protocol}`, status: oldProto ? 'fail' : 'ok', severity: oldProto ? 'high' : 'info',
    detail: `Suite: ${info.cipher}`, recommendation: oldProto ? 'Désactiver TLS < 1.2.' : undefined, controls: ['H.18', 'H.21', 'A.8.24'] }))
  return out
}

// ── HTTP ─────────────────────────────────────────────────────
function httpGet(url, { timeout = 7000, maxBody = 4096 } = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, { timeout, headers: { 'User-Agent': 'MAJ-Audit/1.0 (scan autorisé)' }, rejectUnauthorized: false }, res => {
      let body = ''
      res.on('data', c => { if (body.length < maxBody) body += c.toString('utf8') })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
    })
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.on('error', reject)
  })
}

// Suit les redirections (max 4) uniquement vers le même domaine : les en-têtes de sécurité
// doivent être évalués sur la réponse finale, pas sur la redirection apex -> www.
async function httpGetFollow(url, domain, maxHops = 4) {
  const hops = []
  let current = url
  for (let i = 0; i <= maxHops; i++) {
    const res = await httpGet(current)
    const loc = res.headers.location
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, current)
      const host = next.hostname.toLowerCase()
      const sameSite = host === domain || host.endsWith('.' + domain)
      if (!sameSite || next.protocol !== 'https:') return { ...res, finalUrl: current, hops, stoppedAt: next.href }
      hops.push(`${res.status} → ${next.origin}`)
      current = next.href
      continue
    }
    return { ...res, finalUrl: current, hops }
  }
  return null
}

async function checkHttp(domain) {
  const out = []
  const plain = await safe(() => httpGet(`http://${domain}/`))
  if (plain) {
    const loc = plain.headers.location || ''
    const redirects = plain.status >= 300 && plain.status < 400 && /^https:/i.test(loc)
    out.push(finding({ id: 'http-redirect', category: 'HTTP', title: redirects ? 'HTTP redirigé vers HTTPS' : 'HTTP non redirigé vers HTTPS',
      status: redirects ? 'ok' : 'warn', severity: redirects ? 'info' : 'medium', detail: `Réponse ${plain.status}${loc ? ' → ' + loc : ''}`,
      recommendation: redirects ? undefined : 'Rediriger tout le trafic HTTP vers HTTPS (301).', controls: ['H.18', 'H.21'] }))
  }
  const res = await safe(() => httpGetFollow(`https://${domain}/`, domain))
  if (!res) return out
  const h = res.headers
  const finalOrigin = new URL(res.finalUrl).origin
  if (res.hops.length) {
    out.push(finding({ id: 'http-hops', category: 'HTTP', title: `Redirection vers ${new URL(res.finalUrl).hostname}`, status: 'info',
      detail: `${res.hops.join(' | ')} — les en-têtes ci-dessous sont ceux de ${finalOrigin}.` }))
  }
  const hdr = (name, id, title, sev, reco, ctrls = ['H.18', 'A.8.9']) => finding({
    id, category: 'En-têtes HTTP', title: h[name] ? `${title} présent` : `${title} absent`, status: h[name] ? 'ok' : 'warn', severity: h[name] ? 'info' : sev,
    detail: h[name] ? String(h[name]).slice(0, 160) : 'En-tête non renvoyé par le serveur.', recommendation: h[name] ? undefined : reco, controls: ctrls
  })
  out.push(hdr('strict-transport-security', 'hdr-hsts', 'HSTS', 'medium', 'Ajouter Strict-Transport-Security: max-age=31536000; includeSubDomains.'))
  if (!h['content-security-policy'] && h['content-security-policy-report-only']) {
    out.push(finding({ id: 'hdr-csp', category: 'En-têtes HTTP', title: 'CSP en mode observation (Report-Only)', status: 'warn', severity: 'low',
      detail: String(h['content-security-policy-report-only']).slice(0, 160), recommendation: 'Après vérification de l\'absence de violations, passer en Content-Security-Policy (mode bloquant).', controls: ['H.18', 'A.8.9'] }))
  } else {
    out.push(hdr('content-security-policy', 'hdr-csp', 'Content-Security-Policy', 'medium', 'Définir une politique CSP limitant les sources de scripts.'))
  }
  out.push(hdr('x-content-type-options', 'hdr-xcto', 'X-Content-Type-Options', 'low', 'Ajouter X-Content-Type-Options: nosniff.'))
  const framed = h['x-frame-options'] || /frame-ancestors/i.test(h['content-security-policy'] || '')
  out.push(finding({ id: 'hdr-frame', category: 'En-têtes HTTP', title: framed ? 'Protection anti-clickjacking présente' : 'Protection anti-clickjacking absente',
    status: framed ? 'ok' : 'warn', severity: framed ? 'info' : 'low', detail: h['x-frame-options'] || (framed ? 'CSP frame-ancestors' : '—'),
    recommendation: framed ? undefined : 'Ajouter X-Frame-Options: DENY ou CSP frame-ancestors.', controls: ['H.18', 'A.8.9'] }))
  out.push(hdr('referrer-policy', 'hdr-referrer', 'Referrer-Policy', 'low', 'Ajouter Referrer-Policy: strict-origin-when-cross-origin.'))
  const leak = [h['server'], h['x-powered-by']].filter(Boolean).filter(v => /\d/.test(v))
  out.push(finding({ id: 'hdr-leak', category: 'En-têtes HTTP', title: leak.length ? 'Version logicielle divulguée' : 'Pas de version divulguée dans les en-têtes',
    status: leak.length ? 'warn' : 'ok', severity: leak.length ? 'low' : 'info', detail: leak.join(' | ') || '—',
    recommendation: leak.length ? 'Masquer les en-têtes Server / X-Powered-By.' : undefined, controls: ['H.34', 'A.8.9'] }))
  out.push(...checkHeadersDeep(h))
  out.push(...await checkPageContent(res.finalUrl, domain))
  const sec = await safe(() => httpGet(`${finalOrigin}/.well-known/security.txt`))
  const hasSec = sec && sec.status === 200 && /contact:/i.test(sec.body)
  out.push(finding({ id: 'sec-txt', category: 'En-têtes HTTP', title: hasSec ? 'security.txt présent' : 'security.txt absent', status: hasSec ? 'ok' : 'info', severity: 'info',
    detail: hasSec ? 'Point de contact de sécurité publié.' : 'Recommandé : publier un contact pour le signalement de vulnérabilités (RFC 9116).', controls: ['H.39', 'A.5.6'] }))
  return out
}

// ── Options actives (autorisation écrite requise) ────────────
function tcpOpen(host, port, timeout = 2000) {
  return new Promise(resolve => {
    const s = net.connect({ host, port, timeout })
    s.on('connect', () => { s.destroy(); resolve(true) })
    s.on('timeout', () => { s.destroy(); resolve(false) })
    s.on('error', () => resolve(false))
  })
}

async function checkPorts(ip) {
  const all = { ...Object.fromEntries(Object.entries(RISKY_PORTS).map(([p, [n]]) => [p, n])), ...COMMON_PORTS }
  const results = await Promise.all(Object.keys(all).map(async p => [Number(p), await tcpOpen(ip, Number(p))]))
  const open = results.filter(([, o]) => o).map(([p]) => p).sort((a, b) => a - b)
  const risky = open.filter(p => RISKY_PORTS[p])
  const out = [finding({ id: 'ports-open', category: 'Ports', title: `Ports TCP ouverts : ${open.join(', ') || 'aucun parmi la liste testée'}`,
    status: risky.length ? 'fail' : 'ok', severity: risky.length ? 'high' : 'info',
    detail: `Adresse testée : ${ip}. Ports testés : ${Object.keys(all).join(', ')}.`, evidence: { open }, controls: ['H.23', 'H.19', 'A.8.20', 'A.8.22'] })]
  for (const p of risky) {
    const [name, sev] = RISKY_PORTS[p]
    out.push(finding({ id: `port-${p}`, category: 'Ports', title: `Service ${name} (${p}/tcp) exposé sur Internet`, status: 'fail', severity: sev,
      detail: `Le port ${p} répond depuis Internet.`, recommendation: `Fermer ce port au pare-feu ou le restreindre par VPN / liste d'adresses autorisées.`, controls: ['H.23', 'H.21', 'A.8.20'] }))
  }
  return out
}

async function checkExposedFiles(domain) {
  const probes = [
    ['/.git/HEAD', b => /^ref:\s/m.test(b), 'Dépôt Git exposé (.git)'],
    ['/.env', b => /^[A-Z_]{3,}=.+/m.test(b) && !/<html/i.test(b), 'Fichier .env exposé'],
    ['/phpinfo.php', b => /phpinfo\(\)|PHP Version/i.test(b), 'phpinfo() accessible'],
    ['/server-status', b => /Apache Server Status/i.test(b), 'Page server-status accessible']
  ]
  const hits = []
  for (const [p, test, label] of probes) {
    const r = await safe(() => httpGet(`https://${domain}${p}`, { maxBody: 2048 }))
    if (r && r.status === 200 && test(r.body)) hits.push({ p, label })
  }
  return hits.length
    ? hits.map(h => finding({ id: `exposed-${h.p}`, category: 'Fichiers exposés', title: h.label, status: 'fail', severity: 'critical',
        detail: `${h.p} accessible publiquement.`, recommendation: 'Retirer le fichier du serveur web et changer les secrets éventuellement divulgués.', controls: ['H.23', 'H.12', 'A.8.9'] }))
    : [finding({ id: 'exposed-none', category: 'Fichiers exposés', title: 'Aucun fichier sensible courant exposé', status: 'ok', detail: 'Fichiers testés : .git, .env, phpinfo, server-status.', controls: ['H.23'] })]
}

// ── Orchestration ────────────────────────────────────────────
export async function runScan({ domain, ports = false, probes = false, subs = false }) {
  const d = normalizeDomain(domain)
  if (!d) throw Object.assign(new Error('Nom de domaine invalide.'), { status: 400 })

  const ctx = {}
  const findings = []
  findings.push(...await checkDns(d, ctx))

  // Protection SSRF : on refuse tout domaine résolvant vers une adresse privée
  if (ctx.ips.some(isPrivateIP)) throw Object.assign(new Error('Le domaine résout vers une adresse privée : scan refusé.'), { status: 400 })
  if (!ctx.ips.length) {
    const aaaa = await safe(() => dns.resolve6(d), [])
    if (!aaaa.length) throw Object.assign(new Error('Domaine sans enregistrement A/AAAA : rien à scanner.'), { status: 400 })
  }

  const [mail, tlsF, httpF] = await Promise.all([checkMail(d, ctx), checkTls(d), checkHttp(d)])
  const [mailX, tlsX, dnssec] = await Promise.all([checkMailDeep(d, ctx.hasMx), checkTlsVersions(d), checkDnssec(d)])
  findings.push(...mail, ...mailX, ...tlsF, ...tlsX, ...httpF, ...dnssec)
  if (subs) findings.push(...await checkSubdomains(d))
  if (ports && ctx.ips[0]) findings.push(...await checkPorts(ctx.ips[0]))
  if (probes) findings.push(...await checkExposedFiles(d))

  const count = (k, v) => findings.filter(f => f[k] === v).length
  return {
    domain: d, scannedAt: new Date().toISOString(), options: { ports, probes, subs },
    summary: {
      ...computeGrade(findings),
      total: findings.length, ok: count('status', 'ok'), warn: count('status', 'warn'), fail: count('status', 'fail'),
      critical: count('severity', 'critical'), high: count('severity', 'high'), medium: count('severity', 'medium'), low: count('severity', 'low')
    },
    findings
  }
}
