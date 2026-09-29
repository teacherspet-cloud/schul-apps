/**
 * Zugriff aus dem lokalen Netz: ein kleiner Webserver im Programm.
 *
 * ZWECK: Von einem anderen eigenen Gerät – Tablet, Handy, zweiter Rechner – im selben Netz
 * dieselbe Oberfläche im Browser öffnen und damit Arbeitsblätter erstellen. Gerechnet wird
 * weiterhin auf diesem PC; das Gerät zeigt nur die Oberfläche an.
 *
 * WAS ER NICHT IST: kein Zugang von außerhalb des Netzes, kein Cloud-Dienst, kein
 * Mehrbenutzerbetrieb. Es gibt EINE Bibliothek und EIN KI-Kontingent – das dieses PCs.
 *
 * SICHERHEIT – der Grund für den größten Teil dieser Datei:
 * Die Programmschnittstelle enthält Aufrufe, die im Netz nichts zu suchen haben: API-Schlüssel
 * schreiben, Dateien auf diesem PC öffnen und speichern, Material löschen. Deshalb gilt eine
 * ERLAUBNISLISTE: Was dort nicht steht, wird abgelehnt – nicht umgekehrt. Eine neue Funktion
 * ist damit im Netz erst einmal gesperrt, bis jemand sie bewusst freigibt.
 *
 * Dazu: Der Server läuft nur, solange er eingeschaltet ist, verlangt eine PIN und sperrt nach
 * zehn Fehlversuchen. Ohne die Sperre wäre eine sechsstellige PIN im LAN in Minuten geraten.
 */
import { app } from 'electron'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'

/**
 * Aufrufe, die aus dem Netz erlaubt sind.
 *
 * Bewusst einzeln aufgezählt und nach Zweck geordnet. Was fehlt, ist gesperrt – vor allem:
 * `secrets:*` (API-Schlüssel), `files:*` (Dateidialoge dieses PCs), alle `*:delete`
 * (Material löschen) und `settings:set` (Einstellungen dieses PCs ändern).
 */
export const ERLAUBTE_KANAELE: readonly string[] = [
  // --- Lesen, was die Oberfläche zum Aufbau braucht ---
  'settings:get',
  'secrets:has',
  'ai:status',
  'ai:models',
  'cefr:get',
  'designs:list',
  'branding:get-logo',
  'pictograms:get',
  'textbooks:list',
  'textbooks:get',
  'library:list',

  /*
   * --- Einstellen ---
   * Es ist derselbe Mensch an derselben App, nur an einem anderen Gerät. Schulname,
   * Schullogo, Notenschlüssel, Zitierweise, Symbole und Designvorlagen gehören zum
   * Aussehen des Materials und sind vom Gerät aus änderbar. Der Netzzugang selbst wird
   * aus `settings:set` herausgeschnitten – siehe `UMSCHREIBUNG`.
   */
  'settings:set',
  'branding:set-logo',
  'branding:remove-logo',
  'pictograms:set',
  'pictograms:remove',
  'pictograms:reset',
  'designs:save',
  'designs:set-default',

  // --- Erstellen: KI, Bildsuche, Quellenprüfung, Hörtexte ---
  'ai:structured',
  'ai:image',
  // Einen eigenen Auftrag abbrechen – betrifft nur die Anfrage mit dieser Kennung
  'ai:cancel',
  'images:online-search',
  'images:openmoji-search',
  'images:openmoji-svg',
  'images:fetch',
  'sources:check-media',
  'sources:check-quote',
  /*
   * Materialsuche: lesende Zugriffe auf frei zugängliche Archive und Seiten.
   *
   * Ohne diese drei Freigaben schlüge die Suche nach Originalmaterial am Tablet mit
   * „ist über das Netz nicht freigegeben" fehl – und zwar mitten im Planen, wo die Lehrkraft
   * es für einen Fehler der Erstellung hielte. Genau so ist am 24.09.2026 schon einmal ein
   * Aufruf durchgerutscht.
   */
  'sources:suche',
  'sources:laden',
  'sources:video',
  'maskottchen:list',
  'ai:websuche',
  'audio:voices',
  'audio:speak',
  'audio:preview',
  'audio:read',

  // --- Material lesen ---
  'sheets:list',
  'sheets:get',
  'exams:list',
  'exams:get',
  'tests:list',
  'tests:get',
  'kurztests:list',
  'kurztests:get',
  'grammarTests:list',
  'grammarTests:get',
  'rueckmeldungen:list',
  'rueckmeldungen:get',
  'elternbriefe:list',
  'elternbriefe:get',
  // Themenbereiche (Paket 10b): Bereiche und Zuordnungen lesen
  'themen:list',
  // Lehrplan-Themen lesen (Paket 12) – mitgelieferte Daten, nichts vom Rechner der Lehrkraft
  'lehrplan:themen',
  // Schulsuche (Paket 13): nur lesend im mitgelieferten Verzeichnis und seinen Vorgabe-Logos
  'schulen:suche',
  'schulen:logo',
  'schulen:quellen',

  /*
   * --- Material speichern ---
   * Alle Programme, nicht nur Arbeitsblätter: Wer auf dem Tablet etwas öffnet und ändert,
   * muss es sichern können. Ein gesperrtes Speichern verhindert nichts – es vernichtet
   * Arbeit. LÖSCHEN bleibt gesperrt; das lässt sich nicht rückgängig machen.
   */
  'sheets:save',
  'exams:save',
  'tests:save',
  'kurztests:save',
  'grammarTests:save',
  'rueckmeldungen:save',
  'elternbriefe:save',
  'textbooks:save',
  'library:save',
  /*
   * Themenbereiche ordnen wie die übrigen Bibliotheks-Schreibwege: anlegen, umbenennen,
   * zuordnen, sortieren, Vorschläge übernehmen. `themen:delete` bleibt gesperrt wie alle
   * Löschaufrufe – auch wenn es nur den Ordner und nicht das Material träfe.
   */
  'themen:bereich',
  'themen:verschieben',
  'themen:zuordnen',
  'themen:uebernehmen',
  'themen:reihenfolge',
  'themen:automatik',

  // --- Ausgabe: erzeugt die Datei, die der Browser herunterlädt ---
  'export:preview',
  'export:fillable-preview',
  'export:printers',
  // Word-Datei in Text umwandeln – reine Umrechnung, kein Zugriff auf den Rechner
  'files:docx-html'
]

