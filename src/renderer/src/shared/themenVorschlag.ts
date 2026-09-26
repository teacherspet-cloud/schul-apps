/**
 * Themenbereiche vorschlagen und einsortieren – LOKAL, ohne KI (Paket 10b, 26.09.2026).
 *
 * Wunsch der Lehrkraft: Ab 8 Materialien in einem Fach schlägt die App Bereiche vor, ein
 * Klick übernimmt sie, danach werden neue Materialien von selbst einsortiert. Bewusst ohne
 * KI: Das Ordnen soll kein Kontingent kosten, sofort da sein und jedes Mal gleich ausfallen.
 *
 * Das Verfahren in drei Stufen:
 * 1. Vorhandene Bereiche: Passt ein noch nicht einsortiertes Material zu einem Bereich
 *    (Name oder Materialien darin), wird es dort vorgeschlagen.
 * 2. Lehrplan und Lehrwerk (belegte Themen, themenKatalog.ts): Passen mindestens zwei
 *    Materialien zum selben Lehrplanthema bzw. zur selben Unit, wird daraus ein Bereich.
 * 3. Gemeinsame Stichwörter: Was übrig bleibt, wird nach dem häufigsten gemeinsamen Wortstamm
 *    gruppiert („Zelle", „Zellatmung", „Zellorganellen" → „Zelle").
 *
 * Wortvergleich: klein geschrieben, Umlaute und ß aufgelöst, „ph" als „f" („Photosynthese" =
 * „Fotosynthese"), Stoppwörter (src/shared/stoppwoerter.ts) und Programmwörter
 * („Arbeitsblatt", „Test") entfernt, einfache Endungen abgeschnitten („Zellen" = „Zelle").
 * Zwei Wörter gelten als gleich, wenn sie gleich sind oder eines das andere als Anfang bzw.
 * (ab 5 Buchstaben) als Teil enthält – so trifft „Zelle" auch „Zellatmung".
 *
 * Ohne React und ohne Store geschrieben – geprüft in tests/themenbereiche.test.ts.
 */
import { STOPPWOERTER } from '@shared/stoppwoerter'
import type { ThemenDaten, Themenbereich, Zuordnung } from '@shared/themen'
import { materialSchluessel } from '@shared/themen'

/*
 * SCHWELLEN – was belegt ist und was nicht:
 *
 * - AB_MATERIALIEN = 8: Vorgabe der Lehrkraft (Briefing Paket 10, 26.09.2026). Darunter ist
 *   eine Liste noch überschaubar; Ordner wären nur zusätzliche Klicks.
 * - AEHNLICH = 0,6: FAUSTREGEL, nicht belegt. Anteil der Stichwörter des kürzeren Titels, die
 *   im anderen vorkommen. Bei zwei Wörtern reicht ein gemeinsames also NICHT („Verdauung beim
 *   Menschen" vs. „Evolution des Menschen" = 0,5) – bei einem Wort ja („Zelle" vs.
 *   „Zellatmung und Gärung" = 1). Mit 0,5 wurde in den Beispieldaten zu viel verschmolzen.
 * - MIN_GRUPPE = 2: FAUSTREGEL. Ein Bereich mit nur einem Material ist kein Ordnungsgewinn.
 * - LEHRPLAN_DECKUNG = 0,6: FAUSTREGEL. So viel vom Titel eines Materials muss im Lehrplan-
 *   bzw. Lehrwerksthema stehen, damit es diesem Thema zugerechnet wird.
 */
export const AB_MATERIALIEN = 8
export const AEHNLICH = 0.6
export const MIN_GRUPPE = 2
export const LEHRPLAN_DECKUNG = 0.6

/** Was die Vorschläge über ein Material wissen müssen (Auszug aus shell/materialien.ts) */
export interface ThemenMaterial {
  moduleId: string
  id: string
  name: string
  thema: string
  fachId: string
  grade?: number
  updatedAt: string
}

/** Ein belegtes Thema aus Lehrplan oder Lehrwerk */
export interface KatalogThema {
  name: string
  /** Weitere Wörter, die zum Thema gehören (Grammatik einer Unit, Fachbegriff) – zählen beim Vergleich mit */
  zusatz?: string
  quelle: 'lehrplan' | 'lehrwerk' | 'grammatik'
  /** Jahrgänge, für die das Thema gilt; fehlt = alle. Ein Material mit anderem Jahrgang passt nicht dazu. */
  jahrgaenge?: number[]
}

