/**
 * Jahrgang, Landesausgabe und Schulform eines Lehrwerks (12.10.2026, Wunsch der Lehrkraft).
 *
 * Die Vokabellisten („Reihe und Ausgabe") kannten nur Reihe, Band, Verlag, Landesausgabe und Ausgabe – Jahrgang
 * (`grade`), Land (`stateId`) und Schulform (`schoolTypeId`) standen nur in den mitgelieferten Dateien und ließen sich
 * nicht pflegen. Genau diese drei Angaben braucht aber die Vorwahl des Lehrwerks bei der Materialerstellung
 * (Arbeitsblatt, Vokabeltest, Sprachenlernen). Hier steht die Logik ohne React, damit Oberfläche und Tests sie teilen:
 *  - Landesausgabe ↔ Land: Nennt die Landesausgabe ein Bundesland („Niedersachsen"), gilt dessen Kürzel als `stateId`;
 *    eine bundesweite Ausgabe („1. oder 2. Fremdsprache") hat kein Land.
 *  - Schulformen je Land aus der EINEN Quelle shared/schulformen.ts; ohne Land die Schulformen aller Länder (jede
 *    Kennung einmal, mit der häufigsten Bezeichnung).
 *  - `passtZurGruppe`: Passt ein Lehrwerk zu Fach, Jahrgang, Land und Schulform? (Vokabeltest: die zuletzt genutzte
 *    Auswahl gilt nur, wenn sie passt.)
 */
import { LAENDER, SCHULFORMEN, schulformenDes, foerderschule, profilVon } from './schulformen'

