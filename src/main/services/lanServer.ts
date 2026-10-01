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
import { execFile } from 'node:child_process'
import { extname, join, normalize, sep } from 'node:path'
import {
  AUFTRAG_VORSATZ,
  AUFTRAGS_KANAELE,
  AuftragsFehler,
  AuftragsRegister,
  gueltigeAuftragsId,
  gueltigesGeraet,
  kennungDesAuftrags,
  MAX_WARTEN_MS
} from './lanAuftraege'

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
  /*
   * Nur lesend: Ist das Abo-Programm am PC angemeldet? Die iPad-App mit „Abo über den PC"
   * zeigt das an (30.09.2026). Einrichten, Anmelden und Testen bleiben am PC.
   */
  'ai:subscription-status',
  'cefr:get',
  'designs:list',
  'branding:get-logo',
  'pictograms:get',
  'textbooks:list',
  'textbooks:get',
  // Unregelmäßige Verben je Lehrwerk-Band (30.09.2026)
  'verbLists:list',
  'verbLists:get',
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
  // Abgelehnte Quellen (01.10.2026): am Tablet abgelehnt = auch am PC abgelehnt
  'sources:ablehnungen',
  'sources:ablehnen',
  'sources:ablehnung-aufheben',
  'maskottchen:list',
  'ai:websuche',
  'audio:voices',
  'audio:speak',
  'audio:preview',
  'audio:read',
  // Eigene Hördatei vom Gerät hochladen – schreibt nur in den Hörtext-Ordner, Name geprüft (29.09.2026)
  'audio:import',

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
  'tafelbilder:list',
  'tafelbilder:get',
  'bewertungstabellen:list',
  'bewertungstabellen:get',
  'nachteilsausgleiche:get',
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
  'tafelbilder:save',
  'bewertungstabellen:save',
  'nachteilsausgleiche:save',
  'textbooks:save',
  'verbLists:save',
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
  /** Gerätekennungen, die über diese Anmeldung Aufträge führen (x-schulapps-geraet) – für deren Fortschritt */
  geraete: Set<string>
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
/** So oft wird der gewünschte Port erneut versucht (je 0,7 s), bevor ein anderer drankommt */
const WUNSCHPORT_GEDULD = 4

/** Eine weitere Adresse, unter der der PC erreichbar ist (z. B. über Tailscale von unterwegs) */
export interface LanWeitereAdresse {
  /** Vollständige Adresse, z. B. http://100.101.102.103:8420 */
  adresse: string
  art: 'tailscale' | 'lan'
  /** Name der Netzwerkverbindung laut Windows, z. B. „Tailscale" */
  schnittstelle: string
  /**
   * Nur im Browser brauchbar: die rohe Tailscale-IP (100.x). Die iPad-App erreicht sie nicht –
   * iOS lässt unverschlüsseltes HTTP dort nur für Namen auf „.ts.net" zu (Info.plist, 30.09.2026).
   */
  nurBrowser?: boolean
}

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
  /** Weitere Adressen dieses PCs – vor allem die von Tailscale (Zugriff von unterwegs, 30.09.2026) */
  weitere?: LanWeitereAdresse[]
  /**
   * Tailscale (30.09.2026): `adresse` mit dem MagicDNS-Namen – die EINE Adresse für die iPad-App
   * von unterwegs; `ip` nur für Browser. `name` ist leer, solange er (noch) nicht ermittelt ist.
   */
  tailscale?: { name: string; adresse: string; ip: string } | null
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

/*
 * ---------- Adressen dieses PCs ----------
 *
 * Bis 30.09.2026 galt die erste Adresse, die nicht die Rückschleife ist. Mit Tailscale (privates
 * VPN, damit die iPad-App den KI-Zugang des PCs auch von unterwegs nutzen kann) konnte das die
 * Tailscale-Adresse sein – im WLAN der Schule die falsche. Jetzt: zuerst die privaten Bereiche
 * des lokalen Netzes, Tailscale getrennt daneben.
 */

