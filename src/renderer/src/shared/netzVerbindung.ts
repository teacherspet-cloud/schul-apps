/**
 * Die Verbindung zum Netzzugang des PCs (main/services/lanServer.ts) – Anmeldung, Aufrufe, Ereignisstrom.
 *
 * Zwei Nutzer, eine Fassung (30.09.2026):
 *  - der Browser eines Tablets, der die Oberfläche vom PC lädt (shared/netzZugang.ts): Adresse
 *    ist die eigene Herkunft, die Anmeldung liegt im localStorage
 *  - die iPad-App mit „Abo über den PC" (mobil/pcKi.ts): Adresse aus den Einstellungen, die
 *    Anmeldung nur im Speicher; sie reicht KI-Aufrufe an den PC weiter
 *
 * Bewusst ohne Seiteneffekte beim Laden: Die iPad-App lädt diese Datei, BEVOR window.api steht.
 * netzZugang.ts hält dagegen beim Laden fest, ob window.api fehlt – dort wäre das falsch.
 */

/** Die Anmeldung gilt nicht mehr (Netzzugang am PC neu eingeschaltet, Programm neu gestartet) */
export class AnmeldungAbgelaufen extends Error {
  constructor() {
    super('Die Anmeldung ist abgelaufen. Bitte die PIN erneut eingeben.')
    this.name = 'AnmeldungAbgelaufen'
  }
}

/** Binärdaten kommen als Base64 – über HTTP gibt es keine Uint8Array. */
export function auspacken(wert: unknown): unknown {
  if (wert && typeof wert === 'object' && '__bytes' in (wert as Record<string, unknown>)) {
    const b64 = String((wert as { __bytes: string }).__bytes)
    const roh = atob(b64)
    const bytes = new Uint8Array(roh.length)
    for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i)
    return bytes
  }
  if (Array.isArray(wert)) return wert.map(auspacken)
  if (wert && typeof wert === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(wert as Record<string, unknown>)) out[k] = auspacken(v)
    return out
  }
  return wert
}

export function packen(wert: unknown): unknown {
  if (wert instanceof Uint8Array) {
    let s = ''
    for (const b of wert) s += String.fromCharCode(b)
    return { __bytes: btoa(s) }
  }
  if (Array.isArray(wert)) return wert.map(packen)
  if (wert && typeof wert === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(wert as Record<string, unknown>)) out[k] = packen(v)
    return out
  }
  return wert
}

/*
 * ---------- Ereignisse vom Rechner (Fortschritt, Warteplatz, Modellhinweise) ----------
 *
 * Am Rechner kommen sie über die Electron-Brücke. Über das Netz liest diese Datei einen Strom
 * vom Server (GET /ereignisse, Server-Sent Events). Warum dieser Weg und nicht Abfragen im
 * Takt oder EventSource, steht in main/services/lanServer.ts. Der Server schickt nur, was zu
 * Anfragen DIESES Geräts gehört oder alle angeht.
 */

/** Ein Ereignis aus dem Strom */
export interface StromEreignis {
  nr: string
  kanal: string
  wert: unknown
}

/**
 * Zerlegt gelesenen Text in Ereignisse; ein unvollständiger Rest bleibt für das nächste Stück.
 *
 * Ein Ereignis endet mit einer Leerzeile. Zeilen mit „:" am Anfang sind Herzschlag bzw.
 * Kommentar und tragen nichts. Der Text kann an JEDER Stelle abreißen – mitten in einer Zeile
 * oder zwischen „\n" und „\n" –, deshalb wird nur vollständig Abgeschlossenes ausgewertet.
 */
export function zerlegeStrom(text: string): { ereignisse: StromEreignis[]; rest: string } {
  const ereignisse: StromEreignis[] = []
  const bloecke = text.replace(/\r\n?/g, '\n').split('\n\n')
  const rest = bloecke.pop() ?? ''
  for (const block of bloecke) {
    let nr = ''
    const daten: string[] = []
    for (const zeile of block.split('\n')) {
      if (zeile.startsWith('id:')) nr = zeile.slice(3).trim()
      else if (zeile.startsWith('data:')) daten.push(zeile.slice(5).replace(/^ /, ''))
    }
    if (!daten.length) continue
    try {
      const { kanal, wert } = JSON.parse(daten.join('\n')) as { kanal?: string; wert?: unknown }
      if (typeof kanal === 'string') ereignisse.push({ nr, kanal, wert })
    } catch {
      // ein kaputtes Ereignis überspringen, der Strom geht weiter
    }
  }
  return { ereignisse, rest }
}

/** Kommt so lange gar nichts – auch kein Herzschlag (alle 15 s) –, gilt die Verbindung als tot. */
const STILLE_MS = 45_000

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface NetzVerbindungOptionen {
  /** Adresse des PCs ohne Schrägstrich am Ende, z. B. http://192.168.1.24:8420; '' = dieselbe Herkunft */
  basis: string
  /** Wo die Anmeldung (Token) liegt */
  speicher: { lies(): string; schreibe(token: string): void; loesche(): void }
  /** Anderes fetch (Tests); Vorgabe: das globale */
  abruf?: typeof fetch
}

export interface NetzVerbindung {
  /** Meldet das Gerät mit der PIN an; der Server gibt eine Kennung zurück. */
  anmelden(pin: string, signal?: AbortSignal): Promise<void>
  abgemeldet(): boolean
  /** Ein Aufruf am PC; 401 wirft `AnmeldungAbgelaufen` */
  aufruf<T>(channel: string, args: unknown[], signal?: AbortSignal): Promise<T>
  /** Hörer für ein Ereignis anmelden; der Strom startet mit dem ersten Hörer. */
  horche(kanal: string, cb: (wert: unknown) => void): () => void
  /** Strom schließen und nicht wieder öffnen */
  beenden(): void
}

