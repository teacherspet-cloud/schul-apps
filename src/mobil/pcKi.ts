/**
 * „Abo über den PC" – die iPad-App reicht KI-Aufrufe an Schul-Apps am PC weiter (30.09.2026).
 *
 * Wunsch der Lehrkraft: „Beim Einrichtungsassistenten kann ich für ChatGPT nur den API-Schlüssel
 * angeben, nicht den Abozugang." Den Abo-Zugang gibt es nur über die offiziellen Programme der
 * Anbieter (Codex, Claude Code …), und die laufen nur am PC (main/services/ai/cli.ts). Die
 * Anmeldedaten dieser Programme außerhalb von ihnen zu benutzen, verbieten die
 * Nutzungsbedingungen – das wird hier ausdrücklich NICHT nachgebaut.
 *
 * Stattdessen: Die App am PC nimmt die Anfrage über ihren Netzzugang an (services/lanServer.ts,
 * PIN, Erlaubnisliste) und erledigt sie mit IHREM Zugang – Abo oder API-Schlüssel. Das iPad
 * schickt nur den Auftrag und bekommt das Ergebnis. Erreichbar ist der PC im selben WLAN oder
 * von unterwegs über ein privates VPN wie Tailscale; ins Internet gestellt wird nichts.
 *
 * Was weitergereicht wird, wählt die Lehrkraft getrennt (Einstellungen › pcKi):
 *  - Texte:     ai:structured, ai:websuche (mit Fortschritt, Warteplatz, Abbruch)
 *  - Bilder:    ai:image
 *  - Hörtexte:  audio:voices, audio:speak, audio:preview – die fertige Hördatei wird auf dem
 *               iPad abgelegt, damit audio:read sie wie eine eigene Vertonung findet
 * ai:status wird zusammengesetzt: Was über den PC läuft, meldet der PC.
 */
import { AbbruchFehler, istAbbruch } from '@shared/abbruch'
import type { AiStatus, PcKiEinstellungen, PcKiTest, SubscriptionStatus, TtsResult } from '@shared/types'
import { AnmeldungAbgelaufen, netzVerbindung, type NetzVerbindung } from '../renderer/src/shared/netzVerbindung'

export const KANAELE_TEXTE = ['ai:structured', 'ai:websuche'] as const
export const KANAELE_BILDER = ['ai:image'] as const
export const KANAELE_HOERTEXTE = ['audio:voices', 'audio:speak', 'audio:preview'] as const

/** Voreinstellung des Netzzugangs am PC (main/umgebung.ts) */
const STANDARD_PORT = '8420'
/** Anmeldung, Test und Statusabfrage: länger wartet niemand auf eine Antwort, bevor es „nicht erreichbar" heißt */
const KURZ_MS = 8000
/** Wie lange ein erfolgreicher Erreichbarkeitstest (oder eine erfolgreiche Antwort) gilt */
const ERREICHBAR_MS = 20_000
/**
 * Höchstens so viele KI-Anfragen zugleich schickt das iPad los – so viele rechnet der PC ohnehin
 * (main/services/ai/kiPlaetze.ts). Grund (Messung 30.09.2026, tests/e2e/pc-ki-tempo.mjs): Jede
 * weitere Anfrage hielte eine der wenigen Verbindungen des WebViews zum PC fest (je Rechner nur
 * wenige, eine davon braucht der Ereignisstrom), während sie am PC nur wartet. Dahinter standen
 * dann die kurzen Aufrufe – Erreichbarkeit, Anmeldung, KI-Stand – bis in ihr Zeitlimit und
 * meldeten „PC nicht erreichbar", obwohl er rechnete; der KI-Stand fiel dabei auf die Werte des
 * iPads zurück (ohne Sparmodus = deutlich mehr Anfragen). Wer hier wartet, erscheint wie am PC
 * als „wartet auf freien Platz".
 */
export const GLEICHZEITIG = 3
/** So lange gilt ein gelesener KI-Stand des PCs, ohne erneut zu fragen */
const STAND_MS = 60_000

/**
 * Die eingegebene Adresse in die Form http://host:port bringen.
 *
 * Angenommen wird, was die Netz-Einstellungen am PC zeigen („http://192.168.1.24:8420"), aber
 * auch ohne http:// oder ohne Port. Jeder Rechnername und jede Adresse ist erlaubt – nicht nur
 * die üblichen Heimnetz-Bereiche: Tailscale vergibt 100.x-Adressen und Namen auf „.ts.net".
 */
