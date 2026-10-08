/**
 * Abschnitte und Grammatik aus einem Kurs entfernen – ohne den Lernstand zu verlieren (08.10.2026, abgestimmt mit der
 * Lehrkraft). Entfernen nimmt die Wörter eines Abschnitts aus der Wortliste des Kurses (die Lernenden sehen und üben sie
 * nicht mehr), der Lernstand je Wort bleibt in vok_stand. Die entfernten Wörter liegen mit ihren Kennungen im Kurs
 * (Spalte `entfernt`); kommen sie später wieder dazu (gleicher Abschnitt oder gleiches Wort aus einer eigenen Liste),
 * bekommen sie ihre alte Kennung zurück – der Lernstand gilt dann weiter. Für Grammatik: ein erneut freigegebenes Thema
 * holt das entfernte Training zurück; neue Aufgaben kommen dazu, die alten behalten ihre Kennungen.
 * Reine Funktionen (Server: vokabeln.ts, grammatik.ts).
 */
import type { Vokabel } from './vokabeltrainer'
import type { GrammatikAufgabe, GrammatikPaket } from './grammatiktrainer'

export interface Teil {
  titel: string
  anzahl: number
  zeit: number
}
export interface EntfernterTeil {
  teil: string
  woerter: Vokabel[]
  zeit: number
}

/** Vergleichsform: klein, Leerraum zusammengefasst, Satzzeichen am Rand weg */
export const normiert = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?…"'„“”‚‘’()-]+|[\s.,;:!?…"'„“”‚‘’()-]+$/g, '')
    .trim()
export const wortSchluessel = (v: Pick<Vokabel, 'term' | 'translation'>): string => `${normiert(v.term)}|${normiert(v.translation)}`

/** Wörter je Abschnitt (die Abschnitte stehen in Freigabe-Reihenfolge hintereinander; Rest zählt zum letzten) */
export function woerterJeTeil<T>(teile: Teil[], woerter: T[]): T[][] {
  const out: T[][] = []
  let ab = 0
  teile.forEach((t, i) => {
    const bis = i === teile.length - 1 ? woerter.length : Math.min(woerter.length, ab + Math.max(0, t.anzahl))
    out.push(woerter.slice(ab, bis))
    ab = bis
  })
  return out
}

/** Einen Abschnitt herausnehmen: Wortliste und Abschnitte ohne ihn, dazu der Eintrag für `entfernt` */
export function teilEntfernen(
  woerter: Vokabel[],
  teile: Teil[],
  index: number,
  zeit: number
): { woerter: Vokabel[]; teile: Teil[]; entfernt: EntfernterTeil } | null {
  if (index < 0 || index >= teile.length) return null
  const je = woerterJeTeil(teile, woerter)
  const raus = je[index]
  const rest = je.filter((_, i) => i !== index)
  const restTeile = teile.filter((_, i) => i !== index).map((t, i) => ({ ...t, anzahl: rest[i].length }))
  return { woerter: rest.flat(), teile: restTeile, entfernt: { teil: teile[index].titel, woerter: raus, zeit } }
}

/**
 * Wieder hinzugefügte Wörter: Kennungen aus `entfernt` übernehmen – zuerst aus einem gleichnamigen Abschnitt, sonst aus
 * irgendeinem (eigene Liste). Übernommene fallen aus `entfernt`; leere Einträge verschwinden.
 */
export function kennungenWiederverwenden<T extends Pick<Vokabel, 'id' | 'term' | 'translation'>>(
  neu: { wort: T; teil?: string }[],
  entfernt: EntfernterTeil[]
): { woerter: T[]; entfernt: EntfernterTeil[]; wieder: number } {
  const rest = entfernt.map((e) => ({ ...e, woerter: [...e.woerter] }))
  let wieder = 0
  const woerter = neu.map(({ wort, teil }) => {
    const k = wortSchluessel(wort)
    const reihenfolge = [
      ...rest.filter((e) => teil && normiert(e.teil) === normiert(teil)),
      ...rest.filter((e) => !(teil && normiert(e.teil) === normiert(teil)))
    ]
    for (const e of reihenfolge) {
      const i = e.woerter.findIndex((v) => wortSchluessel(v) === k)
      if (i < 0) continue
      const alt = e.woerter.splice(i, 1)[0]
      wieder++
      return { ...wort, id: alt.id }
    }
    return wort
  })
  return { woerter, entfernt: rest.filter((e) => e.woerter.length), wieder }
}

