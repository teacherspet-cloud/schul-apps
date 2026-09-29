/**
 * Rückmeldebögen als PDF und Word (Großprogramm 0.4, F3). Je Abgabe eine Seite; mehrere Bögen
 * in einer Datei stehen je auf eigener Seite. Der Name steht erst HIER auf dem Bogen – lokal
 * eingesetzt, die KI hat nur das Kürzel gesehen.
 *
 * Seit 29.09.2026 mit den gewählten Formen: Einstufung (nur bestätigte Werte), Bewertungstabelle,
 * Korrekturrand (Text links, Nummer + Korrekturzeichen + Kommentar rechts), Kommentare am Scan
 * (Bild mit nummerierten Markern, daneben die Kommentare), Überarbeitungsauftrag, Legenden,
 * Großdruck als Nachteilsausgleich. Dazu Elternfassung und Notenübersicht der Lerngruppe.
 * Ein Nachteilsausgleich steht NIE auf dem Bogen der Lernenden – nur in der Notenübersicht der
 * Lehrkraft.
 */
import { bogenUeberschriften, type BogenUeberschriften } from './render/texte'
import { AlignmentType, Document, Packer, PageBreak, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from 'docx'
import { kiMetaTag, kiVermerkText, kiWordEigenschaften, vermerkSichtbar } from '@shared/kiKennzeichnung'
import { setzeNamenEin } from '@shared/pseudonymisierung'
import { A4_WIDTH, ALL_BORDERS, imageRun, MM } from '../../shared/export/docxKit'
import { legende, type Korrekturzeichen } from '../../shared/korrekturzeichen'
import { spracheNach } from '../../shared/familiensprachen'
import { EINSTUFUNGEN, einstufungVon, gesamtEinstufen, hatForm, kriterienEinstufen, LEGENDEN, tabellenSumme, wertText } from './art'
import { randLayout, scanReihenfolge, type NummerierterKommentar } from './korrekturrand'
import { ausgleichKurz, hatMassnahme } from './nachteilsausgleich'
import type { Abgabe, Bogen, Einstufungswert, Rueckmeldung } from './model/types'

const SYMBOL: Record<string, string> = { sicher: '●●●', teilweise: '●●○', 'noch nicht': '●○○' }

/** Kürzel im Bogen durch den Namen ersetzen (nur, wenn einer eingetragen ist) */
export function mitName(text: string, a: Abgabe): string {
  const zuordnung = [...(a.pseudonyme ?? []), ...(a.name.trim() ? [{ kuerzel: a.kuerzel, name: a.name.trim() }] : [])]
  return zuordnung.length ? setzeNamenEin(text, zuordnung) : text
}

const titelZeile = (r: Rueckmeldung): string => ['Rückmeldung', r.meta.subjectLabel, r.grundlage.titel].filter(Boolean).join(' · ')
const fuer = (_r: Rueckmeldung, a: Abgabe): string => `für ${a.name.trim() || a.kuerzel}`

const ueberschriften = (r: Rueckmeldung): BogenUeberschriften => bogenUeberschriften(r.meta.anrede)

/** Ausgabeoptionen, die nicht im Dokument stehen */
export interface AusgabeOptionen {
  /** Korrekturzeichen des Fachs (für die Legende) */
  zeichen?: Korrekturzeichen[]
  /** Vorbereitete Scan-Bilder mit eingezeichneten Markern (nur Word; im PDF liegen die Marker als Ebene über dem Bild) */
  scanBilder?: Map<string, { dataUrl: string; width: number; height: number }[]>
}

/** Nur bestätigte Einstufungen gehen hinaus */
const bestaetigt = (w: Einstufungswert | null | undefined): Einstufungswert | null => (w?.bestaetigt && w.wert ? w : null)

const ampelFarbe: Record<string, string> = { grün: '#2e7d32', gelb: '#f9a825', rot: '#c62828' }

function einstufungHtml(r: Rueckmeldung, w: Einstufungswert, esc: (s: string) => string): string {
  const art = einstufungVon(r.meta)
  if (art === 'ampel') return `<span class="ampel" style="background:${ampelFarbe[w.wert] ?? '#999'}"></span> ${esc(w.wert)}`
  return esc(wertText(art, w.wert))
}

export const skalenName = (r: Rueckmeldung): string => {
  const art = einstufungVon(r.meta)
  return art === 'notenpunkte' ? 'Notenpunkte' : art === 'note' || art === 'noteTendenz' ? 'Note' : (EINSTUFUNGEN.find((e) => e.id === art)?.label ?? '')
}

/** Benutzte Korrekturzeichen eines Bogens */
const benutzteZeichen = (b: Bogen): string[] => (b.rand ?? []).map((k) => k.zeichen ?? '').filter(Boolean)

/** Liegen die Randkommentare auf den Scans? */
export const aufScan = (a: Abgabe): boolean => Boolean(a.bogen?.rand?.some((k) => k.seite != null) && a.scans?.length)

// ---------- PDF (HTML) ----------

export function boegenHtml(r: Rueckmeldung, abgaben: Abgabe[], opt: AusgabeOptionen = {}): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const u = ueberschriften(r)
  const m = r.meta
  const art = einstufungVon(m)
  const vermerk = vermerkSichtbar(m.ki, m.kiVermerk, false) && m.ki ? `<p class="ki">${esc(kiVermerkText(m.ki))}</p>` : ''

  const kommentarZeile = (g: NummerierterKommentar, n: (s: string) => string): string =>
    `<li class="${g.k.art}"><b>${g.nr}</b>${g.k.zeichen ? ` <span class="zeichen">${esc(g.k.zeichen)}</span>` : ''} ${n(g.k.text)}${g.k.ohneWertung ? ' <i>(ohne Wertung)</i>' : ''}</li>`

  const seite = (a: Abgabe): string => {
    const b = a.bogen as Bogen
    const n = (s: string): string => esc(mitName(s, a))
    const nRoh = (s: string): string => mitName(s, a)
    const teile: string[] = []
    const gesamt = gesamtEinstufen(m) ? bestaetigt(b.gesamt) : null
    teile.push(
      `<div class="kopf"><div><h1>${esc(titelZeile(r))}</h1><p class="fuer">${esc(fuer(r, a))} · Klasse ${m.grade}</p></div>${
        gesamt ? `<div class="einstufung"><small>${esc(skalenName(r))}</small><strong>${einstufungHtml(r, gesamt, esc)}</strong></div>` : ''
      }</div>`
    )
    if (hatForm(m, 'schriftlich') && b.staerken.length) teile.push(`<h2>${u.staerken}</h2><ul>${b.staerken.map((s) => `<li>${n(s)}</li>`).join('')}</ul>`)
    if (hatForm(m, 'tipps') && b.schritte.length) teile.push(`<h2>${u.schritte}</h2><ol>${b.schritte.map((s) => `<li>${n(s)}</li>`).join('')}</ol>`)
    if (b.kriterien.length && (hatForm(m, 'schriftlich') || kriterienEinstufen(m))) {
      const mitStufe = kriterienEinstufen(m)
      teile.push(
        `<h2>${u.kriterien}</h2><table><tbody>${b.kriterien
          .map((k, i) => {
            const w = mitStufe ? bestaetigt(b.kriterienStufen?.[i]) : null
            return `<tr><td class="k">${n(k.kriterium)}</td><td class="e">${
              mitStufe ? (w ? einstufungHtml(r, w, esc) : '') : `${SYMBOL[k.einschaetzung]} ${esc(k.einschaetzung)}`
            }</td><td>${k.beleg ? `„${n(k.beleg)}“` : ''}</td></tr>`
          })
          .join('')}</tbody></table>${mitStufe ? '' : '<p class="legende">●●● sicher · ●●○ teilweise · ●○○ noch nicht</p>'}`
      )
    }
    if (hatForm(m, 'tabelle') && r.tabelle && b.tabelle?.length) {
      const t = r.tabelle
      const summe = tabellenSumme(t, b.tabelle)
      const zeilen = t.kriterien
        .map((k) => {
          const w = b.tabelle!.find((x) => x.kriteriumId === k.id)
          const wert = k.punkte ? `${w?.punkte ?? '–'} / ${k.punkte}` : w?.stufe != null ? esc(t.stufen[w.stufe] ?? '') : '–'
          return `<tr><td class="k">${k.bereich ? `<small>${esc(k.bereich)}</small><br>` : ''}${esc(k.kriterium)}</td><td class="e">${wert}</td><td>${w?.begruendung ? n(w.begruendung) : ''}</td></tr>`
        })
        .join('')
      const summenZeile = summe.moeglich ? `<tr class="summe"><td>Summe</td><td class="e">${summe.erreicht} / ${summe.moeglich}</td><td></td></tr>` : ''
      teile.push(`<h2>${u.tabelle}</h2><table><tbody>${zeilen}${summenZeile}</tbody></table>`)
    }
    if (b.ueberarbeitung)
      teile.push(
        `<h2>${u.ueberarbeitung}</h2><div class="auftrag">${b.ueberarbeitung.zitat ? `<p class="zitat">„${n(b.ueberarbeitung.zitat)}“</p>` : ''}<p>${n(b.ueberarbeitung.auftrag)}</p></div>`
      )
    if (b.schluss && hatForm(m, 'schriftlich')) teile.push(`<p class="schluss">${n(b.schluss)}</p>`)

    // Korrekturrand bzw. Scan: auf eigener Seite hinter dem Bogen
    const rand = b.rand ?? []
    if (rand.length && aufScan(a)) {
      const reihe = scanReihenfolge(rand)
      const seiten = a.scans!.map((src, s) => {
        const hier = reihe.filter((g) => (g.k.seite ?? 0) === s)
        const marker = hier.map((g) => `<span class="marker ${g.k.art}" style="left:${g.k.x ?? 50}%;top:${g.k.y ?? 50}%">${g.nr}</span>`).join('')
        return `<div class="scanseite"><div class="scanbild"><img src="${src}" alt="">${marker}</div><ol class="randliste">${hier.map((g) => kommentarZeile(g, n)).join('')}</ol></div>`
      })
      teile.push(`<div class="neueseite"><h2>${u.scan}</h2>${seiten.join('')}</div>`)
    } else if (rand.length && hatForm(m, 'rand')) {
      const layout = randLayout(mitName(a.text, a), rand, nRoh)
      const zeilen = layout.absaetze
        .map(
          (abs) =>
            `<tr><td class="text">${abs.teile
              .map((t) => (t.art ? `<mark class="${t.art}">${esc(t.text)}</mark>${t.nr != null ? `<sup>${t.nr}</sup>` : ''}` : esc(t.text)))
              .join('')}</td><td class="rand"><ol>${abs.kommentare.map((g) => kommentarZeile(g, n)).join('')}</ol></td></tr>`
        )
        .join('')
      const ohne = layout.ohneStelle.length
        ? `<p class="ohne">Ohne Stelle im Text:</p><ol class="randliste">${layout.ohneStelle.map((g) => kommentarZeile(g, n)).join('')}</ol>`
        : ''
      teile.push(`<div class="neueseite"><h2>${u.rand}</h2><table class="korrektur"><tbody>${zeilen}</tbody></table>${ohne}</div>`)
    }
    const benutzt = legende(opt.zeichen ?? [], benutzteZeichen(b))
    if (benutzt.length) teile.push(`<p class="legende">${benutzt.map((z) => `${esc(z.zeichen)}${z.bedeutung ? ` = ${esc(z.bedeutung)}` : ''}`).join(' · ')}</p>`)
    if (LEGENDEN[art] && (gesamt || kriterienEinstufen(m))) teile.push(`<p class="legende">${esc(LEGENDEN[art]!)}</p>`)
    const gross = hatMassnahme(a.ausgleich, 'grossdruck') ? ' gross' : ''
    return `<section class="seite${gross}">${teile.join('\n')}${vermerk}</section>`
  }
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(titelZeile(r))}</title>${kiMetaTag(m.ki)}<style>
@page { size: A4; margin: 18mm 18mm 16mm 22mm; }
body { font-family: Calibri, Carlito, "Segoe UI", "Segoe UI Emoji", Arial, sans-serif; font-size: 11.5pt; line-height: 1.45; color: #000; margin: 0; }
.seite { page-break-after: always; } .seite:last-child { page-break-after: auto; }
.seite.gross { font-size: 16pt; line-height: 1.55; } .seite.gross h1 { font-size: 20pt; } .seite.gross h2 { font-size: 17pt; }
.kopf { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 0.3mm solid #999; padding-bottom: 2mm; margin-bottom: 4mm; }
h1 { font-size: 15pt; margin: 0; } .fuer { color: #444; margin: 1mm 0 0; }
.einstufung { border: 0.5mm solid #000; border-radius: 2mm; padding: 1.5mm 4mm; text-align: center; min-width: 28mm; }
.einstufung small { display: block; font-size: 8pt; color: #555; } .einstufung strong { font-size: 15pt; }
h2 { font-size: 12.5pt; margin: 5mm 0 1.5mm; } ul, ol { margin: 0; padding-left: 6mm; } li { margin-bottom: 1.5mm; }
table { width: 100%; border-collapse: collapse; margin-top: 1mm; } td { border: 0.3mm solid #aaa; padding: 1.5mm 2mm; vertical-align: top; }
td.k { width: 32%; font-weight: 600; } td.k small { font-weight: 400; color: #555; } td.e { width: 22%; white-space: nowrap; }
tr.summe td { font-weight: 700; background: #f2f2f2; }
.legende { font-size: 9pt; color: #555; margin: 1.5mm 0 0; }
.schluss { margin-top: 6mm; font-style: italic; } .ki { margin-top: 8mm; font-size: 7pt; color: #777; }
.auftrag { border-left: 1mm solid #555; padding: 1mm 0 1mm 3mm; } .auftrag .zitat { color: #444; font-style: italic; margin: 0 0 1mm; }
.ampel { display: inline-block; width: 3.5mm; height: 3.5mm; border-radius: 50%; vertical-align: -0.4mm; }
.neueseite { page-break-before: always; }
table.korrektur td.text { width: 66%; white-space: pre-wrap; line-height: 1.8; }
table.korrektur td.rand { width: 34%; font-size: 9.5pt; background: #fafafa; }
table.korrektur td.rand ol, .randliste { list-style: none; padding-left: 0; }
mark { background: none; color: inherit; text-decoration: underline; text-decoration-thickness: 0.4mm; text-underline-offset: 0.8mm; }
mark.fehler { text-decoration-color: #c62828; } mark.lob { text-decoration-color: #2e7d32; } mark.hinweis { text-decoration-color: #1565c0; }
sup { font-weight: 700; font-size: 7.5pt; color: #c62828; }
li b { color: #c62828; margin-right: 1mm; } li.lob b { color: #2e7d32; } li.hinweis b { color: #1565c0; }
.zeichen { font-weight: 700; border: 0.25mm solid #999; border-radius: 1mm; padding: 0 1mm; font-size: 8.5pt; }
.ohne { font-size: 9pt; color: #555; margin: 3mm 0 1mm; }
.scanseite { display: flex; gap: 4mm; align-items: flex-start; page-break-inside: avoid; margin-bottom: 4mm; }
.scanbild { position: relative; width: 64%; flex: none; } .scanbild img { width: 100%; display: block; border: 0.3mm solid #ccc; }
.marker { position: absolute; transform: translate(-50%, -50%); width: 5.5mm; height: 5.5mm; border-radius: 50%; background: #c62828; color: #fff; font-size: 8pt; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 0.4mm #fff; }
.marker.lob { background: #2e7d32; } .marker.hinweis { background: #1565c0; }
.randliste { font-size: 9.5pt; flex: 1; }
</style></head><body>${abgaben
    .filter((a) => a.bogen)
    .map(seite)
    .join('\n')}</body></html>`
}

// ---------- Word ----------

export async function boegenDocx(r: Rueckmeldung, abgaben: Abgabe[], opt: AusgabeOptionen = {}): Promise<Uint8Array> {
  const rand = Math.round(18 * MM)
  const breite = A4_WIDTH - rand - Math.round(22 * MM)
  const u = ueberschriften(r)
  const m = r.meta
  const art = einstufungVon(m)
  const spalten = [0.32, 0.22, 0.46].map((x) => Math.round(breite * x))
  const kinder: (Paragraph | Table)[] = []
  const fertige = abgaben.filter((a) => a.bogen)
  fertige.forEach((a, i) => {
    const b = a.bogen as Bogen
    const n = (s: string): string => mitName(s, a)
    const gross = hatMassnahme(a.ausgleich, 'grossdruck')
    const groesse = (normal?: number): { size?: number } => (gross ? { size: 32 } : normal ? { size: normal } : {})
    const tr = (text: string, o: { bold?: boolean; italics?: boolean; color?: string } = {}): TextRun => new TextRun({ text, ...o, ...groesse() })
    const ueber = (text: string): Paragraph => new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text, bold: true, size: gross ? 34 : 25 })] })
    const zelle = (text: string, w: number, fett = false): TableCell =>
      new TableCell({ width: { size: w, type: WidthType.DXA }, borders: ALL_BORDERS, children: [new Paragraph({ children: [tr(text, { bold: fett })] })] })
    if (i > 0) kinder.push(new Paragraph({ children: [new PageBreak()] }))
    const gesamt = gesamtEinstufen(m) ? bestaetigt(b.gesamt) : null
    kinder.push(
      new Paragraph({ children: [new TextRun({ text: titelZeile(r), bold: true, size: gross ? 40 : 30 })] }),
      new Paragraph({ spacing: { after: 200 }, children: [tr(`${fuer(r, a)} · Klasse ${m.grade}`, { color: '444444' })] })
    )
    if (gesamt)
      kinder.push(
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({ text: `${skalenName(r)}: `, ...groesse() }), new TextRun({ text: wertText(art, gesamt.wert), bold: true, size: gross ? 40 : 30 })]
        })
      )
    if (hatForm(m, 'schriftlich') && b.staerken.length) kinder.push(ueber(u.staerken), ...b.staerken.map((s) => new Paragraph({ bullet: { level: 0 }, children: [tr(n(s))] })))
    if (hatForm(m, 'tipps') && b.schritte.length) kinder.push(ueber(u.schritte), ...b.schritte.map((s, k) => new Paragraph({ children: [tr(`${k + 1}. ${n(s)}`)] })))
    if (b.kriterien.length && (hatForm(m, 'schriftlich') || kriterienEinstufen(m))) {
      const mitStufe = kriterienEinstufen(m)
      kinder.push(ueber(u.kriterien))
      kinder.push(
        new Table({
          layout: TableLayoutType.FIXED,
          width: { size: breite, type: WidthType.DXA },
          columnWidths: spalten,
          rows: b.kriterien.map((k, j) => {
            const w = mitStufe ? bestaetigt(b.kriterienStufen?.[j]) : null
            return new TableRow({
              children: [
                zelle(n(k.kriterium), spalten[0], true),
                zelle(mitStufe ? (w ? wertText(art, w.wert) : '') : `${SYMBOL[k.einschaetzung]} ${k.einschaetzung}`, spalten[1]),
                zelle(k.beleg ? `„${n(k.beleg)}“` : '', spalten[2])
              ]
            })
          })
        })
      )
      if (!mitStufe) kinder.push(new Paragraph({ children: [new TextRun({ text: '●●● sicher · ●●○ teilweise · ●○○ noch nicht', size: 17, color: '666666' })] }))
    }
    if (hatForm(m, 'tabelle') && r.tabelle && b.tabelle?.length) {
      const t = r.tabelle
      const summe = tabellenSumme(t, b.tabelle)
      kinder.push(ueber(u.tabelle))
      const zeilen = t.kriterien.map((k) => {
        const w = b.tabelle!.find((x) => x.kriteriumId === k.id)
        const wert = k.punkte ? `${w?.punkte ?? '–'} / ${k.punkte}` : w?.stufe != null ? (t.stufen[w.stufe] ?? '') : '–'
        return new TableRow({
          children: [zelle(`${k.bereich ? `${k.bereich}: ` : ''}${k.kriterium}`, spalten[0], true), zelle(wert, spalten[1]), zelle(w?.begruendung ? n(w.begruendung) : '', spalten[2])]
        })
      })
      if (summe.moeglich) zeilen.push(new TableRow({ children: [zelle('Summe', spalten[0], true), zelle(`${summe.erreicht} / ${summe.moeglich}`, spalten[1], true), zelle('', spalten[2])] }))
      kinder.push(new Table({ layout: TableLayoutType.FIXED, width: { size: breite, type: WidthType.DXA }, columnWidths: spalten, rows: zeilen }))
    }
    if (b.ueberarbeitung) {
      kinder.push(ueber(u.ueberarbeitung))
      if (b.ueberarbeitung.zitat) kinder.push(new Paragraph({ children: [tr(`„${n(b.ueberarbeitung.zitat)}“`, { italics: true, color: '444444' })] }))
      kinder.push(new Paragraph({ children: [tr(n(b.ueberarbeitung.auftrag))] }))
    }
    if (b.schluss && hatForm(m, 'schriftlich')) kinder.push(new Paragraph({ spacing: { before: 240 }, children: [tr(n(b.schluss), { italics: true })] }))

    // Korrekturrand bzw. Scan
    const kommentar = (g: NummerierterKommentar): Paragraph =>
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({ text: `${g.nr} `, bold: true, color: g.k.art === 'lob' ? '2E7D32' : g.k.art === 'hinweis' ? '1565C0' : 'C62828', ...groesse(19) }),
          ...(g.k.zeichen ? [new TextRun({ text: `${g.k.zeichen} `, bold: true, ...groesse(19) })] : []),
          new TextRun({ text: n(g.k.text) + (g.k.ohneWertung ? ' (ohne Wertung)' : ''), ...groesse(19) })
        ]
      })
    const rk = b.rand ?? []
    if (rk.length && aufScan(a)) {
      kinder.push(new Paragraph({ children: [new PageBreak()] }), ueber(u.scan))
      const reihe = scanReihenfolge(rk)
      const bildBreite = Math.round(breite * 0.64)
      const listenBreite = breite - bildBreite
      const bilder = opt.scanBilder?.get(a.id)
      a.scans!.forEach((_src, s) => {
        const bild = bilder?.[s]
        const hier = reihe.filter((g) => (g.k.seite ?? 0) === s)
        // Bild in Pixeln: Spaltenbreite in DXA / 15
        const px = Math.round(bildBreite / 15)
        const bildZelle = bild
          ? [new Paragraph({ children: [imageRun(bild.dataUrl, px, Math.round((px * bild.height) / Math.max(1, bild.width)))] })]
          : [new Paragraph({ children: [tr(`Seite ${s + 1}`)] })]
        kinder.push(
          new Table({
            layout: TableLayoutType.FIXED,
            width: { size: breite, type: WidthType.DXA },
            columnWidths: [bildBreite, listenBreite],
            rows: [
              new TableRow({
                children: [
                  new TableCell({ width: { size: bildBreite, type: WidthType.DXA }, borders: ALL_BORDERS, children: bildZelle }),
                  new TableCell({ width: { size: listenBreite, type: WidthType.DXA }, borders: ALL_BORDERS, children: hier.length ? hier.map(kommentar) : [new Paragraph('')] })
                ]
              })
            ]
          })
        )
      })
    } else if (rk.length && hatForm(m, 'rand')) {
      kinder.push(new Paragraph({ children: [new PageBreak()] }), ueber(u.rand))
      const layout = randLayout(mitName(a.text, a), rk, n)
      const textBreite = Math.round(breite * 0.66)
      const randBreite = breite - textBreite
      const farbe = (art: string | undefined): string => (art === 'lob' ? '2E7D32' : art === 'hinweis' ? '1565C0' : 'C62828')
      const zeilen = layout.absaetze.map(
        (abs) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: textBreite, type: WidthType.DXA },
                borders: ALL_BORDERS,
                children: [
                  new Paragraph({
                    spacing: { line: 360 },
                    children: abs.teile.flatMap((t) => [
                      new TextRun({ text: t.text, ...(t.art ? { underline: { color: farbe(t.art) } } : {}), ...groesse() }),
                      ...(t.nr != null ? [new TextRun({ text: String(t.nr), superScript: true, bold: true, color: farbe(t.art) })] : [])
                    ])
                  })
                ]
              }),
              new TableCell({
                width: { size: randBreite, type: WidthType.DXA },
                borders: ALL_BORDERS,
                shading: { fill: 'FAFAFA' },
                children: abs.kommentare.length ? abs.kommentare.map(kommentar) : [new Paragraph('')]
              })
            ]
          })
      )
      if (zeilen.length) kinder.push(new Table({ layout: TableLayoutType.FIXED, width: { size: breite, type: WidthType.DXA }, columnWidths: [textBreite, randBreite], rows: zeilen }))
      if (layout.ohneStelle.length) kinder.push(new Paragraph({ spacing: { before: 160 }, children: [tr('Ohne Stelle im Text:', { color: '555555' })] }), ...layout.ohneStelle.map(kommentar))
    }
    const benutzt = legende(opt.zeichen ?? [], benutzteZeichen(b))
    if (benutzt.length)
      kinder.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [new TextRun({ text: benutzt.map((z) => `${z.zeichen}${z.bedeutung ? ` = ${z.bedeutung}` : ''}`).join(' · '), size: 17, color: '555555' })]
        })
      )
    if (LEGENDEN[art] && (gesamt || kriterienEinstufen(m))) kinder.push(new Paragraph({ children: [new TextRun({ text: LEGENDEN[art]!, size: 17, color: '555555' })] }))
    if (m.ki && vermerkSichtbar(m.ki, m.kiVermerk, false))
      kinder.push(
        new Paragraph({
          spacing: { before: 300 },
          alignment: AlignmentType.LEFT,
          children: [new TextRun({ text: kiVermerkText(m.ki), size: 14, color: '777777' })]
        })
      )
  })
  return dokument(r, kinder, rand, Math.round(22 * MM))
}

async function dokument(r: Rueckmeldung, kinder: (Paragraph | Table)[], rand: number, links: number, titel = titelZeile(r)): Promise<Uint8Array> {
  const doc = new Document({
    creator: 'Schul-Apps',
    title: titel,
    ...kiWordEigenschaften(r.meta.ki),
    styles: { default: { document: { run: { font: 'Calibri', size: 23 } } } },
    sections: [
      {
        properties: { page: { margin: { top: rand, bottom: Math.round(16 * MM), left: links, right: rand } } },
        children: kinder.length ? kinder : [new Paragraph('')]
      }
    ]
  })
  return new Uint8Array(await Packer.toArrayBuffer(doc))
}

// ---------- Elternfassung ----------

const ELTERN_VERMERK = 'Maschinelle Übersetzung – verbindlich ist die deutsche Fassung.'

export function elternHtml(r: Rueckmeldung, abgaben: Abgabe[]): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const u = ueberschriften(r)
  const seiten = abgaben
    .filter((a) => a.bogen?.eltern)
    .map((a) => {
      const b = a.bogen!
      const uebers = a.familiensprache ? b.elternUebersetzt?.[a.familiensprache] : undefined
      const sprache = a.familiensprache ? spracheNach(a.familiensprache) : undefined
      const absatz = (s: string): string => esc(mitName(s, a)).replace(/\n/g, '<br>')
      return `<section class="seite"><h1>${esc(u.eltern)}</h1><p class="fuer">${esc([r.meta.subjectLabel, r.grundlage.titel].filter(Boolean).join(' · '))} · ${esc(a.name.trim() || a.kuerzel)}, Klasse ${r.meta.grade}</p>
<p>${absatz(b.eltern!)}</p>${
        uebers
          ? `<hr><p class="fuer">${esc(sprache?.eigen ?? a.familiensprache ?? '')}</p><p${sprache?.rtl ? ' dir="rtl"' : ''}>${absatz(uebers)}</p><p class="vermerk">${ELTERN_VERMERK}</p>`
          : ''
      }</section>`
    })
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(u.eltern)}</title><style>
@page { size: A4; margin: 20mm; } body { font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif; font-size: 12pt; line-height: 1.5; margin: 0; }
.seite { page-break-after: always; } .seite:last-child { page-break-after: auto; }
h1 { font-size: 15pt; margin: 0; } .fuer { color: #444; margin: 1mm 0 5mm; } hr { border: none; border-top: 0.3mm solid #aaa; margin: 6mm 0; }
.vermerk { font-size: 8pt; color: #777; }
</style></head><body>${seiten.join('\n')}</body></html>`
}

export async function elternDocx(r: Rueckmeldung, abgaben: Abgabe[]): Promise<Uint8Array> {
  const u = ueberschriften(r)
  const kinder: Paragraph[] = []
  abgaben
    .filter((a) => a.bogen?.eltern)
    .forEach((a, i) => {
      const b = a.bogen!
      if (i > 0) kinder.push(new Paragraph({ children: [new PageBreak()] }))
      kinder.push(
        new Paragraph({ children: [new TextRun({ text: u.eltern, bold: true, size: 30 })] }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({ text: `${[r.meta.subjectLabel, r.grundlage.titel].filter(Boolean).join(' · ')} · ${a.name.trim() || a.kuerzel}, Klasse ${r.meta.grade}`, color: '444444' })
          ]
        }),
        ...mitName(b.eltern!, a)
          .split('\n')
          .map((z) => new Paragraph({ children: [new TextRun(z)] }))
      )
      const uebers = a.familiensprache ? b.elternUebersetzt?.[a.familiensprache] : undefined
      if (uebers) {
        const sprache = spracheNach(a.familiensprache!)
        const rtl = Boolean(sprache?.rtl)
        kinder.push(
          new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: sprache?.eigen ?? a.familiensprache!, color: '444444' })] }),
          ...mitName(uebers, a)
            .split('\n')
            .map((z) => new Paragraph({ bidirectional: rtl, children: [new TextRun({ text: z, rightToLeft: rtl })] })),
          new Paragraph({ children: [new TextRun({ text: ELTERN_VERMERK, size: 16, color: '777777' })] })
        )
      }
    })
  const rand = Math.round(20 * MM)
  return dokument(r, kinder, rand, rand, u.eltern)
}

// ---------- Notenübersicht der Lerngruppe (nur für die Lehrkraft) ----------

export interface UebersichtZeile {
  name: string
  kuerzel: string
  einstufung: string
  bestaetigt: boolean
  punkte: string
  ausgleich: string
  fehler: string
}

export function uebersichtZeilen(r: Rueckmeldung): UebersichtZeile[] {
  return r.abgaben.map((a) => {
    const b = a.bogen
    const summe = r.tabelle && b?.tabelle?.length ? tabellenSumme(r.tabelle, b.tabelle) : null
    return {
      name: a.name.trim(),
      kuerzel: a.kuerzel,
      einstufung: b?.gesamt?.wert ?? '',
      bestaetigt: Boolean(b?.gesamt?.bestaetigt),
      punkte: summe && summe.moeglich ? `${summe.erreicht}/${summe.moeglich}` : '',
      ausgleich: ausgleichKurz(a.ausgleich),
      fehler: (b?.fehler ?? []).map((f) => f.kategorie).join('; ')
    }
  })
}

/** CSV für Excel (Semikolon, UTF-8 mit BOM) */
export function uebersichtCsv(r: Rueckmeldung): string {
  const zelle = (s: string): string => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const kopf = ['Name', 'Kürzel', skalenName(r) || 'Einstufung', 'bestätigt', 'Punkte', 'Nachteilsausgleich/Notenschutz', 'Fehlerschwerpunkte']
  const zeilen = uebersichtZeilen(r).map((z) => [z.name, z.kuerzel, z.einstufung, z.bestaetigt ? 'ja' : z.einstufung ? 'nein' : '', z.punkte, z.ausgleich, z.fehler])
  return '﻿' + [kopf, ...zeilen].map((z) => z.map(zelle).join(';')).join('\r\n')
}

export function uebersichtHtml(r: Rueckmeldung): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const zeilen = uebersichtZeilen(r)
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Notenübersicht</title><style>
@page { size: A4 landscape; margin: 14mm; } body { font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif; font-size: 10.5pt; }
table { width: 100%; border-collapse: collapse; } th, td { border: 0.3mm solid #999; padding: 1.2mm 2mm; text-align: left; vertical-align: top; } th { background: #eee; }
.offen { color: #b26a00; } small { color: #555; }
</style></head><body><h1 style="font-size:14pt;margin:0">Notenübersicht · ${esc(titelZeile(r))}</h1><p><small>Klasse ${r.meta.grade} · nur für die Lehrkraft · NA = Nachteilsausgleich, NS = Notenschutz</small></p>
<table><thead><tr><th>Name</th><th>Kürzel</th><th>${esc(skalenName(r) || 'Einstufung')}</th><th>Punkte</th><th>NA/NS</th><th>Fehlerschwerpunkte</th></tr></thead><tbody>${zeilen
    .map(
      (z) =>
        `<tr><td>${esc(z.name)}</td><td>${esc(z.kuerzel)}</td><td class="${z.einstufung && !z.bestaetigt ? 'offen' : ''}">${esc(z.einstufung)}${z.einstufung && !z.bestaetigt ? ' (Vorschlag)' : ''}</td><td>${esc(z.punkte)}</td><td>${esc(z.ausgleich)}</td><td>${esc(z.fehler)}</td></tr>`
    )
    .join('')}</tbody></table></body></html>`
}

// ---------- Fehlerprofil ----------

export interface FehlerEintrag {
  kategorie: string
  anzahl: number
  kuerzel: string[]
  beispiele: string[]
}

/** Fehlerschwerpunkte der Lerngruppe, häufigste zuerst (gleiche Kategorien ohne Groß-/Kleinschreibung zusammengefasst) */
export function fehlerprofil(r: Rueckmeldung): FehlerEintrag[] {
  const map = new Map<string, FehlerEintrag>()
  for (const a of r.abgaben)
    for (const f of a.bogen?.fehler ?? []) {
      const key = f.kategorie.trim().toLowerCase().replace(/\s+/g, ' ')
      const e = map.get(key) ?? { kategorie: f.kategorie.trim(), anzahl: 0, kuerzel: [], beispiele: [] }
      if (!e.kuerzel.includes(a.kuerzel)) {
        e.kuerzel.push(a.kuerzel)
        e.anzahl++
      }
      if (f.beispiel && e.beispiele.length < 3) e.beispiele.push(f.beispiel)
      map.set(key, e)
    }
  return [...map.values()].sort((x, y) => y.anzahl - x.anzahl || x.kategorie.localeCompare(y.kategorie))
}

/** Text zum Vorlesen (Namen eingesetzt) */
export function bogenVorlesetext(r: Rueckmeldung, a: Abgabe): string {
  const b = a.bogen
  if (!b) return ''
  const u = ueberschriften(r)
  const n = (s: string): string => mitName(s, a)
  const teile: string[] = [`${titelZeile(r).replace(/ · /g, ', ')}. ${fuer(r, a)}.`]
  if (hatForm(r.meta, 'schriftlich') && b.staerken.length) teile.push(`${u.staerken}: ${b.staerken.map(n).join(' ')}`)
  if (hatForm(r.meta, 'tipps') && b.schritte.length) teile.push(`${u.schritte}: ${b.schritte.map((s, i) => `${i + 1}. ${n(s)}`).join(' ')}`)
  if (b.ueberarbeitung) teile.push(`${u.ueberarbeitung}: ${n(b.ueberarbeitung.auftrag)}`)
  if (b.schluss && hatForm(r.meta, 'schriftlich')) teile.push(n(b.schluss))
  return teile.join('\n\n')
}
