/**
 * Drucken und Speichern der Reihen-Materialien (05.10.2026, abgestimmt): am Schritt (Drucken, PDF, Word)
 * und für die ganze Reihe (Sammeldruck), jeweils auf Wunsch mit Lösungsteil – immer in der Fassung des
 * Schritts (Auswahl, Korrekturrand) und mit GEMESSENEN Seiten wie im Editor, damit nichts abgeschnitten wird.
 */
import type { Reihe, Schritt } from '@shared/reihe'
import { useAppSettings } from '../../shared/settingsStore'
import { speichereAusgabe, WORD_FILTER } from '../../shared/export/ausgabe'
import type { Worksheet } from '../arbeitsblatt/model/types'
import type { PagePlan } from '../arbeitsblatt/render/paginate'
import { buildWorksheetHtml } from '../arbeitsblatt/render/printHtml'
import { messeSeiten } from '../arbeitsblatt/render/seitenMessen'
import { buildWorksheetDocx } from '../arbeitsblatt/export/docx/aufbau'
import { browserDocxDeps } from '../arbeitsblatt/export/browserDeps'
import { blattFassung } from './schrittAusBlatt'

export type DruckArt = 'drucken' | 'pdf' | 'word'

const kopf = (): { logo: string | null; schule: string } => {
  const { logoDataUrl, settings } = useAppSettings.getState()
  return { logo: logoDataUrl ?? null, schule: settings.schoolName ?? '' }
}

const dateiname = (t: string): string => t.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Material'

/** Fassung des Schritts (Auswahl, Korrekturrand) samt gemessener Seiten – null ohne Arbeitsblatt */
async function fassungVon(s: Schritt): Promise<{ ws: Worksheet; layouts: Map<string, PagePlan[]> } | null> {
  const i = s.inhalt
  if (i.art !== 'arbeitsblatt' || !i.quelle) return null
  const w = await window.api.sheets.get(i.quelle)
  const ws = blattFassung(w.payload as Worksheet, i.auswahl, i.korrekturrand !== false)
  const { logo, schule } = kopf()
  return { ws, layouts: await messeSeiten(ws, logo, schule) }
}

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const absaetze = (t: string): string =>
  t
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')

/** Einfache Auftragsseite für Schritte ohne Arbeitsblatt (Zwischenaufgabe, Lernkarten, Diagnose …) */
export function auftragsSeite(s: Schritt, nr: number, mitLoesung: boolean): string {
  const i = s.inhalt
  const teile: string[] = []
  switch (i.art) {
    case 'aufgabe':
      teile.push(absaetze(i.anweisung))
      if (i.material) teile.push(`<div style="border:0.3mm solid #999;padding:3mm;margin:3mm 0">${absaetze(i.material)}</div>`)
      if (i.fragen.length) teile.push(`<ol>${i.fragen.map((f) => `<li>${esc(f)}</li>`).join('')}</ol>`)
      if (mitLoesung && i.musterloesung) teile.push(`<h3>Lösung</h3>${absaetze(i.musterloesung)}`)
      break
    case 'lernkarten':
      teile.push(
        `<table style="width:100%;border-collapse:collapse">${i.karten.map((k) => `<tr><td style="border:0.3mm solid #999;padding:2mm;width:40%"><b>${esc(k.vorne)}</b></td><td style="border:0.3mm solid #999;padding:2mm">${esc(k.hinten)}</td></tr>`).join('')}</table>`
      )
      break
    case 'diagnose':
      teile.push(
        `<ol>${i.fragen
          .map(
            (f) =>
              `<li>${esc(f.frage)}${f.optionen.length ? `<br>${f.optionen.map((o) => `☐ ${esc(o)}`).join('&nbsp;&nbsp; ')}` : '<br>______________________'}${mitLoesung ? `<br><i>Lösung: ${esc(f.richtig)}</i>` : ''}</li>`
          )
          .join('')}</ol>`
      )
      break
    case 'reflexion':
      teile.push(absaetze(i.frage), '<div style="height:60mm;border-bottom:0.3mm solid #999"></div>')
      break
    case 'hefter':
      teile.push(`<div style="border:0.5mm solid #666;border-radius:2mm;padding:4mm">${absaetze(i.text)}</div>`)
      break
    case 'abschluss':
      teile.push(absaetze(i.anweisung))
      if (i.raster.length) teile.push(`<h3>Bewertung</h3><ul>${i.raster.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`)
      break
    case 'sprechen':
    case 'praesenz':
      teile.push(absaetze(i.anweisung))
      break
    default:
      return ''
  }
  if (!teile.length) return ''
  return `<div class="ws-page" style="width:210mm;min-height:297mm;box-sizing:border-box;padding:20mm;font:11pt/1.45 system-ui,'Segoe UI',sans-serif;background:#fff"><h2 style="margin-top:0">${nr}. ${esc(s.titel)}</h2>${teile.join('')}</div>`
}

