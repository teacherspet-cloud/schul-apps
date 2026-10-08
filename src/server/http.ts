/**
 * Der Webserver von Schul-Apps auf dem VPS (02.10.2026).
 *
 * Entstanden aus dem Netzzugang am PC (main/services/lanServer.ts): dieselben Endpunkte für die
 * Oberfläche (POST /api, GET /ereignisse, POST /auftrag/*), dieselbe Verpackung von Binärdaten.
 * Neu: echte Nutzer statt einer PIN (anmeldung.ts), Sitzung per Cookie, jede Anfrage läuft im
 * Namen ihres Nutzers (kontext.ts) – in seiner Ablage, mit seinen Schlüsseln und seinem Abo.
 *
 * Schutz:
 *  - Nur unter den eingestellten Adressen (SCHULAPPS_HOSTS). Über gywemaviation.de ist die App
 *    NIE erreichbar (Entscheidung der Lehrkraft) – solche Anfragen bekommen 404.
 *  - Cookie: HttpOnly, Secure, SameSite=Lax. Aufrufe mit Wirkung verlangen zusätzlich die
 *    Kopfzeile x-schulapps-token (erzwingt bei fremden Seiten eine CORS-Vorabfrage, die hier
 *    nie freigegeben wird) – Schutz gegen untergeschobene Formulare.
 *  - Schülerinnen und Schüler erreichen nur ihren Bereich (/s/…), nie die Programme.
 */
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { berichtErlaubt, protokoll } from './diagnose'
import { createSecureContext, type SecureContext } from 'node:tls'
import { createReadStream, existsSync, readFileSync, statSync, watchFile } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { AUFTRAGS_KANAELE, AuftragsFehler, gueltigeAuftragsId, gueltigesGeraet, kennungDesAuftrags, MAX_WARTEN_MS } from '../main/services/lanAuftraege'
import { kennzeichne, kennzeichneAuftrag, PULS_MS } from '../main/services/lanServer'
import { imNutzer, type Nutzer } from './kontext'
import {
  datenbank,
  nutzerAendern,
  passwortHashVon,
  protokolliereServer,
  sitzungAnlegen,
  sitzungBeenden,
  sitzungenDesNutzersBeenden,
  sitzungPruefen,
  SITZUNG_MS,
  type NutzerInfo
} from './datenbank'
import { passwortHash, passwortPruefen } from './geheim'
import {
  AnmeldeFehler,
  fehlversuch,
  gesperrtWegenVersuchen,
  iservAnmeldeAdresse,
  iservBereit,
  iservRueckruf,
  notzugangAn,
  passwortAnmeldung
} from './anmeldung'
import { auftragsRegister, buendel, oeffneStrom, sitzungVergessen } from './ereignisse'
import { beschneideServer, SERVER_KANAELE } from './freigaben'
import { OBERFLAECHE } from './pfade'
import { ANMELDE_CSP, anmeldeSeite, passwortSeite } from './seiten'

export type Aufruf = (kanal: string, args: unknown[]) => Promise<unknown>

/** Zusätzliche Routen (Verwaltung, Onlinetest, Hörtexte …) – liefern true, wenn sie geantwortet haben */
export type Zusatzroute = (k: Anfrage) => Promise<boolean> | boolean

export interface Anfrage {
  req: IncomingMessage
  res: ServerResponse
  url: URL
  /** angemeldeter Nutzer (oder null) */
  sitzung: { nutzer: NutzerInfo; kennung: string } | null
  ip: string
  koerper: () => Promise<unknown>
}

export interface ServerOptionen {
  port: number
  /** öffentliche Adresse, z. B. https://217.154.120.64:8443 (für die Rückkehr von IServ und QR-Codes) */
  adresse: string
  /** erlaubte Host-Kopfzeilen, z. B. ["217.154.120.64:8443"] */
  hosts: string[]
  /** Anfragen über die Weiche auf 443: X-Real-IP von lokalen/privaten Adressen übernehmen */
  weiche?: boolean
  aufruf: Aufruf
  /**
   * Zertifikat; `domain` (05.10.2026): weiteres Zertifikat für eigene Namen (www.meineschulapps.de) –
   * gewählt nach dem Namen beim Verbindungsaufbau (SNI), sonst gilt `cert`/`key` (IP-Zertifikat).
   */
  tls?: { cert: string; key: string; domain?: { namen: string[]; cert: string; key: string } }
  routen?: Zusatzroute[]
  /**
   * Musterschüler-Vorschau (vorschau.ts): Vorschaukonto zum Schlüssel – nur zusammen mit der Cookie-Sitzung der
   * Lehrkraft, an die er gebunden ist. Sonst null.
   */
  vorschau?: (schluessel: string, lehrkraft: NutzerInfo) => NutzerInfo | null
}

const COOKIE = 'sa_sitzung'

// ---------------------------------------------------------------- Hilfen

export const json = (res: ServerResponse, code: number, wert: unknown): void => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(wert))
}

export function leseKoerper(req: IncomingMessage, grenze = 64 * 1024 * 1024): Promise<string> {
  return new Promise((ok, fehler) => {
    const teile: Buffer[] = []
    let laenge = 0
    req.on('data', (s: Buffer) => {
      laenge += s.length
      if (laenge > grenze) {
        req.destroy()
        fehler(new Error('Anfrage zu groß.'))
        return
      }
      teile.push(s)
    })
    req.on('end', () => ok(Buffer.concat(teile).toString('utf8')))
    req.on('error', fehler)
  })
}

export function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const teil of String(req.headers.cookie ?? '').split(';')) {
    const i = teil.indexOf('=')
    if (i > 0) out[teil.slice(0, i).trim()] = decodeURIComponent(teil.slice(i + 1).trim())
  }
  return out
}

function packen(wert: unknown): unknown {
  if (wert instanceof Uint8Array) return { __bytes: Buffer.from(wert).toString('base64') }
  if (Array.isArray(wert)) return wert.map(packen)
  if (wert && typeof wert === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(wert as Record<string, unknown>)) out[k] = packen(v)
    return out
  }
  return wert
}

function auspacken(wert: unknown): unknown {
  if (wert && typeof wert === 'object' && '__bytes' in (wert as Record<string, unknown>)) {
    return new Uint8Array(Buffer.from(String((wert as { __bytes: string }).__bytes), 'base64'))
  }
  if (Array.isArray(wert)) return wert.map(auspacken)
  if (wert && typeof wert === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(wert as Record<string, unknown>)) out[k] = auspacken(v)
    return out
  }
  return wert
}