export function netzVerbindung(o: NetzVerbindungOptionen): NetzVerbindung {
  const abruf = (...a: Parameters<typeof fetch>): Promise<Response> => (o.abruf ?? fetch)(...a)
  const hoerer = new Map<string, Set<(wert: unknown) => void>>()
  let stromLaeuft = false
  let beendet = false
  /** Der gerade offene Strom – nach einer neuen Anmeldung wird er mit dem neuen Token neu geöffnet */
  let stromSteuerung: AbortController | null = null
  /** Weckt den wartenden Strom, sobald eine Anmeldung da ist – sonst gingen die ersten Ereignisse verloren */
  let wecken: (() => void) | null = null
  const warteAufAnmeldung = (ms: number): Promise<void> =>
    new Promise((r) => {
      const t = setTimeout(r, ms)
      wecken = () => {
        clearTimeout(t)
        r()
      }
    })

  /**
   * Hält den Strom offen – solange die Seite lebt.
   *
   * Reißt er ab (WLAN weg, Tablet im Ruhezustand, Rechner neu gestartet), wird er mit
   * wachsender Pause (1 s bis 15 s) neu aufgebaut. Dabei nennt der Browser das zuletzt
   * erhaltene Ereignis (`last-event-id`); der Server liefert nach, was dazwischen kam – vor
   * allem „Platz frei", sonst stünde ein Auftrag für immer auf „wartet".
   * Ohne Anmeldung wird nichts geöffnet; der Server würde ohnehin ablehnen.
   */
  async function halteStrom(): Promise<void> {
    let letzte = ''
    let letzterToken = ''
    let warte = 1000
    while (!beendet) {
      const t = o.speicher.lies()
      if (!t) {
        await warteAufAnmeldung(2000)
        continue
      }
      // Neue Anmeldung = neue Sitzung am Server mit eigener Zählung
      if (t !== letzterToken) letzte = ''
      letzterToken = t
      const steuerung = new AbortController()
      stromSteuerung = steuerung
      let wache: ReturnType<typeof setTimeout> | undefined
      const lebt = (): void => {
        clearTimeout(wache)
        wache = setTimeout(() => steuerung.abort(), STILLE_MS)
      }
      try {
        lebt()
        const res = await abruf(`${o.basis}/ereignisse`, {
          headers: { 'x-schulapps-token': t, ...(letzte ? { 'last-event-id': letzte } : {}) },
          cache: 'no-store',
          signal: steuerung.signal
        })
        if (res.ok && res.body) {
          warte = 1000
          const leser = res.body.getReader()
          // `stream: true`: Ein Umlaut kann auf zwei Stücke verteilt ankommen
          const decoder = new TextDecoder()
          let puffer = ''
          for (;;) {
            const { done, value } = await leser.read()
            if (done) break
            lebt()
            puffer += decoder.decode(value, { stream: true })
            const { ereignisse, rest } = zerlegeStrom(puffer)
            puffer = rest
            for (const e of ereignisse) {
              if (e.nr) letzte = e.nr
              for (const cb of hoerer.get(e.kanal) ?? []) {
                try {
                  cb(e.wert)
                } catch {
                  // ein fehlerhafter Hörer hält die übrigen nicht auf
                }
              }
            }
          }
        } else if (res.status === 401) {
          // Abgemeldet (z. B. Zugang am Rechner neu eingeschaltet): kein neuer Strom, bis wieder eine PIN eingegeben ist
          letzte = ''
          await pause(5000)
        }
      } catch {
        // abgerissen oder zu lange still – unten neu verbinden
      } finally {
        clearTimeout(wache)
        steuerung.abort()
      }
      if (beendet) break
      await pause(warte)
      warte = Math.min(15_000, warte * 2)
    }
    stromLaeuft = false
  }

  return {
    async anmelden(pin, signal) {
      const res = await abruf(`${o.basis}/anmelden`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin }),
        signal
      })
      const daten = (await res.json()) as { token?: string; fehler?: string; verbleibend?: number }
      if (!res.ok || !daten.token) {
        throw new Error((daten.fehler ?? 'Die Anmeldung ist fehlgeschlagen.') + (typeof daten.verbleibend === 'number' ? ` Noch ${daten.verbleibend} Versuche.` : ''))
      }
      o.speicher.schreibe(daten.token)
      // Ein offener Strom gehört zur alten Anmeldung – Ereignisse der neuen kämen dort nie an
      stromSteuerung?.abort()
      wecken?.()
    },
    abgemeldet: () => !o.speicher.lies(),
    async aufruf<T>(channel: string, args: unknown[], signal?: AbortSignal): Promise<T> {
      const res = await abruf(`${o.basis}/api`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-schulapps-token': o.speicher.lies() },
        body: JSON.stringify({ channel, args: args.map(packen) }),
        signal
      })
      if (res.status === 401) {
        o.speicher.loesche()
        throw new AnmeldungAbgelaufen()
      }
      const daten = (await res.json()) as { ok?: boolean; value?: unknown; error?: string; fehler?: string }
      if (daten.fehler) throw new Error(daten.fehler)
      if (daten.ok === false) throw new Error(daten.error)
      return auspacken(daten.value) as T
    },
    horche(kanal, cb) {
      if (!hoerer.has(kanal)) hoerer.set(kanal, new Set())
      hoerer.get(kanal)!.add(cb)
      if (!stromLaeuft && !beendet && typeof fetch === 'function') {
        stromLaeuft = true
        void halteStrom()
      }
      return () => {
        hoerer.get(kanal)?.delete(cb)
      }
    },
    beenden() {
      beendet = true
      stromSteuerung?.abort()
      wecken?.()
    }
  }
}