const koerper = (html: string): string => html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'))

/** Druck-HTML eines Schritts (Arbeitsblatt in der Schrittfassung oder Auftragsseite) */
async function schrittHtml(s: Schritt, nr: number, mitLoesung: boolean): Promise<string> {
  const f = await fassungVon(s)
  if (!f) {
    const seite = auftragsSeite(s, nr, mitLoesung)
    return seite ? `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(s.titel)}</title></head><body>${seite}</body></html>` : ''
  }
  const { logo, schule } = kopf()
  const sheet = f.ws.sheets[0]
  return buildWorksheetHtml(f.ws, f.layouts, { sheetIds: [sheet.id], includeKey: mitLoesung }, logo, schule)
}

async function ausgeben(html: string, name: string, art: DruckArt, word?: () => Promise<Uint8Array>): Promise<void> {
  if (art === 'drucken') return window.api.exporter.print(html)
  if (art === 'word' && word) {
    await speichereAusgabe([{ name: `${name}.docx`, daten: word, filter: WORD_FILTER }], 'Word-Datei gespeichert')
    return
  }
  await speichereAusgabe([{ name: `${name}.pdf`, html }], 'PDF gespeichert')
}

/** Einen Schritt drucken bzw. speichern */
export async function schrittAusgeben(s: Schritt, art: DruckArt, mitLoesung: boolean): Promise<void> {
  const name = dateiname(s.titel || 'Schritt')
  if (art === 'word') {
    const f = await fassungVon(s)
    if (f) {
      const { logo, schule } = kopf()
      return ausgeben('', name, 'word', () =>
        buildWorksheetDocx(f.ws, { sheetIds: [f.ws.sheets[0].id], includeKey: mitLoesung }, browserDocxDeps(logo, schule))
      )
    }
  }
  const html = await schrittHtml(s, 1, mitLoesung)
  if (!html) throw new Error('Dieser Schritt hat nichts zum Drucken.')
  return ausgeben(html, name, art === 'word' ? 'pdf' : art)
}

/** Alle Materialien der Reihe in Reihenfolge – ein Dokument (Platzhalter fehlen) */
export async function reiheAusgeben(r: Reihe, art: Exclude<DruckArt, 'word'>, mitLoesung: boolean): Promise<number> {
  let kopfteil = ''
  const koerperTeile: string[] = []
  let nr = 0
  for (const s of r.schritte) {
    if (s.platzhalter) continue
    nr++
    const html = await schrittHtml(s, nr, mitLoesung)
    if (!html) continue
    if (!kopfteil && html.includes('ws-page') && html.includes('<style>')) kopfteil = html.slice(0, html.indexOf('<body>'))
    koerperTeile.push(koerper(html))
  }
  if (!koerperTeile.length) throw new Error('Die Reihe hat noch keine druckbaren Materialien.')
  const html = `${kopfteil || '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Reihe</title></head>'}<body>${koerperTeile.join('\n')}</body></html>`
  await ausgeben(html, dateiname(r.titel || 'Unterrichtsreihe'), art)
  return koerperTeile.length
}
