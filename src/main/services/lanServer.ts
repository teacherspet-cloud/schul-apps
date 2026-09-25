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
  'textbooks:save',
  'library:save',

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
export const UMSCHREIBUNG: Record<string, (args: unknown[]) => unknown[]> = {
  'settings:set': (args) => {
    const patch = args[0]
    if (patch && typeof patch === 'object' && 'lan' in (patch as Record<string, unknown>)) {
      const { lan: _weg, ...rest } = patch as Record<string, unknown>
      return [rest, ...args.slice(1)]
    }
    return args
  }
}

/** Argumente eines Aufrufs so beschneiden, wie es über das Netz gilt. */
export const beschneide = (kanal: string, args: unknown[]): unknown[] => (UMSCHREIBUNG[kanal] ? UMSCHREIBUNG[kanal](args) : args)

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
const tokens = new Set<string>()
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
          if (fehlversuche >= MAX_FEHLVERSUCHE) return json(res, 429, { fehler: 'Zu viele Fehlversuche. Schalte den Zugang in den Einstellungen neu ein.' })
          const koerper = JSON.parse((await leseKoerper(req)) || '{}') as { pin?: string }
          if (!gleich(String(koerper.pin ?? ''), pin)) {
            fehlversuche++
            // Verzögerung: Raten wird dadurch unattraktiv, ohne den echten Zugang zu stören
            await new Promise((r) => setTimeout(r, 400 * fehlversuche))
            return json(res, 401, { fehler: 'Falsche PIN.', verbleibend: MAX_FEHLVERSUCHE - fehlversuche })
          }
          const neu = randomBytes(24).toString('hex')
          tokens.add(neu)
          fehlversuche = 0
          return json(res, 200, { token: neu })
        }

        if (req.method === 'POST' && url.pathname === '/api') {
          if (typeof token !== 'string' || !tokens.has(token)) return json(res, 401, { fehler: 'Nicht angemeldet.' })
          const koerper = JSON.parse((await leseKoerper(req)) || '{}') as { channel?: string; args?: unknown[] }
          const kanal = String(koerper.channel ?? '')
          if (!ERLAUBTE_KANAELE.includes(kanal)) {
            /*
             * Die Fassungsnummer steht mit in der Meldung. Der erste gemeldete Fall dieser
             * Art kam von einer älteren, noch laufenden Fassung – die Freigabe war längst
             * gebaut. Ohne die Nummer sieht das genauso aus wie ein echter Fehler.
             */
            return json(res, 403, {
              fehler: `„${kanal}" ist über das Netz nicht freigegeben (Schul-Apps ${fassung()}). Erledige das am Rechner selbst. Falls diese Fassung veraltet ist: Schul-Apps am Rechner schließen, neu starten und die Seite hier neu laden.`
            })
          }
          if (!aufrufen) return json(res, 500, { fehler: 'Der Zugang ist nicht bereit.' })
          try {
            const roh = (koerper.args ?? []).map(auspacken)
            const wert = await aufrufen(kanal, beschneide(kanal, roh))
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
        aktuellerPort = port
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
  server?.close()
  server = null
  aktuellerPort = 0
  tokens.clear()
}
