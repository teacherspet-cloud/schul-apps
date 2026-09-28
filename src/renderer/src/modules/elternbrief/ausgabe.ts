/**
 * Elternbrief als PDF und Word (Großprogramm 0.4, F7): die deutsche Fassung, danach je
 * Übersetzung eine Seite (Arabisch, Persisch, Dari, Paschtu von rechts nach links), mit
 * Schullogo und Schulname im Kopf und dem Vermerk zur maschinellen Übersetzung.
 */
import { AlignmentType, Document, ImageRun, Packer, PageBreak, Paragraph, TextRun } from 'docx'
import { kiMetaTag, kiWordEigenschaften } from '@shared/kiKennzeichnung'
import { spracheNach } from '../../shared/familiensprachen'
import { dataUrlBytes, MM } from '../../shared/export/docxKit'
import { DEUTSCHER_VERMERK, type BriefText, type Elternbrief } from './model'

export interface Briefkopf {
  schule: string
  logo: string | null
}

interface Seite {
  text: BriefText
  sprache: string
  rtl: boolean
  eigen?: string
}

function seiten(b: Elternbrief, codes?: string[]): Seite[] {
  if (!b.text) return []
  const out: Seite[] = [{ text: b.text, sprache: 'de', rtl: false }]
  for (const u of b.uebersetzungen) {
    if (codes && !codes.includes(u.code)) continue
    const s = spracheNach(u.code)
    out.push({ text: u.text, sprache: u.code, rtl: Boolean(s?.rtl), eigen: s ? `${s.eigen} · ${s.name}` : u.code })
  }
  return out
}

const datumDe = (iso: string): string => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

// ---------- PDF (HTML) ----------

export function briefHtml(b: Elternbrief, kopf: Briefkopf, codes?: string[]): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = seiten(b, codes)
    .map((s) => {
      const t = s.text
      return `<section class="seite" lang="${s.sprache}" dir="${s.rtl ? 'rtl' : 'ltr'}">
<header dir="ltr">${kopf.logo ? `<img src="${kopf.logo}" alt="">` : ''}<div><b>${esc(kopf.schule)}</b>${b.meta.klasse ? `<br>Klasse ${esc(b.meta.klasse)}` : ''}</div><div class="datum">${esc(datumDe(b.meta.datum))}</div></header>
${s.eigen ? `<p class="sprache" dir="ltr">${esc(s.eigen)}</p>` : ''}
<h1>${esc(t.betreff)}</h1><p>${esc(t.anrede)}</p>${t.absaetze.map((a) => `<p>${esc(a)}</p>`).join('')}
<p class="gruss">${esc(t.gruss)}<br><br>${esc(b.meta.absender)}</p>
${t.ruecklauf ? `<div class="ruecklauf"><p class="schnitt" dir="ltr">✂ – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – – –</p><h2>${esc(t.ruecklauf.titel)}</h2>${t.ruecklauf.zeilen.map((z) => `<p>${esc(z)}</p>`).join('')}</div>` : ''}
${s.eigen ? `<p class="vermerk">${t.vermerk ? `${esc(t.vermerk)}<br>` : ''}<span dir="ltr">${DEUTSCHER_VERMERK}</span></p>` : ''}
</section>`
    })
    .join('\n')
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(b.text?.betreff ?? 'Elternbrief')}</title>${kiMetaTag(b.meta.ki)}<style>
@page { size: A4; margin: 18mm 20mm 16mm 22mm; }
body { font-family: Calibri, Carlito, "Segoe UI", "Noto Sans", "Noto Naskh Arabic", Arial, sans-serif; font-size: 11.5pt; line-height: 1.5; color: #000; margin: 0; }
.seite { page-break-after: always; } .seite:last-child { page-break-after: auto; }
header { display: flex; align-items: center; gap: 5mm; border-bottom: 0.4mm solid #888; padding-bottom: 3mm; margin-bottom: 6mm; }
header img { height: 14mm; } header .datum { margin-left: auto; color: #444; }
.sprache { color: #555; font-size: 9.5pt; margin: 0 0 2mm; } h1 { font-size: 14pt; margin: 0 0 4mm; } h2 { font-size: 12pt; margin: 2mm 0; }
.gruss { margin-top: 6mm; } .ruecklauf { margin-top: 10mm; } .schnitt { color: #777; letter-spacing: 0.5mm; }
.vermerk { margin-top: 8mm; font-size: 9pt; color: #555; border-top: 0.3mm solid #bbb; padding-top: 2mm; }
</style></head><body>${html}</body></html>`
}

// ---------- Word ----------

export async function briefDocx(b: Elternbrief, kopf: Briefkopf, codes?: string[]): Promise<Uint8Array> {
  const kinder: Paragraph[] = []
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
    const kopfZeile: (TextRun | ImageRun)[] = []
    if (kopf.logo) {
      const { data, type } = dataUrlBytes(kopf.logo)
      kopfZeile.push(new ImageRun({ data, type, transformation: { width: 48, height: 48 } }), new TextRun('   '))
    }
    kopfZeile.push(
      new TextRun({ text: kopf.schule, bold: true }),
      new TextRun({ text: `   ${b.meta.klasse ? `Klasse ${b.meta.klasse}   ` : ''}${datumDe(b.meta.datum)}`, color: '444444' })
    )
    kinder.push(new Paragraph({ spacing: { after: 240 }, border: { bottom: { style: 'single', size: 6, color: '888888', space: 4 } }, children: kopfZeile }))
    if (s.eigen) kinder.push(new Paragraph({ children: [new TextRun({ text: s.eigen, size: 19, color: '555555' })] }))
    kinder.push(
      p(t.betreff, { bold: true, size: 28, after: 200 }),
      p(t.anrede),
      ...t.absaetze.map((a) => p(a)),
      p(t.gruss, { before: 240 }),
      p(b.meta.absender, { before: 360 })
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