/**
 * Aufrufe, deren Argumente über das Netz beschnitten werden.
 *
 * `settings:set` nimmt einen Teil-Datensatz entgegen und führt ihn mit den Einstellungen
 * zusammen. Darin steckt auch der Netzzugang selbst. Ein angemeldetes Gerät könnte damit
 * PIN und Port ändern – und dem Rechner den Zugang unter den Füßen wegziehen. Deshalb wird
 * genau dieser Teil entfernt, statt den ganzen Aufruf zu sperren.
 */
/*
 * Was ein Gerät im Netz an den Einstellungen NICHT ändern darf (27.09.2026 erweitert):
 * - `lan`: den Netzzugang selbst
 * - `ai.cliPaths`: den Pfad des KI-Programms – die App startet dieses Programm (spawn); ein
 *   fremder Pfad wäre Fremdcode auf dem Rechner
 * - `ai.access`, `ai.imageAccess`, `ai.subscriptionAccepted`: Umschalten auf den Abo-Weg und
 *   die Bestätigung der Nutzungsbedingungen gehören an den Rechner
 */
export const GESPERRTE_KI_FELDER = ['cliPaths', 'access', 'imageAccess', 'subscriptionAccepted'] as const

export const UMSCHREIBUNG: Record<string, (args: unknown[]) => unknown[]> = {
  'settings:set': (args) => {
    const patch = args[0]
    if (!patch || typeof patch !== 'object') return args
    // `sicherung` enthält einen Ordnerpfad dieses Rechners – gehört an den Rechner
    const { lan: _weg, sicherung: _s, ...rest } = patch as Record<string, unknown>
    // Zertifikat (Pfad auf diesem Rechner) und Signieren stellt nur, wer am Rechner sitzt
    if (rest.briefkopf && typeof rest.briefkopf === 'object') {
      const { zertifikat: _z, signieren: _si, ...kopf } = rest.briefkopf as Record<string, unknown>
      rest.briefkopf = kopf
    }
    if (rest.ai && typeof rest.ai === 'object') {
      const ai = { ...(rest.ai as Record<string, unknown>) }
      for (const feld of GESPERRTE_KI_FELDER) delete ai[feld]
      rest.ai = ai
    }
    return [rest, ...args.slice(1)]
  }
}

/** Argumente eines Aufrufs so beschneiden, wie es über das Netz gilt. */
export const beschneide = (kanal: string, args: unknown[]): unknown[] => (UMSCHREIBUNG[kanal] ? UMSCHREIBUNG[kanal](args) : args)