/** Land zu einer Landesausgabe („Niedersachsen", „Ausgabe Niedersachsen", „NI") – sonst undefined */
export function landZuAusgabe(edition: string | undefined): string | undefined {
  const e = (edition ?? '').trim().toLocaleLowerCase('de')
  if (!e) return undefined
  const genau = LAENDER.find((l) => l.name.toLocaleLowerCase('de') === e || l.id.toLocaleLowerCase('de') === e)
  if (genau) return genau.id
  // „Ausgabe Niedersachsen", „Niedersachsen und Bremen": das zuerst genannte Land
  const treffer = LAENDER.map((l) => ({ l, i: e.indexOf(l.name.toLocaleLowerCase('de')) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)
  return treffer[0]?.l.id
}

/** Name des Landes zu einem Kürzel */
export const landName = (id: string | undefined): string | undefined => LAENDER.find((l) => l.id === id)?.name

/** Schulformen zur Auswahl – je Land, ohne Land alle (jede Kennung einmal, Reihenfolge des ersten Vorkommens) */
export function schulformAuswahl(stateId?: string): { value: string; label: string }[] {
  if (stateId && SCHULFORMEN[stateId]) return schulformenDes(stateId).map((s) => ({ value: s.id, label: s.name }))
  const namen = new Map<string, Map<string, number>>()
  for (const l of LAENDER)
    for (const s of [...SCHULFORMEN[l.id], foerderschule(l.id)]) {
      const m = namen.get(s.id) ?? new Map<string, number>()
      m.set(s.name, (m.get(s.name) ?? 0) + 1)
      namen.set(s.id, m)
    }
  return [...namen.entries()].map(([value, m]) => ({ value, label: [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
}

/** Bezeichnung einer Schulform (Land zuerst) */
export function schulformName(id: string | undefined, stateId?: string): string | undefined {
  if (!id) return undefined
  return schulformAuswahl(stateId).find((s) => s.value === id)?.label ?? schulformAuswahl().find((s) => s.value === id)?.label
}

/** Was die Lerngruppe vorgibt – alles optional */
export interface GruppenWunsch {
  language?: string
  grade?: number
  stateId?: string
  schoolTypeId?: string
}

/** Was ein Lehrwerk dazu sagt */
export interface LehrwerkVorgaben {
  language: string
  grade?: number
  stateId?: string
  schoolTypeId?: string
}

/**
 * Schulform passt? Gleiche Kennung, oder dasselbe Schulprofil (Gymnasium ↔ Gymnasium eines anderen Landes mit eigener
 * Kennung). Ohne Angabe auf einer der beiden Seiten passt es.
 */
export function schulformPasst(buch: string | undefined, wunsch: string | undefined, land?: string): boolean {
  if (!buch || !wunsch || buch === wunsch) return true
  const a = profilVon(buch, land)
  const b = profilVon(wunsch, land)
  return Boolean(a && b && a === b)
}

/**
 * Passt das Lehrwerk zur Lerngruppe? Sprache muss stimmen; Land und Schulform, soweit beide Seiten sie nennen; der
 * Jahrgang höchstens `toleranz` Jahre daneben (Bände werden oft ein Jahr später/früher begonnen, 0 = genau).
 */
export function passtZurGruppe(b: LehrwerkVorgaben, w: GruppenWunsch, toleranz = 1): boolean {
  if (w.language && b.language !== w.language) return false
  if (w.stateId && b.stateId && b.stateId !== w.stateId) return false
  if (!schulformPasst(b.schoolTypeId, w.schoolTypeId, w.stateId)) return false
  if (w.grade && b.grade && Math.abs(b.grade - w.grade) > toleranz) return false
  return true
}

/**
 * Wie gut passt das Lehrwerk? Höher = besser. Für die Sortierung der Kandidaten: genauer Jahrgang vor benachbartem,
 * genaues Land und genaue Schulform vor „ohne Angabe".
 */
export function passung(b: LehrwerkVorgaben, w: GruppenWunsch): number {
  let p = 0
  if (w.grade) p += b.grade ? 100 - Math.min(99, Math.abs(b.grade - w.grade) * 30) : 0
  if (w.stateId) p += b.stateId === w.stateId ? 8 : b.stateId ? -50 : 0
  if (w.schoolTypeId)
    p += b.schoolTypeId === w.schoolTypeId ? 4 : b.schoolTypeId && schulformPasst(b.schoolTypeId, w.schoolTypeId, w.stateId) ? 2 : b.schoolTypeId ? -50 : 0
  return p
}

/**
 * Das Lehrwerk, das am besten zur Lerngruppe passt (früher `bookForGroup` im Lehrwerk-Auswähler): gleiche Sprache,
 * Land und Schulform nicht im Widerspruch, dann der Jahrgang möglichst genau, genaues Land und genaue Schulform zuerst.
 * Ohne Jahrgang zählt die Reihenfolge der Liste (wie bisher).
 */
export function besterBand<B extends LehrwerkVorgaben>(buecher: B[], w: GruppenWunsch): B | undefined {
  const fits = buecher.filter((b) => passtZurGruppe(b, { ...w, grade: undefined }))
  if (!fits.length) return undefined
  return fits.map((b, i) => ({ b, i, p: passung(b, w) })).sort((a, c) => c.p - a.p || a.i - c.i)[0].b
}

/**
 * Vorwahl im Lehrwerk-Auswähler (12.10.2026): Die zuletzt genutzte Auswahl gilt nur, wenn sie zu Fach, Jahrgang und
 * Schulform der Lerngruppe passt (Jahrgang genau, sofern beide ihn kennen) – sonst das passendste Lehrwerk. Ohne Fach
 * und ohne Jahrgang wird nichts geraten: dann nur die letzte Auswahl, soweit sie nicht widerspricht.
 */
export function vorwahlImAuswaehler<B extends LehrwerkVorgaben & { id: string }>(
  buecher: B[],
  w: GruppenWunsch | undefined,
  gemerkt: string | null | undefined
): B | undefined {
  const letzte = gemerkt ? buecher.find((b) => b.id === gemerkt) : undefined
  if (!w) return letzte
  if (letzte && passtZurGruppe(letzte, w, 0)) return letzte
  if (!w.language && !w.grade) return undefined
  return besterBand(buecher, w)
}
