/**
 * Elternbrief als PDF und Word (Großprogramm 0.4, F7): die deutsche Fassung, danach je
 * Übersetzung eine Seite (Arabisch, Persisch, Dari, Paschtu von rechts nach links), mit
 * Schullogo und Schulname im Kopf und dem Vermerk zur maschinellen Übersetzung.
 *
 * Seit 09.10.2026 nach DIN 5008 Form B (din5008.ts): Ränder, Briefkopf 45 mm, Anschriftfeld mit „An die Eltern und
 * Erziehungsberechtigten der Klasse …", Informationsblock mit Ort und Datum, Leerzeilen in ganzen Zeilen der
 * Brieftextschrift. Fettdruck (**…**) und die unterstrichene Rückgabefrist kommen aus hervorhebung.ts.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  ImageRun,
  LineRuleType,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType
} from 'docx'
import { kiMetaTag, kiWordEigenschaften } from '@shared/kiKennzeichnung'
import { spracheNach } from '../../shared/familiensprachen'
import { dataUrlBytes } from '../../shared/export/docxKit'
import { DEUTSCHER_VERMERK, type BriefText, type Elternbrief } from './model'
import { WORD_TRENNUNG } from '@renderer/shared/silbentrennung'
import { DIN5008, empfaengerZeile, KOPF, leerPt, leerTwips, mmTwips, ZEILE_PT } from './din5008'
import { fettHtml, fristMuster, ohneFett, stuecke } from './hervorhebung'

/**
 * Briefkopf (29.09.2026): Absender oben links (Lehrkraft, Schule, Straße, PLZ Ort, Telefon),
 * Logo rechts daneben, darunter rechts „Ort, Datum" – nach dem Vorbild DIN 5008.
 */
export interface Briefkopf {
  schule: string
  logo: string | null
  lehrkraft?: string
  strasse?: string
  plz?: string
  ort?: string
  telefon?: string
  /** E-Mail der Schule (09.10.2026) */
  email?: string
  /** Bild der Unterschrift (PNG, durchsichtig) – steht über dem Namen unter dem Gruß */
  unterschrift?: string | null
  /** Funktion unter dem Namen, z. B. „Klassenleitung 6b" (09.10.2026) */
  funktion?: string
}

/** Zeilen des Absenders, leere weggelassen */
export function absenderZeilen(kopf: Briefkopf, absender: string): string[] {
  return [
    absender.trim() || kopf.lehrkraft?.trim() || '',
    kopf.schule.trim(),
    kopf.strasse?.trim() ?? '',
    [kopf.plz?.trim(), kopf.ort?.trim()].filter(Boolean).join(' '),
    kopf.telefon?.trim() ? `Tel. ${kopf.telefon.trim()}` : '',
    kopf.email?.trim() ?? ''
  ].filter(Boolean)
}

/** „Bremerhaven, 29. September 2026" – ohne Ort nur das Datum */
export const ortDatum = (kopf: Briefkopf, iso: string): string => [kopf.ort?.trim(), datumDe(iso)].filter(Boolean).join(', ')

/** Schulangaben aus der Schul-Einrichtung des Servers (shared/schulEinrichtung.ts) – nur die Felder, die der Briefkopf nutzt */
export interface SchulKopfDaten {
  name?: string
  strasse?: string
  plz?: string
  ort?: string
  telefon?: string
  email?: string
}

/**
 * Rückfall auf die Schule des Servers (09.10.2026): Was die Lehrkraft nicht selbst eingetragen hat (Schulname,
 * Anschrift, Telefon, E-Mail, Logo), kommt aus der Schul-Einrichtung der Verwaltung. Eigene Angaben gehen immer vor.
 */
export function kopfMitSchule(kopf: Briefkopf, schule: SchulKopfDaten | null | undefined, logo?: string | null): Briefkopf {
  if (!schule) return kopf
  const oder = (eigen: string | undefined, rueck: string | undefined): string => eigen?.trim() || rueck?.trim() || ''
  return {
    ...kopf,
    schule: oder(kopf.schule, schule.name),
    strasse: oder(kopf.strasse, schule.strasse),
    plz: oder(kopf.plz, schule.plz),
    ort: oder(kopf.ort, schule.ort),
    telefon: oder(kopf.telefon, schule.telefon),
    email: oder(kopf.email, schule.email),
    logo: kopf.logo || logo || null
  }
}

