/**
 * Ausgaben des Tafelbilds – alle aus denselben Elementen (svg.ts):
 * - PDF zum Drucken: je Format eine Seite, dazu Lückenfassung, ★/★★-Fassungen und die
 *   Planungshilfe (Aufbau in Schritten, Farbbedeutung, Lösungen der Lücken)
 * - PNG in hoher Auflösung für Beamer und Smartboard
 * - PowerPoint: Folien, die das Tafelbild Schritt für Schritt aufbauen
 */
import { FARB_NAMEN, farbwert, formatInfo, PALETTEN, type FormatId } from './formate'
import { elementText, schrittZahl, type Niveau, type Tafelbild, type TbTafel } from './model'
import { pptxDatei, type Folie } from './pptx'
import { STRUKTUR_NAMEN } from './model'
import { svgMasse, tafelSvg, type SvgOptionen } from './svg'
import { loesungen, NIVEAU_NAMEN, sichtbareElemente, wortspeicher } from './varianten'

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface PdfWahl {
  formate: FormatId[]
  vollstaendig: boolean
  luecke: boolean
  niveaus: boolean
  planung: boolean
}

export const standardPdfWahl = (t: Tafelbild): PdfWahl => ({
  formate: t.tafeln.map((x) => x.format),
  vollstaendig: true,
  luecke: t.meta.varianten.luecke,
  niveaus: t.meta.varianten.niveaus,
  planung: t.meta.varianten.schritte
})

interface Seite {
  tafel: TbTafel
  titel: string
  o: SvgOptionen
}

export function seitenFuer(t: Tafelbild, w: PdfWahl): Seite[] {
  const seiten: Seite[] = []
  for (const tafel of t.tafeln.filter((x) => w.formate.includes(x.format))) {
    const f = formatInfo(tafel.format)
    const hatLuecken = tafel.elemente.some((e) => e.lueckenWoerter?.length || e.luecke)
    const hatNiveaus = tafel.elemente.some((e) => (e.niveau ?? 1) > 1)
    if (w.vollstaendig) seiten.push({ tafel, titel: f.label, o: {} })
    if (w.niveaus && hatNiveaus) for (const n of [1, 2] as Niveau[]) seiten.push({ tafel, titel: `${f.label} – ${NIVEAU_NAMEN[n]}`, o: { niveau: n } })
    if (w.luecke && hatLuecken) {
      if (w.niveaus && hatNiveaus) {
        seiten.push({ tafel, titel: `${f.label} – Lückenfassung ${NIVEAU_NAMEN[1]} (mit Wortspeicher)`, o: { luecke: true, niveau: 1, wortspeicher: true } })
        seiten.push({ tafel, titel: `${f.label} – Lückenfassung ${NIVEAU_NAMEN[3]}`, o: { luecke: true } })
      } else seiten.push({ tafel, titel: `${f.label} – Lückenfassung`, o: { luecke: true, wortspeicher: true } })
    }
  }
  return seiten
}

