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
import type { BereichsUebernahme, ThemenDaten, Themenbereich, Zuordnung } from '@shared/themen'
import { automatikAn, kinderVon, materialSchluessel, nachfahrenVon } from '@shared/themen'

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
  /**
   * Bundesland und Schulform, für die das Material gemacht ist (Paket 13) – aus seinen Kopfdaten,
   * sonst aus den Einstellungen. Die Lehrplandatei eines Landes gilt nur für dessen Materialien:
   * Ein Blatt für Bayern kommt nicht in einen Bereich aus dem niedersächsischen Kerncurriculum.
   */
  land?: string
  schulform?: string
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
  /** Oberthemen von oben nach unten (Paket 12) – daraus entstehen beim Einsortieren die Oberbereiche */
  pfad?: string[]
  /** Wortlaut des Lehrplans, wenn `name` gekürzt ist (Paket 13) – kommt als Tooltip an den Bereich */
  wortlaut?: string
  /** Dasselbe für die Oberthemen, Stelle für Stelle wie `pfad` ('' = nicht gekürzt) */
  pfadWortlaut?: string[]
}

export interface Vorschlag {
  name: string
  fachId: string
  /** Gesetzt, wenn die Materialien in einen vorhandenen Bereich kommen */
  bereichId?: string
  schluessel: string[]
  /** Woher der Name stammt – für den Hinweis („aus dem Lehrplan") */
  herkunft: 'bereich' | KatalogThema['quelle'] | 'stichwort'
  /** Oberthemen aus dem Lehrplan (Paket 12) */
  pfad?: string[]
  /** Wortlaut gekürzter Lehrplantitel je Name (Paket 13) */
  wortlaute?: Record<string, string>
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
  let beste: Themenbereich[] = []
  let wert = 0
  for (const b of bereiche) {
    if (b.fachId !== m.fachId) continue
    const s = Math.max(aehnlichkeit(w, stichwoerter(b.name)), ...(mitglieder.get(b.id) ?? []).map((x) => aehnlichkeit(w, x)))
    if (s < AEHNLICH) continue
    if (s > wert) {
      beste = [b]
      wert = s
    } else if (s === wert) beste.push(b)
  }
  if (beste.length <= 1) return beste[0] ?? null
  /*
   * Gleichstand in EINER Linie (Paket 12): „Der Erste Weltkrieg" und sein Unterbereich „Ursachen
   * des Ersten Weltkriegs" passen gleich gut – dann der tiefere, er ist genauer. Gleichstand
   * zwischen verschiedenen Zweigen bleibt unentschieden: lieber gar nicht als falsch einsortieren.
   */
  const alle = { bereiche }
  const tiefster = beste.find((b) => beste.every((x) => x.id === b.id || nachfahrenVon(alle, x.id).includes(b.id)))
  return tiefster ?? null
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
    if (daten.zuordnungen[k] || !automatikAn(daten, m.fachId)) continue
    const b = besterBereich(m, daten.bereiche, mitglieder)
    if (b) neu[k] = { bereichId: b.id, von: 'auto', am: heute }
  }
  return neu
}

// ---------- Lehrplan- und Lehrwerksthemen ----------

/** `w`: Wörter aus Name und Zusatz, `n`: nur aus dem Namen */
type KatalogMitWoertern = { k: KatalogThema; w: string[]; n: string[] }[]

const katalogWoerter = (katalog: KatalogThema[]): KatalogMitWoertern =>
  katalog.map((k) => ({ k, w: stichwoerter(`${k.name} ${k.zusatz ?? ''}`), n: stichwoerter(k.name) }))

/**
 * Das passendste belegte Thema für ein Material (Stelle im Katalog, -1 = keins): Mindestens
 * `LEHRPLAN_DECKUNG` der Wörter des Materials müssen im Thema stehen, darunter ein
 * aussagekräftiges; der Jahrgang muss passen. Bei gleicher Deckung das engere Thema (weniger
 * Wörter) – im Baum meist das tiefere.
 */
