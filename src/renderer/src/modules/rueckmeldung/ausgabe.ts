/**
 * Rückmeldebögen als PDF und Word (Großprogramm 0.4, F3). Je Abgabe ein Blatt; mehrere Bögen
 * in einer Datei beginnen je auf einer neuen Seite. Der Name steht erst HIER auf dem Bogen –
 * lokal eingesetzt, die KI hat nur das Kürzel gesehen.
 *
 * Seit 29.09.2026 abends (Wunsch der Lehrkraft) ist der Ausdruck das „Blatt" aus blattLayout.ts:
 * Kopf mit Einstufung, Schülertext mit Korrekturrand bzw. Scans mit Markern, darunter der Kasten
 * „Rückmeldung" – im PDF mit GENAU dem Layout der Ansicht (gemeinsames CSS), im Word-Dokument so
 * nah wie möglich (Randnotizen als rechte Tabellenspalte hinter einer roten Randlinie – robuster
 * als Word-Kommentare, die beim Drucken je nach Einstellung verschwinden).
 * Ein Nachteilsausgleich steht NIE auf dem Bogen der Lernenden – nur in der Notenübersicht der
 * Lehrkraft; Großdruck wirkt sich nur auf die Schriftgröße aus.
 */
import { bogenUeberschriften, type BogenUeberschriften } from './render/texte'
import {
  AlignmentType,
  BorderStyle,
  Document,
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
import { kiMetaTag, kiVermerkText, kiWordEigenschaften, vermerkSichtbar } from '@shared/kiKennzeichnung'
import { A4_WIDTH, imageRun, MM, NO_BORDERS } from '../../shared/export/docxKit'
import type { Korrekturzeichen } from '../../shared/korrekturzeichen'
import { spracheNach } from '../../shared/familiensprachen'
import { einstufungVon, hatForm, tabellenSumme, wertText } from './art'
import {
  BLATT_MASSE,
  blattDokument,
  blattHtml,
  blattModell,
  kastenTitel,
  mitName,
  notizText,
  RASTER_KOPF,
  skalenName,
  SYMBOL,
  tabellenZeilen,
  tabWert,
  teilTabelle,
  titelZeile,
  type BlattEinstufung,
  type markenStil
} from './blattLayout'
import type { NummerierterKommentar, Textteil } from './korrekturrand'
import { ausgleichKurz } from './nachteilsausgleich'
import type { Abgabe, Bogen, Einstufungswert, Rueckmeldung } from './model/types'
import { WORD_TRENNUNG } from '@renderer/shared/silbentrennung'

export { aufScan, mitName, skalenName } from './blattLayout'

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

// ---------- PDF (HTML) ----------

/**
 * Die Bögen als Druck-HTML im freien Fluss – ohne Messung (Tests, Notfall). Die App druckt mit
 * gemessenem Seitenplan: `boegenDruckHtml` in seitenMessen.ts (dieselben Seiten wie die Ansicht).
 */
export function boegenHtml(r: Rueckmeldung, abgaben: Abgabe[], opt: AusgabeOptionen = {}): string {
  const blaetter = abgaben.filter((a) => a.bogen).map((a) => blattHtml(r, a, { zeichen: opt.zeichen }))
  return blattDokument(titelZeile(r), blaetter, kiMetaTag(r.meta.ki))
}

// ---------- Word ----------

const ROT = 'C62828'
const GRUEN = '2E7D32'
const RANDLINIE = 'EF9A9A'
const LINIE = 'D3DEEC'
const HAND = 'Ink Free'

export async function boegenDocx(r: Rueckmeldung, abgaben: Abgabe[], opt: AusgabeOptionen = {}): Promise<Uint8Array> {
  const oben = Math.round(BLATT_MASSE.oben * MM)
  const links = Math.round(BLATT_MASSE.links * MM)
  const rechts = Math.round(BLATT_MASSE.rechts * MM)
  const breite = A4_WIDTH - links - rechts
  const textBreite = Math.round((breite * BLATT_MASSE.text) / (BLATT_MASSE.text + BLATT_MASSE.rand))
  const randBreite = breite - textBreite
  const m = r.meta
  const art = einstufungVon(m)
  const kinder: (Paragraph | Table)[] = []
  const fertige = abgaben.filter((a) => a.bogen)
  const ohneRahmen = NO_BORDERS
  const linie = (farbe: string, size = 6) => ({ style: BorderStyle.SINGLE, size, color: farbe })
  const zelle = (children: (Paragraph | Table)[], w: number, extra: Partial<ConstructorParameters<typeof TableCell>[0]> = {}): TableCell =>
    new TableCell({ width: { size: w, type: WidthType.DXA }, borders: ohneRahmen, children: children.length ? children : [new Paragraph('')], ...extra })

  fertige.forEach((a, i) => {
    const b = a.bogen as Bogen
    const md = blattModell(r, a, { zeichen: opt.zeichen })
    const n = (s: string): string => mitName(s, a)
    const gross = md.gross
    const pt = (normal: number): number => (gross ? Math.round(normal * 1.35) : normal)
    const tr = (text: string, o: { bold?: boolean; italics?: boolean; color?: string; size?: number; font?: string } = {}): TextRun =>
      new TextRun({ text, ...o, size: o.size ?? pt(23) })
    const hand = (text: string, farbe = ROT, size = 21): TextRun => new TextRun({ text, font: HAND, color: farbe, size: pt(size) })
    const ueber = (text: string): Paragraph => new Paragraph({ spacing: { before: 140, after: 40 }, children: [tr(text, { bold: true, size: pt(23) })] })
    if (i > 0) kinder.push(new Paragraph({ children: [new PageBreak()] }))

    // Kopf: Titel, Lerngruppe, Name links – Einstufung rechts
    const e: BlattEinstufung | null = md.kopf.einstufung
    const kopfLinks = [
      new Paragraph({ children: [tr(md.kopf.titel, { bold: true, size: pt(32) })] }),
      new Paragraph({ children: [tr(md.kopf.unter, { color: '555555', size: pt(19) })] }),
      new Paragraph({ spacing: { before: 100 }, children: [tr('Name  ', { color: '666666', size: pt(18) }), tr(md.kopf.name, { bold: true })] })
    ]
    const kopfRechts = e
      ? [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [tr(e.skala, { color: '666666', size: 16 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [hand(e.art === 'ampel' ? `● ${e.wert}` : e.wert, e.art === 'ampel' ? '444444' : ROT, 48)] }),
          ...(e.text ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [hand(e.text, ROT, 22)] })] : [])
        ]
      : []
    const kopfRechtsBreite = Math.round(38 * MM)
    kinder.push(
      new Table({
        layout: TableLayoutType.FIXED,
        width: { size: breite, type: WidthType.DXA },
        columnWidths: [breite - kopfRechtsBreite, kopfRechtsBreite],
        borders: { ...ohneRahmen, bottom: linie('333333', 8), insideHorizontal: linie('FFFFFF', 0), insideVertical: linie('FFFFFF', 0) },
        rows: [
          new TableRow({
            children: [
              zelle(kopfLinks, breite - kopfRechtsBreite, { verticalAlign: VerticalAlign.BOTTOM, borders: { ...ohneRahmen, bottom: linie('333333', 8) } }),
              zelle(kopfRechts, kopfRechtsBreite, { verticalAlign: VerticalAlign.BOTTOM, borders: { ...ohneRahmen, bottom: linie('333333', 8) } })
            ]
          })
        ]
      }),
      new Paragraph({ spacing: { after: 120 }, children: [] })
    )

    // Schülertext mit Korrekturrand bzw. Scans
    const notiz = (g: NummerierterKommentar): Paragraph =>
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: `${g.nr} `, bold: true, color: g.k.art === 'lob' ? GRUEN : ROT, size: pt(15), font: 'Calibri' }),
          ...(g.k.art === 'lob' ? [hand('✓ ', GRUEN)] : []),
          ...(g.k.zeichen ? [new TextRun({ text: `${g.k.zeichen}: `, bold: true, font: HAND, color: ROT, size: pt(21) })] : []),
          hand(n(notizText(g.k)), g.k.art === 'lob' ? GRUEN : ROT),
          ...(g.k.ohneWertung ? [new TextRun({ text: ' (ohne Wertung)', size: 16, color: '777777' })] : [])
        ]
      })
    const stil = (t: Textteil): ReturnType<typeof markenStil> => (t.nr != null ? (md.stilVon.get(t.nr) ?? 'fehler') : t.art === 'lob' ? 'lob' : 'fehler')
    const textZelle = (children: Paragraph[]): TableCell =>
      zelle(children, textBreite, { borders: { ...ohneRahmen, right: linie(RANDLINIE, 8) }, margins: { right: 120 } })
    const randZelle = (g: NummerierterKommentar[]): TableCell => zelle(g.map(notiz), randBreite, { margins: { left: 160 } })
    const zeilen: TableRow[] = []
    if (md.scans) {
      const bilder = opt.scanBilder?.get(a.id)
      md.scans.forEach((s, k) => {
        const bild = bilder?.[k]
        const px = Math.round((textBreite - 160) / 15)
        zeilen.push(
          new TableRow({
            children: [
              textZelle([
                bild
                  ? new Paragraph({ children: [imageRun(bild.dataUrl, px, Math.round((px * bild.height) / Math.max(1, bild.width)))] })
                  : new Paragraph({ children: [tr(`Seite ${k + 1}`)] })
              ]),
              randZelle(s.notizen)
            ]
          })
        )
      })
    } else if (md.absaetze) {
      for (const abs of md.absaetze)
        zeilen.push(
          new TableRow({
            cantSplit: true,
            children: [
              textZelle([
                new Paragraph({
                  spacing: { line: gross ? 440 : 400 },
                  border: { bottom: linie(LINIE, 4) },
                  children: abs.teile.flatMap((t) => {
                    const s = t.art ? stil(t) : null
                    const farbe = s === 'lob' ? GRUEN : ROT
                    return [
                      ...(t.text
                        ? [new TextRun({ text: t.text, size: pt(24), ...(s ? { underline: { type: s === 'wellig' ? UnderlineType.WAVE : UnderlineType.SINGLE, color: farbe } } : {}) })]
                        : []),
                      ...(t.nr != null ? [new TextRun({ text: `${s === 'lob' ? '✓' : ''}${t.text ? '' : ','}${t.nr}`, superScript: true, bold: true, color: farbe, size: pt(18) })] : [])
                    ]
                  })
                })
              ]),
              randZelle(abs.notizen)
            ]
          })
        )
      if (md.ohneStelle.length)
        zeilen.push(
          new TableRow({
            children: [
              textZelle([new Paragraph({ alignment: AlignmentType.RIGHT, children: [tr('Ohne Stelle im Text:', { italics: true, color: '777777', size: 18 })] })]),
              randZelle(md.ohneStelle)
            ]
          })
        )
    }
    if (zeilen.length)
      kinder.push(
        new Table({
          layout: TableLayoutType.FIXED,
          width: { size: breite, type: WidthType.DXA },
          columnWidths: [textBreite, randBreite],
          borders: { ...ohneRahmen, insideHorizontal: linie('FFFFFF', 0), insideVertical: linie(RANDLINIE, 8) },
          rows: zeilen
        })
      )

    // Kasten „Rückmeldung"
    const innen = breite - 2 * 200
    const spalten = [0.34, 0.22, 0.44].map((x) => Math.round(innen * x))
    const tabelle = (reihen: string[][], fett: boolean[] = []): Table =>
      new Table({
        layout: TableLayoutType.FIXED,
        width: { size: innen, type: WidthType.DXA },
        columnWidths: spalten,
        borders: { ...ohneRahmen, insideHorizontal: linie('CFCFCF', 4) },
        rows: reihen.map(
          (z, j) =>
            new TableRow({
              children: z.map(
                (text, s) =>
                  new TableCell({
                    width: { size: spalten[s], type: WidthType.DXA },
                    borders: { ...ohneRahmen, ...(j ? { top: linie('CFCFCF', 4) } : {}) },
                    children: [new Paragraph({ children: [tr(text, { bold: s === 0 || fett[j], size: pt(21) })] })]
                  })
              )
            })
        )
      })
    // Bewertungsraster (29.09.2026): Kriterium fett, Beschreibung klein darunter, Punkte rechts, Bereiche als
    // Zwischenzeilen mit Zwischensumme; die Kopfzeile wiederholt sich auf jeder Seite, keine Zeile bricht um
    const rasterSpalten = [0.45, 0.13, 0.42].map((x) => Math.round(innen * x))
    const rasterZelle = (children: Paragraph[], s: number, o: { grau?: boolean; kopf?: boolean; oben?: boolean } = {}): TableCell =>
      new TableCell({
        width: { size: rasterSpalten[s], type: WidthType.DXA },
        borders: { ...ohneRahmen, ...(o.kopf ? { bottom: linie('777777', 6) } : o.oben ? { top: linie('D4D4D4', 4) } : {}) },
        ...(o.grau ? { shading: { fill: 'F0F2F4' } } : {}),
        margins: { top: 50, bottom: 50, left: 60, right: 60 },
        children
      })
    const absatz = (text: string, o: { bold?: boolean; color?: string; size?: number; rechts?: boolean } = {}): Paragraph =>
      new Paragraph({ ...(o.rechts ? { alignment: AlignmentType.RIGHT } : {}), children: [tr(text, { bold: o.bold, color: o.color, size: pt(o.size ?? 20) })] })
    const raster = (zeilen: ReturnType<typeof tabellenZeilen>, mitPunkten: boolean): Table =>
      new Table({
        layout: TableLayoutType.FIXED,
        width: { size: innen, type: WidthType.DXA },
        columnWidths: rasterSpalten,
        borders: ohneRahmen,
        rows: [
          new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: [RASTER_KOPF[0], mitPunkten ? RASTER_KOPF[1] : 'Stufe', RASTER_KOPF[2]].map((k, s) =>
              rasterZelle([absatz(k, { bold: true, color: '555555', size: 17, rechts: s === 1 })], s, { kopf: true })
            )
          }),
          ...zeilen.map((z, j) => {
            if (z.art === 'bereich' || z.art === 'summe') {
              const titel = z.art === 'bereich' ? z.titel : 'Summe'
              const wert = z.moeglich ? `${String(z.erreicht).replace('.', ',')} / ${z.moeglich}` : ''
              const o = { grau: z.art === 'bereich', oben: j > 0 }
              return new TableRow({
                cantSplit: true,
                children: [
                  rasterZelle([absatz(titel, { bold: true, size: 19 })], 0, o),
                  rasterZelle([absatz(wert, { bold: true, size: 19, rechts: true })], 1, o),
                  rasterZelle([absatz('')], 2, o)
                ]
              })
            }
            return new TableRow({
              cantSplit: true,
              children: [
                rasterZelle(
                  [
                    ...(z.bereich ? [absatz(z.bereich.toUpperCase(), { color: '777777', size: 15 })] : []),
                    absatz(z.name, { bold: true }),
                    ...(z.deskriptor ? [absatz(z.deskriptor, { color: '666666', size: 17 })] : [])
                  ],
                  0,
                  { oben: j > 0 }
                ),
                rasterZelle([absatz(tabWert(z), { rechts: true })], 1, { oben: j > 0 }),
                rasterZelle([absatz(z.begruendung ? n(z.begruendung) : '', { color: '333333', size: 19 })], 2, { oben: j > 0 })
              ]
            })
          })
        ]
      })
    // Bewertung nach Teilen als kleine Tabelle: erreichte Werte und Gewichte getrennt
    const teilTab = (tt: NonNullable<ReturnType<typeof teilTabelle>>): Table => {
      const anteile = tt.getrennt ? [0.3, 0.13, 0.19, 0.19, 0.19] : [0.5, 0.25, 0.25]
      const breiten = anteile.map((x) => Math.round(innen * x))
      const zelle = (text: string[], s: number, o: { bold?: boolean; kopf?: boolean; span?: number } = {}): TableCell =>
        new TableCell({
          width: { size: breiten[s] * (o.span ?? 1), type: WidthType.DXA },
          ...(o.span ? { columnSpan: o.span } : {}),
          borders: { ...ohneRahmen, ...(o.kopf ? { bottom: linie('777777', 6) } : { top: linie('D4D4D4', 4) }) },
          margins: { top: 40, bottom: 40, left: 60, right: 60 },
          children: text.map((t, k) => absatz(t, { bold: o.bold && k === 0, color: k ? '777777' : o.kopf ? '555555' : undefined, size: k ? 15 : o.kopf ? 17 : 20, rechts: s > 0 }))
        })
      const g = (x: number | null | undefined): string[] => (x != null ? [`Gewicht ${x} %`] : [])
      const kopf = tt.getrennt
        ? [
            zelle(['Teil'], 0, { kopf: true, bold: true }),
            zelle(['zählt'], 1, { kopf: true, bold: true }),
            zelle(['Inhalt erreicht', ...g(tt.gewichtEinheitlich)], 2, { kopf: true, bold: true }),
            zelle(['Sprache erreicht', ...g(tt.gewichtEinheitlich != null ? 100 - tt.gewichtEinheitlich : null)], 3, { kopf: true, bold: true }),
            zelle(['Ergebnis'], 4, { kopf: true, bold: true })
          ]
        : [zelle(['Teil'], 0, { kopf: true, bold: true }), zelle(['zählt'], 1, { kopf: true, bold: true }), zelle(['Ergebnis'], 2, { kopf: true, bold: true })]
      const p = (x: number | undefined | null): string => (x != null ? `${x} %` : '–')
      const reihen = tt.zeilen.map((z) => {
        const einzeln = tt.gewichtEinheitlich == null && z.getrennt
        const mitte = tt.getrennt
          ? z.getrennt
            ? [zelle([p(z.inhalt), ...(einzeln ? g(z.gewichtInhalt) : [])], 2), zelle([p(z.sprache), ...(einzeln ? g(100 - (z.gewichtInhalt ?? 0)) : [])], 3)]
            : [zelle([`erfüllt ${p(z.anteil)}`], 2, { span: 2 })]
          : []
        return new TableRow({
          cantSplit: true,
          children: [zelle([z.titel], 0), zelle([z.zaehlt], 1), ...mitte, zelle([`${p(z.ergebnis)}${z.gedeckelt ? '*' : ''}`], tt.getrennt ? 4 : 2, { bold: true })]
        })
      })
      return new Table({
        layout: TableLayoutType.FIXED,
        width: { size: innen, type: WidthType.DXA },
        columnWidths: breiten,
        borders: ohneRahmen,
        rows: [new TableRow({ tableHeader: true, cantSplit: true, children: kopf }), ...reihen]
      })
    }
    const kasten: (Paragraph | Table)[] = []
    for (const x of md.kasten) {
      switch (x.art) {
        case 'teile': {
          const tt = teilTabelle(r, b)
          if (tt)
            kasten.push(
              ueber(x.titel),
              teilTab(tt),
              ...(tt.gesamtText ? [new Paragraph({ spacing: { before: 60 }, children: [tr(tt.gesamtText, { bold: true, size: pt(20) })] })] : []),
              ...(tt.zeilen.some((z) => z.gedeckelt)
                ? [new Paragraph({ children: [tr('* höchstens 20 %, weil Inhalt oder Sprache ungenügend ist', { color: '777777', size: 16 })] })]
                : [])
            )
          break
        }
        case 'tabelle':
          kasten.push(ueber(x.titel), raster(tabellenZeilen(r, b), r.tabelle!.kriterien.some((k) => k.punkte)))
          break
        case 'staerken':
          kasten.push(ueber(x.titel), ...b.staerken.map((s) => new Paragraph({ indent: { left: 300, hanging: 300 }, children: [tr('✓ ', { color: GRUEN, bold: true }), tr(n(s))] })))
          break
        case 'schritte':
          kasten.push(ueber(x.titel), ...b.schritte.map((s, k) => new Paragraph({ indent: { left: 300, hanging: 300 }, children: [tr(`${k + 1}. ${n(s)}`)] })))
          break
        case 'kriterien':
          kasten.push(
            ueber(x.titel),
            tabelle(
              b.kriterien.map((k, j) => {
                const w = x.mitStufe ? bestaetigt(b.kriterienStufen?.[j]) : null
                return [n(k.kriterium), x.mitStufe ? (w ? wertText(art, w.wert) : '') : `${SYMBOL[k.einschaetzung]} ${k.einschaetzung}`, k.beleg ? `„${n(k.beleg)}“` : '']
              })
            )
          )
          break
        case 'ueberarbeitung':
          if (b.ueberarbeitung) {
            kasten.push(ueber(x.titel))
            if (b.ueberarbeitung.zitat) kasten.push(new Paragraph({ children: [tr(`„${n(b.ueberarbeitung.zitat)}“`, { italics: true, color: '444444' })] }))
            kasten.push(new Paragraph({ children: [tr(n(b.ueberarbeitung.auftrag))] }))
          }
          break
        case 'schluss':
          if (b.schluss) kasten.push(new Paragraph({ spacing: { before: 200 }, children: [hand(n(b.schluss), ROT, 27)] }))
          break
      }
    }
    if (kasten.length) {
      const rahmen = linie('444444', 8)
      kinder.push(
        new Paragraph({ spacing: { before: 200 }, children: [] }),
        new Table({
          layout: TableLayoutType.FIXED,
          width: { size: breite, type: WidthType.DXA },
          columnWidths: [breite],
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: breite, type: WidthType.DXA },
                  borders: { top: rahmen, bottom: rahmen, left: rahmen, right: rahmen },
                  margins: { top: 120, bottom: 160, left: 200, right: 200 },
                  children: [
                    new Paragraph({ border: { bottom: linie('BBBBBB', 4) }, children: [tr(kastenTitel(md.kopf.name), { bold: true, size: pt(26) })] }),
                    ...kasten
                  ]
                })
              ]
            })
          ]
        })
      )
    }
    for (const z of md.legende) kinder.push(new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: z, size: 17, color: '555555' })] }))
    if (m.ki && vermerkSichtbar(m.ki, m.kiVermerk, false))
      kinder.push(new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.LEFT, children: [new TextRun({ text: kiVermerkText(m.ki), size: 14, color: '777777' })] }))
  })
  return dokument(r, kinder, oben, links, titelZeile(r), rechts)
}

async function dokument(r: Rueckmeldung, kinder: (Paragraph | Table)[], rand: number, links: number, titel = titelZeile(r), rechts = rand): Promise<Uint8Array> {
  const doc = new Document({
    creator: 'Schul-Apps',
    // Silbentrennung von Word (02.10.2026, shared/silbentrennung.ts)
    hyphenation: WORD_TRENNUNG,
    title: titel,
    ...kiWordEigenschaften(r.meta.ki),
    styles: { default: { document: { run: { font: 'Calibri', size: 23 } } } },
    sections: [
      {
        properties: { page: { margin: { top: rand, bottom: Math.round(16 * MM), left: links, right: rechts } } },
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