/** Tailscale vergibt Adressen aus 100.64.0.0/10 (Carrier-Grade NAT) */
export const istTailscaleAdresse = (ip: string): boolean => {
  const [a, b] = ip.split('.').map(Number)
  return a === 100 && b >= 64 && b <= 127
}

const istPrivat = (ip: string): boolean => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)

type EigeneAdresse = { ip: string; art: 'tailscale' | 'lan'; schnittstelle: string }

/** Alle IPv4-Adressen außer der Rückschleife, mit Art und Name der Verbindung */
export function lanAdressen(): EigeneAdresse[] {
  const out: EigeneAdresse[] = []
  for (const [name, liste] of Object.entries(networkInterfaces())) {
    for (const netz of liste ?? []) {
      if (netz.family !== 'IPv4' || netz.internal) continue
      const tailscale = istTailscaleAdresse(netz.address) || /tailscale/i.test(name)
      out.push({ ip: netz.address, art: tailscale ? 'tailscale' : 'lan', schnittstelle: name })
    }
  }
  return out
}

/** Die Adresse dieses Rechners im lokalen Netz – bevorzugt eine private (WLAN/LAN), nie die von Tailscale. */
export function lanAdresse(): string {
  const alle = lanAdressen()
  const lan = alle.filter((a) => a.art === 'lan')
  return (lan.find((a) => istPrivat(a.ip)) ?? lan[0] ?? alle[0])?.ip ?? '127.0.0.1'
}

/**
 * Der MagicDNS-Name dieses PCs bei Tailscale (z. B. pc-name.tailnet-xyz.ts.net), falls
 * Tailscale installiert ist. Die iPad-App erreicht den PC darüber auch dann, wenn iOS reine
 * IP-Adressen außerhalb des lokalen Netzes nicht über HTTP zulässt (Info.plist: Ausnahme für ts.net).
 * Nur gelesen („tailscale status"), nie etwas umgestellt.
 */
let magicDns = ''
/** Zeitpunkt der letzten Abfrage – ohne Namen wird höchstens alle 30 s erneut gefragt */
let magicDnsGefragt = 0
let magicDnsLaeuft = false

/** Den MagicDNS-Namen aus der Ausgabe von „tailscale status --json" lesen ('' = keiner) */
export function magicDnsAus(ausgabe: string): string {
  try {
    const name = String((JSON.parse(ausgabe) as { Self?: { DNSName?: string } }).Self?.DNSName ?? '').replace(/\.$/, '')
    return /^[a-z0-9.-]+\.ts\.net$/i.test(name) ? name.toLowerCase() : ''
  } catch {
    return ''
  }
}

/*
 * Rückmeldung der Lehrkraft (30.09.2026): In den Einstellungen stand nur die Tailscale-IP, der
 * Name fehlte. Gefragt wurde nur EINMAL beim Einschalten, ohne dass die Karte später nachlas;
 * und eine vollständige Ausgabe wurde verworfen, sobald das Programm mit einem Fehlercode
 * endete. Jetzt: die Ausgabe auch dann lesen, und solange kein Name da ist, bei jeder
 * Statusabfrage (höchstens alle 30 s) erneut fragen. Nur gelesen – nie etwas umgestellt.
 */