/*
 * ---------- Ereignisse vom Hauptprozess an den Browser ----------
 *
 * Anlass (Nachtrag der Lehrkraft zu Paket 3): Am Rechner kommen Fortschritt, Warteplatz und
 * Modellhinweise über die Electron-Brücke an. Im Browser liefen diese Ereignisse ins Leere –
 * der Balken stand, ein wartender Auftrag sah aus wie ein hängender.
 *
 * WAHL DES WEGS: Server-Sent Events (eine lange Antwort auf GET /ereignisse), gelesen per
 * `fetch` statt per `EventSource`.
 *  - Gegen Abfrage im Takt: Fortschritt kommt bis zu fünfmal je Sekunde und Anfrage. Eine
 *    Abfrage, die das einfängt, hieße mehrere Anfragen je Sekunde vom Tablet – jede mit
 *    Anmeldung, Akku und WLAN-Last –, und zwischen zwei Abfragen stünde der Balken trotzdem.
 *    Ein offener Strom kostet eine Verbindung und liefert sofort.
 *  - Gegen WebSocket: braucht ein eigenes Protokoll und Upgrade-Behandlung; hier fließt nur
 *    eine Richtung, und SSE ist schlichtes HTTP.
 *  - `fetch` statt `EventSource`: EventSource kann keine Kopfzeilen senden. Die Anmeldung
 *    müsste dann in die Adresse (landet in Verlauf und Protokollen), oder ein Cookie wäre
 *    nötig. Mit `fetch` gilt dieselbe Anmeldung wie für jeden anderen Aufruf
 *    (`x-schulapps-token`); Wiederverbinden und „Last-Event-ID" übernimmt der Browser-Teil
 *    (renderer/src/shared/netzZugang.ts) selbst.
 *  - Herzschlag alle 15 s: Router, Proxys und WLAN-Stromsparen kappen stille Verbindungen,
 *    ohne dass die Seite davon erfährt. Der Browser baut neu auf, wenn 45 s nichts kam.
 *
 * ZUORDNUNG: Die Kennungen der Anfragen (Fortschritt, Warteplatz, Abbruch) wählt der Browser
 * selbst – am Rechner und am Tablet können sie gleich lauten. Deshalb stellt der Server jeder
 * Kennung aus dem Netz die Sitzung voran (`netz-<sitzung>-…`, `kennzeichne`). Ereignisse mit
 * so einer Kennung gehen NUR an diese Sitzung, ohne Vorsatz zurück; das Fenster am Rechner
 * bekommt sie nicht. Nebenbei kann ein Gerät damit nur SEINE Anfragen abbrechen.
 */

/** Ereignisse, die überhaupt ins Netz dürfen. Einrichtung und Fenster-Schließen gehören dem Rechner. */
export const NETZ_EREIGNISSE: readonly string[] = ['ai:progress', 'ai:platz', 'models:updated']

const NETZ_VORSATZ = 'netz-'

/** Wo in den Argumenten eines Aufrufs die Kennung einer Anfrage steht */
const KENNUNG_IN: Record<string, (args: unknown[], f: (id: string) => string) => unknown[]> = {
  'ai:structured': (args, f) => {
    const req = args[0] as Record<string, unknown> | undefined
    if (!req || typeof req !== 'object' || typeof req.progressId !== 'string') return args
    return [{ ...req, progressId: f(req.progressId) }, ...args.slice(1)]
  },
  'ai:image': (args, f) => (typeof args[1] === 'string' ? [args[0], f(args[1]), ...args.slice(2)] : args),
  'ai:websuche': (args, f) => (typeof args[1] === 'string' ? [args[0], f(args[1]), ...args.slice(2)] : args),
  'ai:cancel': (args, f) => (typeof args[0] === 'string' ? [f(args[0]), ...args.slice(1)] : args)
}

/** Kennungen einer Anfrage aus dem Netz der Sitzung zuordnen (siehe oben, ZUORDNUNG). */
export const kennzeichne = (kanal: string, args: unknown[], sitzung: string): unknown[] =>
  KENNUNG_IN[kanal] ? KENNUNG_IN[kanal](args, (id) => `${NETZ_VORSATZ}${sitzung}-${id}`) : args

interface Ereignis {
  nr: number
  kanal: string
  wert: unknown
}

interface Sitzung {
  kennung: string
  stroeme: Set<ServerResponse>
  /** Zuletzt gesendete Ereignisse – zum Nachliefern nach einer kurzen Unterbrechung */
  puffer: Ereignis[]
  nr: number
}

