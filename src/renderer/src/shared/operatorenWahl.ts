/**
 * Operatoren für die Auswahl vor der Erstellung aufbereiten (30.09.2026).
 *
 * Rückmeldung der Lehrkraft: „Die Apps, wo man vor Erstellung von Material Operatoren auswählen
 * kann, listen die Operatoren unübersichtlich auf." Die Listen des Bestands stehen im Wortlaut
 * der Länder – mit Doppelzeilen („analyze, examine"), Klammerformen („(be)nennen"),
 * Auslassungen („describe …"), deutschen Entsprechungen neben englischen Operatoren und
 * großgeschriebenen Zeilenanfängen. Hier wird daraus EIN Eintrag je Operator, gruppiert nach
 * Anforderungsbereich (oder, bei den Fremdsprachen, nach Kompetenzbereich) und alphabetisch.
 */
import { istDeutschesOperatorwort, variantenVon } from '@shared/operatoren/erkennung'

export interface WahlQuelle {
  name: string
  synonyme?: string[]
  definition?: string
  /** ['I', 'II'] oder 'I–II' */
  afb?: string[] | string
  teilkompetenz?: string
  deutsch?: string
}

export interface WahlEintrag {
  name: string
  /** Gleichwertige Formen derselben Zeile */
  weitere: string[]
  /** Deutsche Entsprechungen (Fremdsprachen- und bilinguale Listen) */
  deutsch: string[]
  definition: string
  /** „I", „I–II" … oder leer */
  afb: string
  bereich: string
}

export interface WahlGruppe {
  titel: string
  untertitel?: string
  eintraege: WahlEintrag[]
}

const AFB_REIHE = ['I', 'I–II', 'II', 'II–III', 'III', 'I–III']
const AFB_UNTERTITEL: Record<string, string> = {
  I: 'Reproduktion',
  'I–II': 'Reproduktion bis Transfer',
  II: 'Reorganisation und Transfer',
  'II–III': 'Transfer bis Reflexion',
  III: 'Reflexion und Problemlösung',
  'I–III': 'alle Anforderungsbereiche'
}

/** ['I', 'III'] → 'I–III'; Angaben wie 'I–II' bleiben */
export function afbSchluessel(afb: WahlQuelle['afb']): string {
  if (!afb) return ''
  if (typeof afb === 'string') return afb.replace('-', '–')
  const r = ['I', 'II', 'III'].filter((a) => afb.includes(a))
  if (!r.length) return ''
  return r.length === 1 ? r[0] : `${r[0]}–${r[r.length - 1]}`
}

/** Zeilenform bereinigen: Auslassungen am Ende weg, einzelne Verben klein („Analysieren" → „analysieren") */
function sauber(v: string, sprache: string): string {
  const s = v
    .replace(/\s*(?:…|\.\.\.)\s*/g, ' … ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^…\s*|\s*…$/g, '')
    .trim()
  if (sprache !== 'de') return s
  const woerter = s.split(' ')
  return woerter.length === 1 || ['in', 'sich', 'auf', 'etwas'].includes(woerter[0].toLocaleLowerCase('de'))
    ? s.charAt(0).toLocaleLowerCase('de') + s.slice(1)
    : s
}

/** Ein Eintrag je Operator, doppelte Zeilen zusammengeführt */
export function wahlEintraege(ops: WahlQuelle[], sprache: string = 'de'): WahlEintrag[] {
  const nachName = new Map<string, WahlEintrag>()
  const out: WahlEintrag[] = []
  for (const o of ops) {
    const alle = [...new Set([o.name, ...(o.synonyme ?? [])].flatMap(variantenVon).map((v) => sauber(v, sprache)))].filter(Boolean)
    const deutsch = sprache === 'de' ? [] : alle.filter((v) => istDeutschesOperatorwort(v))
    const eigene = alle.filter((v) => !deutsch.includes(v))
    if (!eigene.length) continue
    const [name, ...weitere] = eigene
    const key = name.toLocaleLowerCase('de')
    const vorhanden = nachName.get(key)
    const afb = afbSchluessel(o.afb)
    if (vorhanden) {
      for (const w of weitere) if (!vorhanden.weitere.includes(w)) vorhanden.weitere.push(w)
      for (const d of [...deutsch, ...(o.deutsch ? [o.deutsch] : [])]) if (!vorhanden.deutsch.includes(d)) vorhanden.deutsch.push(d)
      if (!vorhanden.definition && o.definition) vorhanden.definition = o.definition
      if (!vorhanden.afb) vorhanden.afb = afb
      continue
    }
    const e: WahlEintrag = {
      name,
      weitere,
      deutsch: [...deutsch, ...(o.deutsch ? [o.deutsch] : [])],
      definition: o.definition ?? '',
      afb,
      bereich: o.teilkompetenz ?? ''
    }
    nachName.set(key, e)
    out.push(e)
  }
  return out
}

const falte = (s: string): string => s.toLocaleLowerCase('de').normalize('NFD').replace(/\p{M}/gu, '')

/** Passt der Eintrag zur Suche? Name, gleichwertige Formen, deutsche Entsprechung und Erläuterung */
export function passtZurSuche(e: WahlEintrag, suche: string): boolean {
  const q = falte(suche.trim())
  if (!q) return true
  return [e.name, ...e.weitere, ...e.deutsch, e.definition].some((t) => falte(t).includes(q))
}

const alphabetisch = (a: WahlEintrag, b: WahlEintrag): number => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })

/**
 * Gruppen für die Anzeige: nach Anforderungsbereich (I, I–II, II …, so wie die Liste zuordnet),
 * sonst nach Kompetenzbereich, sonst eine alphabetische Liste. Innerhalb alphabetisch.
 */
export function wahlGruppen(eintraege: WahlEintrag[], suche = ''): WahlGruppe[] {
  const sichtbar = eintraege.filter((e) => passtZurSuche(e, suche))
  if (eintraege.some((e) => e.afb)) {
    const gruppen: WahlGruppe[] = AFB_REIHE.map((a) => ({
      titel: `AFB ${a}`,
      untertitel: AFB_UNTERTITEL[a],
      eintraege: sichtbar.filter((e) => e.afb === a).sort(alphabetisch)
    }))
    gruppen.push({
      titel: 'ohne Zuordnung',
      eintraege: sichtbar.filter((e) => !AFB_REIHE.includes(e.afb)).sort(alphabetisch)
    })
    return gruppen.filter((g) => g.eintraege.length)
  }
  if (eintraege.some((e) => e.bereich)) {
    const bereiche = [...new Set(eintraege.map((e) => e.bereich))]
    return bereiche
      .map((b) => ({
        titel: b || 'weitere',
        eintraege: sichtbar.filter((e) => e.bereich === b).sort(alphabetisch)
      }))
      .filter((g) => g.eintraege.length)
  }
  return sichtbar.length ? [{ titel: 'Operatoren A–Z', eintraege: [...sichtbar].sort(alphabetisch) }] : []
}