export interface Vorschlag {
  name: string
  fachId: string
  /** Gesetzt, wenn die Materialien in einen vorhandenen Bereich kommen */
  bereichId?: string
  schluessel: string[]
  /** Woher der Name stammt – für den Hinweis („aus dem Lehrplan") */
  herkunft: 'bereich' | KatalogThema['quelle'] | 'stichwort'
}

// ---------- Wörter ----------

/*
 * Wörter, die in Materialtiteln stehen, aber nichts über das Thema sagen. Ergänzt zu den
 * Stoppwörtern; FAUSTREGEL aus den Namen, die die Programme selbst vergeben („Arbeitsblatt
 * Photosynthese", „Lernzielkontrolle Weimar", „… (Kopie)").
 */
const PROGRAMMWOERTER = new Set(
  (
    'arbeitsblatt arbeitsblaetter blatt lernzielkontrolle kontrolle grammatiktest vokabeltest vokabeln vokabel test tests klassenarbeit klausur ' +
    'stegreifaufgabe ueberpruefung schriftliche kurztest kopie entwurf unbenannt unbenannte unbenanntes neu neue neues teil klasse jahrgang ' +
    'uebung uebungen wiederholung einfuehrung aufgaben aufgabe thema themen material materialien fassung gruppe lzk ka ohne form formen ' +
    'grundlagen station'
  ).split(' ')
)
const STOPP = new Set([...STOPPWOERTER.de, ...STOPPWOERTER.en].map((w) => falte(w)))

/** Kleinschreibung, Umlaute, Akzente, „ph" → „f", „th" → „t" */
function falte(w: string): string {
  return w
    .toLocaleLowerCase('de')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
}

/** Einfache Endungen ab („Zellen" → „zell", „Ökosysteme" → „oekosystem") – kein vollständiger Stemmer, nur so viel wie Titel brauchen */
function stamm(w: string): string {
  if (/\d/.test(w)) return w
  if (w.length > 7 && w.endsWith('ungen')) w = w.slice(0, -2)
  // Fremdwörter behalten ihre Endung („Imperialismus", „Expansion", „Genesis")
  if (/(us|is|os|ion)$/.test(w)) return w
  for (const endung of ['ern', 'en', 'er', 'es', 'e', 'n', 's']) if (w.endsWith(endung) && w.length - endung.length >= 4) return w.slice(0, -endung.length)
  return w
}

/**
 * Stichwörter eines Textes. „Unit 3", „Lektion 12" werden zu einem Wort („unit3"), denn in
 * Sprachenfächern ist genau das die Einheit.
 */
export function stichwoerter(text: string): string[] {
  const zusammen = text.replace(/\b(unit|lektion|kapitel|chapter|chapitre|unidad|unite|unité|lezione|module|modul)\s*(\d+)\b/gi, '$1$2')
  const woerter = zusammen.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const raus = new Set<string>()
  for (const roh of woerter) {
    const w = falte(roh)
    if (/^\d+$/.test(w)) continue
    if (w.length < 3 || STOPP.has(w) || PROGRAMMWOERTER.has(w)) continue
    raus.add(stamm(w))
  }
  return [...raus]
}

/** Zwei Stichwörter meinen dasselbe (siehe Kopf) */
export function passt(a: string, b: string): boolean {
  if (a === b) return true
  // Mit Ziffer nur genau: „unit1" ist nicht „unit12"
  if (/\d/.test(a) || /\d/.test(b)) return false
  const kurz = Math.min(a.length, b.length)
  if (kurz >= 4 && (a.startsWith(b) || b.startsWith(a))) return true
  return kurz >= 5 && (a.includes(b) || b.includes(a))
}

/** Anteil der Stichwörter des kürzeren Textes, die im anderen vorkommen (0 … 1) */
export function aehnlichkeit(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const inB = a.filter((x) => b.some((y) => passt(x, y))).length
  const inA = b.filter((y) => a.some((x) => passt(x, y))).length
  return Math.min(inA, inB) / Math.min(a.length, b.length)
}

/** Anteil der Stichwörter von `a`, die in `b` stehen – für den Vergleich mit langen Lehrplantiteln */
function deckung(a: string[], b: string[]): number {
  if (!a.length) return 0
  return a.filter((x) => b.some((y) => passt(x, y))).length / a.length
}