/** Nachgeliefert wird höchstens so viel; Fortschritt wird gar nicht gepuffert (der nächste ersetzt ihn). */
const PUFFER = 100
/**
 * Jeder Tab eines Browsers teilt sich die Anmeldung und hält einen eigenen Strom. Mehr als acht
 * je Gerät sind ein Zeichen für hängende Reste (abgerissene Verbindungen) – der älteste geht.
 */
const MAX_STROEME = 8
const HERZSCHLAG_MS = 15_000

export interface LanStatus {
  laeuft: boolean
  /** Der gewünschte Port – weicht er vom laufenden ab, war er belegt */
  wunschPort: number
  /** Adresse zum Abtippen, z. B. http://192.168.1.24:842 */
  adresse: string
  port: number
  /** Zahl der Geräte, die sich angemeldet haben */
  angemeldet: number
  /** Gesperrt nach zu vielen Fehlversuchen */
  gesperrt: boolean
}

type Aufruf = (channel: string, args: unknown[]) => Promise<unknown>

let server: Server | null = null
let aktuellerPort = 0
let gewuenschterPort = 0
let pin = ''
let aufrufen: Aufruf | null = null
/** Angemeldete Geräte: Token → Sitzung */
const tokens = new Map<string, Sitzung>()
let herzschlag: ReturnType<typeof setInterval> | null = null
let fehlversuche = 0
const MAX_FEHLVERSUCHE = 10

/** Die Adresse dieses Rechners im lokalen Netz (die erste, die nicht die Rückschleife ist). */
export function lanAdresse(): string {
  for (const liste of Object.values(networkInterfaces())) {
    for (const netz of liste ?? []) {
      if (netz.family === 'IPv4' && !netz.internal) return netz.address
    }
  }
  return '127.0.0.1'
}

/** Die Fassung des laufenden Programms – steht in jeder Ablehnung, siehe dort. */
const fassung = (): string => app.getVersion()

export function lanStatus(): LanStatus {
  return {
    laeuft: Boolean(server),
    adresse: server ? `http://${lanAdresse()}:${aktuellerPort}` : '',
    port: aktuellerPort,
    wunschPort: gewuenschterPort,
    angemeldet: tokens.size,
    gesperrt: fehlversuche >= MAX_FEHLVERSUCHE
  }
}

/** Vergleich ohne Zeitunterschied – sonst ließe sich die PIN Ziffer für Ziffer erraten. */
function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function schreibe(res: ServerResponse, e: Ereignis): void {
  res.write(`id: ${e.nr}\ndata: ${JSON.stringify({ kanal: e.kanal, wert: e.wert })}\n\n`)
}

function zustellen(sitzung: Sitzung, kanal: string, wert: unknown): void {
  const e: Ereignis = { nr: ++sitzung.nr, kanal, wert }
  if (kanal !== 'ai:progress') {
    sitzung.puffer.push(e)
    if (sitzung.puffer.length > PUFFER) sitzung.puffer.shift()
  }
  for (const res of sitzung.stroeme) schreibe(res, e)
}

/**
 * Ein Ereignis des Hauptprozesses, das zu einer Anfrage aus dem Netz gehören KANN.
 *
 * Liefert `true`, wenn es einem Gerät gehört – dann ist es dorthin zugestellt (oder verworfen,
 * falls das Gerät nicht mehr angemeldet ist) und geht NICHT an das Fenster am Rechner.
 */
export function lanEreignis(kanal: string, wert: unknown): boolean {
  const id = wert && typeof wert === 'object' ? (wert as { id?: unknown }).id : undefined
  if (typeof id !== 'string' || !id.startsWith(NETZ_VORSATZ)) return false
  const rest = id.slice(NETZ_VORSATZ.length)
  const trenn = rest.indexOf('-')
  const kennung = rest.slice(0, Math.max(0, trenn))
  const sitzung = trenn > 0 ? [...tokens.values()].find((s) => s.kennung === kennung) : undefined
  if (sitzung && NETZ_EREIGNISSE.includes(kanal)) zustellen(sitzung, kanal, { ...(wert as object), id: rest.slice(trenn + 1) })
  return true
}

/** Ein allgemeines Ereignis (z. B. geänderte KI-Modelle) an alle angemeldeten Geräte. */
export function lanRundruf(kanal: string, wert: unknown): void {
  if (!NETZ_EREIGNISSE.includes(kanal)) return
  for (const sitzung of tokens.values()) zustellen(sitzung, kanal, wert)
}