const TYPEN: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg'
}

/** Ein Nutzer als Kontext (für imNutzer) */
export const alsNutzer = (n: NutzerInfo, kennung?: string): Nutzer => ({
  id: n.id,
  benutzer: n.benutzer,
  name: n.name,
  rolle: n.rolle,
  quelle: n.quelle,
  sitzung: kennung
})

export function setzeSitzungsCookie(res: ServerResponse, cookie: string, maxAgeMs: number, sicher: boolean): void {
  res.setHeader(
    'set-cookie',
    `${COOKIE}=${encodeURIComponent(cookie)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${sicher ? '; Secure' : ''}`
  )
}

const loescheCookie = (res: ServerResponse, sicher: boolean): void =>
  void res.setHeader('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${sicher ? '; Secure' : ''}`)

/**
 * Web-App für den Home-Bildschirm (02.10.2026): je ein Manifest für Lehrkräfte (Start „/") und
 * für Lernende (Start und Bereich „/s/") – wer den Onlinetest ablegt, landet nicht in den Programmen.
 */
export function webManifest(fuerSchueler: boolean): string {
  return JSON.stringify({
    name: fuerSchueler ? 'Schul-Apps · Onlinetest' : 'Schul-Apps',
    short_name: fuerSchueler ? 'Onlinetest' : 'Schul-Apps',
    lang: 'de',
    start_url: fuerSchueler ? '/s/' : '/',
    scope: fuerSchueler ? '/s/' : '/',
    id: fuerSchueler ? '/s/' : '/',
    display: 'standalone',
    background_color: '#f3f6f8',
    theme_color: '#0f7b6c',
    icons: [
      { src: '/web-app/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/web-app/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/web-app/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  })
}

/**
 * Vorschau als Musterschüler (vorschau.ts): Läuft die Seite einer Lehrkraft im Schülerbereich mit einem Vorschau-Schlüssel
 * (Parameter „vs" bzw. gemerkt im sessionStorage des Fensters), lädt dieses Stück das Ich des Vorschaukontos nach –
 * per document.write, damit es vor der Oberfläche feststeht und das Ich der Lehrkraft ersetzt.
 */
const VORSCHAU_HAKEN = `(function(){try{if(location.pathname.indexOf('/s/')!==0||window.__saVorschau)return;var v=new URLSearchParams(location.search).get('vs');
if(v)sessionStorage.setItem('sa-vorschau',v);else v=sessionStorage.getItem('sa-vorschau');if(!v)return;window.__saVorschau=v;
document.write('<scr'+'ipt src="/server/ich.js?vs='+encodeURIComponent(v)+'"></scr'+'ipt>')}catch(e){}})();`

/** Schlüssel abgelaufen oder fremd: nicht angemeldet, Hinweis statt der Oberfläche */
const VORSCHAU_ABGELAUFEN = (adresse: string): string =>
  `window.__schulappsServer={angemeldet:false,adresse:${JSON.stringify(adresse)}};try{sessionStorage.removeItem('sa-vorschau')}catch(e){}
document.addEventListener('DOMContentLoaded',function(){document.body.innerHTML='<p style="font:16px system-ui;padding:24px">Diese Vorschau ist abgelaufen. Bitte in „Meine Klassen“ erneut „Als Schüler ansehen“ wählen.</p>'});`

/**
 * Im Vorschaukonto: Schlüssel an jeden Aufruf der eigenen Adresse hängen – fetch als Kopfzeile, Bilder/Ton/Beacons als
 * Parameter „vs" (die laden ohne fetch). Das Cookie der Lehrkraft bleibt, wie es ist.
 */
const vorschauSkript = (vs: string): string =>
  `(function(){var v=${JSON.stringify(vs).replace(/</g, '')};window.__saVorschau=v;try{sessionStorage.setItem('sa-vorschau',v)}catch(e){}
var eigen=function(u){try{return new URL(u,location.href).origin===location.origin}catch(e){return false}};
var mitVs=function(u){try{var x=new URL(u,location.href);if(x.origin!==location.origin||x.pathname.indexOf('/s/')!==0||x.searchParams.has('vs'))return u;x.searchParams.set('vs',v);return x.toString()}catch(e){return u}};
var f=window.fetch;window.fetch=function(i,o){try{var u=typeof i==='string'?i:i instanceof URL?i.href:i&&i.url;if(u&&eigen(u)){o=Object.assign({},o||{});
var h=new Headers(o.headers||(i instanceof Request?i.headers:undefined));h.set('x-schulapps-vorschau',v);o.headers=h}}catch(e){}return f.call(this,i,o)};
var sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,w){if(n==='src'&&typeof w==='string')w=mitVs(w);return sa.call(this,n,w)};
[window.HTMLImageElement,window.HTMLMediaElement,window.HTMLSourceElement].forEach(function(K){var d=K&&Object.getOwnPropertyDescriptor(K.prototype,'src');
if(d&&d.set)Object.defineProperty(K.prototype,'src',{configurable:true,enumerable:d.enumerable,get:d.get,set:function(w){d.set.call(this,typeof w==='string'?mitVs(w):w)}})});
if(navigator.sendBeacon){var sb=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u,d){return sb(mitVs(u),d)}}})();`

/**
 * Hintergrund, bevor die App steht (08.10.2026, Befund der Lehrkraft: nach der Tür-Animation kurz ein weißer
 * Bildschirm). Läuft als erstes Skript im Kopf (Inline-Skripte verbietet die CSP der Seite): Hintergrund nach der
 * Darstellung der Lernenden (dunkel/hell), bis die App in #root etwas zeigt.
 */
const VORAB_JS = `(function(){try{var d=document.documentElement,m='dunkel';try{var s=JSON.parse(localStorage.getItem('schulapps-darstellung')||'{}');if(s.modus)m=s.modus}catch(e){}
var dunkel=m==='dunkel'||(m==='auto'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);
d.style.background=dunkel?'#1f1f1f':'#ffffff';d.style.colorScheme=dunkel?'dark':'light';
var fertig=function(){d.style.background='';d.style.colorScheme=''};
var warte=function(){var r=document.getElementById('root');if(!r)return;if(r.childElementCount)return requestAnimationFrame(function(){requestAnimationFrame(fertig)});
new MutationObserver(function(_,o){if(r.childElementCount){o.disconnect();requestAnimationFrame(function(){requestAnimationFrame(fertig)})}}).observe(r,{childList:true})};
document.addEventListener('DOMContentLoaded',warte);setTimeout(fertig,10000)}catch(e){}})();`

/*
 * Wohin nach der Anmeldung (03.10.2026, Befund der Lehrkraft: nach dem Abmelden auf der Schülerseite landete der Admin
 * wieder auf der Schüler-Startseite). Lernende nur in ihren Bereich.
 *
 * Lehrkraft-Ansicht als Vorgabe (08.10.2026, Befund der Lehrkraft: nach der Anmeldung landete sie im Schülerbereich).
 * Ursache: Nur fünf Seiten des Schülerbereichs wurden auf „/" umgebogen – jede andere (/s/lernen, /s/einstellungen,
 * /s/ordner/…, /s/v/…, die Rückkehr nach einer abgelaufenen Sitzung mit „ziel=<aktuelle Seite>") blieb Ziel. Jetzt
 * führt jedes Ziel im Schülerbereich Lehrkräfte in die App; nur ausdrückliche Code-Links (QR: Test, Blatt, Aufgabe,
 * Reihe, Vokabel-/Grammatiktraining) bleiben – die öffnet eine Lehrkraft bewusst.
 */
export const zielNachAnmeldung = (rolle: string, z: string): string =>
  rolle === 'schueler'
    ? z.startsWith('/s/')
      ? z
      : '/s/'
    : (z === '/s' || z.startsWith('/s/')) && !/^\/s\/(?:[tfw]|vt|gt|rq)\/[A-Za-z0-9]{4,12}\/?$/.test(z)
    ? '/'
    : z

/** Die Seite der Programme mit dem Skript, das den angemeldeten Nutzer bekannt macht */
const seitenZwischenspeicher = new Map<boolean, { mtime: number; html: string }>()
function programmSeite(fuerSchueler = false): string {
  const datei = join(OBERFLAECHE, 'index.html')
  const mtime = statSync(datei).mtimeMs
  const gemerkt = seitenZwischenspeicher.get(fuerSchueler)
  if (gemerkt?.mtime === mtime) return gemerkt.html
  let html = readFileSync(datei, 'utf8')
  html = html.replace(
    '<meta charset="UTF-8" />',
    [
      '<meta charset="UTF-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
      // Home-Bildschirm (iPad, iPhone, Android): eigene App ohne Browserleiste
      `<link rel="manifest" href="${fuerSchueler ? '/s/manifest.webmanifest' : '/manifest.webmanifest'}" />`,
      '<meta name="apple-mobile-web-app-capable" content="yes" />',
      '<meta name="mobile-web-app-capable" content="yes" />',
      `<meta name="apple-mobile-web-app-title" content="${fuerSchueler ? 'Onlinetest' : 'Schul-Apps'}" />`,
      '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
      '<meta name="theme-color" content="#0f7b6c" />',
      // Symbol im Browser-Reiter (07.10.2026): ausdrücklich das von Schul-Apps – ohne Angabe zeigte der Browser unter
      // meineschulapps.de das gemerkte Symbol von Gywem Aviation (gleicher Server, /favicon.ico kam als Seite zurück)
      '<link rel="icon" href="/favicon.ico" sizes="any" />',
      '<link rel="icon" type="image/png" sizes="192x192" href="/web-app/icon-192.png" />',
      '<link rel="apple-touch-icon" href="/web-app/apple-touch-icon.png" />',
      // Lernende: Hintergrund schon vor der App (kein weißer Blitz nach der Tür-Animation, 08.10.2026)
      ...(fuerSchueler ? ['<script src="/server/vorab.js"></script>'] : []),
      '<script src="/server/ich.js"></script>'
    ].join('\n    ')
  )
  // Bündel absolut laden – die Seite kommt auch unter tieferen Pfaden (/s/t/<Code>)
  html = html.replace(/(src|href)="\.\/assets\//g, '$1="/assets/')
  seitenZwischenspeicher.set(fuerSchueler, { mtime, html })
  return html
}

function statisch(res: ServerResponse, pfad: string): void {
  const ziel = normalize(join(OBERFLAECHE, pfad))
  if (!ziel.startsWith(OBERFLAECHE + sep)) return void res.writeHead(403).end('verboten')
  if (!existsSync(ziel) || !statSync(ziel).isFile() || ziel.endsWith('index.html')) {
    res.writeHead(200, { 'content-type': TYPEN['.html'], 'cache-control': 'no-store' })
    return void res.end(programmSeite(pfad.startsWith('/s/')))
  }
  res.writeHead(200, { 'content-type': TYPEN[extname(ziel)] ?? 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' })
  createReadStream(ziel).pipe(res)
}

// ---------------------------------------------------------------- Server

/** Lokale und private Adressen (auch als ::ffff:-Form) – von dort kommt die Weiche */
const WEICHEN_NETZ = /^(::1|(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.))/

/**
 * Jede Anfrage mit Zeitmessung (08.10.2026): über 1 Sekunde ins Diagnose-Protokoll – Ereignisströme (/ereignisse)
 * und Hintergrundaufträge laufen absichtlich lange und zählen nicht. Fehler wie bisher als 500.
 */
function gemessen(req: IncomingMessage, res: ServerResponse, arbeit: () => Promise<void>): void {
  const ab = Date.now()
  const pfad = String(req.url ?? '').split('?')[0]
  res.on('finish', () => {
    const ms = Date.now() - ab
    if (ms > 1000 && !/^\/(ereignisse|auftrag\/)/.test(pfad)) protokoll('langsam', `${ms} ms ${req.method} ${pfad} ${res.statusCode}`)
  })
  arbeit().catch((e: unknown) => {
    protokoll('langsam', `FEHLER ${req.method} ${pfad}: ${e instanceof Error ? e.message : String(e)}`)
    if (!res.headersSent) json(res, 500, { fehler: e instanceof Error ? e.message : String(e) })
    else res.end()
  })
}

export function starteServer(opts: ServerOptionen): Promise<Server> {
  const sicher = Boolean(opts.tls)
  const rueckruf = `${opts.adresse.replace(/\/$/, '')}/auth/rueckruf`
  const hosts = new Set(opts.hosts.map((h) => h.toLowerCase()))

  const behandle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const host = String(req.headers.host ?? '').toLowerCase()
    // Gesundheit (Docker prüft im Container über 127.0.0.1) – ohne Inhalte, vor der Adressprüfung
    if (req.method === 'GET' && req.url === '/gesundheit' && !host.includes('gywemaviation'))
      return json(res, 200, { name: 'Schul-Apps', server: true, laeuft: true })
    // Nie über die Adresse von Gywem Aviation – und nur unter den eigenen Adressen
    if (host.includes('gywemaviation') || (hosts.size && !hosts.has(host)))
      return void res.writeHead(404, { 'content-type': 'text/plain' }).end('Nicht gefunden.')
    res.setHeader('x-content-type-options', 'nosniff')
    res.setHeader('referrer-policy', 'same-origin')
    res.setHeader('x-frame-options', 'SAMEORIGIN')

    const url = new URL(req.url ?? '/', 'http://x')
    // Hinter der Weiche (deploy/weiche, 05.10.2026) steht die echte Adresse in X-Real-IP – nur von dort
    // geglaubt: Die Weiche erreicht den Container über eine lokale bzw. private Adresse, Besucher von außen nie.
    const direkt = String(req.socket.remoteAddress ?? '')
    const echt = String(req.headers['x-real-ip'] ?? '').trim()
    const ip = opts.weiche && echt && WEICHEN_NETZ.test(direkt) ? echt : direkt
    const keks = cookies(req)[COOKIE] ?? ''
    const s = keks ? sitzungPruefen(keks) : null
    let sitzung = s ? { nutzer: s.nutzer, kennung: s.kennung } : null
    /*
     * Vorschau als Musterschüler (vorschau.ts, 06.10.2026): Das Vorschaufenster schickt seinen Schlüssel als Kopfzeile
     * (alle fetch-Aufrufe) bzw. als Parameter „vs" (Seiten, Bilder, Ton im Schülerbereich). Gilt nur zusammen mit der
     * Cookie-Sitzung der Lehrkraft, an die er gebunden ist – dann läuft die Anfrage als Vorschaukonto (Rolle schueler).
     * Das Cookie bleibt unberührt: Die Lehrkraft bleibt in der Haupt-App angemeldet.
     */
    const vsKopf = req.headers['x-schulapps-vorschau']
    const vs =
      typeof vsKopf === 'string'
        ? vsKopf
        : url.pathname.startsWith('/s/') || url.pathname === '/s' || url.pathname === '/server/ich.js'
        ? url.searchParams.get('vs') ?? ''
        : ''
    const inVorschau = Boolean(vs)
    if (inVorschau) {
      const konto = sitzung && opts.vorschau ? opts.vorschau(vs, sitzung.nutzer) : null
      if (!konto) {
        if (req.method === 'GET' && url.pathname === '/server/ich.js') {
          res.writeHead(200, { 'content-type': TYPEN['.js'], 'cache-control': 'no-store' })
          return void res.end(VORSCHAU_ABGELAUFEN(opts.adresse))
        }
        return json(res, 403, { fehler: 'Die Vorschau ist abgelaufen. Bitte in „Meine Klassen“ erneut öffnen.' })
      }
      sitzung = { nutzer: konto, kennung: `vorschau-${konto.id.slice(0, 12)}` }
    }
    // Kein Zugriff auf fremdes Material: Beitritt per Code (QR) gibt es in der Vorschau nicht
    if (inVorschau && req.method === 'POST' && /^\/s\/api\/(?:gast|(?:blatt|aufgabe|reihe|vokabeln|grammatik)\/(?:gast|wieder))$/.test(url.pathname))
      return json(res, 403, { fehler: 'In der Vorschau gibt es nur das Material dieser Klasse.' })
    let koerperCache: Promise<unknown> | null = null
    const k: Anfrage = {
      req,
      res,
      url,
      sitzung,
      ip,
      koerper: () => (koerperCache ??= leseKoerper(req).then((t) => (t ? (JSON.parse(t) as unknown) : {})))
    }
    // Aufrufe mit Wirkung nur mit der eigenen Kopfzeile (siehe oben)
    const mitKopf = typeof req.headers['x-schulapps-token'] === 'string'

    // ---------- Fehlerberichte aus den Browsern der Lernenden (08.10.2026) – klein, begrenzt, ohne Namen
    if (req.method === 'POST' && url.pathname === '/s/api/fehlerbericht') {
      if (!berichtErlaubt(ip)) return void res.writeHead(204).end()
      const roh = await leseKoerper(req).catch(() => '')
      let b: Record<string, unknown> = {}
      try {
        b = JSON.parse(String(roh).slice(0, 4000)) as Record<string, unknown>
      } catch {
        /* unlesbar */
      }
      const t = (x: unknown, n: number): string => String(x ?? '').slice(0, n)
      protokoll(
        'browser',
        `${t(b.art, 20)} ${t(b.seite, 120)} | ${t(b.meldung, 400)} | ${t(b.ort, 300)} | ${sitzung?.nutzer.rolle ?? 'ohne'} | ${t(req.headers['user-agent'], 160)}`
      )
      return void res.writeHead(204).end()
    }

    // ---------- Web-App-Manifest (ohne Anmeldung – der Home-Bildschirm fragt vorher)
    if (req.method === 'GET' && (url.pathname === '/manifest.webmanifest' || url.pathname === '/s/manifest.webmanifest')) {
      res.writeHead(200, { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'no-cache' })
      return void res.end(webManifest(url.pathname.startsWith('/s/')))
    }

    if (req.method === 'GET' && url.pathname === '/server/vorab.js') {
      res.writeHead(200, { 'content-type': TYPEN['.js'], 'cache-control': 'public, max-age=3600' })
      return void res.end(VORAB_JS)
    }

    // ---------- Symbole für Browser-Reiter und Home-Bildschirm (ohne Anmeldung – auch die Anmeldeseite zeigt sie)
    if (req.method === 'GET' && (url.pathname === '/favicon.ico' || /^\/web-app\/[\w-]+\.png$/.test(url.pathname))) return void statisch(res, url.pathname)

    // ---------- Anmeldung
    if (req.method === 'GET' && url.pathname === '/anmelden') {
      res.writeHead(200, {
        'content-type': TYPEN['.html'],
        'cache-control': 'no-store',
        // Anmeldefenster (08.10.2026): nur das kleine Fensterskript per Hash erlaubt
        'content-security-policy': ANMELDE_CSP
      })
      return void res.end(
        anmeldeSeite({
          iserv: iservBereit(),
          notzugang: notzugangAn(),
          fehler: url.searchParams.get('fehler') ?? '',
          ziel: url.searchParams.get('ziel') ?? '/',
          benutzer: url.searchParams.get('benutzer') ?? '',
          konto: url.searchParams.get('konto') === '1'
        })
      )
    }
    if (req.method === 'GET' && url.pathname === '/auth/iserv') {
      try {
        const { adresse } = await iservAnmeldeAdresse(rueckruf, url.searchParams.get('ziel') ?? '/')
        res.writeHead(302, { location: adresse, 'cache-control': 'no-store' })
        return void res.end()
      } catch (e) {
        res.writeHead(302, { location: `/anmelden?fehler=${encodeURIComponent(e instanceof Error ? e.message : String(e))}` })
        return void res.end()
      }
    }
    const zielFuer = zielNachAnmeldung
    if (req.method === 'GET' && url.pathname === '/auth/rueckruf') {
      try {
        const fehlerVonIserv = url.searchParams.get('error')
        if (fehlerVonIserv)
          throw new AnmeldeFehler(fehlerVonIserv === 'access_denied' ? 'Die Anmeldung bei IServ wurde abgebrochen.' : `IServ: ${fehlerVonIserv}`)
        const { nutzer, ziel } = await iservRueckruf(rueckruf, url.searchParams.get('state') ?? '', url.searchParams.get('code') ?? '')
        const neu = sitzungAnlegen(nutzer.id, nutzer.rolle)
        setzeSitzungsCookie(res, neu.cookie, SITZUNG_MS[nutzer.rolle], sicher)
        res.writeHead(302, { location: zielFuer(nutzer.rolle, ziel), 'cache-control': 'no-store' })
        return void res.end()
      } catch (e) {
        res.writeHead(302, {
          location: `/anmelden?fehler=${encodeURIComponent(e instanceof AnmeldeFehler ? e.message : 'Die Anmeldung bei IServ ist fehlgeschlagen.')}`
        })
        return void res.end()
      }
    }
    if (req.method === 'POST' && url.pathname === '/auth/lokal') {
      // Formular der Anmeldeseite (application/x-www-form-urlencoded) – nur von der eigenen Seite
      const herkunft = String(req.headers.origin ?? '')
      if (herkunft && !hosts.has(herkunft.replace(/^https?:\/\//, '').toLowerCase()) && hosts.size) return void res.writeHead(403).end()
      const form = new URLSearchParams(await leseKoerper(req, 64 * 1024))
      const ziel = /^\/[a-zA-Z0-9/_-]*$/.test(form.get('ziel') ?? '') ? form.get('ziel')! : '/'
      try {
        const nutzer = await passwortAnmeldung(form.get('benutzer') ?? '', form.get('passwort') ?? '', ip)
        const neu = sitzungAnlegen(nutzer.id, nutzer.rolle)
        setzeSitzungsCookie(res, neu.cookie, SITZUNG_MS[nutzer.rolle], sicher)
        const weiter = zielFuer(nutzer.rolle, ziel)
        res.writeHead(303, { location: nutzer.passwortWechseln ? `/passwort?ziel=${encodeURIComponent(weiter)}` : weiter })
      } catch (e) {
        res.writeHead(303, {
          location: `/anmelden?fehler=${encodeURIComponent(e instanceof AnmeldeFehler ? e.message : 'Anmeldung fehlgeschlagen.')}&konto=1&ziel=${encodeURIComponent(
            ziel
          )}`
        })
      }
      return void res.end()
    }
    if (req.method === 'POST' && url.pathname === '/auth/abmelden') {
      if (!mitKopf) return json(res, 403, { fehler: 'Nur aus der App.' })
      // Abmelden in der Vorschau beendet nie die Sitzung der Lehrkraft
      if (inVorschau) return json(res, 200, { ok: true, vorschau: true })
      if (keks) sitzungBeenden(keks)
      if (sitzung) sitzungVergessen(sitzung.kennung)
      loescheCookie(res, sicher)
      return json(res, 200, { ok: true })
    }

    // ---------- Eigenes Passwort statt des vorübergehenden (vom Admin angelegte Konten, 02.10.2026)
    const zielAus = (wert: string | null): string => (/^\/[a-zA-Z0-9/_-]*$/.test(wert ?? '') ? wert! : '/')
    if (req.method === 'GET' && url.pathname === '/passwort') {
      if (!sitzung) return void res.writeHead(302, { location: '/anmelden' }).end()
      res.writeHead(200, {
        'content-type': TYPEN['.html'],
        'cache-control': 'no-store',
        'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'"
      })
      return void res.end(
        passwortSeite({
          name: sitzung.nutzer.name || sitzung.nutzer.benutzer,
          fehler: url.searchParams.get('fehler') ?? '',
          ziel: zielAus(url.searchParams.get('ziel'))
        })
      )
    }
    if (req.method === 'POST' && url.pathname === '/auth/passwort') {
      const herkunft = String(req.headers.origin ?? '')
      if (herkunft && !hosts.has(herkunft.replace(/^https?:\/\//, '').toLowerCase()) && hosts.size) return void res.writeHead(403).end()
      if (!sitzung) return void res.writeHead(303, { location: '/anmelden' }).end()
      const form = new URLSearchParams(await leseKoerper(req, 64 * 1024))
      const ziel = zielAus(form.get('ziel'))
      const neu = form.get('neu') ?? ''
      // Das vorübergehende Passwort fragt die Seite nicht mehr ab (03.10.2026): Wer hier ist, hat sich gerade damit angemeldet
      const nurMitAltem = !sitzung.nutzer.passwortWechseln
      const fehler =
        nurMitAltem && !passwortPruefen(form.get('alt') ?? '', passwortHashVon(sitzung.nutzer.benutzer))
          ? 'Das bisherige Passwort stimmt nicht.'
          : neu.length < 10
          ? 'Das neue Passwort braucht mindestens 10 Zeichen.'
          : neu !== form.get('neu2')
          ? 'Die beiden neuen Passwörter stimmen nicht überein.'
          : passwortPruefen(neu, passwortHashVon(sitzung.nutzer.benutzer))
          ? 'Bitte ein anderes als das vorübergehende Passwort wählen.'
          : ''
      if (fehler) return void res.writeHead(303, { location: `/passwort?fehler=${encodeURIComponent(fehler)}&ziel=${encodeURIComponent(ziel)}` }).end()
      nutzerAendern(sitzung.nutzer.id, { passwortHash: passwortHash(neu), passwortWechseln: false })
      protokolliereServer('anmeldung', 'Eigenes Passwort gesetzt', sitzung.nutzer.id)
      return void res.writeHead(303, { location: zielFuer(sitzung.nutzer.rolle, ziel) }).end()
    }
    // ---------- Passwort ändern aus den Einstellungen (Lehrkraft, Admin, Lernende; 03.10.2026)
    if (req.method === 'POST' && url.pathname === '/konto/passwort') {
      if (!mitKopf) return void res.writeHead(403).end()
      if (!sitzung || sitzung.nutzer.quelle === 'gast') return json(res, 401, { fehler: 'Bitte zuerst anmelden.' })
      if (sitzung.nutzer.quelle === 'vorschau') return json(res, 400, { fehler: 'In der Vorschau gibt es kein Passwort.' })
      if (sitzung.nutzer.quelle === 'iserv') return json(res, 400, { fehler: 'Dein Passwort verwaltest du in IServ.' })
      const sperre = `pw:${sitzung.nutzer.id}`
      if (gesperrtWegenVersuchen(sperre)) return json(res, 429, { fehler: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' })
      const k0 = (await k.koerper()) as Record<string, unknown>
      const alt = String(k0.alt ?? '')
      const neu = String(k0.neu ?? '')
      const hashAlt = passwortHashVon(sitzung.nutzer.benutzer)
      if (!passwortPruefen(alt, hashAlt)) {
        await new Promise((r) => setTimeout(r, Math.min(4000, 300 * fehlversuch(sperre))))
        return json(res, 400, { fehler: 'Das bisherige Passwort stimmt nicht.', feld: 'alt' })
      }
      const fehler =
        neu.length < 10
          ? 'Das neue Passwort braucht mindestens 10 Zeichen.'
          : neu !== String(k0.neu2 ?? '')
          ? 'Die beiden neuen Passwörter stimmen nicht überein.'
          : neu === alt
          ? 'Das neue Passwort ist dasselbe wie das bisherige.'
          : ''
      if (fehler) return json(res, 400, { fehler, feld: 'neu' })
      nutzerAendern(sitzung.nutzer.id, { passwortHash: passwortHash(neu), passwortWechseln: false })
      // Andere Geräte abmelden (wer das Passwort ändert, will oft genau das), dieses bleibt angemeldet
      if (k0.andereAbmelden === true) {
        sitzungenDesNutzersBeenden(sitzung.nutzer.id)
        const neueSitzung = sitzungAnlegen(sitzung.nutzer.id, sitzung.nutzer.rolle)
        setzeSitzungsCookie(res, neueSitzung.cookie, SITZUNG_MS[sitzung.nutzer.rolle], sicher)
      }
      protokolliereServer('anmeldung', 'Passwort in den Einstellungen geändert', sitzung.nutzer.id)
      return json(res, 200, { ok: true })
    }

    // ---------- Darstellung der Lernenden (Modus, Schrift, Farbe) – folgt dem Konto auf jedes Gerät
    // Seit 08.10.2026 auch für Gäste (persönlicher Anmeldecode: sie lernen an mehreren Geräten)
    if (url.pathname === '/s/api/darstellung' && sitzung) {
      const d = datenbank()
      d.exec('CREATE TABLE IF NOT EXISTS nutzer_darstellung (nutzer_id TEXT PRIMARY KEY REFERENCES nutzer(id) ON DELETE CASCADE, daten TEXT NOT NULL)')
      if (req.method === 'GET') {
        const z = d.prepare('SELECT daten FROM nutzer_darstellung WHERE nutzer_id = ?').get(sitzung.nutzer.id) as { daten: string } | undefined
        return json(res, 200, { darstellung: z ? (JSON.parse(z.daten) as unknown) : null })
      }
      if (req.method === 'POST' && mitKopf) {
        const k0 = (await k.koerper()) as Record<string, unknown>
        const wahl = (wert: unknown, erlaubt: string[], vorgabe: string): string => (erlaubt.includes(String(wert)) ? String(wert) : vorgabe)
        const darstellung = {
          modus: wahl(k0.modus, ['hell', 'dunkel', 'auto'], 'auto'),
          schrift: wahl(k0.schrift, ['normal', 'gross', 'sehrgross'], 'normal'),
          farbe: wahl(k0.farbe, ['blue', 'teal', 'grape', 'orange', 'pink', 'green'], 'blue'),
          ruhig: k0.ruhig === true,
          // Vokabeltraining: Fachfarbe oder eigene Farbe (03.10.2026)
          design: wahl(k0.design, ['fach', 'eigen'], 'fach'),
          // Lesen und Hören, Lernen (06.10.2026). Die lesefreundliche Schrift und die Stimme bleiben nur auf dem Gerät
          // (keine Angaben, die nach Diagnose aussehen, auf dem Server; Stimmen gibt es je Gerät).
          zeilen: wahl(k0.zeilen, ['normal', 'weit', 'sehrweit'], 'normal'),
          kontrast: k0.kontrast === true,
          vorlesen: k0.vorlesen === true,
          tempo: wahl(k0.tempo, ['langsam', 'normal', 'schnell'], 'normal'),
          // Aufgenommene Aussprache: weibliche oder männliche Fassung (07.10.2026)
          aussprache: wahl(k0.aussprache, ['w', 'm'], 'm'),
          wochenziel: Math.max(1, Math.min(7, Math.round(Number(k0.wochenziel) || 3))),
          tipps: k0.tipps !== false,
          spiele: k0.spiele !== false,
          zeitdruck: k0.zeitdruck !== false,
          toene: k0.toene !== false,
          // Neue Vorgaben vom 08.10.2026 (Töne an, männliche Stimme) schon übernommen – sonst würden sie die eigene Wahl überschreiben
          vorgabe0810: k0.vorgabe0810 === true,
          // Spielauswahl: auf- und zugeklappte Bereiche (08.10.2026)
          spielGruppen: Object.fromEntries(
            Object.entries(typeof k0.spielGruppen === 'object' && k0.spielGruppen ? (k0.spielGruppen as Record<string, unknown>) : {})
              .filter(([n, v]) => /^[a-z]{1,20}$/.test(n) && typeof v === 'boolean')
              .slice(0, 20)
          ),
          // „Lege das Wort": legen, tippen oder schreiben; Meine Materialien als Regal oder Liste, eigene Ordnerreihenfolge (08.10.2026)
          legen: wahl(k0.legen, ['legen', 'tippen', 'schreiben'], 'legen'),
          // „Dein Vokabelweg" auf- oder zugeklappt (08.10.2026)
          vokabelwegOffen: k0.vokabelwegOffen === true,
          materialien: wahl(k0.materialien, ['regal', 'liste'], 'regal'),
          regal: (Array.isArray(k0.regal) ? k0.regal : [])
            .filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 60)
            .slice(0, 40)
        }
        d.prepare('INSERT INTO nutzer_darstellung (nutzer_id, daten) VALUES (?, ?) ON CONFLICT(nutzer_id) DO UPDATE SET daten = excluded.daten').run(
          sitzung.nutzer.id,
          JSON.stringify(darstellung)
        )
        return json(res, 200, { darstellung })
      }
    }

    // Solange das vorübergehende Passwort gilt, geht nichts anderes
    if (sitzung?.nutzer.passwortWechseln && !url.pathname.startsWith('/assets/') && url.pathname !== '/auth/abmelden') {
      if (req.method === 'GET' && !url.pathname.startsWith('/api') && !url.pathname.startsWith('/server/') && !url.pathname.startsWith('/s/api/'))
        return void res.writeHead(302, { location: `/passwort?ziel=${encodeURIComponent(url.pathname)}`, 'cache-control': 'no-store' }).end()
      if (url.pathname !== '/server/ich.js') return json(res, 403, { fehler: 'Bitte zuerst ein eigenes Passwort festlegen.' })
    }

    // ---------- Wer bin ich (Skript vor der Oberfläche, siehe programmSeite)
    if (req.method === 'GET' && url.pathname === '/server/ich.js') {
      res.writeHead(200, { 'content-type': TYPEN['.js'], 'cache-control': 'no-store' })
      const ich = sitzung
        ? {
            angemeldet: true,
            benutzer: sitzung.nutzer.benutzer,
            name: sitzung.nutzer.name,
            rolle: sitzung.nutzer.rolle,
            quelle: sitzung.nutzer.quelle,
            eingerichtet: sitzung.nutzer.eingerichtet,
            adresse: opts.adresse,
            ...(inVorschau ? { vorschau: true } : {})
          }
        : { angemeldet: false, adresse: opts.adresse }
      /*
       * Schülerbereich im Dunkelmodus (03.10.2026, Befund der Lehrkraft: beim Wechsel der Seite „hellt das
       * Fenster sehr hell auf"): Die Seite war weiß, bis das Programm geladen hatte. Dieses Skript läuft
       * vor allem anderen im Kopf und färbt den Hintergrund gleich richtig (gemerkte Darstellung).
       */
      const frueh =
        "(function(){try{if(location.pathname.indexOf('/s/')!==0)return;var d=JSON.parse(localStorage.getItem('schulapps-darstellung')||'{}');" +
        // Dunkel als Vorgabe (05.10.2026): ohne gespeicherte Wahl bzw. ältere „automatisch" → dunkel
        "var m=d.modus||'dunkel';if(m==='auto'&&!d.dunkelVorgabe)m='dunkel';var dk=m==='dunkel'||(m==='auto'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);" +
        "var s=document.createElement('style');s.id='sa-frueh';s.textContent=dk?':where(html,body){background:#242424;color-scheme:dark}':':where(html,body){background:#fff}';" +
        'document.head.appendChild(s)}catch(e){}})();'
      return void res.end(
        `window.__schulappsServer=${JSON.stringify(ich).replace(/</g, '\\u003c')};${frueh}` +
          (inVorschau ? vorschauSkript(vs) : sitzung && sitzung.nutzer.rolle !== 'schueler' && opts.vorschau ? VORSCHAU_HAKEN : '')
      )
    }

    // ---------- Zusatzrouten (Verwaltung, Onlinetest, Hörtexte, Schülerbereich)
    for (const route of opts.routen ?? []) if (await route(k)) return

    // ---------- Ab hier nur angemeldet
    if (!sitzung) {
      if (req.method === 'GET' && !url.pathname.startsWith('/api') && !url.pathname.startsWith('/ereignisse')) {
        const datei = url.pathname !== '/' && existsSync(join(OBERFLAECHE, url.pathname)) && !url.pathname.endsWith('.html')
        // Bündel (js/css) dürfen ohne Anmeldung kommen – die Anmeldeseite braucht sie nicht, schadet aber nicht
        if (datei) return statisch(res, decodeURIComponent(url.pathname))
        // Onlinetest per QR-Code: Solange IServ nicht freigeschaltet ist, reicht der Name (SchuelerBereich, src/server/onlinetest.ts)
        // Grammatiktraining (gt) und Unterrichtsreihe (rq) per QR-Code ebenso
        if ((/^\/s\/(?:[tfw]|vt|gt|rq)\/[A-Za-z0-9]{4,12}\/?$/.test(url.pathname) || url.pathname === '/s/' || url.pathname === '/s') && !iservBereit())
          return statisch(res, '/s/')
        res.writeHead(302, {
          location: `/anmelden?ziel=${encodeURIComponent(url.pathname.startsWith('/s/') ? url.pathname : '/')}`,
          'cache-control': 'no-store'
        })
        return void res.end()
      }
      return json(res, 401, { fehler: 'Nicht angemeldet.' })
    }
    const nutzer = sitzung.nutzer
    const istSchueler = nutzer.rolle === 'schueler'
    const b = buendel(sitzung.kennung, nutzer.id)
    const geraet = req.headers['x-schulapps-geraet']
    const geraetSchluessel = gueltigesGeraet(geraet) ? `${nutzer.id}_${geraet}` : null
    if (geraetSchluessel) b.geraete.add(geraetSchluessel)

    if (req.method === 'GET' && url.pathname === '/ereignisse') {
      if (istSchueler) return json(res, 403, { fehler: 'Kein Zugang.' })
      return oeffneStrom(req, res, b)
    }

    if (req.method === 'POST' && url.pathname === '/api') {
      if (istSchueler) return json(res, 403, { fehler: 'Kein Zugang zu den Programmen.' })
      if (!mitKopf) return json(res, 403, { fehler: 'Nur aus der App.' })
      const koerper = (await k.koerper()) as { channel?: string; args?: unknown[] }
      const kanal = String(koerper.channel ?? '')
      if (!SERVER_KANAELE.has(kanal)) return json(res, 403, { fehler: `„${kanal}" steht auf dem Server nicht zur Verfügung.` })
      const args = kennzeichne(kanal, beschneideServer(kanal, (koerper.args ?? []).map(auspacken)), sitzung.kennung)
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      const puls = setInterval(() => res.write(' '), PULS_MS)
      res.on('close', () => clearInterval(puls))
      try {
        const wert = await imNutzer(alsNutzer(nutzer, sitzung.kennung), () => opts.aufruf(kanal, args))
        res.end(JSON.stringify({ ok: true, value: packen(wert) }))
      } catch (e) {
        res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
      } finally {
        clearInterval(puls)
      }
      return
    }

    if (req.method === 'POST' && url.pathname.startsWith('/auftrag/')) {
      if (istSchueler) return json(res, 403, { fehler: 'Kein Zugang.' })
      if (!mitKopf) return json(res, 403, { fehler: 'Nur aus der App.' })
      if (!geraetSchluessel) return json(res, 400, { fehler: 'Gerätekennung fehlt.' })
      const koerper = (await k.koerper()) as { id?: unknown; channel?: unknown; args?: unknown; warteMs?: unknown }
      const aktion = url.pathname.slice('/auftrag/'.length)
      const reg = auftragsRegister
      if (aktion === 'liste') return json(res, 200, { auftraege: reg.liste(geraetSchluessel) })
      const id = koerper.id
      if (!gueltigeAuftragsId(id)) return json(res, 400, { fehler: 'Ungültige Auftrags-ID.' })
      const antwort = (bild: ReturnType<typeof reg.abfragen>): void => {
        if (!bild) return json(res, 404, { fehler: 'Auftrag unbekannt.' })
        json(res, 200, { auftrag: 'wert' in bild ? { ...bild, wert: packen(bild.wert) } : bild })
      }
      if (aktion === 'starten') {
        const kanal = String(koerper.channel ?? '')
        if (!AUFTRAGS_KANAELE.includes(kanal) || !SERVER_KANAELE.has(kanal))
          return json(res, 403, { fehler: `„${kanal}" lässt sich nicht als Auftrag starten.` })
        const roh = Array.isArray(koerper.args) ? (koerper.args as unknown[]) : []
        const args = kennzeichneAuftrag(kanal, beschneideServer(kanal, roh.map(auspacken)), id)
        const ich = alsNutzer(nutzer, sitzung.kennung)
        try {
          return antwort(reg.starte(geraetSchluessel, id, kanal, () => imNutzer(ich, () => opts.aufruf(kanal, args))).bild)
        } catch (e) {
          if (e instanceof AuftragsFehler) return e.code === 'voll' ? json(res, 429, { fehler: e.message }) : json(res, 404, { fehler: 'Auftrag unbekannt.' })
          throw e
        }
      }
      if (aktion === 'abfragen') {
        const steuerung = new AbortController()
        res.on('close', () => steuerung.abort())
        const ms = Math.max(0, Math.min(MAX_WARTEN_MS, Number(koerper.warteMs) || 0))
        const bild = await reg.warte(geraetSchluessel, id, ms, steuerung.signal)
        if (res.writableEnded || res.destroyed) return
        return antwort(bild)
      }
      if (aktion === 'quittieren') return json(res, 200, { ok: reg.quittiere(geraetSchluessel, id) })
      if (aktion === 'abbrechen') {
        const lief = reg.brichAb(geraetSchluessel, id)
        if (lief) void imNutzer(alsNutzer(nutzer, sitzung.kennung), () => opts.aufruf('ai:cancel', [kennungDesAuftrags(id)])).catch(() => undefined)
        return json(res, 200, { ok: lief })
      }
      return json(res, 404, { fehler: 'Unbekannter Aufruf.' })
    }

    if (req.method === 'GET') {
      // Schülerinnen und Schüler sehen nur ihren Bereich
      if (istSchueler && !url.pathname.startsWith('/assets/') && !url.pathname.startsWith('/s/')) {
        res.writeHead(302, { location: '/s/' })
        return void res.end()
      }
      /*
       * Lehrkräfte auf der Schüler-Startseite (08.10.2026): als Hauptseite geöffnet (gemerkte Seite, Web-App vom
       * Home-Bildschirm, Rückweg „/s/") gleich zur Lehrkraft-Ansicht. Nicht im Vorschaufenster (läuft im iframe bzw. mit
       * Vorschau-Schlüssel) und nicht mit einem Code aus „Mit Code öffnen" (/s/?code=…).
       */
      if (
        !istSchueler &&
        !inVorschau &&
        (url.pathname === '/s/' || url.pathname === '/s') &&
        !url.searchParams.has('code') &&
        req.headers['sec-fetch-dest'] === 'document'
      ) {
        res.writeHead(302, { location: '/', 'cache-control': 'no-store' })
        return void res.end()
      }
      return statisch(res, decodeURIComponent(url.pathname))
    }
    res.writeHead(405).end('nicht erlaubt')
  }

  // Zertifikat nach Namen (SNI): eigene Domain → ihr Zertifikat, sonst das der IP-Adresse
  let domainKontext: SecureContext | null = null
  const domainLaden = (): void => {
    const d = opts.tls?.domain
    if (!d || !existsSync(d.cert) || !existsSync(d.key)) return void (domainKontext = null)
    try {
      domainKontext = createSecureContext({ cert: readFileSync(d.cert), key: readFileSync(d.key) })
    } catch (e) {
      console.error('TLS: Domain-Zertifikat nicht lesbar', e)
    }
  }
  domainLaden()
  const domainNamen = new Set((opts.tls?.domain?.namen ?? []).map((n) => n.toLowerCase()))
  const server = opts.tls
    ? createHttpsServer(
        {
          cert: readFileSync(opts.tls.cert),
          key: readFileSync(opts.tls.key),
          SNICallback: (name, fertig) => fertig(null, domainKontext && domainNamen.has(String(name).toLowerCase()) ? domainKontext : undefined)
        },
        (req, res) => {
          gemessen(req, res, () => behandle(req, res))
        }
      )
    : createHttpServer((req, res) => {
        gemessen(req, res, () => behandle(req, res))
      })
  server.keepAliveTimeout = 65_000
  server.headersTimeout = 70_000
  server.requestTimeout = 0

  // Erneuertes Zertifikat ohne Neustart übernehmen (wie bei Gywem: Polling, weil die Dateien ersetzt werden)
  if (opts.tls && 'setSecureContext' in server) {
    const tls = opts.tls
    const neuLaden = (): void => {
      try {
        ;(server as unknown as { setSecureContext(o: object): void }).setSecureContext({ cert: readFileSync(tls.cert), key: readFileSync(tls.key) })
        console.log('TLS: erneuertes Zertifikat übernommen')
      } catch (e) {
        console.error('TLS: Zertifikat nicht lesbar', e)
      }
    }
    watchFile(tls.cert, { interval: 60_000 }, neuLaden)
    if (tls.domain) watchFile(tls.domain.cert, { interval: 60_000 }, () => (domainLaden(), console.log('TLS: Domain-Zertifikat übernommen')))
  }

  return new Promise((ok, fehler) => {
    server.on('error', fehler)
    server.listen(opts.port, '0.0.0.0', () => ok(server))
  })
}
