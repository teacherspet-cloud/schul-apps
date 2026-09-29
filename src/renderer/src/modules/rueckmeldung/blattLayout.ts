/**
 * Das Blatt der Rückmeldung (29.09.2026, Wunsch der Lehrkraft: „statt vieler Textfelder eine Art
 * DIN-A4-Seite, die genau zeigt, wie die ausgedruckte Rückmeldung aussieht – mit echtem
 * Blatt-Design, auf dem Schülertext und Feedback stehen").
 *
 * Abgestimmt (Multiple Choice, 29.09.2026):
 * - Kopf mit Titel, Name, Klasse und der Einstufung rechts (rot, handschriftlich eingekreist).
 * - Schülertext OBEN auf liniertem Papier, rechts der Korrekturrand hinter einer roten Randlinie:
 *   Stelle unterstrichen (Wellenlinie bei Ausdrucksfehlern), Nummer, Korrekturzeichen und
 *   Verbesserung in Handschrift-Anmutung und Rot; Lob grün mit Häkchen.
 * - Darunter der Kasten „Rückmeldung": Bewertung nach Teilen, Bewertungstabelle, Stärken, nächste
 *   Schritte, Kriterien, Überarbeitungsauftrag, Schlusssatz (handschriftlich).
 * - Scans: die Seitenbilder mit den nummerierten Markern, die Notizen am Rand daneben.
 * - Mehrseitig: Jeder Absatz und jeder Abschnitt des Kastens ist ein „Block", der nicht zerteilt
 *   wird; die Ansicht bricht die Seiten nach denselben Blöcken um wie der Druck.
 *
 * AUSDRUCK = ANSICHT: Diese Datei liefert das gemeinsame Modell (Kopf, Absätze mit Marken und
 * Randnotizen, Abschnitte des Kastens), das gemeinsame CSS (in Millimetern) und das Druck-HTML.
 * Die Ansicht (steps/Blatt.tsx) zeichnet dasselbe Modell mit denselben Klassen – nur mit
 * Bearbeitungsknöpfen, die im Druck fehlen. Kein React hier, damit die Tests ohne Oberfläche laufen.
 *
 * Handschrift: „Ink Free" gehört zu Windows 10/11; ohne sie greifen „Segoe Print", „Bradley Hand"
 * (macOS) und „Comic Sans MS". Keine Webfonts – die App läuft ohne Netz.
 */
import { setzeNamenEin, ersetzeNamen } from '@shared/pseudonymisierung'
import { kiVermerkText, vermerkSichtbar } from '@shared/kiKennzeichnung'
import { legende, type Korrekturzeichen } from '../../shared/korrekturzeichen'
import { EINSTUFUNGEN, einstufungVon, gesamtEinstufen, hatForm, kriterienEinstufen, LEGENDEN, tabellenSumme, wertText } from './art'
import { randLayout, scanReihenfolge, type NummerierterKommentar, type Textteil } from './korrekturrand'
import { hatMassnahme } from './nachteilsausgleich'
import { bogenUeberschriften, type BogenUeberschriften } from './render/texte'
import { teilZeilenFuerBogen } from './teilbewertung'
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
}

const bestaetigt = (w: Einstufungswert | null | undefined): Einstufungswert | null => (w?.bestaetigt && w.wert ? w : null)