interface Seite {
  text: BriefText
  sprache: string
  rtl: boolean
  eigen?: string
}

function seiten(b: Elternbrief, codes?: string[]): Seite[] {
  if (!b.text) return []
  // `codes` wählt die Fassungen (Seitenauswahl, 01.10.2026) – mit „de" auch die deutsche
  const out: Seite[] = !codes || codes.includes('de') ? [{ text: b.text, sprache: 'de', rtl: false }] : []
  for (const u of b.uebersetzungen) {
    if (codes && !codes.includes(u.code)) continue
    const s = spracheNach(u.code)
    out.push({ text: u.text, sprache: u.code, rtl: Boolean(s?.rtl), eigen: s ? `${s.eigen} · ${s.name}` : u.code })
  }
  return out
}

function datumDe(iso: string): string {
  return iso ? new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
}

// ---------- PDF (HTML) ----------

const mm = (n: number): string => `${n}mm`
const pt = (n: number): string => `${n}pt`

export function briefHtml(b: Elternbrief, kopf: Briefkopf, codes?: string[]): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Rückgabefrist: im Fettdruck zusätzlich unterstrichen (hervorhebung.ts)
  const frist = b.meta.ruecklauf ? fristMuster(b.meta.rueckgabeBis) : null
  const name = b.meta.absender || kopf.lehrkraft || ''
  const html = seiten(b, codes)
    .map((s) => {
      const t = s.text
      // DIN 5008 Form B (din5008.ts): Kopfbereich bis zum Ende des Anschriftfelds, darin Briefkopf, Vermerkzone,
      // Anschriftzone mit „An die Eltern …" und rechts der Informationsblock mit Ort und Datum.
      // data-sa-art: die Fassung – damit wählt die Seitenauswahl auch im Word-Export (Brief.tsx)
      return `<section class="seite" lang="${s.sprache}" dir="${s.rtl ? 'rtl' : 'ltr'}" data-sa-seite="brief" data-sa-art="${s.sprache}">
<div class="kopfbereich" dir="ltr"><header><div class="absender">${absenderZeilen(kopf, b.meta.absender)
        .map(esc)
        .join('<br>')}</div>${kopf.logo ? `<img src="${kopf.logo}" alt="">` : ''}</header>
<div class="vermerkzone">${s.eigen ? `<span class="sprache">${esc(s.eigen)}</span>` : ''}</div>
<p class="anschrift">${esc(empfaengerZeile(b.meta.klasse ?? ''))}</p>
<p class="infoblock ortdatum">${esc(ortDatum(kopf, b.meta.datum))}</p></div>
<p class="betreff">${esc(ohneFett(t.betreff))}</p><p class="anrede">${esc(ohneFett(t.anrede))}</p>${t.absaetze.map((a) => `<p class="absatz">${fettHtml(a, frist)}</p>`).join('')}
<p class="gruss">${esc(ohneFett(t.gruss))}</p>${kopf.unterschrift ? `<img class="unterschrift" src="${kopf.unterschrift}" alt="">` : '<div class="ohne-unterschrift"></div>'}<p class="name">${esc(name)}</p>${kopf.funktion?.trim() ? `<p class="funktion">${esc(kopf.funktion.trim())}</p>` : ''}
${t.ruecklauf ? `<div class="ruecklauf"><p class="schnitt" dir="ltr">✂ – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –</p><p class="rl-titel">${esc(ohneFett(t.ruecklauf.titel))}</p>${t.ruecklauf.zeilen.map((z) => `<p class="rl-zeile">${fettHtml(z, frist)}</p>`).join('')}</div>` : ''}
${s.eigen ? `<p class="vermerk">${t.vermerk ? `${esc(t.vermerk)}<br>` : ''}<span dir="ltr">${DEUTSCHER_VERMERK}</span></p>` : ''}
</section>`
    })
    .join('\n')
  const r = DIN5008.rand
  const l = DIN5008.leerzeilen
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(b.text?.betreff ?? 'Elternbrief')}</title>${kiMetaTag(b.meta.ki)}<style>
@page { size: A4; margin: ${mm(r.obenMm)} ${mm(r.rechtsMm)} ${mm(r.untenMm)} ${mm(r.linksMm)}; }
body { font-family: Calibri, Carlito, "Segoe UI", "Noto Sans", "Noto Naskh Arabic", Arial, sans-serif; font-size: ${pt(DIN5008.schriftPt)}; line-height: ${pt(ZEILE_PT)}; color: #000; margin: 0; }
p { margin: 0; }
.seite { page-break-after: always; } .seite:last-child { page-break-after: auto; }
.kopfbereich { position: relative; height: ${mm(KOPF.kopfbereichMm)}; }
header { position: absolute; top: 0; left: 0; right: 0; height: ${mm(KOPF.briefkopfMm)}; display: flex; align-items: flex-start; justify-content: space-between; gap: 8mm; overflow: hidden; }
header .absender { font-size: ${pt(DIN5008.kopfSchriftPt)}; line-height: 1.3; } header img { max-height: ${mm(KOPF.briefkopfMm - 4)}; max-width: 55mm; object-fit: contain; }
.vermerkzone { position: absolute; top: ${mm(KOPF.briefkopfMm)}; left: 0; width: ${mm(KOPF.anschriftBreiteMm)}; height: ${mm(DIN5008.anschriftfeld.vermerkzoneMm)}; display: flex; align-items: flex-end; font-size: 8pt; line-height: 1.2; color: #555; }
.anschrift { position: absolute; top: ${mm(KOPF.anschriftzoneObenMm)}; left: 0; width: ${mm(KOPF.anschriftBreiteMm)}; }
.infoblock { position: absolute; top: ${mm(KOPF.infoObenMm)}; left: ${mm(KOPF.infoLinksMm)}; width: ${mm(KOPF.infoBreiteMm)}; }
.betreff { font-weight: bold; margin-top: ${pt(leerPt(l.vorBetreff))}; }
.anrede { margin-top: ${pt(leerPt(l.nachBetreff))}; }
.absatz { margin-top: ${pt(leerPt(l.nachAnrede))}; } .absatz + .absatz { margin-top: ${pt(leerPt(l.zwischenAbsaetzen))}; }
.gruss { margin-top: ${pt(leerPt(l.vorGruss))}; }
.unterschrift { display: block; height: ${pt(leerPt(l.unterschrift))}; max-width: 60mm; object-fit: contain; object-position: left center; } .ohne-unterschrift { height: ${pt(leerPt(l.unterschrift))}; }
.ruecklauf { margin-top: ${pt(leerPt(l.vorAbschnitt))}; page-break-inside: avoid; } .schnitt { color: #777; letter-spacing: 0.5mm; }
.rl-titel { font-weight: bold; margin-top: ${pt(leerPt(1))}; } .rl-zeile { margin-top: ${pt(leerPt(1))}; }
.vermerk { margin-top: ${pt(leerPt(2))}; font-size: 9pt; line-height: 1.3; color: #555; border-top: 0.3mm solid #bbb; padding-top: 2mm; }
</style></head><body>${html}</body></html>`
}

// ---------- Word ----------

const OHNE_RAND = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const RANDLOS = { top: OHNE_RAND, bottom: OHNE_RAND, left: OHNE_RAND, right: OHNE_RAND }
const ZELLE_OHNE_ABSTAND = { top: 0, bottom: 0, left: 0, right: 0 }
/** Breite des Satzspiegels und der linken Spalte (bis zum Informationsblock) in Twips */
const SATZ_TWIPS = mmTwips(DIN5008.seite.breiteMm - DIN5008.rand.linksMm - DIN5008.rand.rechtsMm)
const LINKS_TWIPS = mmTwips(KOPF.infoLinksMm)
/** Zeilenhöhe des Brieftextes genau eine Zeile (Leerzeilen = Abstand davor in ganzen Zeilen) */
const ZEILE = { line: Math.round(ZEILE_PT * 20), lineRule: LineRuleType.EXACT }
/** Schriftgröße in halben Punkten */
const halb = (p: number): number => Math.round(p * 2)

/** Logo in Word: höchstens so hoch, wie der Briefkopf erlaubt, Seitenverhältnis erhalten (Pixel bei 96 dpi) */
function logoLauf(logo: string): ImageRun {
  const { data, type } = dataUrlBytes(logo)
  const img = type === 'png' ? pngMasse(data) : null
  const hoehe = Math.round(((KOPF.briefkopfMm - 4) / 25.4) * 96)
  const breite = img ? Math.min(Math.round((55 / 25.4) * 96), Math.round((img.b / img.h) * hoehe)) : hoehe
  return new ImageRun({ data, type, transformation: { width: breite, height: img ? Math.round(breite * (img.h / img.b)) : hoehe } })
}

/**
 * Kopfbereich nach DIN 5008 Form B als randlose Tabelle mit festen Zeilenhöhen: oben der Briefkopf (Absender links,
 * Logo rechts), darunter das Anschriftfeld (Vermerkzone, „An die Eltern …") und rechts der Informationsblock.
 */
function kopfTabelle(kopf: Briefkopf, b: Elternbrief, eigen?: string): Table {
  const klein = halb(DIN5008.kopfSchriftPt)
  const zeilen = absenderZeilen(kopf, b.meta.absender)
  const zelle = (breite: number, kinder: Paragraph[]): TableCell =>
    new TableCell({
      width: { size: breite, type: WidthType.DXA },
      verticalAlign: VerticalAlign.TOP,
      borders: RANDLOS,
      margins: ZELLE_OHNE_ABSTAND,
      children: kinder
    })
  const kopfZeile = new TableRow({
    height: { value: mmTwips(KOPF.briefkopfMm), rule: HeightRule.EXACT },
    children: [
      zelle(
        LINKS_TWIPS,
        zeilen.length ? zeilen.map((z) => new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: z, size: klein })] })) : [new Paragraph('')]
      ),
      zelle(SATZ_TWIPS - LINKS_TWIPS, [new Paragraph({ alignment: AlignmentType.RIGHT, children: kopf.logo ? [logoLauf(kopf.logo)] : [] })])
    ]
  })
  const anschriftZeile = new TableRow({
    height: { value: mmTwips(DIN5008.anschriftfeld.hoeheMm), rule: HeightRule.EXACT },
    children: [
      zelle(LINKS_TWIPS, [
        // Zusatz- und Vermerkzone (17,7 mm): bei Übersetzungen die Sprache; die Schrift sitzt unten in der Zone
        new Paragraph({
          spacing: { after: 0, line: mmTwips(DIN5008.anschriftfeld.vermerkzoneMm), lineRule: LineRuleType.EXACT },
          children: eigen ? [new TextRun({ text: eigen, size: 16, color: '555555' })] : []
        }),
        new Paragraph({ spacing: { after: 0, ...ZEILE }, children: [new TextRun(empfaengerZeile(b.meta.klasse ?? ''))] })
      ]),
      zelle(SATZ_TWIPS - LINKS_TWIPS, [
        new Paragraph({
          spacing: { before: mmTwips(DIN5008.infoblock.obenMm - DIN5008.anschriftfeld.obenMm), after: 0, ...ZEILE },
          children: [new TextRun(ortDatum(kopf, b.meta.datum))]
        })
      ])
    ]
  })
  return new Table({
    width: { size: SATZ_TWIPS, type: WidthType.DXA },
    columnWidths: [LINKS_TWIPS, SATZ_TWIPS - LINKS_TWIPS],
    layout: TableLayoutType.FIXED,
    borders: { ...RANDLOS, insideHorizontal: OHNE_RAND, insideVertical: OHNE_RAND },
    rows: [kopfZeile, anschriftZeile]
  })
}

/** Bild der Unterschrift: so hoch wie die drei Leerzeilen dafür, Seitenverhältnis erhalten */
function unterschriftAbsatz(kopf: Briefkopf): Paragraph[] {
  if (!kopf.unterschrift) return []
  const { data, type } = dataUrlBytes(kopf.unterschrift)
  const img = pngMasse(data)
  // pt → Pixel (Word rechnet hier mit 96 dpi)
  const hoehe = Math.round((leerPt(DIN5008.leerzeilen.unterschrift) * 96) / 72)
  const breite = img ? Math.min(Math.round((60 / 25.4) * 96), Math.round((img.b / img.h) * hoehe)) : hoehe * 3
  return [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new ImageRun({ data, type, transformation: { width: breite, height: hoehe } })] })]
}

/** Breite und Höhe eines PNG aus dem Kopf (IHDR) */
function pngMasse(daten: Uint8Array): { b: number; h: number } | null {
  if (daten.length < 24 || daten[0] !== 0x89) return null
  const v = new DataView(daten.buffer, daten.byteOffset, daten.byteLength)
  return { b: v.getUint32(16), h: v.getUint32(20) }
}

export async function briefDocx(b: Elternbrief, kopf: Briefkopf, codes?: string[]): Promise<Uint8Array> {
  const kinder: (Paragraph | Table)[] = []
  const frist = b.meta.ruecklauf ? fristMuster(b.meta.rueckgabeBis) : null
  const l = DIN5008.leerzeilen
  seiten(b, codes).forEach((s, i) => {
    const t = s.text
    /** Absatz mit `leer` Leerzeilen davor; `fett`: **…** als Fettdruck (die Frist zusätzlich unterstrichen) */
    const p = (text: string, leer: number, opts: { bold?: boolean; size?: number; color?: string; fett?: boolean } = {}): Paragraph =>
      new Paragraph({
        bidirectional: s.rtl,
        alignment: s.rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        spacing: { before: leerTwips(leer), after: 0, ...(opts.size ? {} : ZEILE) },
        children: (opts.fett ? stuecke(text, frist) : [{ text: ohneFett(text), fett: false, unterstrichen: false }]).map(
          (st) =>
            new TextRun({
              text: st.text,
              bold: opts.bold || st.fett,
              ...(st.unterstrichen ? { underline: { type: UnderlineType.SINGLE } } : {}),
              size: opts.size,
              color: opts.color,
              rightToLeft: s.rtl
            })
        )
      })
    if (i > 0) kinder.push(new Paragraph({ children: [new PageBreak()] }))
    kinder.push(
      kopfTabelle(kopf, b, s.eigen),
      p(t.betreff, l.vorBetreff, { bold: true }),
      p(t.anrede, l.nachBetreff),
      ...t.absaetze.map((a, k) => p(a, k === 0 ? l.nachAnrede : l.zwischenAbsaetzen, { fett: true })),
      p(t.gruss, l.vorGruss),
      ...unterschriftAbsatz(kopf),
      // Ohne Bild: drei Leerzeilen Raum für die handschriftliche Unterschrift
      p(b.meta.absender || kopf.lehrkraft || '', kopf.unterschrift ? 0 : l.unterschrift)
    )
    if (kopf.funktion?.trim()) kinder.push(p(kopf.funktion.trim(), 0))
    if (t.ruecklauf) {
      kinder.push(
        new Paragraph({
          spacing: { before: leerTwips(l.vorAbschnitt), after: 0, ...ZEILE },
          keepNext: true,
          children: [new TextRun({ text: '✂ – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –', color: '777777' })]
        }),
        p(t.ruecklauf.titel, 1, { bold: true }),
        ...t.ruecklauf.zeilen.map((z) => p(z, 1, { fett: true }))
      )
    }
    if (s.eigen) {
      if (t.vermerk) kinder.push(p(t.vermerk, 2, { size: 18, color: '555555' }))
      kinder.push(new Paragraph({ children: [new TextRun({ text: DEUTSCHER_VERMERK, size: 18, color: '555555' })] }))
    }
  })
  const r = DIN5008.rand
  const doc = new Document({
    creator: 'Schul-Apps',
    // Silbentrennung von Word (02.10.2026, shared/silbentrennung.ts)
    hyphenation: WORD_TRENNUNG,
    title: b.text?.betreff ?? 'Elternbrief',
    ...kiWordEigenschaften(b.meta.ki),
    styles: { default: { document: { run: { font: 'Calibri', size: halb(DIN5008.schriftPt) } } } },
    sections: [
      {
        properties: {
          page: { margin: { top: mmTwips(r.obenMm), bottom: mmTwips(r.untenMm), left: mmTwips(r.linksMm), right: mmTwips(r.rechtsMm) } }
        },
        children: kinder.length ? kinder : [new Paragraph('')]
      }
    ]
  })
  return new Uint8Array(await Packer.toArrayBuffer(doc))
}