const woerterVon = (m: ThemenMaterial): string[] => stichwoerter(`${m.name} ${m.thema}`)
export const schluesselVon = (m: Pick<ThemenMaterial, 'moduleId' | 'id'>): string => materialSchluessel(m.moduleId, m.id)

// ---------- Einsortieren in vorhandene Bereiche ----------

/**
 * Bester vorhandener Bereich für ein Material: Name des Bereichs oder eines der Materialien
 * darin muss mindestens `AEHNLICH` erreichen. Bei Gleichstand zweier Bereiche bleibt das
 * Material, wo es ist – lieber gar nicht als falsch einsortieren.
 */
export function besterBereich(m: ThemenMaterial, bereiche: Themenbereich[], mitglieder: Map<string, string[][]>): Themenbereich | null {
  const w = woerterVon(m)
  if (!w.length) return null
  let bester: Themenbereich | null = null
  let wert = 0
  let gleichstand = false
  for (const b of bereiche) {
    if (b.fachId !== m.fachId) continue
    const s = Math.max(aehnlichkeit(w, stichwoerter(b.name)), ...(mitglieder.get(b.id) ?? []).map((x) => aehnlichkeit(w, x)))
    if (s < AEHNLICH) continue
    if (s > wert) {
      bester = b
      wert = s
      gleichstand = false
    } else if (s === wert) gleichstand = true
  }
  return gleichstand ? null : bester
}

/** Stichwörter der Materialien je Bereich (nur, was einsortiert ist) */
function mitgliederWoerter(materialien: ThemenMaterial[], daten: ThemenDaten): Map<string, string[][]> {
  const map = new Map<string, string[][]>()
  for (const m of materialien) {
    const z = daten.zuordnungen[schluesselVon(m)]
    if (!z?.bereichId) continue
    map.set(z.bereichId, [...(map.get(z.bereichId) ?? []), woerterVon(m)])
  }
  return map
}

/**
 * Die Automatik: neue, noch nie einsortierte Materialien in Fächern mit eingeschalteter
 * Automatik. Von Hand Zugeordnetes – auch ausdrücklich „Ohne Themenbereich" – hat einen
 * Eintrag und wird deshalb NIE angefasst; ebenso bleibt automatisch Einsortiertes, wo es ist.
 */
export function einsortieren(materialien: ThemenMaterial[], daten: ThemenDaten, heute = new Date().toISOString()): Record<string, Zuordnung> {
  const neu: Record<string, Zuordnung> = {}
  const mitglieder = mitgliederWoerter(materialien, daten)
  for (const m of materialien) {
    const k = schluesselVon(m)
    if (daten.zuordnungen[k] || !daten.automatik[m.fachId]) continue
    const b = besterBereich(m, daten.bereiche, mitglieder)
    if (b) neu[k] = { bereichId: b.id, von: 'auto', am: heute }
  }
  return neu
}

// ---------- Vorschläge ----------

/** Lange Lehrplantitel kürzen – umbenennen lässt sich jeder Bereich danach */
export function kurzName(name: string): string {
  const n = name.trim()
  if (n.length <= 60) return n
  return `${n.slice(0, 57).replace(/\s+\S*$/, '')} …`
}

const gross = (w: string): string => w.charAt(0).toLocaleUpperCase('de') + w.slice(1)

/** Das häufigste Originalwort zu einem Stamm („zell" → „Zelle" statt „Zellatmung", wenn es vorkommt) */
function anzeigeWort(stammWort: string, titel: string[]): string {
  const zaehler = new Map<string, number>()
  for (const t of titel) {
    const zusammen = t.replace(/\b(unit|lektion|kapitel|chapter|chapitre|unidad|lezione|module|modul)\s*(\d+)\b/gi, '$1 $2')
    const woerter = zusammen.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
    for (let i = 0; i < woerter.length; i++) {
      const roh = /\d/.test(stammWort) && /^\d+$/.test(woerter[i + 1] ?? '') ? `${woerter[i]} ${woerter[i + 1]}` : woerter[i]
      const w = /\d/.test(stammWort) ? falte(roh.replace(' ', '')) : stamm(falte(roh))
      if (w === stammWort) zaehler.set(roh, (zaehler.get(roh) ?? 0) + 1)
    }
  }
  // Häufigstes, bei Gleichstand das kürzeste
  const bestes = [...zaehler.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]?.[0]
  return gross(bestes ?? stammWort)
}