function besterKatalogIndex(m: ThemenMaterial, katalog: KatalogMitWoertern): number {
  const w = woerterVon(m)
  let bestes = -1
  let wert = 0
  let wertName = 0
  let wertRueck = 0
  for (let i = 0; i < katalog.length; i++) {
    // „Unit 3" in Klasse 6 ist eine andere Unit als in Klasse 8
    const jg = katalog[i].k.jahrgaenge
    if (m.grade && jg && !jg.includes(m.grade)) continue
    const d = deckung(w, katalog[i].w)
    /*
     * Mindestens ein aussagekräftiges Wort muss passen, nicht nur Kurzwörter – ODER der ganze
     * Name des Themas steht im Material (ab zwei Wörtern; Paket 13): „Leben im Wald" besteht nur
     * aus Kurzwörtern, ein Blatt „Leben im Wald – Stockwerke" gehört trotzdem sicher dorthin.
     */
    const kraeftig = w.some((x) => (x.length >= 5 || /\d/.test(x)) && katalog[i].w.some((y) => passt(x, y)))
    const ganzerName = katalog[i].n.length >= 2 && katalog[i].n.every((y) => w.some((x) => passt(x, y)))
    if (d < LEHRPLAN_DECKUNG || !(kraeftig || ganzerName)) continue
    /*
     * Bei gleicher Deckung zählt, wie viel davon im NAMEN des Themas steht (Paket 13): Seit die
     * Leitsätze der Kerncurricula als Zusatzwörter beim Oberthema mitzählen, trifft „Fotosynthese
     * – Leben und Energie" sonst zufällig „Lebewesen in ihrer Umwelt" (… Energieflüsse …).
     */
    const dn = deckung(w, katalog[i].n)
    // Danach: wie viel vom Namen des Themas im Material steht – „Lineare Zusammenhänge" ganz, „Abgrenzung gegen nicht-lineare Zusammenhänge" halb
    const rn = deckung(katalog[i].n, w)
    const besser =
      d > wert ||
      (d === wert &&
        (dn > wertName || (dn === wertName && (rn > wertRueck || (rn === wertRueck && bestes >= 0 && katalog[i].w.length < katalog[bestes].w.length)))))
    if (besser) {
      bestes = i
      wert = d
      wertName = dn
      wertRueck = rn
    }
  }
  return bestes
}

/**
 * Die AUTOMATIK (Paket 12, Wunsch der Lehrkraft vom 26.09.2026): „vorhandene und neue
 * Materialien werden automatisch in die Hierarchie einsortiert – von Hand Zugeordnetes bleibt".
 *
 * Für jedes noch nie zugeordnete Material in einem Fach mit eingeschalteter Automatik
 * (Standard: an):
 * 1. Passt es zu einem vorhandenen Bereich (auch einem Unterbereich), kommt es dorthin.
 * 2. Sonst: Passt es sicher zu einem belegten Thema aus Lehrplan oder Lehrwerk, entsteht der
 *    Bereich mit seinen Oberbereichen („Der Erste Weltkrieg" › „Ursachen des Ersten
 *    Weltkriegs"). Heißt ein vorhandener Bereich auf derselben Ebene fast gleich („Erster
 *    Weltkrieg"), wird er genommen statt eines zweiten.
 *    Ein oberstes Thema ohne Oberthemen braucht dafür mindestens `MIN_GRUPPE` Materialien.
 * 3. Sonst bleibt es ohne Bereich – geraten wird nicht. Gemeinsame Stichwörter ohne Beleg
 *    bleiben ein Vorschlag, den die Lehrkraft übernimmt (`vorschlagen`).
 *
 * Anders als die Vorschläge greift die Automatik ab dem ersten Material: Hier wird nur nach
 * Belegtem oder schon Vorhandenem sortiert, nicht nach Ähnlichkeit untereinander.
 */
