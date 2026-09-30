/**
 * KI-Aufträge im API-Modus, während die iPad-App im Hintergrund ist (30.09.2026).
 *
 * Wunsch der Lehrkraft: „Aufträge zur Generierung sollen nicht abbrechen, wenn man die App auf
 * dem Tablet minimiert oder ausblendet."
 *
 * WAS iOS ZULÄSST – ehrlich:
 *  - Mit „Abo über den PC" rechnet der PC. Der Auftrag läuft dort weiter, egal was das iPad tut;
 *    zurück im Vordergrund holt die App das Ergebnis sofort ab (mobil/pcKi.ts, Auftragsregister).
 *  - Im API-Modus rechnet der Anbieter, aber die ANFRAGE hängt an der App. iOS hält die WebView
 *    im Hintergrund an. Eine App kann dafür nur um etwas Zeit bitten
 *    (UIApplication.beginBackgroundTask, plugins/schulapps-nativ, Hintergrund): etwa 30 Sekunden,
 *    danach entscheidet iOS. Ob die WebView in dieser Zeit weiterläuft, bestimmt ebenfalls iOS.
 *    `fetch(…, { keepalive: true })` hilft hier nicht: Es gilt nur für kleine Anfragen beim
 *    Verlassen einer Seite und liefert keine Antwort zurück.
 *  - Bricht eine Anfrage deshalb ab, wird sie nach der Rückkehr in den Vordergrund automatisch
 *    wiederholt (höchstens zweimal); die Auftragsleiste sagt es („ai:verbindung": wiederholt).
 *    Das kostet die Anfrage ein zweites Mal – der Preis dafür, dass nichts verloren geht.
 */
import { istAbbruch } from '@shared/abbruch'

/** Diese Aufrufe sind lang und werden geschützt */
export const GESCHUETZTE_KANAELE: readonly string[] = ['ai:structured', 'ai:image', 'ai:websuche', 'audio:speak']
/** Höchstens so oft wird eine Anfrage nach der Rückkehr wiederholt */
export const MAX_WIEDERHOLUNGEN = 2

export interface HintergrundOptionen {
  /** Native Hintergrundzeit anfordern; liefert eine Kennung oder null (nicht möglich) */
  beginnen: () => Promise<string | null>
  beenden: (id: string) => Promise<void>
  /** Ereignis an die Oberfläche (bus.emit) */
  emit: (kanal: string, wert: unknown) => void
}

export interface HintergrundSchutz {
  /** Den Aufruf ausführen; bricht er ab, während die App im Hintergrund war, nach der Rückkehr wiederholen */
  schuetze<T>(kanal: string, args: unknown[], ausfuehren: () => Promise<T>): Promise<T>
  /** Die App ist in den Vorder- (true) bzw. Hintergrund (false) gewechselt */
  vordergrund(aktiv: boolean): void
}

/** Die Kennung einer Anfrage (Auftragsleiste) */
function kennung(kanal: string, args: unknown[]): string | null {
  if (kanal === 'ai:structured') {
    const id = (args[0] as { progressId?: unknown } | undefined)?.progressId
    return typeof id === 'string' ? id : null
  }
  if (kanal === 'ai:image' || kanal === 'ai:websuche') return typeof args[1] === 'string' ? args[1] : null
  return null
}

export function erstelleHintergrundSchutz(o: HintergrundOptionen): HintergrundSchutz {
  let aktiv = true
  /** Läufe, die gerade beim Anbieter sind – `imHintergrund` merkt, ob die App zwischendurch weg war */
  const laeufe = new Set<{ imHintergrund: boolean }>()
  const wartend = new Set<() => void>()
  let zahl = 0
  let aufgabe: Promise<string | null> | null = null

  /** Hintergrundzeit anfordern, solange mindestens ein Lauf beim Anbieter ist */
  function halte(): void {
    if (zahl++ > 0) return
    aufgabe = o.beginnen().catch(() => null)
  }
  function loslassen(): void {
    if (--zahl > 0) return
    zahl = 0
    const a = aufgabe
    aufgabe = null
    void a?.then((id) => (id ? o.beenden(id).catch(() => undefined) : undefined))
  }

  const zurueck = (): Promise<void> =>
    aktiv
      ? Promise.resolve()
      : new Promise((ok) => {
          wartend.add(ok)
        })

  return {
    vordergrund(jetztAktiv) {
      aktiv = jetztAktiv
      if (!jetztAktiv) {
        for (const l of laeufe) l.imHintergrund = true
        return
      }
      for (const w of [...wartend]) w()
      wartend.clear()
    },
    async schuetze<T>(kanal: string, args: unknown[], ausfuehren: () => Promise<T>): Promise<T> {
      const id = kennung(kanal, args)
      let wiederholt = false
      for (let versuch = 0; ; versuch++) {
        const lauf = { imHintergrund: !aktiv }
        laeufe.add(lauf)
        halte()
        try {
          const wert = await ausfuehren()
          if (wiederholt && id) o.emit('ai:verbindung', { id, zustand: 'verbunden' })
          return wert
        } catch (e) {
          // Ein Abbruch der Lehrkraft bleibt ein Abbruch; ein Fehler im Vordergrund ist ein echter Fehler
          if (istAbbruch(e) || (!lauf.imHintergrund && aktiv) || versuch >= MAX_WIEDERHOLUNGEN) {
            if (wiederholt && id) o.emit('ai:verbindung', { id, zustand: 'verbunden' })
            throw e
          }
          wiederholt = true
          if (id) o.emit('ai:verbindung', { id, zustand: 'wiederholt' })
        } finally {
          laeufe.delete(lauf)
          loslassen()
        }
        await zurueck()
      }
    }
  }
}
