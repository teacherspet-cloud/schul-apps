/**
 * Fach einer Fachschafts-Freigabe (10.10.2026, Entscheidung der Lehrkraft).
 *
 * Bis dahin landete Material ohne erkanntes Fach unter „Allgemein" – und „Allgemein" sah JEDE Lehrkraft. So stand ein
 * Geschichtsblatt ohne Fachangabe plötzlich bei der Mathe-Fachschaft. Jetzt:
 *  - Fach aus dem Material (Fach-Kennung im Dokument oder in den Kennzahlen, Fachname, Vokabeltest über die Sprache).
 *  - Kein Fach erkannt: Die Freigabe fragt nach dem Fach (vorbelegt mit dem eigenen, wenn es genau eines ist). Ohne
 *    Antwort gibt der Server nicht frei (`fachNoetig`).
 *  - „Allgemein" (Altbestand) sehen nur Lehrkräfte ohne eigene Fächer – und natürlich die Besitzerin bzw. der Besitzer.
 *
 * Ohne Server und Oberfläche prüfbar (tests/fachschaftFach.test.ts).
 */
import { FAECHER } from './faecher'

export const ALLGEMEIN = 'allgemein'

/** Ein echtes Fach – „Anderes Fach …" ist keins (dann wird nachgefragt) */
const istFach = (id: unknown): id is string => typeof id === 'string' && id !== 'anderes' && FAECHER.some((f) => f.id === id)

/** Fach aus einem gespeicherten Dokument – null, wenn keins zu erkennen ist */
export function fachAusDokument(art: string, dok: Record<string, unknown>): string | null {
  const p = (dok.payload ?? {}) as { meta?: { subjectId?: unknown; subjectLabel?: unknown }; settings?: { targetLanguage?: unknown; subjectId?: unknown } }
  // Die Kennzahlen stehen in der Ablage oben im Eintrag (neben name/payload); `stats` als Rückfall für ältere Formen
  const stats = { ...((dok.stats ?? {}) as object), ...dok } as { subjectId?: unknown; subjectLabel?: unknown; language?: unknown }
  if (art === 'vokabeltest') {
    const sprache = p.settings?.targetLanguage ?? stats.language
    return FAECHER.find((f) => f.sprache && f.sprache === sprache)?.id ?? null
  }
  for (const id of [p.meta?.subjectId, stats.subjectId, p.settings?.subjectId]) if (istFach(id)) return id
  // Nur der Name des Fachs („Geschichte") – auch andere Bezeichnungen der Länder
  for (const label of [p.meta?.subjectLabel, stats.subjectLabel]) {
    if (typeof label !== 'string' || !label.trim()) continue
    const l = label.trim().toLocaleLowerCase('de')
    const f = FAECHER.find((x) => x.label.toLocaleLowerCase('de') === l || x.auch?.some((a) => a.toLocaleLowerCase('de') === l))
    if (f) return f.id
  }
  return null
}

/** Fach der Freigabe: aus dem Material, sonst das gewählte – fehlt beides, muss die Oberfläche nachfragen */
export function freigabeFach(art: string, dok: Record<string, unknown>, gewaehlt?: unknown): { fach: string } | { fachNoetig: true } {
  const erkannt = fachAusDokument(art, dok)
  if (erkannt) return { fach: erkannt }
  if (istFach(gewaehlt)) return { fach: gewaehlt }
  return { fachNoetig: true }
}

/** Darf eine Lehrkraft mit diesen Fächern die Freigabe sehen? Ohne Fächer alles; „Allgemein" nur ohne Fächer. */
export function freigabeSichtbar(fach: string, eigeneFaecher: readonly string[]): boolean {
  return !eigeneFaecher.length || eigeneFaecher.includes(fach)
}

/** Vorbelegung im Dialog: das eigene Fach, wenn es genau eines ist */
export function fachVorschlag(eigeneFaecher: readonly string[] | undefined): string | null {
  return eigeneFaecher?.length === 1 && istFach(eigeneFaecher[0]) ? eigeneFaecher[0] : null
}