export function automatischEinsortieren(
  materialien: ThemenMaterial[],
  daten: ThemenDaten,
  /** Die belegten Themen für ein Material – je Fach, Land und Schulform des Materials (Paket 13) */
  katalogFuer: (fachId: string, m: ThemenMaterial) => KatalogThema[],
  heute = new Date().toISOString()
): { zuordnungen: Record<string, Zuordnung>; uebernahmen: BereichsUebernahme[] } {
  const zuordnungen: Record<string, Zuordnung> = {}
  const gruppen = new Map<string, BereichsUebernahme>()
  const mitglieder = mitgliederWoerter(materialien, daten)
  const kataloge = new Map<string, KatalogMitWoertern>()
  for (const m of materialien) {
    const k = schluesselVon(m)
    if (daten.zuordnungen[k] || !automatikAn(daten, m.fachId)) continue
    const b = besterBereich(m, daten.bereiche, mitglieder)
    if (b) {
      zuordnungen[k] = { bereichId: b.id, von: 'auto', am: heute }
      continue
    }
    const art = `${m.fachId}|${m.land ?? ''}|${m.schulform ?? ''}`
    if (!kataloge.has(art)) kataloge.set(art, katalogWoerter(katalogFuer(m.fachId, m)))
    const katalog = kataloge.get(art)!
    const i = besterKatalogIndex(m, katalog)
    if (i < 0) continue
    const thema = katalog[i].k
    const lehrplanNamen = [...(thema.pfad ?? []), thema.name].map(kurzName)
    const pfad = passendePfadnamen(daten, m.fachId, lehrplanNamen)
    const name = pfad.pop()!
    const wortlaute = wortlauteVon(thema, lehrplanNamen)
    const schluessel = `${m.fachId}|${pfad.join('›')}|${name}`
    const da = gruppen.get(schluessel)
    if (da) da.schluessel.push(k)
    else
      gruppen.set(schluessel, {
        fachId: m.fachId,
        name,
        ...(pfad.length ? { pfad } : {}),
        herkunft: thema.quelle,
        ...(wortlaute ? { wortlaute } : {}),
        schluessel: [k]
      })
  }
  /*
   * Ein OBERSTES Thema ohne Unterthemen wird erst ab `MIN_GRUPPE` Materialien ein Bereich: Sonst
   * entstünde zu jedem Blatt, dessen Titel zufällig ein Lehrplanthema ist, ein Ordner mit genau
   * diesem einen Blatt. Mit Oberthemen (Pfad) ist schon das erste Material richtig aufgehoben –
   * es steht dann unter seiner Unterrichtseinheit.
   */
  /*
   * Ausnahme (Paket 13): Entsteht der Bereich ohnehin – als Oberbereich eines anderen, der
   * angelegt wird („Lineare Zusammenhänge" über „Lineare Gleichungen") –, kommt auch das eine
   * Material dorthin. Sonst stünde es neben dem frisch angelegten Ordner seines Themas.
   */
  const alle = [...gruppen.values()]
  const pfadText = (u: BereichsUebernahme): string => [...(u.pfad ?? []), u.name].join('›').toLocaleLowerCase('de')
  const behalten = alle.filter((u) => u.pfad?.length || u.schluessel.length >= MIN_GRUPPE)
  const entstehen = new Set(
    behalten.flatMap((u) =>
      (u.pfad ?? []).map((_, i) =>
        u
          .pfad!.slice(0, i + 1)
          .join('›')
          .toLocaleLowerCase('de')
      )
    )
  )
  return { zuordnungen, uebernahmen: alle.filter((u) => behalten.includes(u) || entstehen.has(pfadText(u))) }
}

/** Gekürzte Lehrplantitel: der Wortlaut je (Kurz-)Name, damit er am neuen Bereich als Tooltip steht */
function wortlauteVon(k: KatalogThema, namen: string[]): Record<string, string> | undefined {
  const paare = [...(k.pfadWortlaut ?? (k.pfad ?? []).map(() => '')), k.wortlaut ?? ''].map((w, j) => [namen[j], w] as const).filter(([n, w]) => n && w)
  return paare.length ? Object.fromEntries(paare) : undefined
}

/** Ebene für Ebene: Heißt ein vorhandener Bereich fast gleich, wird sein Name genommen (dann legt `uebernehmen` keinen zweiten an) */
function passendePfadnamen(daten: ThemenDaten, fachId: string, namen: string[]): string[] {
  const out: string[] = []
  let eltern: string | null = null
  // Gibt es eine Ebene noch nicht, gibt es darunter auch keine vorhandenen Unterbereiche
  let vorhanden = true
  for (const name of namen) {
    const w = stichwoerter(name)
    const da: Themenbereich | undefined = vorhanden
      ? kinderVon(daten, fachId, eltern).find((b) => w.length > 0 && aehnlichkeit(w, stichwoerter(b.name)) >= 1)
      : undefined
    out.push(da?.name ?? name)
    vorhanden = Boolean(da)
    eltern = da?.id ?? null
  }
  return out
}

// ---------- Vorschläge ----------

/** Lange Lehrplantitel kürzen – umbenennen lässt sich jeder Bereich danach */
export function kurzName(name: string): string {
  const n = name.trim()
  // 80 Zeichen wie `bereichSetzen`; Lehrplantitel sind seit Paket 13 schon gekürzt (`bereichsName`)
  if (n.length <= 80) return n
  return `${n.slice(0, 77).replace(/\s+\S*$/, '')} …`
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
  const katalog = katalogWoerter(opt.katalog ?? [])
  if (katalog.length) {
    const gruppen = new Map<number, ThemenMaterial[]>()
    for (const m of offen) {
      const bestes = besterKatalogIndex(m, katalog)
      if (bestes >= 0) gruppen.set(bestes, [...(gruppen.get(bestes) ?? []), m])
    }
    for (const [i, liste] of gruppen) {
      if (liste.length < MIN_GRUPPE) continue
      const k = katalog[i].k
      const wortlaute = wortlauteVon(k, [...(k.pfad ?? []), k.name].map(kurzName))
      vorschlaege.push({
        name: kurzName(k.name),
        fachId,
        schluessel: liste.map(schluesselVon),
        herkunft: k.quelle,
        ...(k.pfad?.length ? { pfad: k.pfad.map(kurzName) } : {}),
        ...(wortlaute ? { wortlaute } : {})
      })
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
