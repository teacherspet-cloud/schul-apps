/**
 * Das Blatt der Rückmeldung (29.09.2026, Wunsch der Lehrkraft: „statt vieler Textfelder eine Art
 * DIN-A4-Seite, die genau zeigt, wie die ausgedruckte Rückmeldung aussieht – mit echtem
 * Blatt-Design, auf dem Schülertext und Feedback stehen").
 *
 * Abgestimmt (Multiple Choice, 29.09.2026):
 * - Kopf mit Titel, Name, Klasse und der Einstufung rechts (rot, handschriftlich eingekreist).
 * - Schülertext OBEN auf liniertem Papier, rechts der Korrekturrand hinter einer roten Randlinie –
 *   jede Randnotiz steht auf der Höhe der Zeile, in der ihre Stelle endet (29.09.2026 spät):
 *   Stelle unterstrichen (Wellenlinie bei Ausdrucksfehlern), Nummer, Korrekturzeichen und
 *   Verbesserung in Handschrift-Anmutung und Rot; Lob grün mit Häkchen.
 * - Darunter der Kasten „Rückmeldung": Bewertung nach Teilen, Bewertungstabelle, Stärken, nächste
 *   Schritte, Kriterien, Überarbeitungsauftrag, Schlusssatz (handschriftlich).
 * - Scans: die Seitenbilder mit den nummerierten Markern, die Notizen am Rand daneben.
 *
 * EINE PAGINIERUNG (29.09.2026 nachts, Bericht der Lehrkraft: „Seitenzahl zwischen Ansicht und PDF
 * weicht ab", „hohe Randnotiz rutscht auf die nächste Seite"): Das Blatt besteht aus „Blöcken"
 * (Kopf, Absätze, Abschnitte des Kastens …, `blattBloecke`). Wo die Seiten umbrechen, wird im
 * Renderer GEMESSEN (seitenMessen.ts) und nach denselben Regeln entschieden (seitenPlan.ts): Ein
 * Absatz wird an einer Zeilengrenze geteilt, eine Tabelle zwischen zwei Zeilen, eine Liste
 * zwischen zwei Punkten; Randnotizen, die unten nicht mehr passen, weichen nach oben aus. Das
 * Ergebnis ist ein `SeitenPlan` – die Ansicht zeichnet ihn, das Druck-HTML bekommt feste
 * Seiten-Container (`.bl-seite`) statt freien Flusses. So haben Ansicht und PDF dieselben Seiten.
 * Ohne Messung (Tests, Word) bleibt es beim alten Fluss mit geschätzt vorzerlegten Absätzen
 * (`absatzTeilen`).
 *
 * AUSDRUCK = ANSICHT: Diese Datei liefert das gemeinsame Modell, das gemeinsame CSS (in
 * Millimetern) und das Druck-HTML. Die Ansicht (steps/Blatt.tsx) zeichnet dieselben Blöcke mit
 * denselben Klassen – nur mit Bearbeitungsknöpfen, die im Druck fehlen. Kein React und kein DOM
 * hier, damit die Tests ohne Oberfläche laufen.
 *
 * Handschrift: „Ink Free" gehört zu Windows 10/11; ohne sie greifen „Segoe Print", „Bradley Hand"
 * (macOS) und „Comic Sans MS". Keine Webfonts – die App läuft ohne Netz.
 */
import { setzeNamenEin, ersetzeNamen } from '@shared/pseudonymisierung'
import { kiVermerkText, vermerkSichtbar } from '@shared/kiKennzeichnung'
import { legende, type Korrekturzeichen } from '../../shared/korrekturzeichen'
import { EINSTUFUNGEN, einstufungVon, gesamtEinstufen, hatForm, kriterienEinstufen, LEGENDEN, tabellenSumme, wertText } from './art'
import { randLayout, scanReihenfolge, type NummerierterKommentar, type Textteil } from './korrekturrand'
import { klartext } from './abgabeTrennen'
import { hatMassnahme } from './nachteilsausgleich'
import { bogenUeberschriften, type BogenUeberschriften } from './render/texte'
import { gesamtAusTeilen, getrennt, INHALT_STANDARD, teilAnteil, teilZeilenFuerBogen } from './teilbewertung'
import type { Abgabe, Bogen, EinstufungsArt, Einstufungswert, RandKommentar, Rueckmeldung } from './model/types'

// ---------- Namen ----------

const zuordnungVon = (a: Abgabe): { kuerzel: string; name: string }[] => [...(a.pseudonyme ?? []), ...(a.name.trim() ? [{ kuerzel: a.kuerzel, name: a.name.trim() }] : [])]

/** Kürzel im Bogen durch den Namen ersetzen (nur, wenn einer eingetragen ist) */
export function mitName(text: string, a: Abgabe): string {
  const zuordnung = zuordnungVon(a)
  return zuordnung.length ? setzeNamenEin(text, zuordnung) : text
}

/**
 * Umkehrung von `mitName`: Was die Lehrkraft auf dem Blatt (mit Namen) schreibt, wird mit
 * Kürzeln gespeichert – so bleibt der Bogen so, wie ihn die KI kennt, und kein Name geht bei
 * einer späteren Überarbeitung hinaus.
 */
export function ohneName(text: string, a: Abgabe): string {
  const zuordnung = zuordnungVon(a)
  if (!zuordnung.length) return text
  // Bekannte Namen behalten ihr Kürzel (die Zuordnung geht als „bisher" mit)
  return ersetzeNamen(
    text,
    zuordnung.map((z) => z.name),
    zuordnung
  ).text
}

// ---------- Kleine Bausteine ----------

export const titelZeile = (r: Rueckmeldung): string => ['Rückmeldung', r.meta.subjectLabel, r.grundlage.titel].filter(Boolean).join(' · ')

export const skalenName = (r: Rueckmeldung): string => {
  const art = einstufungVon(r.meta)
  return art === 'notenpunkte' ? 'Notenpunkte' : art === 'note' || art === 'noteTendenz' ? 'Note' : (EINSTUFUNGEN.find((e) => e.id === art)?.label ?? '')
}

/** Liegen die Randkommentare auf den Scans? */
export const aufScan = (a: Abgabe): boolean => Boolean(a.bogen?.rand?.some((k) => k.seite != null) && a.scans?.length)

export const SYMBOL: Record<string, string> = { sicher: '●●●', teilweise: '●●○', 'noch nicht': '●○○' }
export const EINSCHAETZUNG_LEGENDE = '●●● sicher · ●●○ teilweise · ●○○ noch nicht'

export const AMPEL_FARBE: Record<string, string> = { grün: '#2e7d32', gelb: '#f9a825', rot: '#c62828' }

/** Korrekturzeichen, die traditionell mit einer Wellenlinie angestrichen werden (Ausdruck, Stil …) */
const WELLIG = new Set(['A', 'W', 'St', 'Sb', 'Bz', 'Wdh', 'Log', '~', 'Ausdr'])

/** Wie eine markierte Stelle angestrichen wird */
export function markenStil(k: Pick<RandKommentar, 'art' | 'zeichen'> | undefined): 'lob' | 'wellig' | 'hinweis' | 'fehler' {
  if (!k) return 'fehler'
  if (k.art === 'lob') return 'lob'
  if (k.zeichen && WELLIG.has(k.zeichen)) return 'wellig'
  return k.art === 'hinweis' ? 'hinweis' : 'fehler'
}