/** Alle Kennungen in `entfernt` – neue Wörter dürfen sie nicht bekommen (sonst erbten sie fremden Lernstand) */
export const entfernteKennungen = (entfernt: EntfernterTeil[]): string[] => entfernt.flatMap((e) => e.woerter.map((v) => v.id))

/** Lernstand nur der aktuellen Wörter (entfernte bleiben gespeichert, zählen aber nicht) */
export function nurAktuell<S>(stand: Record<string, S>, woerter: { id: string }[]): Record<string, S> {
  const ids = new Set(woerter.map((v) => v.id))
  return Object.fromEntries(Object.entries(stand).filter(([id]) => ids.has(id)))
}

// ------------------------------------------------------------------------------------------------- Grammatik

/** Passt eine neue Grammatik-Freigabe zu einem entfernten Training? Gleiches Katalog-Thema oder gleicher Titel */
export function gleichesThema(
  alt: { titel: string; themen?: string[] },
  neu: { titel: string; themen?: string[] }
): boolean {
  const a = new Set((alt.themen ?? []).filter(Boolean))
  if (a.size && (neu.themen ?? []).some((t) => a.has(t))) return true
  return Boolean(normiert(alt.titel)) && normiert(alt.titel) === normiert(neu.titel)
}

const aufgabeSchluessel = (a: GrammatikAufgabe): string =>
  [a.art, normiert(a.satz), ...(a.teile ?? []).map(normiert), ...a.loesungen.map(normiert).sort()].join('|')

/**
 * Pakete zusammenführen: die alten Aufgaben und Regeln behalten ihre Kennungen (der Lernstand gilt weiter), neue Aufgaben
 * (anderer Satz/andere Lösung) kommen dazu – mit ihrer Regel auf die gleichnamige alte umgehängt bzw. neu aufgenommen.
 */
export function paketeZusammen(alt: GrammatikPaket, neu: GrammatikPaket): { paket: GrammatikPaket; dazu: number } {
  const regeln = [...alt.regeln]
  const regelIds = new Set(regeln.map((r) => r.id))
  const regelMap = new Map<string, string>()
  for (const r of neu.regeln) {
    const gleich = regeln.find((x) => normiert(x.titel) === normiert(r.titel))
    if (gleich) {
      regelMap.set(r.id, gleich.id)
      continue
    }
    let id = r.id
    for (let n = regeln.length + 1; regelIds.has(id); n++) id = `r${n}`
    regelIds.add(id)
    regelMap.set(r.id, id)
    regeln.push({ ...r, id })
  }
  const da = new Set(alt.aufgaben.map(aufgabeSchluessel))
  const ids = new Set(alt.aufgaben.map((a) => a.id))
  const aufgaben = [...alt.aufgaben]
  let dazu = 0
  for (const a of neu.aufgaben) {
    const k = aufgabeSchluessel(a)
    if (da.has(k)) continue
    da.add(k)
    let id = a.id
    for (let n = aufgaben.length + 1; ids.has(id); n++) id = `a${n}`
    ids.add(id)
    aufgaben.push({ ...a, id, regelId: regelMap.get(a.regelId) ?? a.regelId })
    dazu++
  }
  const verben = alt.verben ?? neu.verben
  const verbSprache = alt.verbSprache ?? neu.verbSprache
  return { paket: { ...alt, regeln, aufgaben, ...(verben ? { verben } : {}), ...(verbSprache ? { verbSprache } : {}) }, dazu }
}