function frageMagicDns(): void {
  if (magicDnsLaeuft || Date.now() - magicDnsGefragt < 30_000) return
  if (!lanAdressen().some((a) => a.art === 'tailscale')) return
  magicDnsGefragt = Date.now()
  magicDnsLaeuft = true
  const programme = process.env.ProgramFiles ?? 'C:\\Program Files'
  const kandidaten =
    process.platform === 'win32' ? ['tailscale', join(programme, 'Tailscale', 'tailscale.exe'), 'C:\\Program Files\\Tailscale\\tailscale.exe'] : ['tailscale']
  const versuch = (i: number): void => {
    if (i >= kandidaten.length) {
      magicDnsLaeuft = false
      return
    }
    execFile(kandidaten[i], ['status', '--json'], { timeout: 4000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (_fehler, ausgabe) => {
      const name = magicDnsAus(String(ausgabe ?? ''))
      if (!name) return versuch(i + 1)
      magicDns = name
      magicDnsLaeuft = false
    })
  }
  versuch(0)
}

/** Tailscale-Adressen dieses PCs: Name (für die iPad-App) und IP (nur Browser) */
function tailscaleAdressen(port: number): LanStatus['tailscale'] {
  const ts = lanAdressen().find((a) => a.art === 'tailscale')
  if (!ts) return null
  if (!magicDns) frageMagicDns()
  return {
    name: magicDns,
    adresse: magicDns ? `http://${magicDns}:${port}` : '',
    ip: `http://${ts.ip}:${port}`
  }
}

function weitereAdressen(port: number): LanWeitereAdresse[] {
  const haupt = lanAdresse()
  const alle = lanAdressen()
  const out: LanWeitereAdresse[] = []
  const tailscale = alle.filter((a) => a.art === 'tailscale')
  if (magicDns && tailscale.length) out.push({ adresse: `http://${magicDns}:${port}`, art: 'tailscale', schnittstelle: tailscale[0].schnittstelle })
  for (const a of alle) {
    if (a.ip !== haupt) out.push({ adresse: `http://${a.ip}:${port}`, art: a.art, schnittstelle: a.schnittstelle, ...(a.art === 'tailscale' ? { nurBrowser: true } : {}) })
  }
  return out
}

/**
 * Soll der Zugang beim Programmstart von selbst angehen? (30.09.2026)
 *
 * Wunsch der Lehrkraft: Der Zugang war nach jedem Neustart aus – die iPad-App („Abo über den
 * PC") stand dann ohne KI da, bis jemand am PC den Schalter fand. Jetzt:
 *  - `autoStart` ausdrücklich gesetzt: das gilt
 *  - sonst (Voreinstellung): an, sobald der Zugang einmal eingerichtet war oder zuletzt lief
 * Ein PC, an dem nie jemand den Zugang eingeschaltet hat, öffnet weiterhin keinen Port.
 */
export function lanBeimStart(lan: { pin?: string; autoStart?: boolean; eingerichtet?: boolean; zuletztAn?: boolean } | undefined): boolean {
  if (!lan || !/^\d{6}$/.test(String(lan.pin ?? ''))) return false
  if (typeof lan.autoStart === 'boolean') return lan.autoStart
  return Boolean(lan.eingerichtet || lan.zuletztAn)
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
    gesperrt: fehlversuche >= MAX_FEHLVERSUCHE,
    weitere: server ? weitereAdressen(aktuellerPort) : [],
    tailscale: server ? tailscaleAdressen(aktuellerPort) : null
  }
}

/*
 * ---------- Aufrufe aus der iPad-App (30.09.2026) ----------
 *
 * Die iPad-App kann ihre KI-Aufrufe an diesen PC weiterreichen („Abo über den PC",
 * mobil/pcKi.ts). Ihre Seite kommt aber nicht von hier, sondern von capacitor://localhost –
 * für den Browser eine fremde Herkunft. Ohne CORS-Freigabe verwirft der WKWebView jede
 * Antwort. Freigegeben werden NUR die Herkünfte der App (und localhost für die Prüfungen);
 * eine beliebige Webseite im Netz bekommt keine Freigabe. Die Anmeldung per PIN mit Sperre
 * nach zehn Fehlversuchen gilt unverändert – CORS ersetzt sie nicht.
 */
export const erlaubteHerkunft = (herkunft: string): boolean =>
  /^(capacitor|ionic):\/\/localhost$/.test(herkunft) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(herkunft)

/**
 * Lebenszeichen während einer langen Anfrage.
 *
 * Eine KI-Anfrage dauert Minuten. Solange keine Antwort kommt, fließt kein einziges Byte – und
 * Mobilfunk, Router und iOS kappen stille Verbindungen (iOS nach 60 s ohne Daten). Deshalb
 * geht während des Wartens alle 15 s ein Leerzeichen hinaus: vor JSON erlaubt und bedeutungslos.
 */
export const PULS_MS = 15_000