export interface VorschlagsOptionen {
  /** Nur Materialien dieses Jahrgangs (Jahrgangsfilter der Bibliothek) */
  jahrgang?: number | null
  /** Belegte Themen zum Fach (themenKatalog.ts) */
  katalog?: KatalogThema[]
}

/**
 * Vorschläge für ein Fach. Liefert nichts, solange das Fach (bzw. Fach und Jahrgang) weniger
 * als `AB_MATERIALIEN` Materialien hat. Vorgeschlagen werden nur Materialien OHNE Eintrag –
 * was von Hand oder schon automatisch zugeordnet ist, bleibt außen vor.
 */
export function vorschlagen(alle: ThemenMaterial[], daten: ThemenDaten, fachId: string, opt: VorschlagsOptionen = {}): Vorschlag[] {
  const imFach = alle.filter((m) => m.fachId === fachId && (!opt.jahrgang || m.grade === opt.jahrgang))
  if (imFach.length < AB_MATERIALIEN) return []
  let offen = imFach.filter((m) => !daten.zuordnungen[schluesselVon(m)])
  const vorschlaege: Vorschlag[] = []

  // 1. Vorhandene Bereiche
  const mitglieder = mitgliederWoerter(alle, daten)
  const zuBereich = new Map<string, string[]>()
  for (const m of offen) {
    const b = besterBereich(m, daten.bereiche, mitglieder)
    if (b) zuBereich.set(b.id, [...(zuBereich.get(b.id) ?? []), schluesselVon(m)])
  }
  for (const [id, schluessel] of zuBereich) {
    const b = daten.bereiche.find((x) => x.id === id)!
    vorschlaege.push({ name: b.name, fachId, bereichId: id, schluessel, herkunft: 'bereich' })
  }
  const vergeben = new Set(vorschlaege.flatMap((v) => v.schluessel))
  offen = offen.filter((m) => !vergeben.has(schluesselVon(m)))

  // 2. Lehrplan und Lehrwerk
  const katalog = (opt.katalog ?? []).map((k) => ({ k, w: stichwoerter(`${k.name} ${k.zusatz ?? ''}`) }))
  if (katalog.length) {
    const gruppen = new Map<number, ThemenMaterial[]>()
    for (const m of offen) {
      const w = woerterVon(m)
      let bestes = -1
      let wert = 0
      for (let i = 0; i < katalog.length; i++) {
        // „Unit 3" in Klasse 6 ist eine andere Unit als in Klasse 8
        const jg = katalog[i].k.jahrgaenge
        if (m.grade && jg && !jg.includes(m.grade)) continue
        const d = deckung(w, katalog[i].w)
        // Mindestens ein aussagekräftiges Wort muss passen, nicht nur Kurzwörter
        if (d < LEHRPLAN_DECKUNG || !w.some((x) => (x.length >= 5 || /\d/.test(x)) && katalog[i].w.some((y) => passt(x, y)))) continue
        // Bei gleicher Deckung das engere Thema (weniger Wörter)
        if (d > wert || (d === wert && bestes >= 0 && katalog[i].w.length < katalog[bestes].w.length)) {
          bestes = i
          wert = d
        }
      }
      if (bestes >= 0) gruppen.set(bestes, [...(gruppen.get(bestes) ?? []), m])
    }
    for (const [i, liste] of gruppen) {
      if (liste.length < MIN_GRUPPE) continue
      vorschlaege.push({ name: kurzName(katalog[i].k.name), fachId, schluessel: liste.map(schluesselVon), herkunft: katalog[i].k.quelle })
      for (const m of liste) vergeben.add(schluesselVon(m))
    }
    offen = offen.filter((m) => !vergeben.has(schluesselVon(m)))
  }

  // 3. Gemeinsame Stichwörter: immer das Wort, das die meisten übrigen Materialien teilen
  const woerter = new Map(offen.map((m) => [schluesselVon(m), woerterVon(m)]))
  for (;;) {
    const zaehler = new Map<string, Set<string>>()
    for (const ws of woerter.values())
      for (const w of ws) for (const [k2, ws2] of woerter) if (ws2.some((y) => passt(w, y))) zaehler.set(w, (zaehler.get(w) ?? new Set()).add(k2))
    const [wort, treffer] = [...zaehler.entries()].sort((a, b) => b[1].size - a[1].size || a[0].length - b[0].length || a[0].localeCompare(b[0]))[0] ?? []
    if (!wort || !treffer || treffer.size < MIN_GRUPPE) break
    const titel = offen.filter((m) => treffer.has(schluesselVon(m))).map((m) => `${m.name} ${m.thema}`)
    vorschlaege.push({ name: anzeigeWort(wort, titel), fachId, schluessel: [...treffer], herkunft: 'stichwort' })
    for (const k of treffer) woerter.delete(k)
  }

  // Gleichnamige zusammenlegen; ein Vorschlag mit dem Namen eines vorhandenen Bereichs geht dorthin
  const zusammen: Vorschlag[] = []
  for (const v of vorschlaege) {
    const gleich = (a: string, b: string): boolean => a.toLocaleLowerCase('de') === b.toLocaleLowerCase('de')
    const da = zusammen.find((x) => gleich(x.name, v.name))
    if (da) da.schluessel = [...new Set([...da.schluessel, ...v.schluessel])]
    else {
      const bereich = v.bereichId ? undefined : daten.bereiche.find((b) => b.fachId === fachId && gleich(b.name, v.name))
      zusammen.push(bereich ? { ...v, bereichId: bereich.id, name: bereich.name } : v)
    }
  }
  return zusammen.sort((a, b) => b.schluessel.length - a.schluessel.length || a.name.localeCompare(b.name, 'de'))
}

