/**
 * Zugriff auf den gemeinsamen Operatoren-Bestand (Großprogramm 0.4, Aufräumen D3).
 *
 * `anlageFuer` liefert die amtliche Liste eines Landes für ein Fach als Klausur-Anlage.
 * Grundsatz der Lehrkraft (27.09.2026): „Immer nur die amtlichen Listen des Landes" – deshalb
 * zählen nur Listen, die aus einem Dokument DES LANDES stammen (`belegt: 'volltext'`). Listen,
 * bei denen das Land nur auf KMK/IQB/EPA verweist, und der KMK-Grundstock bleiben außen vor.
 */
import type { BestandsListe, LandesBestand, Listensprache, OperatorDefinition, Operatorenliste } from './typen'

const dateien = import.meta.glob<LandesBestand>('./daten/*.json', { eager: true, import: 'default' })

export const BESTAND: Record<string, LandesBestand> = Object.fromEntries(Object.values(dateien).map((d) => [d.stateId, d]))

/** Länder mit mindestens einer Liste im Bestand (ohne den KMK-Grundstock) */
export const laenderImBestand = (): string[] =>
  Object.keys(BESTAND)
    .filter((l) => l !== 'KMK')
    .sort()

export interface AnlageWunsch {
  stufe?: 'sek1' | 'sek2'
  /** Sprache der Arbeit: bei Fremdsprachen die Zielsprache, bei bilingualem Sachfach 'en' */
  sprache?: Listensprache
}

/** Alle belegten Listen eines Landes für ein Fach, in der gewünschten Sprache und Stufe (Sek II als Rückfall) */
export function listenFuer(stateId: string, fach: string, wunsch: AnlageWunsch = {}): BestandsListe[] {
  const alle = (BESTAND[stateId]?.listen ?? []).filter((l) => l.belegt === 'volltext' && l.faecher.includes(fach))
  const inSprache = wunsch.sprache ? alle.filter((l) => l.sprache === wunsch.sprache) : alle
  const kandidaten = inSprache.length ? inSprache : alle.filter((l) => l.sprache === 'de')
  const stufe = wunsch.stufe ?? 'sek2'
  const passend = kandidaten.filter((l) => l.stufe === stufe)
  return passend.length ? passend : kandidaten.filter((l) => l.stufe === 'sek2')
}

/**
 * Die Listen zu einer Anlage zusammengeführt. Ein Land veröffentlicht oft je Kompetenzbereich
 * oder je Fach eine eigene Tabelle; auf der Klausur erscheint EINE Anlage, die Fundstellen
 * werden alle genannt. Doppelte Einträge (gleicher Operator, gleicher Bereich, gleiche
 * Erläuterung) erscheinen einmal.
 */
export function anlageFuer(stateId: string, fach: string, wunsch: AnlageWunsch = {}): Operatorenliste | null {
  const listen = listenFuer(stateId, fach, wunsch)
  if (!listen.length) return null
  const operatoren: OperatorDefinition[] = []
  const gesehen = new Set<string>()
  for (const l of listen)
    for (const o of l.operatoren) {
      const k = `${o.operator.toLowerCase()}|${o.kompetenzbereich ?? ''}|${o.definition}`
      if (gesehen.has(k)) continue
      gesehen.add(k)
      operatoren.push(o)
    }
  const quellen = [...new Set(listen.map((l) => l.quelle))]
  return { sprache: listen[0].sprache, quelle: quellen.join('; '), operatoren }
}
