/**
 * Eine lange Anfrage (KI, Vertonung) über das Auftragsregister am PC – mit Wiederanknüpfen (30.09.2026).
 *
 * Wunsch der Lehrkraft: Bricht die Verbindung zwischen iPad und PC ab (WLAN-Wechsel, Tailscale
 * verbindet neu, App im Hintergrund), soll der Auftrag nicht verloren sein, sondern nahtlos
 * weiterlaufen. Das Register am PC (main/services/lanAuftraege.ts) hält ihn unabhängig von der
 * Verbindung; diese Datei ist die Seite des Geräts:
 *
 *  1. starten – mit einer ID, die das Gerät wählt. Dieselbe ID zweimal ist derselbe Auftrag.
 *  2. abfragen im Long-Poll (bis 20 s je Anfrage), bis er fertig ist.
 *  3. Reißt die Verbindung ab: NICHT neu senden, sondern mit wachsender Pause (1 s … 15 s)
 *     erneut abfragen – die Pause lässt sich wecken (App zurück im Vordergrund). Der Oberfläche
 *     wird „unterbrochen" bzw. „verbunden" gemeldet.
 *  4. Fertig: Ergebnis nehmen und quittieren – dann erst gibt der PC den Platz frei.
 *
 * Kennt der PC den Auftrag nicht (Programm am PC neu gestartet), wird er mit derselben ID neu
 * gestartet. Ein PC ohne Register (ältere Fassung) meldet `OhneAuftragsregister` – dann nimmt
 * der Aufrufer den gewöhnlichen Weg.
 */
import { AbbruchFehler } from '@shared/abbruch'
import { AnmeldungAbgelaufen, type NetzVerbindung } from './netzVerbindung'

/** So lange hält der PC eine Abfrage offen, bevor er „läuft noch" antwortet */
export const WARTE_MS = 20_000
/** Wie lange nach einer Unterbrechung weiter versucht wird, bevor der Auftrag als „unterbrochen" endet */
export const GEDULD_MS = 10 * 60_000

/**
 * Die Verbindung kam nie zustande oder ist zu lange weg. Der Auftrag kann am PC trotzdem laufen –
 * wer später dieselbe ID abfragt, bekommt das Ergebnis.
 */
export class AuftragUnterbrochen extends Error {
  constructor(message: string, readonly ursache: unknown, readonly angenommen: boolean) {
    super(message)
    this.name = 'AuftragUnterbrochen'
  }
}

export const VERBINDUNG_LANGE_WEG =
  'Die Verbindung zum PC ist seit über zehn Minuten unterbrochen. Der Auftrag läuft am PC weiter – „Erneut versuchen" holt das Ergebnis ab, sobald die Verbindung wieder steht.'

/** Lange Anfragen, die über das Register laufen (wie AUFTRAGS_KANAELE in main/services/lanAuftraege.ts) */
export const REGISTER_KANAELE: readonly string[] = ['ai:structured', 'ai:image', 'ai:websuche', 'audio:speak']

/** Die Kennung einer Anfrage in ihren Argumenten (Fortschritt, Warteplatz, Abbruch) */
export function kennungIn(kanal: string, args: unknown[]): string | null {
  if (kanal === 'ai:structured') {
    const id = (args[0] as { progressId?: unknown } | undefined)?.progressId
    return typeof id === 'string' ? id : null
  }
  if (kanal === 'ai:image' || kanal === 'ai:websuche') return typeof args[1] === 'string' ? args[1] : null
  return null
}

/** Ein Netzproblem (kein Fehler des PCs): fetch meldet es als TypeError, ein abgerissener Körper als SyntaxError */
export function istNetzfehler(e: unknown): boolean {
  if (e instanceof TypeError || e instanceof SyntaxError) return true
  return e instanceof Error && /load failed|failed to fetch|networkerror|network connection|zeitlimit|verbindung.*(abgerissen|unterbrochen)/i.test(e.message)
}

/** Eine Pause, die ein Abbruch beendet (dann wirft sie) */
export function pauseMitAbbruch(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((ok, fehler) => {
    if (signal.aborted) return fehler(new AbbruchFehler())
    const ab = (): void => {
      clearTimeout(t)
      fehler(new AbbruchFehler())
    }
    const t = setTimeout(() => {
      signal.removeEventListener('abort', ab)
      ok()
    }, ms)
    signal.addEventListener('abort', ab, { once: true })
  })
}

/** Ein Signal, das nach `ms` von selbst auslöst – das Ende der Frist ist ein Netzproblem, kein Abbruch */
async function mitFrist<T>(ms: number, signal: AbortSignal, fn: (s: AbortSignal) => Promise<T>): Promise<T> {
  const steuerung = new AbortController()
  const frist = setTimeout(() => steuerung.abort(), ms)
  const weiter = (): void => steuerung.abort()
  signal.addEventListener('abort', weiter, { once: true })
  try {
    return await fn(steuerung.signal)
  } catch (e) {
    if (signal.aborted) throw new AbbruchFehler()
    if (steuerung.signal.aborted) throw new TypeError('Failed to fetch (Zeitlimit)')
    throw e
  } finally {
    clearTimeout(frist)
    signal.removeEventListener('abort', weiter)
  }
}