/** Kurzfassung für den Hinweis: „Ökologie (5), Zelle (3) …" */
export function vorschauText(v: Vorschlag[], hoechstens = 4): string {
  const teile = v.slice(0, hoechstens).map((x) => `${x.name} (${x.schluessel.length})`)
  return teile.join(', ') + (v.length > hoechstens ? ' …' : '')
}

// ---------- Reihenfolge im Bereich ----------

export type Sortierung = 'neu' | 'alt' | 'titel' | 'art' | 'eigen'

export const SORTIERUNGEN: { value: Sortierung; label: string }[] = [
  { value: 'neu', label: 'Neueste zuerst' },
  { value: 'alt', label: 'Älteste zuerst' },
  { value: 'titel', label: 'Titel A–Z' },
  { value: 'art', label: 'Nach Materialart' },
  { value: 'eigen', label: 'Eigene Reihenfolge' }
]

const zeit = (m: { updatedAt: string }): number => Date.parse(m.updatedAt) || 0
const titelVergleich = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })

/**
 * Sortiert die Materialien eines Bereichs. `artReihenfolge`: Programme in der Reihenfolge der
 * Leiste (modules/registry.ts). Eigene Reihenfolge: was in `eigene` steht, in dieser Folge;
 * neu Hinzugekommenes dahinter, neueste zuerst.
 */
export function sortiere<M extends Pick<ThemenMaterial, 'moduleId' | 'id' | 'name' | 'updatedAt'>>(
  liste: M[],
  art: Sortierung,
  eigene: string[] = [],
  artReihenfolge: string[] = []
): M[] {
  const neueste = (a: M, b: M): number => zeit(b) - zeit(a)
  const kopie = [...liste]
  switch (art) {
    case 'alt':
      return kopie.sort((a, b) => zeit(a) - zeit(b))
    case 'titel':
      return kopie.sort((a, b) => titelVergleich.compare(a.name, b.name))
    case 'art': {
      const rang = (m: M): number => {
        const i = artReihenfolge.indexOf(m.moduleId)
        return i < 0 ? artReihenfolge.length : i
      }
      return kopie.sort((a, b) => rang(a) - rang(b) || neueste(a, b))
    }
    case 'eigen': {
      const platz = new Map(eigene.map((k, i) => [k, i]))
      const p = (m: M): number => platz.get(schluesselVon(m)) ?? Infinity
      return kopie.sort((a, b) => {
        const d = p(a) - p(b)
        return Number.isNaN(d) || d === 0 ? neueste(a, b) : d
      })
    }
    default:
      return kopie.sort(neueste)
  }
}

/** Eigene Reihenfolge nach dem Ziehen: `gezogen` vor `ziel` einsetzen (ziel null = ans Ende) */
export function umstellen(reihenfolge: string[], gezogen: string[], ziel: string | null): string[] {
  const ohne = reihenfolge.filter((k) => !gezogen.includes(k))
  const i = ziel ? ohne.indexOf(ziel) : -1
  return i < 0 ? [...ohne, ...gezogen] : [...ohne.slice(0, i), ...gezogen, ...ohne.slice(i)]
}
