import { create } from 'zustand'

/**
 * Zwischenstände laufender Aufträge – die Live-Vorschau (02.10.2026).
 *
 * Wunsch der Lehrkraft: „live mitverfolgen, was gerade erstellt und platziert / verschoben /
 * geändert wird". Abgestimmt: Zwischenstände nach jedem Schritt (kein Tippen in Echtzeit), nur
 * zum Ansehen, neue und geänderte Bausteine leuchten kurz auf, dazu eine Laufzeile.
 *
 * Der Stand liegt NUR hier, nie im Dokument: Abgelegt wird weiterhin erst am Ende, als ein
 * Rückgängig-Schritt (`legeAb`). Ein eigener Speicher statt eines Feldes am Auftrag, damit
 * nicht jeder Zwischenstand die Auftragsleiste neu zeichnet.
 *
 * GEDROSSELT auf einen Stand je Sekunde und Auftrag – das Blatt wird bei jeder Änderung ganz
 * neu gemessen und umbrochen (`useSheetLayouts`). Was dazwischen kommt, ersetzt den wartenden
 * Stand; die Markierungen werden dabei gesammelt, damit kein Aufleuchten verloren geht.
 */

export interface Zwischenstand {
  /** Der Stand selbst – je Programm etwas anderes (Arbeitsblatt, Arbeit, Test …) */
  stand: unknown
  /** Kennungen der Bausteine, die mit diesem Stand neu oder geändert sind */
  markiert: string[]
  /** Laufzeile: was gerade geschehen ist („Teil 2 steht", „Überarbeitet: Aufgabe 3") */
  was?: string
  /** Zählt mit – die Vorschau startet das Aufleuchten für jeden neuen Stand */
  nr: number
}

interface ZwischenstandState {
  staende: Record<string, Zwischenstand>
}

export const useZwischenstaende = create<ZwischenstandState>(() => ({ staende: {} }))

/** Abstand zwischen zwei gezeigten Ständen eines Auftrags */
export const DROSSEL_MS = 1000

/** Bausteinartiges: alles mit `id` */
interface MitId {
  id: string
}

/**
 * Alle Bausteine eines Standes: jedes Objekt mit `id` in `blocks`- oder `elemente`-Listen, gleich
 * wie tief (Arbeitsblatt → sheets → blocks, Arbeit → parts → blocks, Tafelbild → tafeln → elemente).
 */
export function bausteineIn(stand: unknown): Map<string, string> {
  const out = new Map<string, string>()
  const gehe = (x: unknown): void => {
    if (!x || typeof x !== 'object') return
    if (Array.isArray(x)) {
      x.forEach(gehe)
      return
    }
    for (const [schluessel, wert] of Object.entries(x)) {
      if ((schluessel === 'blocks' || schluessel === 'elemente') && Array.isArray(wert)) {
        for (const b of wert) {
          if (b && typeof b === 'object' && typeof (b as MitId).id === 'string') {
            // Fassungsstände (versions) gehören zum Baustein, aber nicht in den Vergleich
            const { versions: _v, versionIndex: _i, warnings: _w, ...kern } = b as Record<string, unknown>
            out.set((b as MitId).id, JSON.stringify(kern))
          }
          gehe(b)
        }
      } else if (schluessel !== 'versions') gehe(wert)
    }
  }
  gehe(stand)
  return out
}

/** Neue und geänderte Bausteine zwischen zwei Ständen (Vergleich je Kennung) */
export function geaenderteBausteine(alt: unknown, neu: unknown): string[] {
  const vorher = bausteineIn(alt)
  return [...bausteineIn(neu)].filter(([id, inhalt]) => vorher.get(id) !== inhalt).map(([id]) => id)
}

/**
 * Melder für EINEN Auftrag: nimmt Stände an, zeigt höchstens einen je `DROSSEL_MS`.
 * `zeit`/`planen` nur für Tests austauschbar.
 */
export function zwischenstandsMelder(
  auftragId: string,
  uhr: { jetzt: () => number; planen: (fn: () => void, ms: number) => unknown; aufheben: (h: unknown) => void } = {
    jetzt: () => Date.now(),
    planen: (fn, ms) => setTimeout(fn, ms),
    aufheben: (h) => clearTimeout(h as ReturnType<typeof setTimeout>)
  }
): { zeige: (stand: unknown, hinweis?: { geaendert?: string[]; was?: string }) => void; ende: () => void } {
  let zuletzt = 0
  let nr = 0
  let gezeigt: unknown = null
  let wartend: { stand: unknown; markiert: Set<string>; was?: string } | null = null
  let geplant: unknown = null
  let vorbei = false

  const ausgeben = (): void => {
    geplant = null
    if (!wartend || vorbei) return
    const { stand, markiert, was } = wartend
    wartend = null
    zuletzt = uhr.jetzt()
    gezeigt = stand
    nr++
    useZwischenstaende.setState((s) => ({ staende: { ...s.staende, [auftragId]: { stand, markiert: [...markiert], was, nr } } }))
  }

  return {
    zeige: (stand, hinweis) => {
      if (vorbei) return
      // Kopie: Die Erzeugung arbeitet auf ihren Listen weiter und darf die Vorschau nicht verändern
      const kopie = structuredClone(stand)
      const markiert = new Set(wartend?.markiert ?? [])
      for (const id of hinweis?.geaendert ?? geaenderteBausteine(wartend?.stand ?? gezeigt, kopie)) markiert.add(id)
      wartend = { stand: kopie, markiert, was: hinweis?.was ?? wartend?.was }
      const warten = DROSSEL_MS - (uhr.jetzt() - zuletzt)
      if (warten <= 0) {
        if (geplant !== null) uhr.aufheben(geplant)
        ausgeben()
      } else if (geplant === null) geplant = uhr.planen(ausgeben, warten)
    },
    ende: () => {
      vorbei = true
      if (geplant !== null) uhr.aufheben(geplant)
      geplant = null
      wartend = null
      useZwischenstaende.setState((s) => {
        if (!(auftragId in s.staende)) return s
        const rest = { ...s.staende }
        delete rest[auftragId]
        return { staende: rest }
      })
    }
  }
}
