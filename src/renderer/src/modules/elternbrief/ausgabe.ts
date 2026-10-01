/**
 * Elternbrief als PDF und Word (Großprogramm 0.4, F7): die deutsche Fassung, danach je
 * Übersetzung eine Seite (Arabisch, Persisch, Dari, Paschtu von rechts nach links), mit
 * Schullogo und Schulname im Kopf und dem Vermerk zur maschinellen Übersetzung.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} from 'docx'
import { kiMetaTag, kiWordEigenschaften } from '@shared/kiKennzeichnung'
import { spracheNach } from '../../shared/familiensprachen'
import { dataUrlBytes, MM } from '../../shared/export/docxKit'
import { DEUTSCHER_VERMERK, type BriefText, type Elternbrief } from './model'

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
  /** Bild der Unterschrift (PNG, durchsichtig) – steht über dem Namen unter dem Gruß */
  unterschrift?: string | null
}

/** Zeilen des Absenders, leere weggelassen */
export function absenderZeilen(kopf: Briefkopf, absender: string): string[] {
  return [
    absender.trim() || kopf.lehrkraft?.trim() || '',
    kopf.schule.trim(),
    kopf.strasse?.trim() ?? '',
    [kopf.plz?.trim(), kopf.ort?.trim()].filter(Boolean).join(' '),
    kopf.telefon?.trim() ? `Tel. ${kopf.telefon.trim()}` : ''
  ].filter(Boolean)
}

/** „Bremerhaven, 29. September 2026" – ohne Ort nur das Datum */
export const ortDatum = (kopf: Briefkopf, iso: string): string => [kopf.ort?.trim(), datumDe(iso)].filter(Boolean).join(', ')

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