function planungsHtml(t: Tafelbild): string {
  const tafel = t.tafeln[0]
  if (!tafel || !t.inhalt) return ''
  const n = schrittZahl(tafel)
  const medium = formatInfo(tafel.format).medium
  const zeilen = Array.from({ length: n }, (_, i) => {
    const s = i + 1
    const plan = t.inhalt!.schritte.find((x) => x.nr === s)
    const neu = tafel.elemente.filter((e) => (e.schritt || 1) === s && e.typ !== 'verbinder')
    return `<tr><td class="nr">${s}</td><td>${esc(plan?.phase ?? '')}</td><td>${esc(plan?.impuls ?? '')}</td><td>${neu
      .map((e) => esc((e.titel || elementText(e) || e.typ).slice(0, 60)))
      .join('<br>')}</td></tr>`
  }).join('')
  const legende = t.inhalt.farbLegende
    .map((l) => `<li><span class="farbe" style="background:${farbwert(medium === 'kreide' ? 'marker' : medium, l.farbe)}"></span>${esc(FARB_NAMEN.marker[l.farbe])}: ${esc(l.bedeutung)}</li>`)
    .join('')
  const loes = loesungen(tafel)
  return `<section class="seite hoch"><h1>Planungshilfe: ${esc(t.inhalt.titel)}</h1>
<p class="meta">${esc(STRUKTUR_NAMEN[t.inhalt.struktur])}${t.inhalt.strukturGrund ? ` – ${esc(t.inhalt.strukturGrund)}` : ''}</p>
<h2>Aufbau im Unterricht</h2><table><thead><tr><th>Schritt</th><th>Phase</th><th>Impuls der Lehrkraft</th><th>Neu an der Tafel</th></tr></thead><tbody>${zeilen}</tbody></table>
${legende ? `<h2>Farben mit fester Bedeutung</h2><ul class="legende">${legende}</ul>` : ''}
${loes.length ? `<h2>Lösungen der Lückenfassung</h2><ul>${loes.map((l) => `<li><b>${esc(l.element)}</b>: ${esc(l.woerter.join(', '))}</li>`).join('')}</ul>` : ''}
${t.inhalt.hausaufgabe ? `<h2>Hausaufgabe</h2><p>${esc(t.inhalt.hausaufgabe)}</p>` : ''}
</section>`
}