const regexSicher = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Text einer Randnotiz ohne doppeltes Korrekturzeichen (Bericht der Lehrkraft, 29.09.2026:
 * „W: W: Bezug unpräzise"): Beginnt der Text schon mit „<Zeichen>:", steht das Zeichen davor
 * ohnehin – der Anfang fällt in der Anzeige weg.
 */
export function notizText(k: Pick<RandKommentar, 'zeichen' | 'text'>): string {
  const z = k.zeichen?.trim()
  if (!z) return k.text
  return k.text.replace(new RegExp(`^\\s*${regexSicher(z)}\\s*:\\s*`), '')
}

/** Zahl mit deutschem Komma („0,4", „7,5") */
const dez = (x: number): string => String(Math.round(x * 100) / 100).replace('.', ',')

// ---------- Modell ----------

export interface BlattEinstufung {
  art: EinstufungsArt
  /** Bezeichnung der Skala („Note", „Notenpunkte" …) */
  skala: string
  wert: string
  /** Erklärung unter dem Wert („gut", „Punkte" …) – leer, wenn der Wert für sich spricht */
  text: string
  bestaetigt: boolean
}

export interface BlattKopf {
  titel: string
  unter: string
  name: string
  einstufung: BlattEinstufung | null
}

export type KastenAbschnitt =
  | { art: 'teile'; titel: string; zeilen: string[] }
  | { art: 'tabelle'; titel: string }
  | { art: 'staerken'; titel: string }
  | { art: 'schritte'; titel: string }
  | { art: 'kriterien'; titel: string; mitStufe: boolean }
  | { art: 'ueberarbeitung'; titel: string }
  | { art: 'schluss'; titel: string }

export interface BlattModell {
  kopf: BlattKopf
  /** Digitaler Text: Absätze mit markierten Stellen und ihren Randnotizen (null bei Scans oder ohne Text) */
  absaetze: { teile: Textteil[]; notizen: NummerierterKommentar[] }[] | null
  ohneStelle: NummerierterKommentar[]
  /** Scans: je Seite das Bild und die Notizen dieser Seite (null ohne Scan-Kommentare) */
  scans: { src: string; notizen: NummerierterKommentar[] }[] | null
  /** Stil der Marke je Nummer (für die Stellen im Text) */
  stilVon: Map<number, ReturnType<typeof markenStil>>
  kasten: KastenAbschnitt[]
  /** Legende der benutzten Korrekturzeichen und der Skala */
  legende: string[]
  gross: boolean
  u: BogenUeberschriften
}

export interface BlattOptionen {
  /** Korrekturzeichen des Fachs (für die Legende) */
  zeichen?: Korrekturzeichen[]
  /**
   * Ansicht in der App: auch unbestätigte Vorschläge und leere Abschnitte (zum Ausfüllen) zeigen.
   * Im Ausdruck (Standard) steht nur Bestätigtes und Gefülltes.
   */
  ansicht?: boolean
  /**
   * Lange Absätze vorab nach SCHÄTZUNG zerlegen (Standard). Mit gemessener Paginierung (Ansicht,
   * PDF aus der App) aus: Dann teilt der Seitenplan einen Absatz genau an der Zeile, an der die
   * Seite endet – ohne künstliche Zeilenumbrüche mitten im Absatz.
   */
  vorteilen?: boolean
}

const bestaetigt = (w: Einstufungswert | null | undefined): Einstufungswert | null => (w?.bestaetigt && w.wert ? w : null)

function einstufungFuer(r: Rueckmeldung, w: Einstufungswert): BlattEinstufung {
  const art = einstufungVon(r.meta)
  const lang = wertText(art, w.wert)
  // „2− (gut)" → Wert „2−", Text „gut"; „11 Punkte" → „11", „Punkte"; Smileys/++ mit Erklärung
  const rest = lang.startsWith(w.wert) ? lang.slice(w.wert.length).trim().replace(/^\((.*)\)$/, '$1') : ''
  return { art, skala: skalenName(r), wert: w.wert, text: art === 'ampel' ? '' : rest, bestaetigt: Boolean(w.bestaetigt) }
}

/** Steht eine Bewertungstabelle auf dem Bogen? */
const mitTabelle = (r: Rueckmeldung, b: Bogen): boolean => hatForm(r.meta, 'tabelle') && Boolean(r.tabelle) && Boolean(b.tabelle?.length)

/** Welche Abschnitte der Kasten hat – in der Reihenfolge des Blatts */
export function kastenAbschnitte(r: Rueckmeldung, a: Abgabe, ansicht = false): KastenAbschnitt[] {
  const b = a.bogen
  if (!b) return []
  const m = r.meta
  const u = bogenUeberschriften(m.anrede)
  const art = einstufungVon(m)
  const out: KastenAbschnitt[] = []
  const gesamt = gesamtEinstufen(m) ? bestaetigt(b.gesamt) : null
  // Bewertung nach Teilen: im Ausdruck nur mit bestätigter Einstufung
  if (ansicht ? Boolean(r.grundlage.teile?.length) && art !== 'keine' : gesamt) {
    const zeilen = teilZeilenFuerBogen(r.grundlage.teile, b.teile, r.grundlage.verrechnung)
    if (ansicht || zeilen.length) out.push({ art: 'teile', titel: 'Bewertung nach Teilen', zeilen })
  }
  const tabelle = mitTabelle(r, b)
  if (tabelle) out.push({ art: 'tabelle', titel: u.tabelle })
  if (hatForm(m, 'schriftlich') && (ansicht || b.staerken.length)) out.push({ art: 'staerken', titel: u.staerken })
  if (hatForm(m, 'tipps') && (ansicht || b.schritte.length)) out.push({ art: 'schritte', titel: u.schritte })
  // Mit Bewertungstabelle stehen die Kriterien dort – NIE zweimal mit verschiedenen Werten (Bericht der Lehrkraft, 29.09.2026)
  if (!tabelle && b.kriterien.length && (hatForm(m, 'schriftlich') || kriterienEinstufen(m)))
    out.push({ art: 'kriterien', titel: u.kriterien, mitStufe: kriterienEinstufen(m) })
  if (b.ueberarbeitung || (ansicht && hatForm(m, 'ueberarbeitung'))) out.push({ art: 'ueberarbeitung', titel: u.ueberarbeitung })
  if (hatForm(m, 'schriftlich') && (b.schluss || ansicht)) out.push({ art: 'schluss', titel: 'Schlusssatz' })
  return out
}

/** Überschrift des Kastens – persönlich wie auf einem echten Rückmeldebogen */
export const kastenTitel = (name: string): string => `Rückmeldung für ${name}`

/** Das Modell eines Blatts – gemeinsam für Ansicht, PDF und Word */
export function blattModell(r: Rueckmeldung, a: Abgabe, opt: BlattOptionen = {}): BlattModell {
  const b = a.bogen as Bogen
  const m = r.meta
  const u = bogenUeberschriften(m.anrede)
  const art = einstufungVon(m)
  const n = (s: string): string => mitName(s, a)
  const w = gesamtEinstufen(m) ? (opt.ansicht ? (b.gesamt?.wert ? b.gesamt : null) : bestaetigt(b.gesamt)) : null
  const kopf: BlattKopf = {
    titel: r.grundlage.titel.trim() || r.meta.title.trim() || 'Rückmeldung',
    unter: ['Rückmeldung', m.subjectLabel, `Klasse ${m.grade}`].filter(Boolean).join(' · '),
    name: a.name.trim() || a.kuerzel,
    einstufung: w ? einstufungFuer(r, w) : null
  }
  const rand = b.rand ?? []
  let absaetze: BlattModell['absaetze'] = null
  let ohneStelle: NummerierterKommentar[] = []
  let scans: BlattModell['scans'] = null
  const stilVon = new Map<number, ReturnType<typeof markenStil>>()
  const gross = hatMassnahme(a.ausgleich, 'grossdruck')
  if (aufScan(a)) {
    const reihe = scanReihenfolge(rand)
    scans = a.scans!.map((src, s) => ({ src, notizen: reihe.filter((g) => (g.k.seite ?? 0) === s) }))
    for (const g of reihe) stilVon.set(g.nr, markenStil(g.k))
  } else if (a.text.trim()) {
    // Ältere Abgaben tragen noch HTML aus Word (<p>…</p>) – auf dem Blatt steht nur der Text
    const layout = randLayout(n(klartext(a.text)), rand, n)
    // Ohne Messung: lange Absätze vorab in Teilblöcke zerlegen – kein Block höher als eine Seite
    absaetze = layout.absaetze.flatMap((x) => (opt.vorteilen === false ? [{ teile: x.teile, notizen: x.kommentare }] : absatzTeilen(x.teile, x.kommentare, gross)))
    ohneStelle = layout.ohneStelle
    for (const g of [...layout.absaetze.flatMap((x) => x.kommentare), ...ohneStelle]) stilVon.set(g.nr, markenStil(g.k))
  }
  const legendeZeilen: string[] = []
  const benutzt = legende(opt.zeichen ?? [], rand.map((k) => k.zeichen ?? '').filter(Boolean))
  if (benutzt.length) legendeZeilen.push(benutzt.map((z) => `${z.zeichen}${z.bedeutung ? ` = ${z.bedeutung}` : ''}`).join(' · '))
  const kasten = kastenAbschnitte(r, a, opt.ansicht)
  if (kasten.some((k) => k.art === 'kriterien' && !k.mitStufe)) legendeZeilen.push(EINSCHAETZUNG_LEGENDE)
  if (LEGENDEN[art] && ((w && kopf.einstufung) || kriterienEinstufen(m))) legendeZeilen.push(LEGENDEN[art]!)
  return { kopf, absaetze, ohneStelle, scans, stilVon, kasten, legende: legendeZeilen, gross, u }
}

// ---------- Bewertungstabelle als Raster ----------

/** Kriterium einer Tabelle in Name (bis zum Doppelpunkt) und Beschreibung */
export function kriteriumTeilen(s: string): { name: string; deskriptor: string } {
  const text = s.trim()
  const i = text.indexOf(':')
  if (i > 0 && i <= 70) return { name: text.slice(0, i).trim(), deskriptor: text.slice(i + 1).trim() }
  return { name: text, deskriptor: '' }
}

export type TabZeile =
  | { art: 'bereich'; titel: string; erreicht: number; moeglich: number }
  | {
      art: 'kriterium'
      id: string
      kriterium: string
      name: string
      deskriptor: string
      /** Bereich – nur, wenn es keine Bereichszeilen gibt und er etwas sagt */
      bereich?: string
      /** Höchstpunktzahl (fehlt bei Stufen) */
      max?: number
      punkte?: number
      stufe?: number
      stufeText?: string
      begruendung: string
    }
  | { art: 'summe'; erreicht: number; moeglich: number }

/**
 * Die Zeilen der Bewertungstabelle wie ein echtes Bewertungsraster (29.09.2026, Wunsch der
 * Lehrkraft): Bereichsüberschriften (Inhalt, Darstellung/Sprache) als Zwischenzeilen mit
 * Zwischensumme, darunter die Kriterien, am Ende die Summe.
 */
export function tabellenZeilen(r: Rueckmeldung, b: Bogen): TabZeile[] {
  const t = r.tabelle
  if (!t) return []
  const bereiche = new Set(t.kriterien.map((k) => k.bereich?.trim() ?? ''))
  const gruppiert = bereiche.size >= 2 && [...bereiche].some(Boolean)
  const out: TabZeile[] = []
  let gruppe: Extract<TabZeile, { art: 'bereich' }> | null = null
  for (const k of t.kriterien) {
    const w = b.tabelle?.find((y) => y.kriteriumId === k.id)
    const bereich = k.bereich?.trim() ?? ''
    if (gruppiert && (!gruppe || gruppe.titel !== bereich) && bereich) {
      gruppe = { art: 'bereich', titel: bereich, erreicht: 0, moeglich: 0 }
      out.push(gruppe)
    } else if (gruppiert && !bereich) gruppe = null
    if (gruppe && k.punkte) {
      gruppe.moeglich += k.punkte
      gruppe.erreicht += Math.max(0, Math.min(k.punkte, w?.punkte ?? 0))
    }
    const { name, deskriptor } = kriteriumTeilen(k.kriterium)
    out.push({
      art: 'kriterium',
      id: k.id,
      kriterium: k.kriterium,
      name,
      deskriptor,
      ...(!gruppiert && bereich && bereiche.size > 1 ? { bereich } : {}),
      ...(k.punkte ? { max: k.punkte } : {}),
      ...(w?.punkte != null ? { punkte: w.punkte } : {}),
      ...(w?.stufe != null ? { stufe: w.stufe, stufeText: t.stufen[w.stufe] ?? '' } : {}),
      begruendung: w?.begruendung ?? ''
    })
  }
  const summe = tabellenSumme(t, b.tabelle)
  if (summe.moeglich) out.push({ art: 'summe', erreicht: summe.erreicht, moeglich: summe.moeglich })
  return out
}

/** Wert einer Kriteriumszeile im Ausdruck („5 / 20", „teilweise erfüllt", „–") */
export const tabWert = (z: Extract<TabZeile, { art: 'kriterium' }>): string =>
  z.max ? `${z.punkte != null ? dez(z.punkte) : '–'} / ${z.max}` : z.stufeText || '–'

// ---------- Bewertung nach Teilen als kleine Tabelle ----------

export interface TeilZeileModell {
  id: string
  titel: string
  /** Wie viel der Teil zählt: „100 %" bzw. „15 P." */
  zaehlt: string
  getrennt: boolean
  inhalt?: number
  sprache?: number
  /** Inhaltsanteil (Gewicht) in Prozent – nur bei getrennter Bewertung */
  gewichtInhalt?: number
  /** Übrige Teile: Erfüllungsgrad */
  anteil?: number
  /** Ergebnis des Teils in Prozent */
  ergebnis: number | null
  /** Die Rechnung in Worten (nur als Erläuterung in der Ansicht) */
  rechnung: string
  /** Oberstufen-Deckel gegriffen (Inhalt oder Sprache ungenügend) */
  gedeckelt: boolean
  begruendung?: string
}

export interface TeilTabelle {
  zeilen: TeilZeileModell[]
  /** Mindestens ein Teil nach Inhalt und Sprache */
  getrennt: boolean
  /** Inhaltsanteil, wenn er für alle getrennt bewerteten Teile gleich ist (steht dann im Tabellenkopf) */
  gewichtEinheitlich: number | null
  gesamt: { anteil: number; erreicht?: number; moeglich?: number } | null
  /** „Gesamt: 52 % (Teile nach Gewichtung verrechnet)" */
  gesamtText: string
  /** Die Rechnung der Gesamtleistung in Worten (Erläuterung in der Ansicht) */
  gesamtRechnung: string
}

/**
 * Bewertung nach Teilen als kleine Tabelle (29.09.2026, Bericht der Lehrkraft: „Mediation (100 %):
 * Inhalt 40 % · Sprache 60 % = 52 %" – man verwechselte die erreichten Werte mit der Gewichtung
 * 40 : 60). Jetzt getrennt: Teil | zählt | Inhalt erreicht (Gewicht 40 %) | Sprache erreicht
 * (Gewicht 60 %) | Ergebnis – darunter die Gesamtleistung.
 */
export function teilTabelle(r: Rueckmeldung, b: Bogen): TeilTabelle | null {
  const teile = r.grundlage.teile ?? []
  if (!teile.length) return null
  const v = r.grundlage.verrechnung ?? 'prozent'
  const oberstufe = r.meta.grade >= 11
  const wertungen = b.teile ?? []
  const zeilen = teile.map((t): TeilZeileModell => {
    const w = wertungen.find((x) => x.teilId === t.id)
    const zaehlt = v === 'punkte' ? (t.punkte ? `${t.punkte} P.` : '–') : typeof t.gewicht === 'number' ? `${t.gewicht} %` : '–'
    const ergebnis = teilAnteil(t, w, oberstufe)
    if (getrennt(t)) {
      const g = t.inhalt ?? INHALT_STANDARD
      const i = w?.inhalt
      const s = w?.sprache
      const roh = i != null || s != null ? Math.round(((i ?? 0) * g + (s ?? 0) * (100 - g)) / 100) : null
      const gedeckelt = ergebnis != null && roh != null && ergebnis < roh
      const rechnung =
        roh == null
          ? ''
          : `Inhalt ${i ?? 0} % × ${dez(g / 100)} + Sprache ${s ?? 0} % × ${dez((100 - g) / 100)} = ${roh} %${gedeckelt ? ` – gedeckelt auf ${ergebnis} %, weil Inhalt oder Sprache ungenügend ist` : ''}`
      return {
        id: t.id,
        titel: t.titel,
        zaehlt,
        getrennt: true,
        ...(i != null ? { inhalt: i } : {}),
        ...(s != null ? { sprache: s } : {}),
        gewichtInhalt: g,
        ergebnis,
        rechnung,
        gedeckelt,
        ...(w?.begruendung ? { begruendung: w.begruendung } : {})
      }
    }
    return {
      id: t.id,
      titel: t.titel,
      zaehlt,
      getrennt: false,
      ...(w?.anteil != null ? { anteil: w.anteil } : {}),
      ergebnis,
      rechnung: ergebnis != null ? `erfüllt zu ${ergebnis} %` : '',
      gedeckelt: false,
      ...(w?.begruendung ? { begruendung: w.begruendung } : {})
    }
  })
  const gewichte = [...new Set(teile.filter(getrennt).map((t) => t.inhalt ?? INHALT_STANDARD))]
  const gesamt = gesamtAusTeilen(teile, wertungen, v, oberstufe)
  const bewertet = zeilen.map((z, k) => ({ z, t: teile[k] })).filter((x) => x.z.ergebnis != null)
  let gesamtText = ''
  let gesamtRechnung = ''
  if (gesamt) {
    if (v === 'punkte' && gesamt.moeglich) {
      gesamtText = `Gesamt: ${dez(gesamt.erreicht ?? 0)} von ${gesamt.moeglich} Punkten = ${gesamt.anteil} % (Teile nach Punkten verrechnet)`
      gesamtRechnung = bewertet.map(({ z, t }) => `${z.titel}: ${z.ergebnis} % von ${t.punkte ?? 0} P. = ${dez(((z.ergebnis ?? 0) * (t.punkte ?? 0)) / 100)} P.`).join(' · ')
    } else {
      const summe = bewertet.reduce((s, { t }) => s + (t.gewicht ?? 0), 0) || 1
      gesamtText = `Gesamt: ${gesamt.anteil} % (Teile nach Gewichtung verrechnet)`
      gesamtRechnung = `${bewertet.map(({ z, t }) => `${z.titel} ${z.ergebnis} % × ${dez((t.gewicht ?? 0) / summe)}`).join(' + ')} = ${gesamt.anteil} %`
    }
  }
  return { zeilen, getrennt: zeilen.some((z) => z.getrennt), gewichtEinheitlich: gewichte.length === 1 ? gewichte[0] : null, gesamt, gesamtText, gesamtRechnung }
}

// ---------- Lange Absätze zerlegen (Schätzung, ohne Messung) ----------

/**
 * Geschätzte Maße des Schülertexts und der Randnotizen (mm bzw. Zeichen je Zeile) – bewusst
 * vorsichtig (eher zu viele Zeilen), gemessen an Calibri 12 pt bzw. „Ink Free" 10,5 pt. Die
 * Schätzung muss nur so gut sein, dass ein Teilblock sicher auf eine Seite passt.
 */
const SCHAETZUNG = {
  normal: { zeile: 8, zeichen: 52, notizZeile: 4.6, notizZeichen: 22 },
  gross: { zeile: 11, zeichen: 40, notizZeile: 6.1, notizZeichen: 16 }
} as const
/**
 * Höchste Höhe eines Teilblocks: 30 % der nutzbaren Seite – klein genug, dass ein auf die nächste
 * Seite geschobener Teilblock in der Ansicht höchstens ein knappes Drittel der Seite frei lässt
 * (bei 60 % blieb Seite 1 zur Hälfte leer). Funktion, weil die Maße weiter unten stehen.
 */
export const teilblockMaxMm = (): number => SEITEN_HOEHE_MM * 0.3

export interface Teilblock {
  teile: Textteil[]
  notizen: NummerierterKommentar[]
}

/** Geschätzte Höhe der Randnotizen (mm) */
export function notizenHoeheMm(notizen: NummerierterKommentar[], gross = false): number {
  const m = SCHAETZUNG[gross ? 'gross' : 'normal']
  if (!notizen.length) return 0
  return 2.3 + notizen.reduce((h, g) => h + Math.max(1, Math.ceil(((g.k.zeichen?.length ?? 0) + g.k.text.length + 5) / m.notizZeichen)) * m.notizZeile + 2, 0)
}

/** Geschätzte Höhe eines Absatzes mit seinen Randnotizen (mm) */
export function absatzHoeheMm(textLaenge: number, notizen: NummerierterKommentar[], gross = false): number {
  const m = SCHAETZUNG[gross ? 'gross' : 'normal']
  return Math.max(Math.max(1, Math.ceil(textLaenge / m.zeichen)) * m.zeile, notizenHoeheMm(notizen, gross))
}

/**
 * Einen Absatz an gegebenen Zeichenpositionen schneiden (`schnitte`, aufsteigend, im Klartext des
 * Absatzes). Eine Randnotiz steht in dem Teil, in dem ihre Stelle endet (dort steht auch ihre
 * Nummer); eine angestrichene Stelle, die über den Schnitt reicht, bleibt in beiden Teilen
 * angestrichen, die Nummer steht am Ende. `von` ist die Lage des Teils im Absatz.
 */
export function teileSchneiden(teile: Textteil[], notizen: NummerierterKommentar[], schnitte: number[]): (Teilblock & { von: number })[] {
  const text = teile.map((t) => t.text).join('')
  const grenzen = [0, ...[...new Set(schnitte)].filter((s) => s > 0 && s < text.length).sort((x, y) => x - y), text.length]
  if (grenzen.length <= 2) return [{ teile, notizen, von: 0 }]
  // Lage jedes Teils im Absatz; Lage jeder Notiz = Ende ihrer nummerierten Stelle
  const lagen: { t: Textteil; start: number; ende: number }[] = []
  let pos = 0
  for (const t of teile) {
    lagen.push({ t, start: pos, ende: pos + t.text.length })
    pos += t.text.length
  }
  const notizLage = new Map<NummerierterKommentar, number>()
  for (const g of notizen) notizLage.set(g, lagen.find((l) => l.t.nr === g.nr)?.ende ?? text.length)
  const notizenIn = (s: number, e: number, erst: boolean): NummerierterKommentar[] =>
    notizen.filter((g) => {
      const p = notizLage.get(g)!
      return (p > s || (erst && p === s)) && p <= e
    })
  const out: (Teilblock & { von: number })[] = []
  for (let k = 0; k < grenzen.length - 1; k++) {
    const a = grenzen[k]
    const b = grenzen[k + 1]
    const stuecke: Textteil[] = []
    for (const l of lagen) {
      if (l.start === l.ende) {
        // Nur eine Nummer (überlappende Stellen): zur Stelle davor
        if ((l.start > a || (k === 0 && l.start === a)) && l.start <= b) stuecke.push(l.t)
        continue
      }
      const von = Math.max(a, l.start)
      const bis = Math.min(b, l.ende)
      if (bis <= von) continue
      const stueck: Textteil = { text: text.slice(von, bis) }
      if (l.t.art) stueck.art = l.t.art
      // Die Nummer steht am Ende der Stelle – im Teil, in dem sie endet
      if (l.t.nr != null && l.ende <= b) stueck.nr = l.t.nr
      stuecke.push(stueck)
    }
    out.push({ teile: stuecke, notizen: notizenIn(a, b, k === 0), von: a })
  }
  return out
}

/**
 * Einen Absatz in Teilblöcke zerlegen, von denen keiner höher als `max` (mm, geschätzt) ist.
 * Geschnitten wird bevorzugt nach einem Satzende, sonst zwischen zwei Wörtern, zuletzt mitten in
 * einer Zeichenkette ohne Leerzeichen (Base64, lange Adressen). Nur ohne Messung (Word, Tests) –
 * mit Messung teilt der Seitenplan an der Zeile, an der die Seite endet.
 */
export function absatzTeilen(teile: Textteil[], notizen: NummerierterKommentar[], gross = false, max = teilblockMaxMm()): Teilblock[] {
  const text = teile.map((t) => t.text).join('')
  if (absatzHoeheMm(text.length, notizen, gross) <= max) return [{ teile, notizen }]
  const lagen: { t: Textteil; start: number; ende: number }[] = []
  let pos = 0
  for (const t of teile) {
    lagen.push({ t, start: pos, ende: pos + t.text.length })
    pos += t.text.length
  }
  const notizLage = new Map<NummerierterKommentar, number>()
  for (const g of notizen) notizLage.set(g, lagen.find((l) => l.t.nr === g.nr)?.ende ?? text.length)
  const notizenIn = (s: number, e: number, erst: boolean): NummerierterKommentar[] =>
    notizen.filter((g) => {
      const p = notizLage.get(g)!
      return (p > s || (erst && p === s)) && p <= e
    })
  const passt = (s: number, e: number): boolean => absatzHoeheMm(e - s, notizenIn(s, e, s === 0), gross) <= max
  // Schnittstellen (Beginn des nächsten Teils): nach Satzende, nach Leerraum, überall
  const satz: number[] = []
  const wort: number[] = []
  for (const m of text.matchAll(/[.!?…:;]["“”'»«)\]]*\s+/g)) satz.push(m.index! + m[0].length)
  for (const m of text.matchAll(/\s+/g)) wort.push(m.index! + m[0].length)
  /** Größte Schnittstelle in (s, ende), bis zu der der Teil noch passt (Höhe wächst mit e) */
  const groesste = (liste: number[], s: number): number | null => {
    let lo = 0
    let hi = liste.length - 1
    let best: number | null = null
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const e = liste[mid]
      if (e <= s) lo = mid + 1
      else if (e >= text.length) hi = mid - 1
      else if (passt(s, e)) {
        best = e
        lo = mid + 1
      } else hi = mid - 1
    }
    return best
  }
  const schnitte: number[] = []
  let s = 0
  while (!passt(s, text.length)) {
    // Satzende bevorzugt – außer es schnitte viel früher als die Wortgrenze (ein langer Satz folgt)
    const es = groesste(satz, s)
    const ew = groesste(wort, s)
    let e = es != null && (ew == null || es - s >= (ew - s) / 2) ? es : ew
    if (e == null) {
      // Zeichenkette ohne Leerzeichen: so viele Zeichen, wie Zeilen passen (mindestens eines)
      const m = SCHAETZUNG[gross ? 'gross' : 'normal']
      e = Math.min(text.length, s + Math.max(1, Math.floor(max / m.zeile) * m.zeichen))
      while (e > s + 1 && !passt(s, e)) e -= m.zeichen
      e = Math.max(s + 1, e)
      // Selbst eine Zeile ist zu hoch (viele Notizen an einer Stelle): Schnitt trotzdem – weiter kommt man nicht
    }
    if (e >= text.length) break
    schnitte.push(e)
    s = e
  }
  if (!schnitte.length) return [{ teile, notizen }]
  return teileSchneiden(teile, notizen, schnitte).map(({ teile: t, notizen: n }) => ({ teile: t, notizen: n }))
}

/**
 * Reihenfolge eines Absatzes für Ansicht und Druck: Text und – direkt hinter der nummerierten
 * Stelle – ihre Randnotiz. Die Notiz ist im Blatt ein Float in den Korrekturrand: Sie steht so auf
 * der Höhe der Zeile, in der ihre Stelle endet, und mehrere Notizen einer Zeile stapeln sich, ohne
 * sich zu überdecken. Notizen ohne ihre Nummer im Absatz (sollte nicht vorkommen) stehen am Anfang.
 */
export function absatzFolge(teile: Textteil[], notizen: NummerierterKommentar[]): ({ teil: Textteil } | { notiz: NummerierterKommentar })[] {
  const nrn = new Set(teile.filter((t) => t.nr != null).map((t) => t.nr))
  const out: ({ teil: Textteil } | { notiz: NummerierterKommentar })[] = notizen.filter((g) => !nrn.has(g.nr)).map((g) => ({ notiz: g }))
  for (const t of teile) {
    out.push({ teil: t })
    if (t.nr != null) for (const g of notizen) if (g.nr === t.nr) out.push({ notiz: g })
  }
  return out
}

/** Notizen „ohne Stelle" in Gruppen, von denen keine höher als `max` (mm, geschätzt) ist */
export function notizGruppen(notizen: NummerierterKommentar[], gross = false, max = teilblockMaxMm()): NummerierterKommentar[][] {
  const out: NummerierterKommentar[][] = []
  for (const g of notizen) {
    const letzte = out[out.length - 1]
    if (letzte && notizenHoeheMm([...letzte, g], gross) <= max) letzte.push(g)
    else out.push([g])
  }
  return out
}

// ---------- Blöcke und Seitenplan ----------

/** Maße des Blatts in Millimetern – Druckränder, Textspalte, Korrekturrand */
export const BLATT_MASSE = { breite: 210, hoehe: 297, oben: 15, unten: 15, links: 18, rechts: 12, text: 124, rand: 56 } as const
/** Nutzbare Höhe einer Seite */
export const SEITEN_HOEHE_MM = BLATT_MASSE.hoehe - BLATT_MASSE.oben - BLATT_MASSE.unten
/** Höhe eines Seiten-Containers im Druck und in der Paginierung – 1 mm Luft gegen Rundung im Druck */
export const SEITE_NUTZ_MM = SEITEN_HOEHE_MM - 1

/** Zeichenpositionen (Absatz) bzw. Eintragsnummern (Tabelle, Liste), an denen ein Block geteilt wird – je Grundschlüssel */
export type Schnitte = Record<string, number[]>

/** Randnotiz, die unten auf der Seite nicht mehr passte: um `hoch` mm nach oben, Schrift auf `mass`, Höhe festgehalten (je Nummer der Notiz) */
export interface NotizLage {
  hoch: number
  mass: number
  hoehe: number
}

/** Das Ergebnis der Messung: Schnitte, Seitenanfänge (ab Seite 2) und verschobene Randnotizen */
export interface SeitenPlan {
  schnitte: Schnitte
  /** Block, mit dem eine neue Seite beginnt, und der freie Rest der Seite davor (mm) */
  seiten: { start: string; rest: number }[]
  notizen: Record<string, NotizLage>
  /** Absätze am Seitenende mit überstehenden Randnotizen: Höchsthöhe der Textspalte (mm) */
  kappen: Record<string, number>
}

export const leererPlan = (): SeitenPlan => ({ schnitte: {}, seiten: [], notizen: {}, kappen: {} })

interface BlockKennung {
  /** Schlüssel des Blocks (Teil eines geteilten Blocks: `<basis>@<von>`) */
  key: string
  /** Schlüssel des ungeteilten Blocks – unter ihm stehen die Schnitte */
  basis: string
  /** Beginn des Teils: Zeichenposition (Absatz) bzw. erster Eintrag (Kasten) */
  von: number
}

export type BlattBlock = BlockKennung &
  (
    | { art: 'kopf' | 'luft' | 'fuss' }
    | { art: 'abs'; index: number; teile: Textteil[]; notizen: NummerierterKommentar[] }
    | { art: 'ohne'; erst: boolean; notizen: NummerierterKommentar[] }
    | { art: 'scan'; seite: number; src: string; notizen: NummerierterKommentar[] }
    | {
        art: 'k'
        abschnitt: KastenAbschnitt
        /** Kopf des Kastens („Rückmeldung für …") */
        erst: boolean
        /** Unterer Rand des Kastens */
        letzt: boolean
        /** Ende des Teils (ausschließlich) – null: bis zum Ende des Abschnitts */
        bis: number | null
      }
  )

/** Wie viele teilbare Einträge ein Abschnitt des Kastens hat (Tabellenzeilen, Listenpunkte) */
export function kastenEintraege(r: Rueckmeldung, a: Abgabe, x: KastenAbschnitt): number {
  const b = a.bogen
  if (!b) return 0
  switch (x.art) {
    case 'tabelle':
      return tabellenZeilen(r, b).length
    case 'kriterien':
      return b.kriterien.length
    case 'staerken':
      return b.staerken.length
    case 'schritte':
      return b.schritte.length
    default:
      return 0
  }
}

const teilKey = (basis: string, von: number): string => (von ? `${basis}@${von}` : basis)

/**
 * Die Blöcke eines Blatts in ihrer Reihenfolge – für Ansicht und Druck gleich. `schnitte` teilt
 * Absätze (an Zeichenpositionen) und Abschnitte des Kastens (an Einträgen).
 */
export function blattBloecke(r: Rueckmeldung, a: Abgabe, md: BlattModell, schnitte: Schnitte = {}, mitFuss = true): BlattBlock[] {
  const out: BlattBlock[] = [{ key: 'kopf', basis: 'kopf', von: 0, art: 'kopf' }]
  if (md.scans) md.scans.forEach((s, i) => out.push({ key: `scan-${i}`, basis: `scan-${i}`, von: 0, art: 'scan', seite: i, src: s.src, notizen: s.notizen }))
  else if (md.absaetze) {
    md.absaetze.forEach((abs, i) => {
      const basis = `abs-${i}`
      for (const t of teileSchneiden(abs.teile, abs.notizen, schnitte[basis] ?? []))
        out.push({ key: teilKey(basis, t.von), basis, von: t.von, art: 'abs', index: i, teile: t.teile, notizen: t.notizen })
    })
    notizGruppen(md.ohneStelle, md.gross).forEach((gruppe, k) => out.push({ key: `ohne-${k}`, basis: `ohne-${k}`, von: 0, art: 'ohne', erst: k === 0, notizen: gruppe }))
  }
  if (md.kasten.length) {
    out.push({ key: 'luft', basis: 'luft', von: 0, art: 'luft' })
    md.kasten.forEach((x, i) => {
      const basis = `k-${x.art}`
      const n = kastenEintraege(r, a, x)
      const grenzen = [0, ...[...new Set(schnitte[basis] ?? [])].filter((s) => s > 0 && s < n).sort((p, q) => p - q)]
      grenzen.forEach((von, j) => {
        const bis = j < grenzen.length - 1 ? grenzen[j + 1] : null
        out.push({ key: teilKey(basis, von), basis, von, art: 'k', abschnitt: x, erst: i === 0 && von === 0, letzt: i === md.kasten.length - 1 && bis === null, bis })
      })
    })
  }
  if (mitFuss) out.push({ key: 'fuss', basis: 'fuss', von: 0, art: 'fuss' })
  return out
}

/** Inline-Stil einer nach oben ausgewichenen Randnotiz (Ansicht und Druck) */
export const notizLageStil = (l: NotizLage): string => `height:${l.hoehe}mm;transform:translateY(-${l.hoch}mm);--mass:${l.mass}`

/** Verschobene Notizen und gekappte Textspalten eines Blatts als CSS – für die Ansicht, die React zeichnet */
export function planCss(plan: Pick<SeitenPlan, 'notizen' | 'kappen'>, bereich: string): string {
  const kappen = Object.entries(plan.kappen ?? {}).map(([key, h]) => `${bereich} [data-bl="${key.replace(/[^\w@-]/g, '')}"] .bl-text { max-height: ${h}mm; }`)
  return [...kappen, notizLagenCss(plan.notizen, bereich)].join('\n')
}

/** Die verschobenen Notizen eines Blatts als CSS */
export function notizLagenCss(notizen: Record<string, NotizLage>, bereich: string): string {
  return Object.entries(notizen)
    .map(([nr, l]) => `${bereich} .bl-notiz[data-notiz-nr="${nr.replace(/\D/g, '')}"] { ${notizLageStil(l).replace(/;/g, ' !important;')} !important; }`)
    .join('\n')
}

// ---------- CSS (Ansicht und Druck) ----------

/**
 * Seitenumbruch nach Blockhöhen (ohne Teilen) – nur noch für Schätzungen ohne Messung. Liefert je
 * Umbruch den Block und den freien Rest der Seite davor.
 */
export function seitenUmbrueche(hoehen: number[], seite: number): { index: number; rest: number }[] {
  const out: { index: number; rest: number }[] = []
  let belegt = 0
  hoehen.forEach((h, i) => {
    if (i > 0 && belegt > 0 && belegt + h > seite + 0.5) {
      out.push({ index: i, rest: Math.max(0, seite - belegt) })
      belegt = h
    } else belegt += h
  })
  return out
}

export const HANDSCHRIFT = '"Ink Free", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive'

/**
 * Das Aussehen des Blatts – dieselben Regeln in der Ansicht (Blatt.tsx bindet sie ein) und im
 * PDF. Alle Maße in Millimetern bzw. Punkt, damit Bildschirm und Papier gleich umbrechen.
 */
export const BLATT_CSS = `
.blatt { --zeile: 8mm; --rot: #c62828; --gruen: #2e7d32; --linie: #d3deec; --hand: ${HANDSCHRIFT}; position: relative;
  font-family: Calibri, Carlito, "Segoe UI", "Segoe UI Emoji", Arial, sans-serif; font-size: 11.5pt; line-height: 1.4; color: #1b1b1b;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; overflow-wrap: anywhere; }
.blatt.gross { --zeile: 11mm; font-size: 15.5pt; }
.blatt * { box-sizing: border-box; }
.bl-block { position: relative; break-inside: avoid; page-break-inside: avoid; }
/* Textabsätze und Abschnitte des Kastens dürfen im Druck umbrechen (Sicherheitsnetz ohne Messung);
   zusammen bleiben nur kleine Einheiten */
.bl-abs, .bl-ohne, .bl-k { break-inside: auto; page-break-inside: auto; orphans: 2; widows: 2; }
.bl-notiz, .bl-tab tr, .bl-raster tr, .bl-teiltab tr, .bl-k li, .bl-k-kopf, .bl-auftrag, .bl-schluss { break-inside: avoid; page-break-inside: avoid; }
.bl-k h3 { break-after: avoid; page-break-after: avoid; }
.bl-kopf { padding-bottom: 5mm; z-index: 1; }
.bl-kopf-innen { display: flex; justify-content: space-between; align-items: flex-end; gap: 6mm; border-bottom: 0.35mm solid #333; padding-bottom: 2.5mm; background: #fff; }
.bl-titel { font-size: 16pt; font-weight: 700; line-height: 1.2; }
.blatt.gross .bl-titel { font-size: 20pt; }
.bl-unter { font-size: 9.5pt; color: #555; margin-top: 0.8mm; letter-spacing: 0.02em; }
.bl-name { margin-top: 2.5mm; font-size: 11pt; }
.bl-name small { color: #666; font-size: 9pt; margin-right: 1.5mm; }
.bl-name b { display: inline-block; min-width: 55mm; border-bottom: 0.25mm dotted #888; padding: 0 1mm; font-weight: 600; }
.bl-note { text-align: center; min-width: 28mm; flex: none; }
.bl-note small { display: block; font-size: 8pt; color: #666; }
.bl-note .bl-note-wert { display: inline-block; font-family: var(--hand); color: var(--rot); font-size: 24pt; line-height: 1.15; min-width: 14mm; padding: 0.5mm 3mm 0; margin: 0.5mm 0;
  border: 0.55mm solid var(--rot); border-radius: 52% 46% 55% 45% / 50% 58% 42% 50%; transform: rotate(-4deg); }
.bl-note .bl-note-text { font-family: var(--hand); color: var(--rot); font-size: 11pt; }
.bl-note.vorschlag .bl-note-wert { color: #9a9a9a; border-color: #b5b5b5; border-style: dashed; }
.bl-note.vorschlag .bl-note-text { color: #9a9a9a; }
.bl-ampel { display: inline-block; width: 6mm; height: 6mm; border-radius: 50%; vertical-align: -0.8mm; }
.bl-scan, .bl-ohne { display: grid; grid-template-columns: ${BLATT_MASSE.text}mm ${BLATT_MASSE.rand}mm; }
.bl-text { padding-right: 3.5mm; font-size: 12pt; line-height: var(--zeile); white-space: pre-wrap; overflow-wrap: anywhere;
  background-image: linear-gradient(to bottom, transparent calc(var(--zeile) - 0.3mm), var(--linie) calc(var(--zeile) - 0.3mm));
  background-size: 100% var(--zeile); }
.blatt.gross .bl-text { font-size: 15.5pt; }
.bl-rand { padding: 0.8mm 0 1.5mm 4mm; }
.bl-scan .bl-text, .bl-ohne .bl-text { background: none; }
.bl-ohne .bl-text { font-size: 9pt; color: #777; text-align: right; line-height: 1.4; padding-top: 1.5mm; font-style: italic; }
.bl-m { text-decoration-line: underline; text-decoration-color: var(--rot); text-decoration-thickness: 0.4mm; text-underline-offset: 1.2mm; text-decoration-skip-ink: none; }
.bl-m.wellig { text-decoration-style: wavy; text-decoration-thickness: 0.28mm; }
.bl-m.hinweis { text-decoration-thickness: 0.25mm; }
.bl-m.lob { text-decoration-color: var(--gruen); text-decoration-thickness: 0.55mm; }
.bl-nr-t { font-size: 7pt; font-weight: 700; color: var(--rot); line-height: 0; vertical-align: super; margin-left: 0.3mm; user-select: none; font-family: Calibri, Carlito, Arial, sans-serif; }
.bl-nr-t.lob { color: var(--gruen); }
/* Randnotiz: Schriftgröße über --nf, damit eine unten ausweichende Notiz (--mass < 1) kleiner werden kann,
   ohne dass sich ihr Abstand zur Zeile ändert */
.bl-notiz { --nf: 10.5pt; font-family: var(--hand); color: var(--rot); font-size: calc(var(--nf) * var(--mass, 1)); line-height: 1.22; margin-bottom: 2mm; overflow-wrap: anywhere; }
.blatt.gross .bl-notiz { --nf: 14pt; }
/* Schülertext: Die Textspalte umschließt ihre Notizen (flow-root); jede Notiz floatet aus der Zeile ihrer
   Stelle in den Korrekturrand. Rechnung: Inhalt der Textspalte endet bei ${BLATT_MASSE.text - 3.5} mm; die Notiz
   (${BLATT_MASSE.rand - 4} mm breit) soll bei ${BLATT_MASSE.text + 4} mm beginnen. Ihr Randkasten ist 0,1 mm breit –
   so kostet sie der Zeile keinen Platz; „clear: right" schiebt eine zweite Notiz derselben Zeile unter die erste. */
.bl-abs .bl-text { display: flow-root; width: ${BLATT_MASSE.text}mm; }
.bl-abs .bl-notiz { float: right; clear: right; width: ${BLATT_MASSE.rand - 4}mm; white-space: normal; text-decoration: none; font-style: normal; font-weight: 400;
  margin: calc((var(--zeile) - 1.22 * var(--nf)) / 2) -${BLATT_MASSE.rand + 3.5}mm 1.5mm ${7.5 + 0.1}mm; }
.bl-notiz.lob { color: var(--gruen); }
.bl-nr { display: inline-block; min-width: 4mm; height: 4mm; line-height: 3.6mm; padding: 0 0.6mm; border: 0.25mm solid currentColor; border-radius: 2mm; text-align: center;
  font-family: Calibri, Carlito, Arial, sans-serif; font-size: 7pt; font-weight: 700; margin-right: 1.2mm; vertical-align: 0.4mm; }
.bl-zeichen { font-weight: 700; margin-right: 1.2mm; }
.bl-haken { font-weight: 700; margin-right: 1mm; }
.bl-ow { font-size: 8pt; color: #777; font-family: Calibri, Carlito, Arial, sans-serif; }
.bl-scanbild { position: relative; margin: 1mm 0 3mm; }
.bl-scanbild img { width: 100%; display: block; border: 0.3mm solid #cfcfcf; }
.bl-marker { position: absolute; transform: translate(-50%, -50%); width: 5.5mm; height: 5.5mm; border-radius: 50%; background: var(--rot); color: #fff; font-size: 8pt; font-weight: 700;
  display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 0.4mm #fff; font-family: Calibri, Carlito, Arial, sans-serif; }
.bl-marker.lob { background: var(--gruen); }
.bl-luft { height: 7mm; }
/* Der Kasten bleibt in der Textspalte – links der roten Randlinie, wie auf einer echten Korrektur */
.bl-k, .bl-fuss { max-width: ${BLATT_MASSE.text - 3.5}mm; }
.bl-k { background: #fff; z-index: 1; border-left: 0.35mm solid #444; border-right: 0.35mm solid #444; padding: 1mm 5.5mm 1.5mm; }
.bl-k.erst { border-top: 0.35mm solid #444; border-radius: 2.5mm 2.5mm 0 0; padding-top: 3mm; }
.bl-k.letzt { border-bottom: 0.35mm solid #444; border-radius: 0 0 2.5mm 2.5mm; padding-bottom: 4mm; }
.bl-k.erst.letzt { border-radius: 2.5mm; }
.bl-k-kopf { display: flex; justify-content: space-between; align-items: baseline; gap: 4mm; font-size: 13pt; font-weight: 700; letter-spacing: 0.03em;
  border-bottom: 0.25mm solid #bbb; padding-bottom: 1.5mm; }
.bl-k h3 { font-size: 11.5pt; margin: 2.5mm 0 1mm; font-weight: 700; }
.blatt.gross .bl-k h3 { font-size: 16pt; }
.bl-k ul, .bl-k ol { margin: 0; padding-left: 6mm; }
.bl-k li { margin-bottom: 1mm; }
.bl-k ul.bl-staerken { list-style: none; padding-left: 5.5mm; }
.bl-k ul.bl-staerken > li::before { content: '✓'; color: var(--gruen); font-weight: 700; display: inline-block; width: 5.5mm; margin-left: -5.5mm; }
.bl-tab { width: 100%; border-collapse: collapse; font-size: 10.5pt; table-layout: fixed; }
.blatt.gross .bl-tab { font-size: 14pt; }
.bl-tab td { border-top: 0.2mm solid #cfcfcf; padding: 1.2mm 1.5mm; vertical-align: top; }
.bl-tab tr:first-child td { border-top: none; }
.bl-tab td.k { width: 34%; font-weight: 600; }
.bl-tab td.k small { display: block; font-weight: 400; color: #666; font-size: 8.5pt; }
.bl-tab td.e { width: 22%; white-space: nowrap; }
.bl-tab tr.summe td { font-weight: 700; border-top: 0.35mm solid #888; }
/* Bewertungsraster (29.09.2026): Kriterium kurz und fett, Beschreibung klein darunter; Punkte rechtsbündig;
   Bereiche als Zwischenzeilen mit Zwischensumme; die Kopfzeile steht auf jeder Seite der Tabelle */
.bl-raster { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10pt; margin-top: 0.5mm; }
.blatt.gross .bl-raster { font-size: 13.5pt; }
.bl-raster col.k { width: 45%; }
.bl-raster col.p { width: 13%; }
.bl-raster col.b { width: 42%; }
.bl-raster th { font-size: 8.5pt; font-weight: 600; color: #555; text-align: left; padding: 0.6mm 1.5mm 0.8mm; border-bottom: 0.35mm solid #777; }
.bl-raster td { border-top: 0.2mm solid #d4d4d4; padding: 1.3mm 1.5mm; vertical-align: top; line-height: 1.3; }
.bl-raster tr:first-child td { border-top: none; }
.bl-raster .p { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bl-raster .kn { font-weight: 700; }
.bl-raster .kd { display: block; font-size: 8.5pt; color: #666; font-weight: 400; margin-top: 0.4mm; line-height: 1.25; }
.blatt.gross .bl-raster .kd { font-size: 11.5pt; }
.bl-raster .kb { display: block; font-size: 7.5pt; color: #777; font-weight: 400; text-transform: uppercase; letter-spacing: 0.04em; }
.bl-raster td.b { font-size: 9.5pt; color: #333; }
.blatt.gross .bl-raster td.b { font-size: 13pt; }
.bl-raster tr.bereich td { background: #f0f2f4; font-weight: 700; font-size: 9.5pt; border-top: 0.3mm solid #999; padding-top: 1mm; padding-bottom: 1mm; }
.bl-raster tr.summe td { font-weight: 700; border-top: 0.45mm solid #555; }
/* Bewertung nach Teilen (29.09.2026): erreichte Werte und Gewichte getrennt */
.bl-teiltab { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 0.5mm; }
.blatt.gross .bl-teiltab { font-size: 13.5pt; }
.bl-teiltab th { font-size: 8.5pt; font-weight: 600; color: #555; text-align: left; vertical-align: bottom; line-height: 1.2; padding: 0.6mm 1.5mm 0.8mm; border-bottom: 0.35mm solid #777; }
.bl-teiltab th small, .bl-teiltab td small { display: block; font-weight: 400; color: #777; font-size: 7.5pt; }
.bl-teiltab td { border-top: 0.2mm solid #d4d4d4; padding: 1.2mm 1.5mm; vertical-align: top; line-height: 1.3; }
.bl-teiltab tr:first-child td { border-top: none; }
.bl-teiltab .z { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bl-teiltab td.erg { font-weight: 700; }
.bl-teil-gesamt { margin: 1.2mm 0 0; font-size: 10pt; font-weight: 700; }
.bl-teil-gesamt small { font-weight: 400; color: #666; }
.bl-teil-hinweis { margin: 0.6mm 0 0; font-size: 8pt; color: #777; }
.bl-teile { font-size: 10.5pt; color: #333; margin: 0; }
.bl-auftrag { border-left: 1mm solid #aaa; padding: 0.5mm 0 0.5mm 3mm; }
.bl-auftrag .bl-zitat { font-style: italic; color: #444; margin: 0 0 1mm; }
.bl-auftrag p { margin: 0; }
.bl-schluss { font-family: var(--hand); color: var(--rot); font-size: 13.5pt; line-height: 1.3; margin: 3mm 0 0; }
.blatt.gross .bl-schluss { font-size: 17pt; }
.bl-fuss { padding-top: 3mm; font-size: 8.5pt; color: #555; z-index: 1; }
.bl-fuss p { margin: 0 0 0.8mm; background: #fff; display: inline-block; }
.bl-fuss .bl-ki { display: block; font-size: 7pt; color: #777; margin-top: 1.5mm; }
`

/**
 * Nur für den Druck: Seitenränder, Seitenwechsel, Randlinie auf jeder Seite. Mit Seitenplan steht
 * jede Seite in einem Container fester Höhe (`.bl-seite`) – kein freier Fluss, kein Umbruch mitten
 * in einem Block.
 */
const DRUCK_CSS = `
@page { size: A4; margin: ${BLATT_MASSE.oben}mm ${BLATT_MASSE.rechts}mm ${BLATT_MASSE.unten}mm ${BLATT_MASSE.links}mm; }
html, body { margin: 0; padding: 0; background: #fff; }
.blatt { page-break-after: always; break-after: page; }
.blatt:last-of-type { page-break-after: auto; break-after: auto; }
.blatt.paginiert { page-break-after: auto; break-after: auto; }
.bl-seite { position: relative; height: ${SEITE_NUTZ_MM}mm; overflow: hidden; page-break-after: always; break-after: page; }
.blatt.paginiert:last-of-type > .bl-seite:last-child { page-break-after: auto; break-after: auto; }
.bl-randlinie { position: fixed; top: -${BLATT_MASSE.oben}mm; bottom: -${BLATT_MASSE.unten}mm; left: ${BLATT_MASSE.text}mm; width: 0; border-left: 0.45mm solid #ef9a9a; z-index: 0; }
`

// ---------- Druck-HTML ----------

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function einstufungHtml(e: BlattEinstufung): string {
  if (e.art === 'ampel') return `<span class="bl-ampel" style="background:${AMPEL_FARBE[e.wert] ?? '#999'}"></span>`
  return esc(e.wert)
}

function kopfHtml(k: BlattKopf): string {
  const e = k.einstufung
  const note = e
    ? `<div class="bl-note${e.bestaetigt ? '' : ' vorschlag'}"><small>${esc(e.skala)}</small><span class="bl-note-wert">${einstufungHtml(e)}</span>${
        e.text || e.art === 'ampel' ? `<br><span class="bl-note-text">${esc(e.art === 'ampel' ? e.wert : e.text)}</span>` : ''
      }</div>`
    : ''
  return `<div class="bl-kopf-innen"><div class="bl-kopf-links"><div class="bl-titel">${esc(k.titel)}</div><div class="bl-unter">${esc(k.unter)}</div><div class="bl-name"><small>Name</small><b>${esc(
    k.name
  )}</b></div></div>${note}</div>`
}

/** Eine Randnotiz: Nummer, Häkchen bzw. Korrekturzeichen, Text (ein doppeltes Zeichen fällt weg) */
export function notizHtml(g: NummerierterKommentar, n: (s: string) => string, lage?: NotizLage): string {
  const k = g.k
  return `<div class="bl-notiz ${k.art}"${lage ? ` style="${notizLageStil(lage)}"` : ''}><span class="bl-nr">${g.nr}</span>${
    k.art === 'lob' ? '<span class="bl-haken">✓</span>' : ''
  }${k.zeichen ? `<span class="bl-zeichen">${esc(k.zeichen)}:</span>` : ''}${esc(n(notizText(k)))}${k.ohneWertung ? ' <span class="bl-ow">(ohne Wertung)</span>' : ''}</div>`
}

/** Eine Stelle im Text – angestrichen und nummeriert */
export function teilHtml(t: Textteil, stil: (nr: number | undefined) => ReturnType<typeof markenStil>): string {
  if (!t.art) return esc(t.text)
  const s = t.nr != null ? stil(t.nr) : t.art === 'lob' ? 'lob' : t.art === 'hinweis' ? 'hinweis' : 'fehler'
  const nr = t.nr != null ? `<sup class="bl-nr-t ${s === 'lob' ? 'lob' : ''}">${s === 'lob' ? '✓' : ''}${t.text ? '' : ','}${t.nr}</sup>` : ''
  return `${t.text ? `<span class="bl-m ${s}">${esc(t.text)}</span>` : ''}${nr}`
}

/** Kopf der Bewertungstabelle – steht auf jeder Seite, auf der die Tabelle weitergeht */
export const RASTER_KOPF = ['Kriterium', 'Punkte', 'Begründung'] as const

function rasterHtml(zeilen: TabZeile[], n: (s: string) => string, mitPunkten: boolean): string {
  const koerper = zeilen
    .map((z) => {
      if (z.art === 'bereich')
        return `<tr class="bereich" data-bl-teil><td>${esc(z.titel)}</td><td class="p">${z.moeglich ? `${dez(z.erreicht)} / ${z.moeglich}` : ''}</td><td></td></tr>`
      if (z.art === 'summe') return `<tr class="summe" data-bl-teil><td>Summe</td><td class="p">${dez(z.erreicht)} / ${z.moeglich}</td><td></td></tr>`
      return `<tr data-bl-teil><td>${z.bereich ? `<span class="kb">${esc(z.bereich)}</span>` : ''}<span class="kn">${esc(z.name)}</span>${
        z.deskriptor ? `<span class="kd">${esc(z.deskriptor)}</span>` : ''
      }</td><td class="p">${esc(tabWert(z))}</td><td class="b">${z.begruendung ? esc(n(z.begruendung)) : ''}</td></tr>`
    })
    .join('')
  return `<table class="bl-raster"><colgroup><col class="k"><col class="p"><col class="b"></colgroup><thead><tr><th>${RASTER_KOPF[0]}</th><th class="p">${
    mitPunkten ? RASTER_KOPF[1] : 'Stufe'
  }</th><th>${RASTER_KOPF[2]}</th></tr></thead><tbody>${koerper}</tbody></table>`
}

/** Bewertung nach Teilen als kleine Tabelle (Druck) */
export function teilTabelleHtml(tt: TeilTabelle): string {
  const gewicht = (g: number | undefined): string => (g != null ? `<small>Gewicht ${g} %</small>` : '')
  const kopf = tt.getrennt
    ? `<tr><th>Teil</th><th class="z">zählt</th><th class="z">Inhalt erreicht${gewicht(tt.gewichtEinheitlich ?? undefined)}</th><th class="z">Sprache erreicht${gewicht(
        tt.gewichtEinheitlich != null ? 100 - tt.gewichtEinheitlich : undefined
      )}</th><th class="z">Ergebnis</th></tr>`
    : '<tr><th>Teil</th><th class="z">zählt</th><th class="z">Ergebnis</th></tr>'
  const prozent = (x: number | undefined | null): string => (x != null ? `${x} %` : '–')
  const zeilen = tt.zeilen
    .map((z) => {
      const einzeln = tt.gewichtEinheitlich == null && z.getrennt
      const mitte = tt.getrennt
        ? z.getrennt
          ? `<td class="z">${prozent(z.inhalt)}${einzeln ? gewicht(z.gewichtInhalt) : ''}</td><td class="z">${prozent(z.sprache)}${einzeln ? gewicht(100 - (z.gewichtInhalt ?? 0)) : ''}</td>`
          : `<td class="z" colspan="2">erfüllt ${prozent(z.anteil)}</td>`
        : ''
      return `<tr><td>${esc(z.titel)}</td><td class="z">${esc(z.zaehlt)}</td>${mitte}<td class="z erg">${prozent(z.ergebnis)}${z.gedeckelt ? '*' : ''}</td></tr>`
    })
    .join('')
  const deckel = tt.zeilen.some((z) => z.gedeckelt) ? '<p class="bl-teil-hinweis">* höchstens 20 %, weil Inhalt oder Sprache ungenügend ist</p>' : ''
  return `<table class="bl-teiltab"><thead>${kopf}</thead><tbody>${zeilen}</tbody></table>${tt.gesamtText ? `<p class="bl-teil-gesamt">${esc(tt.gesamtText)}</p>` : ''}${deckel}`
}

/** Ein Abschnitt des Kastens (bzw. sein Teil `von`–`bis`) als HTML */
function kastenTeilHtml(r: Rueckmeldung, a: Abgabe, x: KastenAbschnitt, von: number, bis: number | null): string {
  const b = a.bogen as Bogen
  const n = (s: string): string => esc(mitName(s, a))
  const art = einstufungVon(r.meta)
  const ab = <T>(liste: T[]): T[] => liste.slice(von, bis ?? undefined)
  const kopf = von === 0 ? `<h3>${esc(x.titel)}</h3>` : ''
  switch (x.art) {
    case 'teile': {
      const tt = teilTabelle(r, b)
      return tt ? `${kopf}${teilTabelleHtml(tt)}` : ''
    }
    case 'tabelle': {
      const t = r.tabelle!
      return `${kopf}${rasterHtml(ab(tabellenZeilen(r, b)), (s) => mitName(s, a), t.kriterien.some((k) => k.punkte))}`
    }
    case 'staerken':
      return `${kopf}<ul class="bl-staerken">${ab(b.staerken)
        .map((s) => `<li data-bl-teil>${n(s)}</li>`)
        .join('')}</ul>`
    case 'schritte':
      return `${kopf}<ol${von ? ` start="${von + 1}"` : ''}>${ab(b.schritte)
        .map((s) => `<li data-bl-teil>${n(s)}</li>`)
        .join('')}</ol>`
    case 'kriterien':
      return `${kopf}<table class="bl-tab"><tbody>${ab(b.kriterien.map((k, i) => ({ k, i })))
        .map(({ k, i }) => {
          const w = x.mitStufe ? bestaetigt(b.kriterienStufen?.[i]) : null
          const e = x.mitStufe ? (w ? (art === 'ampel' ? einstufungHtml(einstufungFuer(r, w)) + ' ' + esc(w.wert) : esc(wertText(art, w.wert))) : '') : `${SYMBOL[k.einschaetzung]} ${esc(k.einschaetzung)}`
          return `<tr data-bl-teil><td class="k">${n(k.kriterium)}</td><td class="e">${e}</td><td>${k.beleg ? `„${n(k.beleg)}“` : ''}</td></tr>`
        })
        .join('')}</tbody></table>`
    case 'ueberarbeitung':
      return b.ueberarbeitung
        ? `${kopf}<div class="bl-auftrag">${b.ueberarbeitung.zitat ? `<p class="bl-zitat">„${n(b.ueberarbeitung.zitat)}“</p>` : ''}<p>${n(b.ueberarbeitung.auftrag)}</p></div>`
        : ''
    case 'schluss':
      return b.schluss ? `<p class="bl-schluss">${n(b.schluss)}</p>` : ''
  }
}

/** Kennung eines Blocks im HTML – danach misst der Seitenplan */
const blockAttr = (b: BlattBlock): string => `data-bl="${esc(b.key)}" data-bl-basis="${esc(b.basis)}" data-bl-von="${b.von}" data-bl-art="${b.art}"`

export interface DruckOptionen extends BlattOptionen {
  /** Gemessener Seitenplan: Schnitte, Seiten-Container, verschobene Notizen */
  plan?: SeitenPlan
  /** Messdurchgang: Schnitte anwenden, aber noch ohne Seiten-Container und ohne verschobene Notizen */
  messen?: boolean
}

/**
 * Ein Blatt als HTML – je Abgabe ein `<section class="blatt">`. Mit Seitenplan stehen die Blöcke in
 * Seiten-Containern fester Höhe (dieselben Seiten wie in der Ansicht), sonst im freien Fluss.
 */
export function blattHtml(r: Rueckmeldung, a: Abgabe, opt: DruckOptionen = {}): string {
  const plan = opt.plan
  const md = blattModell(r, a, { ...opt, ansicht: false, vorteilen: plan ? false : opt.vorteilen })
  const n = (s: string): string => mitName(s, a)
  const stil = (nr: number | undefined): ReturnType<typeof markenStil> => (nr != null ? (md.stilVon.get(nr) ?? 'fehler') : 'fehler')
  const lage = (g: NummerierterKommentar): NotizLage | undefined => (plan && !opt.messen ? plan.notizen[String(g.nr)] : undefined)
  // Absatz am Seitenende mit überstehenden Randnotizen: Textspalte endet an der Seitenunterkante
  const kappe = (key: string): string => (plan && !opt.messen && plan.kappen?.[key] ? ` style="max-height:${plan.kappen[key]}mm"` : '')
  const vermerk = vermerkSichtbar(r.meta.ki, r.meta.kiVermerk, false) && r.meta.ki ? `<span class="bl-ki">${esc(kiVermerkText(r.meta.ki))}</span>` : ''
  const bloecke = blattBloecke(r, a, md, plan?.schnitte ?? {}, Boolean(md.legende.length || vermerk))
  const html = bloecke
    .map((b): string => {
      const at = blockAttr(b)
      switch (b.art) {
        case 'kopf':
          return `<div class="bl-block bl-kopf" ${at}>${kopfHtml(md.kopf)}</div>`
        case 'scan': {
          const marker = b.notizen.map((g) => `<span class="bl-marker ${g.k.art}" style="left:${g.k.x ?? 50}%;top:${g.k.y ?? 50}%">${g.nr}</span>`).join('')
          return `<div class="bl-block bl-scan" ${at}><div class="bl-text"><div class="bl-scanbild"><img src="${b.src}" alt="">${marker}</div></div><div class="bl-rand">${b.notizen
            .map((g) => notizHtml(g, n, lage(g)))
            .join('')}</div></div>`
        }
        case 'abs':
          return `<div class="bl-block bl-abs" ${at}><div class="bl-text"${kappe(b.key)}>${absatzFolge(b.teile, b.notizen)
            .map((x) => ('teil' in x ? teilHtml(x.teil, stil) : notizHtml(x.notiz, n, lage(x.notiz))))
            .join('')}</div></div>`
        case 'ohne':
          return `<div class="bl-block bl-ohne" ${at}><div class="bl-text">${b.erst ? 'Ohne Stelle im Text:' : ''}</div><div class="bl-rand">${b.notizen
            .map((g) => notizHtml(g, n, lage(g)))
            .join('')}</div></div>`
        case 'luft':
          return `<div class="bl-block bl-luft" ${at}></div>`
        case 'k': {
          const inhalt = kastenTeilHtml(r, a, b.abschnitt, b.von, b.bis)
          const kopf = b.erst ? `<div class="bl-k-kopf"><span>${esc(kastenTitel(md.kopf.name))}</span></div>` : ''
          return `<div class="bl-block bl-k${b.erst ? ' erst' : ''}${b.letzt ? ' letzt' : ''}${b.von ? ' fort' : ''}" ${at}>${kopf}${inhalt}</div>`
        }
        case 'fuss':
          return `<div class="bl-block bl-fuss" ${at}>${md.legende.map((z) => `<p>${esc(z)}</p><br>`).join('')}${vermerk}</div>`
      }
    })
  const klasse = `blatt seite${md.gross ? ' gross' : ''}`
  if (!plan || opt.messen) return `<section class="${klasse}" data-bl-blatt="${esc(a.id)}">${html.join('\n')}</section>`
  // Seiten-Container: ein neuer beginnt vor jedem Block, mit dem laut Plan eine Seite anfängt
  const anfaenge = new Set(plan.seiten.map((s) => s.start))
  const seiten: string[][] = [[]]
  bloecke.forEach((b, i) => {
    if (anfaenge.has(b.key) && seiten[seiten.length - 1].length) seiten.push([])
    seiten[seiten.length - 1].push(html[i])
  })
  return `<section class="${klasse} paginiert" data-bl-blatt="${esc(a.id)}" data-bl-seiten="${seiten.length}">${seiten
    .map((s, k) => `<div class="bl-seite" data-bl-seite="${k + 1}">${s.join('\n')}</div>`)
    .join('\n')}</section>`
}

/** Das ganze Druckdokument (PDF, Drucken) – dieselben Regeln wie die Ansicht */
export function blattDokument(titel: string, sektionen: string[], kopfZusatz = ''): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(titel)}</title>${kopfZusatz}<style>${DRUCK_CSS}${BLATT_CSS}</style></head><body><div class="bl-randlinie"></div>${sektionen.join(
    '\n'
  )}</body></html>`
}