export function pcAdresse(eingabe: string): string {
  let text = String(eingabe ?? '').trim()
  if (!text) throw new Error('Es ist noch keine Adresse des PCs eingetragen.')
  if (!/^[a-z]+:\/\//i.test(text)) text = `http://${text}`
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new Error(`„${eingabe}" ist keine gültige Adresse. Erwartet wird z. B. 192.168.1.24:8420.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Die Adresse muss mit http:// beginnen.')
  if (url.username || url.password) throw new Error('Die Adresse darf keine Zugangsdaten enthalten.')
  if (!url.port) url.port = STANDARD_PORT
  return `${url.protocol}//${url.host}`
}

/** Welche Gruppe ein Kanal gehört – oder null, wenn er nie weitergereicht wird */
export function gruppeVon(kanal: string): 'texte' | 'bilder' | 'hoertexte' | null {
  if ((KANAELE_TEXTE as readonly string[]).includes(kanal)) return 'texte'
  if ((KANAELE_BILDER as readonly string[]).includes(kanal)) return 'bilder'
  if ((KANAELE_HOERTEXTE as readonly string[]).includes(kanal)) return 'hoertexte'
  return null
}

/** Ist für diese Gruppe „über den PC" gewählt (und eine Adresse eingetragen)? */
export const ueberPc = (e: PcKiEinstellungen | undefined, gruppe: 'texte' | 'bilder' | 'hoertexte'): boolean => Boolean(e && e.adresse.trim() && e[gruppe])

/** Die Kennung einer Anfrage in ihren Argumenten (zum Abbrechen) */
function kennungIn(kanal: string, args: unknown[]): string | null {
  if (kanal === 'ai:structured') {
    const id = (args[0] as { progressId?: unknown } | undefined)?.progressId
    return typeof id === 'string' ? id : null
  }
  if (kanal === 'ai:image' || kanal === 'ai:websuche') return typeof args[1] === 'string' ? args[1] : null
  return null
}

export const NICHT_ERREICHBAR = (adresse: string): string =>
  `PC nicht erreichbar (${adresse}) – läuft Schul-Apps am PC mit eingeschaltetem Netzzugang (Einstellungen › Netzwerk)? iPad und PC müssen im selben WLAN sein oder über Tailscale verbunden.`

export const VERBINDUNG_ABGERISSEN =
  'Die Verbindung zum PC ist während der Anfrage abgerissen (WLAN oder Mobilfunk unterbrochen, iPad im Ruhezustand oder Schul-Apps am PC beendet). Der Auftrag lässt sich erneut starten.'

/** Netzfehler in eine verständliche Meldung übersetzen; Abbrüche und Meldungen des PCs bleiben, wie sie sind */
function verstaendlich(e: unknown, adresse: string, seitMs: number): Error {
  if (istAbbruch(e)) return e instanceof Error ? e : new AbbruchFehler()
  if (e instanceof SyntaxError) return new Error(`Unter ${adresse} antwortet kein Schul-Apps. Stimmen Adresse und Port (wie in den Netz-Einstellungen am PC)?`)
  // fetch meldet jedes Netzproblem als TypeError („Load failed", „Failed to fetch", „NetworkError …")
  if (e instanceof TypeError || (e instanceof Error && /load failed|failed to fetch|networkerror|network connection/i.test(e.message))) {
    return new Error(seitMs > 15_000 ? VERBINDUNG_ABGERISSEN : NICHT_ERREICHBAR(adresse))
  }
  return e instanceof Error ? e : new Error(String(e))
}

/** fetch mit Zeitlimit – ein nicht erreichbarer PC hängt sonst über eine Minute */
function mitFrist(abruf: typeof fetch, ms: number): typeof fetch {
  return (input, init = {}) => {
    const steuerung = new AbortController()
    const frist = setTimeout(() => steuerung.abort(), ms)
    init.signal?.addEventListener('abort', () => steuerung.abort(), { once: true })
    return abruf(input, { ...init, signal: steuerung.signal })
      .catch((e: unknown) => {
        // Die Frist ist abgelaufen – das ist „nicht erreichbar", kein Abbruch durch die Lehrkraft
        if (steuerung.signal.aborted && !init.signal?.aborted) throw new TypeError('Failed to fetch (Zeitlimit)')
        throw e
      })
      .finally(() => clearTimeout(frist))
  }
}

export interface PcKiOptionen {
  /** Die aktuellen Einstellungen (getSettings().pcKi) */
  einstellungen: () => PcKiEinstellungen | undefined
  /** Denselben Aufruf auf dem iPad selbst ausführen */
  lokal: (kanal: string, args: unknown[]) => Promise<unknown>
  /** Ereignis an die Oberfläche (bus.emit) */
  emit: (kanal: string, wert: unknown) => void
  /** Eine am PC vertonte Hördatei auf dem iPad ablegen (audio:read findet sie dann) */
  hoerdateiAblegen?: (ergebnis: TtsResult) => void
  /** Anderes fetch (Tests) */
  abruf?: typeof fetch
  /**
   * Zuletzt gelesener KI-Stand des PCs, über Neustarts gemerkt (iPad: localStorage). Damit
   * stimmen Sparmodus und Modell sofort – auch bevor der PC geantwortet hat oder wenn er
   * gerade nicht erreichbar ist.
   */
  standSpeicher?: { lies(): { basis: string; wert: AiStatus } | null; schreibe(stand: { basis: string; wert: AiStatus }): void }
}

export interface PcKi {
  /** Den Aufruf am PC ausführen, falls er dorthin gehört – sonst null (dann lokal) */
  weiterleiten(kanal: string, args: unknown[]): Promise<unknown> | null
  /** „Verbindung testen": anmelden, KI-Zugang und Abo-Stand des PCs lesen */
  testen(adresse: string, pin: string): Promise<PcKiTest>
  /** Verbindung schließen (Tests) */
  beenden(): void
  /** Verbindung, Anmeldung und KI-Stand im Voraus herstellen (App-Start, Rückkehr in den Vordergrund) */
  vorwaermen(): void
}

export function erstellePcKi(o: PcKiOptionen): PcKi {
  const abruf = (...a: Parameters<typeof fetch>): Promise<Response> => (o.abruf ?? fetch)(...a)
  let verbindung: NetzVerbindung | null = null
  let fuer = ''
  let token = ''
  let erreichbarBis = 0
  /**
   * Eine PIN, die der PC abgelehnt hat. Mit ihr wird es nicht still weiter versucht: Nach zehn
   * Fehlversuchen sperrt der PC den Zugang – eine veraltete PIN in den Einstellungen des iPads
   * hätte ihn sonst mit jeder Statusabfrage ein Stück weiter zugesperrt.
   */
  let abgelehntePin = ''
  /** Laufende Anfragen am PC: Kennung → lokaler Abbruch */
  const laufend = new Map<string, AbortController>()
  /** KI-Anfragen, die gerade beim PC sind, und die, die auf einen Platz warten */
  let unterwegs = 0
  const warteschlange: (() => void)[] = []
  /** Zuletzt gelesener KI-Stand des PCs */
  let stand: { basis: string; wert: AiStatus; zeit: number } | null = null
  let standHolen: Promise<AiStatus | null> | null = null
  /** HTTP-Anfragen, die gerade beim PC sind (auch kurze) */
  let imFlug = 0
  /** Eine laufende Anmeldung – parallele Aufträge teilen sie, statt je eine eigene Sitzung am PC zu eröffnen */
  let anmeldung: Promise<void> | null = null

  /** Die Verbindung zur eingestellten Adresse – bei geänderter Adresse neu */
  function holeVerbindung(basis: string): NetzVerbindung {
    if (verbindung && fuer === basis) return verbindung
    verbindung?.beenden()
    token = ''
    erreichbarBis = 0
    fuer = basis
    verbindung = netzVerbindung({
      basis,
      // Nur im Speicher: Nach einem Neustart meldet sich die App mit der gespeicherten PIN neu an
      speicher: { lies: () => token, schreibe: (t) => void (token = t), loesche: () => void (token = '') },
      abruf
    })
    // Fortschritt und Warteplatz der eigenen Anfragen – der PC schickt sie mit der Kennung des iPads zurück
    verbindung.horche('ai:progress', (wert) => o.emit('ai:progress', wert))
    verbindung.horche('ai:platz', (wert) => o.emit('ai:platz', wert))
    return verbindung
  }

  function schliessen(): void {
    verbindung?.beenden()
    verbindung = null
    fuer = ''
    token = ''
  }

  /** Kurzer Test vor einer langen Anfrage: Antwortet der PC überhaupt? */
  async function pruefeErreichbar(basis: string): Promise<{ fassung: string }> {
    const res = await mitFrist(abruf, KURZ_MS)(`${basis}/gesundheit`, { cache: 'no-store' })
    const daten = (await res.json()) as { name?: string; fassung?: string }
    if (daten.name !== 'Schul-Apps') throw new SyntaxError('kein Schul-Apps')
    erreichbarBis = Date.now() + ERREICHBAR_MS
    return { fassung: String(daten.fassung ?? '') }
  }

  function anmelden(v: NetzVerbindung, pin: string): Promise<void> {
    if (anmeldung) return anmeldung
    anmeldung = anmeldenEinmal(v, pin).finally(() => {
      anmeldung = null
    })
    return anmeldung
  }

  async function anmeldenEinmal(v: NetzVerbindung, pin: string): Promise<void> {
    if (!/^\d{6}$/.test(pin)) throw new Error('Die PIN hat sechs Ziffern – sie steht am PC unter Einstellungen › Netzwerk.')
    if (pin === abgelehntePin) throw new Error('Der PC hat die PIN abgelehnt. Die aktuelle PIN steht am PC unter Einstellungen › Netzwerk; nach dem Eintragen „Verbindung testen" wählen.')
    const steuerung = new AbortController()
    const frist = setTimeout(() => steuerung.abort(), KURZ_MS)
    try {
      await v.anmelden(pin, steuerung.signal)
    } catch (e) {
      if (steuerung.signal.aborted) throw new TypeError('Failed to fetch (Zeitlimit)')
      // Der PC hat geantwortet und abgelehnt – die Meldung des PCs („Falsche PIN. Noch 9 Versuche.") bleibt stehen
      if (!(e instanceof TypeError) && !(e instanceof SyntaxError)) abgelehntePin = pin
      throw e
    } finally {
      clearTimeout(frist)
    }
  }

  /** Ein Aufruf am PC: erreichbar? angemeldet? – und bei abgelaufener Anmeldung einmal neu anmelden */
  async function amPc<T>(e: PcKiEinstellungen, kanal: string, args: unknown[], signal?: AbortSignal, kurz = false): Promise<T> {
    const basis = pcAdresse(e.adresse)
    const beginn = Date.now()
    try {
      const v = holeVerbindung(basis)
      // Solange andere Anfragen beim PC laufen, ist er erreichbar – kein Test, der sich hinter ihnen anstellen müsste
      if (Date.now() > erreichbarBis && imFlug === 0) await pruefeErreichbar(basis)
      if (v.abgemeldet()) await anmelden(v, e.pin)
      const einmal = async (): Promise<T> => {
        imFlug++
        try {
          return await roh()
        } finally {
          imFlug--
        }
      }
      const roh = (): Promise<T> => {
        if (!kurz) return v.aufruf<T>(kanal, args, signal)
        // Kurze Aufrufe (Status) mit Zeitlimit über ein eigenes Signal; das Ende der Frist heißt „nicht erreichbar", nicht „abgebrochen"
        const steuerung = new AbortController()
        const frist = setTimeout(() => steuerung.abort(), KURZ_MS)
        return v
          .aufruf<T>(kanal, args, steuerung.signal)
          .catch((err: unknown) => {
            throw steuerung.signal.aborted ? new TypeError('Failed to fetch (Zeitlimit)') : err
          })
          .finally(() => clearTimeout(frist))
      }
      const start = Date.now()
      try {
        const wert = await einmal()
        erreichbarBis = Date.now() + ERREICHBAR_MS
        return wert
      } catch (err) {
        if (err instanceof AnmeldungAbgelaufen) {
          // Der Netzzugang am PC wurde neu eingeschaltet – mit der gespeicherten PIN neu anmelden
          await anmelden(v, e.pin)
          return await einmal()
        }
        /*
         * Sofort gescheitert (eine alte, inzwischen tote Verbindung nach einem Neustart am PC oder
         * ein kurzer WLAN-Aussetzer): Die Anfrage kam nicht an. Einmal prüfen und neu versuchen.
         */
        if (err instanceof TypeError && Date.now() - start < 2000 && !signal?.aborted) {
          await pruefeErreichbar(basis)
          try {
            return await einmal()
          } catch (nochmal) {
            if (!(nochmal instanceof AnmeldungAbgelaufen)) throw nochmal
            await anmelden(v, e.pin)
            return await einmal()
          }
        }
        throw err
      }
    } catch (err) {
      if (signal?.aborted) throw new AbbruchFehler()
      erreichbarBis = 0
      throw verstaendlich(err, basis, Date.now() - beginn)
    }
  }

  /** Auf einen der Plätze warten (siehe GLEICHZEITIG); ein Abbruch nimmt die Anfrage aus der Schlange */
  function platz(id: string | null, signal: AbortSignal): Promise<void> {
    if (unterwegs < GLEICHZEITIG) {
      unterwegs++
      return Promise.resolve()
    }
    if (id) o.emit('ai:platz', { id, zustand: 'wartend', abgebrochen: 0, abgebrocheneBilder: 0 })
    return new Promise((los, weg) => {
      const dran = (): void => {
        signal.removeEventListener('abort', ab)
        unterwegs++
        los()
      }
      const ab = (): void => {
        const i = warteschlange.indexOf(dran)
        if (i >= 0) warteschlange.splice(i, 1)
        weg(new AbbruchFehler())
      }
      warteschlange.push(dran)
      signal.addEventListener('abort', ab, { once: true })
    })
  }

  function platzFrei(): void {
    unterwegs = Math.max(0, unterwegs - 1)
    warteschlange.shift()?.()
  }

  /** Eine lange Anfrage (KI, Vertonung) – abbrechbar über ihre Kennung */
  async function anfrage(e: PcKiEinstellungen, kanal: string, args: unknown[]): Promise<unknown> {
    const id = kennungIn(kanal, args)
    const steuerung = new AbortController()
    if (id) laufend.set(id, steuerung)
    // Nur KI-Anfragen belegen am PC einen Platz; Stimmen und Vertonung laufen nebenher
    const begrenzt = kanal.startsWith('ai:')
    try {
      if (begrenzt) await platz(id, steuerung.signal)
      try {
        const wert = await amPc<unknown>(e, kanal, args, steuerung.signal)
        if (kanal === 'audio:speak' && wert && typeof wert === 'object') o.hoerdateiAblegen?.(wert as TtsResult)
        return wert
      } finally {
        if (begrenzt) platzFrei()
      }
    } catch (err) {
      if (steuerung.signal.aborted) throw new AbbruchFehler()
      throw err
    } finally {
      if (id && laufend.get(id) === steuerung) laufend.delete(id)
    }
  }

  function merkeStand(basis: string, wert: AiStatus): void {
    stand = { basis, wert, zeit: Date.now() }
    try {
      o.standSpeicher?.schreibe({ basis, wert })
    } catch {
      // Merken ist Komfort – ohne geht es auch
    }
  }

  /** Den KI-Stand des PCs lesen und merken; null, wenn der PC gerade nicht antwortet */
  function holeStand(e: PcKiEinstellungen): Promise<AiStatus | null> {
    if (standHolen) return standHolen
    standHolen = (async () => {
      try {
        const wert = await amPc<AiStatus>(e, 'ai:status', [], undefined, true)
        merkeStand(pcAdresse(e.adresse), wert)
        return wert
      } catch {
        return null
      } finally {
        standHolen = null
      }
    })()
    return standHolen
  }

  /** Der zuletzt bekannte Stand für diese Adresse (im Speicher oder vom letzten Start) */
  function bekannterStand(basis: string): { wert: AiStatus; frisch: boolean } | null {
    if (stand?.basis === basis) return { wert: stand.wert, frisch: Date.now() - stand.zeit < STAND_MS }
    try {
      const gemerkt = o.standSpeicher?.lies()
      if (gemerkt?.basis === basis && gemerkt.wert) return { wert: gemerkt.wert, frisch: false }
    } catch {
      // nichts gemerkt
    }
    return null
  }

  /** ai:status: was über den PC läuft, meldet der PC; der Rest bleibt vom iPad */
  async function status(e: PcKiEinstellungen): Promise<AiStatus> {
    const hier = (await o.lokal('ai:status', [])) as AiStatus
    const texte = ueberPc(e, 'texte')
    const bilder = ueberPc(e, 'bilder')
    const hoertexte = ueberPc(e, 'hoertexte')
    let basis = ''
    try {
      basis = pcAdresse(e.adresse)
    } catch {
      basis = ''
    }
    /*
     * Ein frischer Stand gilt sofort. Ein älterer, gemerkter ebenfalls – er wird im Hintergrund
     * erneuert. Am PC kommt der KI-Stand in einer Millisekunde; müsste das iPad jedes Mal erst
     * über das Netz fragen, entschiede die Oberfläche womöglich vor der Antwort – mit den Werten
     * des iPads (ohne Sparmodus: ein Vielfaches an Anfragen, Messung 30.09.2026).
     */
    const bekannt = basis ? bekannterStand(basis) : null
    let pc: AiStatus | null
    if (bekannt) {
      pc = bekannt.wert
      if (!bekannt.frisch) void holeStand(e)
    } else {
      /*
       * Nichts bekannt und PC gerade nicht erreichbar (null): trotzdem als „eingerichtet"
       * melden. Sonst schickte die Oberfläche die Lehrkraft in die Einstellungen, obwohl dort
       * alles stimmt – die klare Meldung kommt beim ersten Auftrag.
       */
      pc = await holeStand(e)
    }
    return {
      ...hier,
      ...(texte
        ? pc
          ? { textProvider: pc.textProvider, textModel: pc.textModel, textAccess: pc.textAccess, hasTextKey: pc.hasTextKey, economy: pc.economy, textOptions: pc.textOptions }
          : { hasTextKey: true, textOptions: [] }
        : {}),
      ...(bilder
        ? pc
          ? { imageProvider: pc.imageProvider, imageModel: pc.imageModel, imageAccess: pc.imageAccess, hasImageKey: pc.hasImageKey }
          : { hasImageKey: true }
        : {}),
      ...(hoertexte ? { hasTts: pc ? pc.hasTts : true } : {})
    }
  }

  return {
    weiterleiten(kanal, args) {
      const e = o.einstellungen()
      const aktiv = ueberPc(e, 'texte') || ueberPc(e, 'bilder') || ueberPc(e, 'hoertexte')
      if (!aktiv) {
        // Ausgeschaltet: keinen Strom zum PC offen halten
        if (verbindung) schliessen()
        return null
      }
      if (kanal === 'ai:status') return status(e!)
      if (kanal === 'ai:cancel') {
        const id = typeof args[0] === 'string' ? args[0] : ''
        const steuerung = laufend.get(id)
        if (!steuerung) return null
        // Am PC abbrechen (spart dort Kontingent) und hier sofort als abgebrochen melden
        void amPc(e!, 'ai:cancel', [id], undefined, true).catch(() => undefined)
        steuerung.abort()
        laufend.delete(id)
        return Promise.resolve(undefined)
      }
      const gruppe = gruppeVon(kanal)
      if (!gruppe || !ueberPc(e, gruppe)) return null
      return anfrage(e!, kanal, args)
    },
    async testen(adresse, pin) {
      const basis = pcAdresse(adresse)
      const beginn = Date.now()
      try {
        const { fassung } = await pruefeErreichbar(basis)
        // Immer frisch anmelden: Der Test prüft auch die PIN
        const v = holeVerbindung(basis)
        token = ''
        abgelehntePin = ''
        // Mit genau DIESER PIN – nicht mit einer gerade laufenden Anmeldung der gespeicherten
        await anmeldenEinmal(v, String(pin ?? '').trim())
        const e: PcKiEinstellungen = { adresse: basis, pin: String(pin ?? '').trim(), texte: true, bilder: true, hoertexte: true }
        const status = await amPc<AiStatus>(e, 'ai:status', [], undefined, true)
        merkeStand(basis, status)
        let abo: SubscriptionStatus | null = null
        if (status.textAccess === 'subscription') {
          // Ältere Fassungen am PC geben diesen Aufruf nicht frei – dann ohne Anmeldestand
          abo = await amPc<SubscriptionStatus>(e, 'ai:subscription-status', [status.textProvider], undefined, true).catch(() => null)
        }
        return { adresse: basis, fassung, status, abo }
      } catch (err) {
        erreichbarBis = 0
        throw verstaendlich(err, basis, Date.now() - beginn)
      }
    },
    beenden: schliessen,
    vorwaermen() {
      const e = o.einstellungen()
      if (!(ueberPc(e, 'texte') || ueberPc(e, 'bilder') || ueberPc(e, 'hoertexte'))) return
      // Erreichbarkeit, Anmeldung, Ereignisstrom und KI-Stand stehen danach; Fehler meldet erst ein echter Auftrag
      void holeStand(e!)
    }
  }
}