/** GET /ereignisse: der Strom eines angemeldeten Geräts. */
function oeffneStrom(req: IncomingMessage, res: ServerResponse, sitzung: Sitzung): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    // Zwischengeschaltete Proxys sollen nicht puffern – sonst kommt der Fortschritt in Klumpen
    'x-accel-buffering': 'no'
  })
  req.socket.setNoDelay(true)
  req.socket.setKeepAlive(true, HERZSCHLAG_MS)
  res.write(': verbunden\n\n')
  // Nach einer Unterbrechung nachliefern, was seitdem kam (vor allem: Warteplatz frei)
  const letzte = Number(req.headers['last-event-id'])
  if (Number.isFinite(letzte) && letzte > 0) for (const e of sitzung.puffer) if (e.nr > letzte) schreibe(res, e)
  sitzung.stroeme.add(res)
  if (sitzung.stroeme.size > MAX_STROEME) {
    const aeltester = sitzung.stroeme.values().next().value
    if (aeltester) {
      sitzung.stroeme.delete(aeltester)
      aeltester.end()
    }
  }
  res.on('close', () => sitzung.stroeme.delete(res))
}

/**
 * Binärdaten für die Übertragung verpacken.
 *
 * Über die Electron-Brücke kommen Uint8Array direkt durch, über HTTP nicht. Betroffen sind
 * Word-Dateien, PDF-Vorschauen und Bilddaten – ohne diese Umwandlung käme dort ein leeres
 * Objekt an, und der Fehler sähe aus wie ein kaputter Export.
 */
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
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

function leseKoerper(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fehler) => {
    let daten = ''
    req.on('data', (stueck) => {
      daten += stueck
      // Eine Anfrage, die größer ist als jedes denkbare Arbeitsblatt, wird abgebrochen
      if (daten.length > 64 * 1024 * 1024) req.destroy()
    })
    req.on('end', () => ok(daten))
    req.on('error', fehler)
  })
}

const json = (res: ServerResponse, code: number, wert: unknown): void => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(wert))
}

/** Statische Datei der Oberfläche ausliefern. */
function datei(res: ServerResponse, wurzel: string, pfad: string): void {
  // Kein Ausbruch aus dem Ordner der Oberfläche
  const ziel = normalize(join(wurzel, pfad))
  if (!ziel.startsWith(wurzel + sep) && ziel !== wurzel) {
    res.writeHead(403).end('verboten')
    return
  }
  const gewaehlt = existsSync(ziel) && statSync(ziel).isFile() ? ziel : join(wurzel, 'index.html')
  /*
   * Die Seite selbst wird NIE zwischengespeichert, die Bündel dagegen dauerhaft.
   *
   * Die Bündel tragen einen Namen mit Prüfsumme (index-CZT1SjSH.js) und ändern sich bei
   * jeder neuen Fassung mit. Würde der Browser die Seite behalten, zeigte das Tablet nach
   * einem Update weiter die alte Oberfläche – und rief Dinge auf, die es längst anders gibt.
   */
  const istSeite = gewaehlt.endsWith('index.html')
  res.writeHead(200, {
    'content-type': TYPEN[extname(gewaehlt)] ?? 'application/octet-stream',
    'cache-control': istSeite ? 'no-store' : 'public, max-age=31536000, immutable'
  })
  createReadStream(gewaehlt).pipe(res)
}

export interface LanOptionen {
  port: number
  pin: string
  /** Ordner mit der gebauten Oberfläche */
  wurzel: string
  /** Führt einen Aufruf im Hauptprozess aus */
  aufruf: Aufruf
}