export function briefHtml(b: Elternbrief, kopf: Briefkopf, codes?: string[]): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = seiten(b, codes)
    .map((s) => {
      const t = s.text
      // data-sa-art: die Fassung – damit wählt die Seitenauswahl auch im Word-Export (Brief.tsx)
      return `<section class="seite" lang="${s.sprache}" dir="${s.rtl ? 'rtl' : 'ltr'}" data-sa-seite="brief" data-sa-art="${s.sprache}">
<header dir="ltr"><div class="absender">${absenderZeilen(kopf, b.meta.absender)
        .map(esc)
        .join('<br>')}</div>${kopf.logo ? `<img src="${kopf.logo}" alt="">` : ''}</header>
<p class="ortdatum" dir="ltr">${esc(ortDatum(kopf, b.meta.datum))}</p>
${s.eigen ? `<p class="sprache" dir="ltr">${esc(s.eigen)}</p>` : ''}
<h1>${esc(t.betreff)}</h1><p>${esc(t.anrede)}</p>${t.absaetze.map((a) => `<p>${esc(a)}</p>`).join('')}
<p class="gruss">${esc(t.gruss)}</p>${kopf.unterschrift ? `<img class="unterschrift" src="${kopf.unterschrift}" alt="">` : '<div class="ohne-unterschrift"></div>'}<p class="name">${esc(b.meta.absender || kopf.lehrkraft || '')}</p>
${t.ruecklauf ? `<div class="ruecklauf"><p class="schnitt" dir="ltr">✂ – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –</p><h2>${esc(t.ruecklauf.titel)}</h2>${t.ruecklauf.zeilen.map((z) => `<p>${esc(z)}</p>`).join('')}</div>` : ''}
${s.eigen ? `<p class="vermerk">${t.vermerk ? `${esc(t.vermerk)}<br>` : ''}<span dir="ltr">${DEUTSCHER_VERMERK}</span></p>` : ''}
</section>`
    })
    .join('\n')
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(b.text?.betreff ?? 'Elternbrief')}</title>${kiMetaTag(b.meta.ki)}<style>
@page { size: A4; margin: 18mm 20mm 16mm 22mm; }
body { font-family: Calibri, Carlito, "Segoe UI", "Noto Sans", "Noto Naskh Arabic", Arial, sans-serif; font-size: 11.5pt; line-height: 1.5; color: #000; margin: 0; }
.seite { page-break-after: always; } .seite:last-child { page-break-after: auto; }
header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8mm; margin-bottom: 4mm; }
header .absender { font-size: 10pt; line-height: 1.35; } header img { max-height: 24mm; max-width: 55mm; object-fit: contain; }
.ortdatum { text-align: right; margin: 0 0 8mm; }
.unterschrift { display: block; max-height: 16mm; max-width: 60mm; margin: 1mm 0 0; } .ohne-unterschrift { height: 10mm; } .name { margin-top: 0; }
.sprache { color: #555; font-size: 9.5pt; margin: 0 0 2mm; } h1 { font-size: 14pt; margin: 0 0 4mm; } h2 { font-size: 12pt; margin: 2mm 0; }
.gruss { margin: 6mm 0 0; } .ruecklauf { margin-top: 10mm; } .schnitt { color: #777; letter-spacing: 0.5mm; }
.vermerk { margin-top: 8mm; font-size: 9pt; color: #555; border-top: 0.3mm solid #bbb; padding-top: 2mm; }
</style></head><body>${html}</body></html>`
}

// ---------- Word ----------

const OHNE_RAND = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }

/** Absender links, Logo rechts – als randlose Tabelle, damit Word beides nebeneinander hält */
function kopfTabelle(kopf: Briefkopf, absender: string): Table {
  const zeilen = absenderZeilen(kopf, absender)
  const links = new TableCell({
    width: { size: 65, type: WidthType.PERCENTAGE },
    borders: { top: OHNE_RAND, bottom: OHNE_RAND, left: OHNE_RAND, right: OHNE_RAND },
    children: zeilen.length ? zeilen.map((z) => new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: z, size: 20 })] })) : [new Paragraph('')]
  })
  const bild: ImageRun[] = []
  if (kopf.logo) {
    const { data, type } = dataUrlBytes(kopf.logo)
    bild.push(new ImageRun({ data, type, transformation: { width: 90, height: 90 } }))
  }
  const rechts = new TableCell({
    width: { size: 35, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.TOP,
    borders: { top: OHNE_RAND, bottom: OHNE_RAND, left: OHNE_RAND, right: OHNE_RAND },
    children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: bild })]
  })
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: OHNE_RAND, bottom: OHNE_RAND, left: OHNE_RAND, right: OHNE_RAND, insideHorizontal: OHNE_RAND, insideVertical: OHNE_RAND },
    rows: [new TableRow({ children: [links, rechts] })]
  })
}

/** Bild der Unterschrift (Seitenverhältnis erhalten, 16 mm hoch) */
function unterschriftAbsatz(kopf: Briefkopf): Paragraph[] {
  if (!kopf.unterschrift) return []
  const { data, type } = dataUrlBytes(kopf.unterschrift)
  const img = pngMasse(data)
  const hoehe = 60
  const breite = img ? Math.min(230, Math.round((img.b / img.h) * hoehe)) : 180
  return [new Paragraph({ spacing: { after: 0 }, children: [new ImageRun({ data, type, transformation: { width: breite, height: hoehe } })] })]
}

/** Breite und Höhe eines PNG aus dem Kopf (IHDR) */
function pngMasse(daten: Uint8Array): { b: number; h: number } | null {
  if (daten.length < 24 || daten[0] !== 0x89) return null
  const v = new DataView(daten.buffer, daten.byteOffset, daten.byteLength)
  return { b: v.getUint32(16), h: v.getUint32(20) }
}

export async function briefDocx(b: Elternbrief, kopf: Briefkopf, codes?: string[]): Promise<Uint8Array> {
  const kinder: (Paragraph | Table)[] = []
  seiten(b, codes).forEach((s, i) => {
    const t = s.text
    const p = (text: string, opts: { bold?: boolean; size?: number; color?: string; after?: number; before?: number } = {}): Paragraph =>
      new Paragraph({
        bidirectional: s.rtl,
        alignment: s.rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        spacing: { after: opts.after ?? 120, before: opts.before ?? 0 },
        children: [new TextRun({ text, bold: opts.bold, size: opts.size, color: opts.color, rightToLeft: s.rtl })]
      })
    if (i > 0) kinder.push(new Paragraph({ children: [new PageBreak()] }))
    kinder.push(
      kopfTabelle(kopf, b.meta.absender),
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 120, after: 360 }, children: [new TextRun(ortDatum(kopf, b.meta.datum))] })
    )
    if (s.eigen) kinder.push(new Paragraph({ children: [new TextRun({ text: s.eigen, size: 19, color: '555555' })] }))
    kinder.push(
      p(t.betreff, { bold: true, size: 28, after: 200 }),
      p(t.anrede),
      ...t.absaetze.map((a) => p(a)),
      p(t.gruss, { before: 240, after: 0 }),
      ...unterschriftAbsatz(kopf),
      p(b.meta.absender || kopf.lehrkraft || '', { before: kopf.unterschrift ? 0 : 480 })
    )
    if (t.ruecklauf) {
      kinder.push(
        new Paragraph({
          spacing: { before: 480 },
          children: [new TextRun({ text: '✂ – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –', color: '777777' })]
        }),
        p(t.ruecklauf.titel, { bold: true, size: 24 }),
        ...t.ruecklauf.zeilen.map((z) => p(z, { after: 200 }))
      )
    }
    if (s.eigen) {
      if (t.vermerk) kinder.push(p(t.vermerk, { size: 18, color: '555555', before: 360 }))
      kinder.push(new Paragraph({ children: [new TextRun({ text: DEUTSCHER_VERMERK, size: 18, color: '555555' })] }))
    }
  })
  const rand = Math.round(18 * MM)
  const doc = new Document({
    creator: 'Schul-Apps',
    title: b.text?.betreff ?? 'Elternbrief',
    ...kiWordEigenschaften(b.meta.ki),
    styles: { default: { document: { run: { font: 'Calibri', size: 23 } } } },
    sections: [
      {
        properties: { page: { margin: { top: rand, bottom: Math.round(16 * MM), left: Math.round(22 * MM), right: Math.round(20 * MM) } } },
        children: kinder.length ? kinder : [new Paragraph('')]
      }
    ]
  })
  return new Uint8Array(await Packer.toArrayBuffer(doc))
}
