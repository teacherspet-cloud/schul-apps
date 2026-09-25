/**
 * Höchstens drei KI-Anfragen gleichzeitig – für ALLE Wege, und jede lässt sich abbrechen.
 *
 * Anlass (25.09.2026): Material entsteht jetzt im Hintergrund, auch mehrere Aufträge
 * nebeneinander. Bis dahin gab es eine Begrenzung nur im Abo-Weg (cli.ts, `slot()`); über
 * API-Schlüssel liefen beliebig viele Anfragen zugleich. Drei parallele Arbeitsblätter mit
 * je zwei Niveaustufen und Bildprüfung hätten so ein Dutzend Anfragen auf einmal abgesetzt
 * – das endet beim Anbieter in „429 – zu viele Anfragen", und zwar für alle Aufträge.
 *
 * Was hier mitzählt: Texte (`ai:structured`), Bilder (`ai:image`) und die Websuche
 * (`ai:websuche`). Entschieden, Bilder MITzuzählen: Im Abo-Weg startet jedes Bild dasselbe
 * Programm wie eine Textanfrage und zehrt am selben Kontingent; über Claude ist ein Bild
 * sogar eine Textanfrage (Vektorgrafik). Die Bildsuche im Netz (Openverse, OpenMoji) ist
 * keine KI und zählt nicht.
 *
 * Wer warten muss, steht in einer Warteschlange und wird der Reihe nach bedient. Die
 * Oberfläche erfährt über `melde`, ob eine Anfrage wartet oder läuft – so kann die
 * Auftragsleiste „wartet auf freien Platz" zeigen, statt einen stehenden Balken.
 *
 * Diese Datei kennt Electron nicht, damit sie sich ohne Programm prüfen lässt.
 */
import { AbbruchFehler } from '@shared/abbruch'

export type PlatzZustand = 'wartend' | 'laufend'

interface Wartender {
  id?: string
  los: () => void
  weg: (e: Error) => void
}

/** So lange merkt sich der Begrenzer einen Abbruch für eine Kennung, die noch nicht angekommen ist. */
const VORZEITIG_MS = 60_000

export class KiPlaetze {
  private laufend = 0
  private schlange: Wartender[] = []
  private steuerung = new Map<string, AbortController>()
  private vorzeitig = new Map<string, number>()

  constructor(
    readonly max: number,
    private melde?: (id: string, zustand: PlatzZustand) => void
  ) {}

  /** Laufende und wartende Anfragen (für Tests und Anzeige). */
  stand(): { laufend: number; wartend: number } {
    return { laufend: this.laufend, wartend: this.schlange.length }
  }

  /**
   * Führt `arbeit` aus, sobald ein Platz frei ist.
   *
   * Mit `id` lässt sich die Anfrage abbrechen (`abbrechen(id)`): wartend wird sie aus der
   * Schlange genommen, laufend bekommt `arbeit` das Signal. In beiden Fällen endet der Aufruf
   * mit `AbbruchFehler` – gleich, was der Anbieter dabei für einen Fehler wirft.
   */
  async platz<T>(id: string | undefined, arbeit: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const steuerung = new AbortController()
    if (id) {
      if (this.vorzeitig.has(id)) {
        this.vorzeitig.delete(id)
        throw new AbbruchFehler()
      }
      this.steuerung.set(id, steuerung)
    }
    try {
      if (this.laufend >= this.max) {
        if (id) this.melde?.(id, 'wartend')
        await new Promise<void>((los, weg) => {
          const eintrag: Wartender = { id, los, weg }
          this.schlange.push(eintrag)
          steuerung.signal.addEventListener('abort', () => {
            const i = this.schlange.indexOf(eintrag)
            if (i >= 0) this.schlange.splice(i, 1)
            weg(new AbbruchFehler())
          })
        })
      }
      this.laufend++
      if (id) this.melde?.(id, 'laufend')
      let lauf: Promise<T>
      try {
        lauf = arbeit(steuerung.signal)
      } catch (e) {
        lauf = Promise.reject(e)
      }
      // Der Platz wird erst frei, wenn die Arbeit wirklich endet – nicht schon beim Abbruch
      void lauf
        .catch(() => undefined)
        .then(() => {
          this.laufend--
          this.schlange.shift()?.los()
        })
      return await mitAbbruch(lauf, steuerung.signal)
    } finally {
      if (id && this.steuerung.get(id) === steuerung) this.steuerung.delete(id)
    }
  }

  /**
   * Bricht eine Anfrage ab. Liefert `false`, wenn sie (noch) nicht bekannt ist – dann wird
   * der Wunsch eine Weile gemerkt: Kommt die Anfrage doch noch an, endet sie sofort.
   */
  abbrechen(id: string): boolean {
    const s = this.steuerung.get(id)
    if (s) {
      s.abort()
      return true
    }
    const jetzt = Date.now()
    for (const [alt, zeit] of this.vorzeitig) if (jetzt - zeit > VORZEITIG_MS) this.vorzeitig.delete(alt)
    this.vorzeitig.set(id, jetzt)
    return false
  }
}

/**
 * Wartet auf `arbeit`, endet aber beim Abbruch sofort mit `AbbruchFehler`.
 *
 * Nicht jeder Weg reagiert auf das Signal (die Bild-KI von OpenAI etwa nimmt keines). Die
 * Anfrage läuft dann im Hintergrund zu Ende, ihr Ergebnis wird verworfen – der Platz bleibt
 * so lange belegt, denn so lange arbeitet der Anbieter tatsächlich.
 */
function mitAbbruch<T>(arbeit: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new AbbruchFehler())
  return new Promise<T>((ok, fehler) => {
    const beiAbbruch = (): void => fehler(new AbbruchFehler())
    signal.addEventListener('abort', beiAbbruch, { once: true })
    arbeit.then(
      (wert) => {
        signal.removeEventListener('abort', beiAbbruch)
        if (signal.aborted) fehler(new AbbruchFehler())
        else ok(wert)
      },
      (e) => {
        signal.removeEventListener('abort', beiAbbruch)
        fehler(signal.aborted ? new AbbruchFehler() : e)
      }
    )
  })
}