/*
 * ---------- Aufträge der iPad-App (30.09.2026, services/lanAuftraege.ts) ----------
 *
 * Das Register lebt so lange wie das Programm – NICHT nur so lange wie der Netzzugang: Wird
 * der Zugang aus- und wieder eingeschaltet, laufen die Aufträge im Hauptprozess ja weiter.
 */
export const auftragsRegister = new AuftragsRegister()

/** Die Kennung eines Auftrags dort einsetzen, wo der Aufruf sie erwartet (Fortschritt, Warteplatz, Abbruch) */
export function kennzeichneAuftrag(kanal: string, args: unknown[], id: string): unknown[] {
  const kennung = kennungDesAuftrags(id)
  if (kanal === 'ai:structured') {
    const req = args[0] as Record<string, unknown> | undefined
    return req && typeof req === 'object' ? [{ ...req, progressId: kennung }, ...args.slice(1)] : args
  }
  if (kanal === 'ai:image' || kanal === 'ai:websuche') return [args[0], kennung, ...args.slice(2)]
  return args
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
  /*
   * Ein Auftrag aus dem Register: Stand festhalten (das Gerät holt ihn nach einer Unterbrechung
   * ab) und an jede Anmeldung desselben Geräts schicken – nach einem Neustart der App ist das
   * eine andere als beim Start des Auftrags. Kennung dort: „auftrag:<ID>".
   */
  if (id.startsWith(AUFTRAG_VORSATZ)) {
    const auftrag = id.slice(AUFTRAG_VORSATZ.length)
    const geraet = auftragsRegister.ereignis(auftrag, kanal, wert)
    if (geraet && NETZ_EREIGNISSE.includes(kanal)) {
      for (const s of tokens.values())
        if (s.geraete.has(geraet))
          zustellen(s, kanal, {
            ...(wert as object),
            id: `auftrag:${auftrag}`
          })
    }
    return true
  }
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

interface AuftragsKoerper {
  id?: unknown
  channel?: unknown
  args?: unknown
  warteMs?: unknown
}

/**
 * Die Endpunkte des Auftragsregisters (alle POST mit JSON, nur angemeldet und mit Gerätekennung):
 *  - /auftrag/starten    { id, channel, args } → Stand (idempotent: dieselbe ID = derselbe Auftrag)
 *  - /auftrag/abfragen   { id, warteMs }       → Stand nach höchstens 25 s (Long-Poll); fertig mit Ergebnis
 *  - /auftrag/liste      {}                    → alle Aufträge dieses Geräts (ohne Ergebnisse)
 *  - /auftrag/quittieren { id }                → Ergebnis abgeholt, Auftrag entfernt
 *  - /auftrag/abbrechen  { id }                → ausdrücklicher Abbruch
 * Ein unbekannter (oder fremder) Auftrag ergibt 404 – das Gerät startet ihn dann neu.
 */
async function auftragsEndpunkt(res: ServerResponse, aktion: string, geraet: string, koerper: AuftragsKoerper): Promise<void> {
  const reg = auftragsRegister
  if (aktion === 'liste') return json(res, 200, { auftraege: reg.liste(geraet) })
  const id = koerper.id
  if (!gueltigeAuftragsId(id)) return json(res, 400, { fehler: 'Ungültige Auftrags-ID.' })
  const antwort = (bild: ReturnType<AuftragsRegister['abfragen']>): void => {
    if (!bild) return json(res, 404, { fehler: 'Auftrag unbekannt.' })
    json(res, 200, {
      auftrag: 'wert' in bild ? { ...bild, wert: packen(bild.wert) } : bild
    })
  }

  if (aktion === 'starten') {
    const kanal = String(koerper.channel ?? '')
    if (!AUFTRAGS_KANAELE.includes(kanal) || !ERLAUBTE_KANAELE.includes(kanal)) {
      return json(res, 403, {
        fehler: `„${kanal}" lässt sich über das Netz nicht als Auftrag starten (Schul-Apps ${fassung()}).`
      })
    }
    if (!aufrufen) return json(res, 500, { fehler: 'Der Zugang ist nicht bereit.' })
    const ausfuehren = aufrufen
    const roh = Array.isArray(koerper.args) ? (koerper.args as unknown[]) : []
    const args = kennzeichneAuftrag(kanal, beschneide(kanal, roh.map(auspacken)), id)
    try {
      return antwort(reg.starte(geraet, id, kanal, () => ausfuehren(kanal, args)).bild)
    } catch (e) {
      if (e instanceof AuftragsFehler) return e.code === 'voll' ? json(res, 429, { fehler: e.message }) : json(res, 404, { fehler: 'Auftrag unbekannt.' })
      throw e
    }
  }
  if (aktion === 'abfragen') {
    // Geht die Verbindung weg, endet nur das Warten – der Auftrag selbst läuft weiter
    const steuerung = new AbortController()
    res.on('close', () => steuerung.abort())
    const ms = Math.max(0, Math.min(MAX_WARTEN_MS, Number(koerper.warteMs) || 0))
    const bild = await reg.warte(geraet, id, ms, steuerung.signal)
    if (res.writableEnded || res.destroyed) return
    return antwort(bild)
  }
  if (aktion === 'quittieren') return json(res, 200, { ok: reg.quittiere(geraet, id) })
  if (aktion === 'abbrechen') {
    const lief = reg.brichAb(geraet, id)
    if (lief && aufrufen) void aufrufen('ai:cancel', [kennungDesAuftrags(id)]).catch(() => undefined)
    return json(res, 200, { ok: lief })
  }
  return json(res, 404, { fehler: 'Unbekannter Aufruf.' })
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

        // Die iPad-App (siehe oben): Freigabe nur für ihre Herkunft
        const herkunft = String(req.headers.origin ?? '')
        const fremdErlaubt = Boolean(herkunft) && erlaubteHerkunft(herkunft)
        if (fremdErlaubt) {
          res.setHeader('access-control-allow-origin', herkunft)
          res.setHeader('vary', 'origin')
        }
        if (req.method === 'OPTIONS') {
          if (!fremdErlaubt) return void res.writeHead(403).end()
          res.writeHead(204, {
            'access-control-allow-methods': 'GET, POST',
            'access-control-allow-headers': 'content-type, x-schulapps-token, x-schulapps-geraet, last-event-id',
            'access-control-max-age': '600',
            // Chromium fragt vor Zugriffen ins private Netz eigens nach
            ...(req.headers['access-control-request-private-network'] ? { 'access-control-allow-private-network': 'true' } : {})
          })
          return void res.end()
        }

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
          tokens.set(neu, { kennung: randomBytes(6).toString('hex'), geraete: new Set(), stroeme: new Set(), puffer: [], nr: 0 })
          fehlversuche = 0
          // Die Adresse für unterwegs: Die iPad-App merkt sie sich (die Tailscale-IP erreicht sie nicht)
          const ts = tailscaleAdressen(aktuellerPort)
          return json(res, 200, {
            token: neu,
            ...(ts?.adresse ? { tailscale: ts.adresse } : {})
          })
        }

        // Die Gerätekennung der iPad-App: Fortschritt ihrer Aufträge geht an jede ihrer Anmeldungen
        const geraet = req.headers['x-schulapps-geraet']
        const merkeGeraet = (s: Sitzung): void => {
          if (gueltigesGeraet(geraet)) s.geraete.add(geraet)
        }

        if (req.method === 'GET' && url.pathname === '/ereignisse') {
          // Dieselbe Anmeldung wie für jeden Aufruf – ohne sie gibt es keinen Strom
          const sitzung = typeof token === 'string' ? tokens.get(token) : undefined
          if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' })
          merkeGeraet(sitzung)
          return oeffneStrom(req, res, sitzung)
        }

        if (req.method === 'POST' && url.pathname.startsWith('/auftrag/')) {
          const sitzung = typeof token === 'string' ? tokens.get(token) : undefined
          if (!sitzung) return json(res, 401, { fehler: 'Nicht angemeldet.' })
          if (!gueltigesGeraet(geraet)) return json(res, 400, { fehler: 'Gerätekennung fehlt.' })
          merkeGeraet(sitzung)
          const koerper = JSON.parse((await leseKoerper(req)) || '{}') as AuftragsKoerper
          return await auftragsEndpunkt(res, url.pathname.slice('/auftrag/'.length), geraet, koerper)
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
          const ausfuehren = aufrufen
          const args = kennzeichne(kanal, beschneide(kanal, (koerper.args ?? []).map(auspacken)), sitzung.kennung)
          // Ab hier steht die Antwort fest auf 200 (Fehler stecken im JSON) – so können Lebenszeichen vorausgehen
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          const puls = setInterval(() => res.write(' '), PULS_MS)
          /*
           * Verbindung verloren (WLAN weg, iPad im Ruhezustand): Bis 30.09.2026 wurde die
           * KI-Anfrage dann abgebrochen. Seitdem nicht mehr – nur ein ausdrücklicher Abbruch
           * (ai:cancel) beendet sie. Die iPad-App holt Ergebnisse über das Auftragsregister ab
           * (/auftrag/…, siehe auftragsEndpunkt), auch nach einer Unterbrechung.
           */
          res.on('close', () => clearInterval(puls))
          try {
            const wert = await ausfuehren(kanal, args)
            res.end(JSON.stringify({ ok: true, value: packen(wert) }))
          } catch (e) {
            res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }))
          } finally {
            clearInterval(puls)
          }
          return
        }

        if (req.method === 'GET' && url.pathname === '/gesundheit') return json(res, 200, { name: 'Schul-Apps', laeuft: true, fassung: fassung() })

        if (req.method === 'GET') return datei(res, opts.wurzel, decodeURIComponent(url.pathname))
        res.writeHead(405).end('nicht erlaubt')
      } catch (e) {
        json(res, 500, { fehler: e instanceof Error ? e.message : String(e) })
      }
    })
    /*
     * Lange Anfragen der iPad-App kommen oft mit Pausen: Hielte der Server eine ruhende
     * Verbindung nur die üblichen 5 s offen, müsste jede Anfrage über Tailscale erst eine neue
     * aufbauen – oder träfe auf eine, die der Server gerade schließt, und scheiterte sofort.
     */
    s.keepAliveTimeout = 65_000
    s.headersTimeout = 70_000
    /*
     * Ist der Port belegt, wird er zuerst ein paar Mal erneut versucht, erst dann der nächste –
     * bis zu zehn weitere.
     *
     * Belegt sein kann er leicht: ein anderes Programm, oder ein Rest des eigenen Servers,
     * den Windows noch nicht freigegeben hat (vor allem beim Neustart des Programms). Der Port
     * soll dabei STABIL bleiben: Auf ihn zeigen die Adresse im iPad und die Freigabe in der
     * Windows-Firewall. Ein anderer Port wird nur genommen, wenn es nicht anders geht – die
     * Einstellungen sagen es dann deutlich (NetzwerkCard). Ohne diesen Ausweg bliebe nur eine
     * Fehlermeldung mit „EADDRINUSE", mit der niemand etwas anfangen kann.
     */
    let versuch = 0
    let geduld = 0
    const binden = (port: number): void => {
      s.listen(port, '0.0.0.0', () => {
        server = s
        // Bei Port 0 (nur in den Tests) wählt das System – maßgeblich ist der tatsächliche
        aktuellerPort = (s.address() as AddressInfo | null)?.port ?? port
        herzschlag = setInterval(() => {
          for (const sitzung of tokens.values()) for (const res of sitzung.stroeme) res.write(': puls\n\n')
        }, HERZSCHLAG_MS)
        herzschlag.unref?.()
        frageMagicDns()
        ok(lanStatus())
      })
    }
    s.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE' && versuch === 0 && geduld < WUNSCHPORT_GEDULD && opts.port !== 0) {
        geduld++
        s.removeAllListeners('listening')
        setTimeout(() => binden(opts.port), 700)
        return
      }
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