function einstufungFuer(r: Rueckmeldung, w: Einstufungswert): BlattEinstufung {
  const art = einstufungVon(r.meta)
  const lang = wertText(art, w.wert)
  // „2− (gut)" → Wert „2−", Text „gut"; „11 Punkte" → „11", „Punkte"; Smileys/++ mit Erklärung
  const rest = lang.startsWith(w.wert) ? lang.slice(w.wert.length).trim().replace(/^\((.*)\)$/, '$1') : ''
  return { art, skala: skalenName(r), wert: w.wert, text: art === 'ampel' ? '' : rest, bestaetigt: Boolean(w.bestaetigt) }
}

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
  if (hatForm(m, 'tabelle') && r.tabelle && b.tabelle?.length) out.push({ art: 'tabelle', titel: u.tabelle })
  if (hatForm(m, 'schriftlich') && (ansicht || b.staerken.length)) out.push({ art: 'staerken', titel: u.staerken })
  if (hatForm(m, 'tipps') && (ansicht || b.schritte.length)) out.push({ art: 'schritte', titel: u.schritte })
  if (b.kriterien.length && (hatForm(m, 'schriftlich') || kriterienEinstufen(m))) out.push({ art: 'kriterien', titel: u.kriterien, mitStufe: kriterienEinstufen(m) })
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
  if (aufScan(a)) {
    const reihe = scanReihenfolge(rand)
    scans = a.scans!.map((src, s) => ({ src, notizen: reihe.filter((g) => (g.k.seite ?? 0) === s) }))
    for (const g of reihe) stilVon.set(g.nr, markenStil(g.k))
  } else if (a.text.trim()) {
    const layout = randLayout(n(a.text), rand, n)
    absaetze = layout.absaetze.map((x) => ({ teile: x.teile, notizen: x.kommentare }))
    ohneStelle = layout.ohneStelle
    for (const g of [...layout.absaetze.flatMap((x) => x.kommentare), ...ohneStelle]) stilVon.set(g.nr, markenStil(g.k))
  }
  const legendeZeilen: string[] = []
  const benutzt = legende(opt.zeichen ?? [], rand.map((k) => k.zeichen ?? '').filter(Boolean))
  if (benutzt.length) legendeZeilen.push(benutzt.map((z) => `${z.zeichen}${z.bedeutung ? ` = ${z.bedeutung}` : ''}`).join(' · '))
  const kasten = kastenAbschnitte(r, a, opt.ansicht)
  if (kasten.some((k) => k.art === 'kriterien' && !k.mitStufe)) legendeZeilen.push(EINSCHAETZUNG_LEGENDE)
  if (LEGENDEN[art] && ((w && kopf.einstufung) || kriterienEinstufen(m))) legendeZeilen.push(LEGENDEN[art]!)
  return { kopf, absaetze, ohneStelle, scans, stilVon, kasten, legende: legendeZeilen, gross: hatMassnahme(a.ausgleich, 'grossdruck'), u }
}

// ---------- CSS (Ansicht und Druck) ----------

/** Maße des Blatts in Millimetern – Druckränder, Textspalte, Korrekturrand */
export const BLATT_MASSE = { breite: 210, hoehe: 297, oben: 15, unten: 15, links: 18, rechts: 12, text: 124, rand: 56 } as const
/** Nutzbare Höhe einer Seite */
export const SEITEN_HOEHE_MM = BLATT_MASSE.hoehe - BLATT_MASSE.oben - BLATT_MASSE.unten