export interface AuftragsLauf {
  v: NetzVerbindung
  id: string
  kanal: string
  args: unknown[]
  signal: AbortSignal
  /** Vor jedem Versuch: erreichbar? angemeldet? Netzprobleme als TypeError */
  bereit: () => Promise<void>
  /** Verbindung unterbrochen bzw. wieder da */
  zustand?: (z: 'unterbrochen' | 'verbunden') => void
  /** Nach jeder Antwort des PCs (er ist erreichbar) */
  lebt?: () => void
  /**
   * Letzter Fortschritt laut Register – kommt mit jeder Antwort. Wichtig nach einer
   * Unterbrechung: Der Ereignisstrom ist dann erst neu aufzubauen, der Stand steht aber schon da.
   */
  fortschritt?: (f: Record<string, unknown>) => void
  /** Pause vor dem nächsten Versuch – der Aufrufer kann sie wecken (App wieder im Vordergrund) */
  pause?: (ms: number, signal: AbortSignal) => Promise<void>
  geduldMs?: number
  /** Zeitlimit je Anfrage an den PC, zusätzlich zur Wartezeit des Long-Polls */
  fristMs?: number
  jetzt?: () => number
}

/** Führt den Auftrag aus und liefert sein Ergebnis – über Unterbrechungen hinweg */
export async function fuehreAuftragAus<T>(o: AuftragsLauf): Promise<T> {
  const jetzt = o.jetzt ?? Date.now
  const pause = o.pause ?? pauseMitAbbruch
  const frist = o.fristMs ?? 15_000
  const geduld = o.geduldMs ?? GEDULD_MS
  /** Hat der PC den Auftrag schon einmal bestätigt? Erst dann lohnt Warten statt Aufgeben. */
  let angenommen = false
  let gestartet = false
  let unterbrochenSeit = 0
  let warte = 1000
  let neuAngemeldet = 0
  let neuGestartet = 0
  /** Ein sofortiges Scheitern (eine alte, tote Verbindung nach einem Neustart am PC) wird einmal wiederholt */
  let schnellWiederholt = false
  let letzterFortschritt = ''

  for (;;) {
    if (o.signal.aborted) throw new AbbruchFehler()
    const versuch = jetzt()
    try {
      await o.bereit()
      const bild = gestartet
        ? await mitFrist(WARTE_MS + frist, o.signal, (s) => o.v.auftrag('abfragen', { id: o.id, warteMs: WARTE_MS }, s))
        : await mitFrist(frist, o.signal, (s) => o.v.auftrag('starten', { id: o.id, channel: o.kanal, args: o.args }, s))
      o.lebt?.()
      neuAngemeldet = 0
      if (unterbrochenSeit) {
        unterbrochenSeit = 0
        o.zustand?.('verbunden')
      }
      warte = 1000
      if (!bild) {
        // Der PC kennt den Auftrag nicht (dort neu gestartet): mit derselben ID erneut starten
        if (++neuGestartet > 3) throw new Error('Der PC hat den Auftrag verloren (Schul-Apps am PC neu gestartet?). Der Auftrag lässt sich erneut starten.')
        gestartet = false
        continue
      }
      gestartet = true
      angenommen = true
      if (bild.fortschritt && o.fortschritt) {
        const text = JSON.stringify(bild.fortschritt)
        if (text !== letzterFortschritt) {
          letzterFortschritt = text
          o.fortschritt(bild.fortschritt)
        }
      }
      if (bild.zustand === 'laeuft') continue
      // Ergebnis ist da: quittieren (nebenbei – gelingt es nicht, räumt der PC nach zwei Stunden selbst auf)
      void o.v.auftrag('quittieren', { id: o.id }).catch(() => undefined)
      if (bild.zustand === 'fertig') return bild.wert as T
      if (bild.zustand === 'abgebrochen') throw new AbbruchFehler()
      throw new Error(bild.fehler || 'Der Auftrag ist am PC fehlgeschlagen.')
    } catch (e) {
      if (o.signal.aborted) throw new AbbruchFehler()
      if (e instanceof AnmeldungAbgelaufen) {
        // Der Netzzugang am PC wurde neu eingeschaltet: `bereit` meldet neu an, die Aufträge bleiben
        if (++neuAngemeldet > 3) throw e
        continue
      }
      if (!istNetzfehler(e)) throw e
      // Nie angekommen: sofort melden (der PC ist nicht erreichbar) – ein erneuter Versuch findet den Auftrag über seine ID
      if (!angenommen && !schnellWiederholt && jetzt() - versuch < 2000) {
        schnellWiederholt = true
        continue
      }
      if (!angenommen) throw new AuftragUnterbrochen(e instanceof Error ? e.message : String(e), e, false)
      if (!unterbrochenSeit) {
        unterbrochenSeit = jetzt()
        o.zustand?.('unterbrochen')
      }
      if (jetzt() - unterbrochenSeit > geduld) throw new AuftragUnterbrochen(VERBINDUNG_LANGE_WEG, e, true)
      await pause(warte, o.signal)
      warte = Math.min(15_000, warte * 2)
    }
  }
}