export function startLan(opts: LanOptionen): Promise<LanStatus> {
  stopLan()
  pin = opts.pin
  gewuenschterPort = opts.port
  aufrufen = opts.aufruf
  fehlversuche = 0
  tokens.clear()

  return new Promise((ok, fehler) => {
    const s = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://x')
        const token = req.headers['x-schulapps-token']

        if (req.method === 'POST' && url.pathname === '/anmelden') {
          if (fehlversuche >= MAX_FEHLVERSUCHE)
            return json(res, 429, { fehler: 'Zu viele Fehlversuche. Der Zugang muss am Rechner in den Einstellungen neu eingeschaltet werden.' })
          const koerper = JSON.parse((await leseKoerper(req)) || '{}') as { pin?: string }
          if (!gleich(String(koerper.pin ?? ''), pin)) {
            fehlversuche++
            // Verzögerung: Raten wird dadurch unattraktiv, ohne den echten Zugang zu stören
            await new Promise((r) => setTimeout(r, 400 * fehlversuche))
            return json(res, 401, { fehler: 'Falsche PIN.', verbleibend: MAX_FEHLVERSUCHE - fehlversuche })
          }
          const neu = randomBytes(24).toString('hex')
          tokens.set(neu, { kennung: randomBytes(6).toString('hex'), stroeme: new Set(), puffer: [], nr: 0 })
          fehlversuche = 0
          return json(res, 200, { token: neu })
        }

        if (req.method === 'GET' && url.pathname === '/ereignisse') {
          // Dieselbe Anmeldung wie für jeden Aufruf – ohne sie gibt es keinen Strom
          const sitzung = typeof token === 'string' ? tokens.get(token) : undefined
          if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' })
          return oeffneStrom(req, res, sitzung)
        }

        if (req.method === 'POST' && url.pathname === '/api') {
          const sitzung = typeof token === 'string' ? tokens.get(token) : undefined
          if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' })
          const koerper = JSON.parse((await leseKoerper(req)) || '{}') as { channel?: string; args?: unknown[] }
          const kanal = String(koerper.channel ?? '')
          if (!ERLAUBTE_KANAELE.includes(kanal)) {
            /*
             * Die Fassungsnummer steht mit in der Meldung. Der erste gemeldete Fall dieser
             * Art kam von einer älteren, noch laufenden Fassung – die Freigabe war längst
             * gebaut. Ohne die Nummer sieht das genauso aus wie ein echter Fehler.
             */
            return json(res, 403, {
              fehler: `„${kanal}" ist über das Netz nicht freigegeben (Schul-Apps ${fassung()}). Das geht nur am Rechner selbst. Falls diese Fassung veraltet ist: Schul-Apps am Rechner schließen, neu starten und die Seite hier neu laden.`
            })
          }
          if (!aufrufen) return json(res, 500, { fehler: 'Der Zugang ist nicht bereit.' })
          try {
            const roh = (koerper.args ?? []).map(auspacken)
            const wert = await aufrufen(kanal, kennzeichne(kanal, beschneide(kanal, roh), sitzung.kennung))
            return json(res, 200, { ok: true, value: packen(wert) })
          } catch (e) {
            return json(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) })
          }
        }

        if (req.method === 'GET' && url.pathname === '/gesundheit') return json(res, 200, { name: 'Schul-Apps', laeuft: true, fassung: fassung() })

        if (req.method === 'GET') return datei(res, opts.wurzel, decodeURIComponent(url.pathname))
        res.writeHead(405).end('nicht erlaubt')
      } catch (e) {
        json(res, 500, { fehler: e instanceof Error ? e.message : String(e) })
      }
    })
    /*
     * Ist der Port belegt, wird der nächste versucht – bis zu zehnmal.
     *
     * Belegt sein kann er leicht: ein anderes Programm, oder ein Rest des eigenen Servers,
     * den Windows noch nicht freigegeben hat. Ohne diesen Ausweg bliebe nur eine
     * Fehlermeldung mit „EADDRINUSE", mit der niemand etwas anfangen kann.
     */
    let versuch = 0
    const binden = (port: number): void => {
      s.listen(port, '0.0.0.0', () => {
        server = s
        // Bei Port 0 (nur in den Tests) wählt das System – maßgeblich ist der tatsächliche
        aktuellerPort = (s.address() as AddressInfo | null)?.port ?? port
        herzschlag = setInterval(() => {
          for (const sitzung of tokens.values()) for (const res of sitzung.stroeme) res.write(': puls\n\n')
        }, HERZSCHLAG_MS)
        herzschlag.unref?.()
        ok(lanStatus())
      })
    }
    s.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE' && versuch < 10) {
        versuch++
        s.removeAllListeners('listening')
        binden(opts.port + versuch)
        return
      }
      fehler(e)
    })
    binden(opts.port)
  })
}

export function stopLan(): void {
  if (herzschlag) clearInterval(herzschlag)
  herzschlag = null
  // Offene Ströme beenden – sonst hielten sie den Server über `close()` hinaus am Leben
  for (const sitzung of tokens.values()) for (const res of sitzung.stroeme) res.end()
  server?.close()
  server = null
  aktuellerPort = 0
  tokens.clear()
}