/**
 * Seitenumbruch wie im Druck: Blöcke werden nicht zerteilt; passt ein Block nicht mehr auf die
 * Seite, beginnt mit ihm die nächste. Liefert je Umbruch den Block und den freien Rest der Seite
 * davor (dieselbe Einheit wie die Höhen). Ein Block, der allein höher ist als eine Seite, bleibt
 * auf seiner Seite (der Druck zerteilt ihn dann).
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
.blatt { --zeile: 8mm; --rot: #c62828; --gruen: #2e7d32; --linie: #d3deec; --hand: ${HANDSCHRIFT};
  font-family: Calibri, Carlito, "Segoe UI", "Segoe UI Emoji", Arial, sans-serif; font-size: 11.5pt; line-height: 1.4; color: #1b1b1b;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.blatt.gross { --zeile: 11mm; font-size: 15.5pt; }
.blatt * { box-sizing: border-box; }
.bl-block { position: relative; break-inside: avoid; page-break-inside: avoid; }
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
.bl-abs, .bl-scan, .bl-ohne { display: grid; grid-template-columns: ${BLATT_MASSE.text}mm ${BLATT_MASSE.rand}mm; }
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
.bl-notiz { font-family: var(--hand); color: var(--rot); font-size: 10.5pt; line-height: 1.22; margin-bottom: 2mm; overflow-wrap: anywhere; }
.blatt.gross .bl-notiz { font-size: 14pt; }
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
.bl-tab { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
.blatt.gross .bl-tab { font-size: 14pt; }
.bl-tab td { border-top: 0.2mm solid #cfcfcf; padding: 1.2mm 1.5mm; vertical-align: top; }
.bl-tab tr:first-child td { border-top: none; }
.bl-tab td.k { width: 34%; font-weight: 600; }
.bl-tab td.k small { display: block; font-weight: 400; color: #666; font-size: 8.5pt; }
.bl-tab td.e { width: 22%; white-space: nowrap; }
.bl-tab tr.summe td { font-weight: 700; border-top: 0.35mm solid #888; }
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

/** Nur für den Druck: Seitenränder, Seitenwechsel je Blatt, Randlinie auf jeder Seite */
const DRUCK_CSS = `
@page { size: A4; margin: ${BLATT_MASSE.oben}mm ${BLATT_MASSE.rechts}mm ${BLATT_MASSE.unten}mm ${BLATT_MASSE.links}mm; }
html, body { margin: 0; padding: 0; background: #fff; }
.blatt { page-break-after: always; break-after: page; }
.blatt:last-of-type { page-break-after: auto; break-after: auto; }
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
  return `<div class="bl-block bl-kopf"><div class="bl-kopf-innen"><div class="bl-kopf-links"><div class="bl-titel">${esc(k.titel)}</div><div class="bl-unter">${esc(
    k.unter
  )}</div><div class="bl-name"><small>Name</small><b>${esc(k.name)}</b></div></div>${note}</div></div>`
}

/** Eine Randnotiz: Nummer, Häkchen bzw. Korrekturzeichen, Text */
export function notizHtml(g: NummerierterKommentar, n: (s: string) => string): string {
  const k = g.k
  return `<div class="bl-notiz ${k.art}"><span class="bl-nr">${g.nr}</span>${k.art === 'lob' ? '<span class="bl-haken">✓</span>' : ''}${
    k.zeichen ? `<span class="bl-zeichen">${esc(k.zeichen)}:</span>` : ''
  }${esc(n(k.text))}${k.ohneWertung ? ' <span class="bl-ow">(ohne Wertung)</span>' : ''}</div>`
}

/** Eine Stelle im Text – angestrichen und nummeriert */
export function teilHtml(t: Textteil, stil: (nr: number | undefined) => ReturnType<typeof markenStil>): string {
  if (!t.art) return esc(t.text)
  const s = t.nr != null ? stil(t.nr) : t.art === 'lob' ? 'lob' : t.art === 'hinweis' ? 'hinweis' : 'fehler'
  const nr = t.nr != null ? `<sup class="bl-nr-t ${s === 'lob' ? 'lob' : ''}">${s === 'lob' ? '✓' : ''}${t.text ? '' : ','}${t.nr}</sup>` : ''
  return `${t.text ? `<span class="bl-m ${s}">${esc(t.text)}</span>` : ''}${nr}`
}

function kastenHtml(r: Rueckmeldung, a: Abgabe, abschnitte: KastenAbschnitt[]): string[] {
  const b = a.bogen as Bogen
  const n = (s: string): string => esc(mitName(s, a))
  const art = einstufungVon(r.meta)
  const bloecke = abschnitte.map((x) => {
    switch (x.art) {
      case 'teile':
        return `<h3>${esc(x.titel)}</h3><p class="bl-teile">${x.zeilen.map(esc).join('<br>')}</p>`
      case 'tabelle': {
        const t = r.tabelle!
        const summe = tabellenSumme(t, b.tabelle)
        const zeilen = t.kriterien
          .map((k) => {
            const w = b.tabelle!.find((y) => y.kriteriumId === k.id)
            const wert = k.punkte ? `${w?.punkte ?? '–'} / ${k.punkte}` : w?.stufe != null ? esc(t.stufen[w.stufe] ?? '') : '–'
            return `<tr><td class="k">${k.bereich ? `<small>${esc(k.bereich)}</small>` : ''}${esc(k.kriterium)}</td><td class="e">${wert}</td><td>${w?.begruendung ? n(w.begruendung) : ''}</td></tr>`
          })
          .join('')
        const summenZeile = summe.moeglich ? `<tr class="summe"><td class="k">Summe</td><td class="e">${summe.erreicht} / ${summe.moeglich}</td><td></td></tr>` : ''
        return `<h3>${esc(x.titel)}</h3><table class="bl-tab"><tbody>${zeilen}${summenZeile}</tbody></table>`
      }
      case 'staerken':
        return `<h3>${esc(x.titel)}</h3><ul class="bl-staerken">${b.staerken.map((s) => `<li>${n(s)}</li>`).join('')}</ul>`
      case 'schritte':
        return `<h3>${esc(x.titel)}</h3><ol>${b.schritte.map((s) => `<li>${n(s)}</li>`).join('')}</ol>`
      case 'kriterien':
        return `<h3>${esc(x.titel)}</h3><table class="bl-tab"><tbody>${b.kriterien
          .map((k, i) => {
            const w = x.mitStufe ? bestaetigt(b.kriterienStufen?.[i]) : null
            const e = x.mitStufe ? (w ? (art === 'ampel' ? einstufungHtml(einstufungFuer(r, w)) + ' ' + esc(w.wert) : esc(wertText(art, w.wert))) : '') : `${SYMBOL[k.einschaetzung]} ${esc(k.einschaetzung)}`
            return `<tr><td class="k">${n(k.kriterium)}</td><td class="e">${e}</td><td>${k.beleg ? `„${n(k.beleg)}“` : ''}</td></tr>`
          })
          .join('')}</tbody></table>`
      case 'ueberarbeitung':
        return b.ueberarbeitung
          ? `<h3>${esc(x.titel)}</h3><div class="bl-auftrag">${b.ueberarbeitung.zitat ? `<p class="bl-zitat">„${n(b.ueberarbeitung.zitat)}“</p>` : ''}<p>${n(b.ueberarbeitung.auftrag)}</p></div>`
          : ''
      case 'schluss':
        return b.schluss ? `<p class="bl-schluss">${n(b.schluss)}</p>` : ''
    }
  })
  return bloecke.filter(Boolean)
}

/** Ein Blatt als HTML (ohne Seitenrahmen) – je Abgabe ein `<section class="blatt">` */
export function blattHtml(r: Rueckmeldung, a: Abgabe, opt: BlattOptionen = {}): string {
  const md = blattModell(r, a, { ...opt, ansicht: false })
  const n = (s: string): string => mitName(s, a)
  const stil = (nr: number | undefined): ReturnType<typeof markenStil> => (nr != null ? (md.stilVon.get(nr) ?? 'fehler') : 'fehler')
  const teile: string[] = [kopfHtml(md.kopf)]
  if (md.scans) {
    for (const s of md.scans) {
      const marker = s.notizen.map((g) => `<span class="bl-marker ${g.k.art}" style="left:${g.k.x ?? 50}%;top:${g.k.y ?? 50}%">${g.nr}</span>`).join('')
      teile.push(
        `<div class="bl-block bl-scan"><div class="bl-text"><div class="bl-scanbild"><img src="${s.src}" alt="">${marker}</div></div><div class="bl-rand">${s.notizen
          .map((g) => notizHtml(g, n))
          .join('')}</div></div>`
      )
    }
  } else if (md.absaetze) {
    for (const abs of md.absaetze)
      teile.push(
        `<div class="bl-block bl-abs"><div class="bl-text">${abs.teile.map((t) => teilHtml(t, stil)).join('')}</div><div class="bl-rand">${abs.notizen
          .map((g) => notizHtml(g, n))
          .join('')}</div></div>`
      )
    if (md.ohneStelle.length)
      teile.push(`<div class="bl-block bl-ohne"><div class="bl-text">Ohne Stelle im Text:</div><div class="bl-rand">${md.ohneStelle.map((g) => notizHtml(g, n)).join('')}</div></div>`)
  }
  const kasten = kastenHtml(r, a, md.kasten)
  if (kasten.length) {
    teile.push('<div class="bl-block bl-luft"></div>')
    kasten.forEach((k, i) => {
      const kopf = i === 0 ? `<div class="bl-k-kopf"><span>${esc(kastenTitel(md.kopf.name))}</span></div>` : ''
      teile.push(`<div class="bl-block bl-k${i === 0 ? ' erst' : ''}${i === kasten.length - 1 ? ' letzt' : ''}">${kopf}${k}</div>`)
    })
  }
  const vermerk = vermerkSichtbar(r.meta.ki, r.meta.kiVermerk, false) && r.meta.ki ? `<span class="bl-ki">${esc(kiVermerkText(r.meta.ki))}</span>` : ''
  if (md.legende.length || vermerk) teile.push(`<div class="bl-block bl-fuss">${md.legende.map((z) => `<p>${esc(z)}</p><br>`).join('')}${vermerk}</div>`)
  return `<section class="blatt seite${md.gross ? ' gross' : ''}">${teile.join('\n')}</section>`
}

/** Das ganze Druckdokument (PDF, Drucken) – dieselben Regeln wie die Ansicht */
export function blattDokument(titel: string, sektionen: string[], kopfZusatz = ''): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(titel)}</title>${kopfZusatz}<style>${DRUCK_CSS}${BLATT_CSS}</style></head><body><div class="bl-randlinie"></div>${sektionen.join(
    '\n'
  )}</body></html>`
}