export function pdfHtml(t: Tafelbild, w: PdfWahl, schule = ''): string {
  const kopf = [t.meta.subjectLabel, t.meta.grade ? `Klasse ${t.meta.grade}` : '', t.meta.thema, schule].filter(Boolean).map(esc).join(' · ')
  const seiten = seitenFuer(t, w)
    .map((s) => {
      const f = formatInfo(s.tafel.format)
      const svg = tafelSvg(s.tafel, s.o)
      const m = svgMasse(svg)
      // Querformat: Breite füllt die Seite; hochkant: Höhe begrenzt
      const stil = f.seite === 'quer' ? `width:100%;max-height:${m.hoehe / m.breite > 0.62 ? '165mm' : 'none'}` : 'height:250mm;max-width:100%'
      return `<section class="seite ${f.seite}"><div class="kopf"><span>${esc(s.titel)}</span><span>${kopf}</span></div><div class="flaeche">${svg.replace('<svg ', `<svg style="${stil}" `)}</div></section>`
    })
    .join('')
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(t.inhalt?.titel || t.meta.title || 'Tafelbild')}</title><style>
@page { size: A4 portrait; margin: 0 }
@page quer { size: A4 landscape; margin: 0 }
body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #1d1d1f }
.seite { box-sizing: border-box; padding: 10mm 12mm; break-after: page; page-break-after: always }
.seite:last-child { break-after: auto; page-break-after: auto }
.seite.quer { page: quer; width: 297mm; min-height: 209mm }
.seite.hoch { width: 210mm; min-height: 296mm }
.kopf { display: flex; justify-content: space-between; font-size: 9pt; color: #555; border-bottom: 0.3mm solid #bbb; padding-bottom: 1.5mm; margin-bottom: 4mm }
.flaeche { display: flex; justify-content: center }
.flaeche svg { display: block; height: auto }
h1 { font-size: 16pt; margin: 0 0 2mm } h2 { font-size: 12pt; margin: 6mm 0 2mm } .meta { color: #555; font-size: 10pt; margin: 0 }
table { border-collapse: collapse; width: 100%; font-size: 10pt } th, td { border: 0.3mm solid #999; padding: 1.5mm 2mm; text-align: left; vertical-align: top } th { background: #eef2f6 } td.nr { width: 12mm; text-align: center; font-weight: 700 }
.legende { list-style: none; padding: 0 } .legende li { margin: 1mm 0 } .farbe { display: inline-block; width: 4mm; height: 4mm; border: 0.2mm solid #666; margin-right: 2mm; vertical-align: -0.6mm }
</style></head><body>${seiten}${w.planung ? planungsHtml(t) : ''}</body></html>`
}

// ---------- PNG ----------

/** SVG in ein PNG der Breite `breite` rechnen (im Browser bzw. in der App) */
export async function svgZuPng(svg: string, breite: number): Promise<{ png: Uint8Array; breite: number; hoehe: number }> {
  const m = svgMasse(svg)
  const hoehe = Math.round((breite * m.hoehe) / m.breite)
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${breite}" height="${hoehe}"`))}`
  const bild = new Image()
  bild.decoding = 'async'
  await new Promise<void>((ok, fehler) => {
    bild.onload = () => ok()
    bild.onerror = () => fehler(new Error('Das Tafelbild ließ sich nicht als Bild berechnen.'))
    bild.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = breite
  canvas.height = hoehe
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Keine Zeichenfläche verfügbar.')
  ctx.drawImage(bild, 0, 0, breite, hoehe)
  const blob = await new Promise<Blob>((ok, fehler) => canvas.toBlob((b) => (b ? ok(b) : fehler(new Error('PNG nicht erzeugt.'))), 'image/png'))
  return { png: new Uint8Array(await blob.arrayBuffer()), breite, hoehe }
}

export async function pngFuer(tafel: TbTafel, o: SvgOptionen = {}, breite?: number): Promise<Uint8Array> {
  return (await svgZuPng(tafelSvg(tafel, o), breite ?? formatInfo(tafel.format).pngBreite)).png
}

export const pngDataUrl = async (tafel: TbTafel, o: SvgOptionen = {}, breite = 1600): Promise<string> => {
  const png = await pngFuer(tafel, o, breite)
  let bin = ''
  for (let i = 0; i < png.length; i += 0x8000) bin += String.fromCharCode(...png.subarray(i, i + 0x8000))
  return `data:image/png;base64,${btoa(bin)}`
}

// ---------- PowerPoint ----------

/** Folien: je Format der schrittweise Aufbau, am Ende auf Wunsch die Lückenfassung */
export async function pptxFuer(t: Tafelbild, formate: FormatId[], mitLuecke: boolean): Promise<Uint8Array> {
  const folien: Folie[] = []
  for (const tafel of t.tafeln.filter((x) => formate.includes(x.format))) {
    const f = formatInfo(tafel.format)
    const n = t.meta.varianten.schritte ? schrittZahl(tafel) : 1
    const hintergrund = PALETTEN[f.medium].hintergrund
    for (let s = 1; s <= n; s++) {
      const o: SvgOptionen = s < n ? { schritt: s } : {}
      const { png, breite, hoehe } = await svgZuPng(tafelSvg(tafel, o), 1920)
      const texte = sichtbareElemente(tafel, o).map(elementText).filter(Boolean)
      folien.push({ png, breite, hoehe, hintergrund, titel: n > 1 ? `${f.kurz} – Schritt ${s} von ${n}` : f.kurz, beschreibung: `Tafelbild: ${texte.join(' | ')}`.slice(0, 1500) })
    }
    if (mitLuecke && tafel.elemente.some((e) => e.lueckenWoerter?.length || e.luecke)) {
      const o: SvgOptionen = { luecke: true, wortspeicher: true }
      const { png, breite, hoehe } = await svgZuPng(tafelSvg(tafel, o), 1920)
      folien.push({ png, breite, hoehe, hintergrund, titel: `${f.kurz} – Lückenfassung`, beschreibung: `Lückenfassung. Wortspeicher: ${wortspeicher(tafel, o).join(', ')}` })
    }
  }
  if (!folien.length) throw new Error('Kein Tafelbild zum Ausgeben.')
  return pptxDatei(folien, t.inhalt?.titel || t.meta.title || 'Tafelbild')
}
