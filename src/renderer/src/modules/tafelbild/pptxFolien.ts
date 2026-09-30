/**
 * Folien für PowerPoint aus den Elementen einer Tafel (Nachbesserung 30.09.2026) – alles
 * bearbeitbar: Kästen, Merksatz und Texte als Textfelder (Titel fett in der Farbe des Kastens,
 * Stichpunkte als echte Aufzählung, Gelb auf hellem Grund als Textmarker), Pfeile und Verbinder als
 * Linien, an die Kästen angeschlossen, Beschriftungen als eigene Textfelder, Tabellen als Tabellen.
 * Symbole, Skizzen, Diagramme und Formeln sind Bilder mit Alternativtext. Die Tafelfläche (Kreide
 * mit Staub und Holzrahmen, Whiteboard, Flipchart, Karopapier) liegt als Folienhintergrund dahinter.
 *
 * Aufbau: je Schritt eine Folie (sicherer als Animationen, die Keynote und LibreOffice anders
 * abspielen), am Ende auf Wunsch die Lückenfassung. Sprechernotizen: Schritt, Phase, Impulsfrage,
 * was neu an die Tafel kommt, Merksatz, Lösungen der Lücken, Hausaufgabe.
 *
 * Ohne DOM: Die Bilder rechnet eine übergebene Funktion (in der App svgZuPng, im Test eine Attrappe).
 */
import { formatInfo, ZEILENHOEHE, type Farbe, type FormatId } from './formate'
import { kastenInhalt, kastenSatz } from './kasten'
import { tabellenSpalten } from './layout'
import { ELEMENT_NAMEN, elementText, schrittZahl, type Tafelbild, type TbElement, type TbTafel } from './model'
import { FOLIE, PT, type Absatz, type Folie, type Form, type Lauf, type TextForm } from './pptx'
import { elementBildSvg, folienHintergrundSvg, kontextFuer, linienPunkte, pfeilBeschriftung, pfeilStaerke, type Kontext } from './svg'
import { textBreite, umbrechen } from './textsatz'
import { inAnsicht, loesungen, sichtbareElemente, wortspeicher, type Ansicht } from './varianten'

/** SVG → PNG in der gewünschten Pixelbreite */
export type BildRechner = (svg: string, breite: number) => Promise<Uint8Array>

const SCHRIFT_PPTX = { hand: 'Segoe Print', druck: 'Segoe UI' } as const

const DIAGRAMM_NAMEN: Record<string, string> = {
  zeitstrahl: 'Zeitstrahl',
  koordinatensystem: 'Koordinatensystem',
  schaltplan: 'Schaltplan',
  kreislauf: 'Kreislauf',
  kartenskizze: 'Kartenskizze',
  tabelle: 'Tabelle'
}

/** Rand der Folie um die Tafel */
const RAND_FARBE = { kreide: '#16271d', marker: '#e9edf1', papier: '#e9edf1' } as const

interface Masstab {
  /** EMU je Tafeleinheit */ s: number
  ox: number
  oy: number
}

const kurz = (s: string, n = 40): string => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

/** Name eines Elements für Auswahlbereich und Notizen */
const elementName = (e: TbElement): string => kurz(e.titel || elementText(e) || ELEMENT_NAMEN[e.typ], 50)

function lauf(k: Kontext, text: string, farbe: Farbe, fett = false): Lauf {
  const marker = farbe === 'gelb' && k.hell ? k.marker : undefined
  return { text, farbe: k.farbe(farbe), fett, ...(marker ? { marker } : {}) }
}

/** Kasten, Merksatz oder freier Text als Textfeld (dieselben Maße wie im SVG) */
function textFeld(k: Kontext, e: TbElement, m: Masstab, nr: number, schrift: string, titel: boolean): TextForm {
  const x = e.x * k.W
  const y = e.y * k.H
  const w = e.w * k.W
  const h = e.h * k.H
  const g = (e.schrift ?? 0.05) * k.H
  const satz = kastenSatz(kastenInhalt(e), w, g, k.schrift)
  // Ein Wort, das im SVG getrennt wurde, bricht PowerPoint mitten im Wort um – dann lieber etwas kleiner
  const innen = w - 2 * satz.pad
  const titelPlatz = innen - (satz.icon ? satz.icon + satz.pad * 0.6 : 0)
  const zuBreit = Math.max(
    ...(e.titel ?? '').split(/\s+/).map((x) => textBreite(x, satz.titelGroesse, k.schrift) / Math.max(1, titelPlatz)),
    ...e.text.split(/\s+/).map((x) => textBreite(x, g, k.schrift) / Math.max(1, innen - g * 0.9)),
    1
  )
  const pt = (v: number): number => (v * m.s) / PT / zuBreit
  const mitte = e.ausrichtung === 'mitte'
  const titelFarbe: Farbe = e.typ === 'text' && e.titel === 'Hausaufgabe' ? 'blau' : e.farbe
  const textFarbe: Farbe = e.typ === 'text' ? e.farbe : 'grund'
  const absaetze: Absatz[] = []
  const einzug = satz.icon ? (satz.icon + satz.pad * 0.6) * m.s : 0
  const titelHoehe = satz.titelZeilen.length * satz.titelGroesse * ZEILENHOEHE
  if (e.titel?.trim()) absaetze.push({ laeufe: [lauf(k, e.titel.trim(), titelFarbe, true)], groesse: pt(satz.titelGroesse), mitte, einzug })
  let davor = e.titel?.trim() ? g * 0.25 + Math.max(0, satz.icon - titelHoehe) : satz.icon ? satz.icon + g * 0.25 : 0
  for (const zeile of e.text.trim() ? e.text.trim().split('\n') : []) {
    const punkt = /^•\s*/.test(zeile)
    const text = punkt ? zeile.replace(/^•\s*/, '') : zeile
    absaetze.push({ laeufe: [lauf(k, text, textFarbe)], groesse: pt(g), mitte, punkt, davor: pt(davor) })
    davor = 0
  }
  const art = e.rahmen ?? (e.typ === 'merksatz' ? 'doppelt' : e.typ === 'kasten' ? 'linie' : 'keiner')
  const strich = Math.max(1.5, g * 0.075)
  const rahmenFarbe = k.farbe(e.farbe === 'gelb' && k.hell ? 'grund' : e.farbe)
  const rundung = art === 'wolke' ? 0.3 : Math.min(0.5, (g * 0.3) / Math.max(1, Math.min(w, h)))
  return {
    art: 'text',
    nr,
    name: `${ELEMENT_NAMEN[e.typ]}: ${elementName(e)}`,
    x: m.ox + x * m.s,
    y: m.oy + y * m.s,
    w: w * m.s,
    h: h * m.s,
    absaetze,
    schrift,
    innen: satz.pad * m.s,
    titel,
    ...(art === 'keiner'
      ? {}
      : {
          rahmen: {
            farbe: rahmenFarbe,
            breite: (art === 'doppelt' ? Math.max(strich * 3, g * 0.45) : strich) * m.s,
            art: art === 'doppelt' ? 'doppelt' : art === 'gestrichelt' ? 'gestrichelt' : 'linie',
            rundung
          }
        })
  }
}

/** Alternativtext einer Zeichnung */
function bildText(e: TbElement): string {
  const dazu = e.text.trim() ? ` – ${e.text.trim()}` : ''
  switch (e.typ) {
    case 'symbol':
      return `Symbol: ${e.symbol ?? 'Bild'}${dazu}`
    case 'bild':
      return `Bild: ${e.bildPrompt?.trim() || e.text.trim() || 'Abbildung'}`
    case 'skizze':
      return `Skizze${e.vorlage ? `: ${e.vorlage}` : ''}${dazu}`
    case 'formel':
      return `Formel: ${e.tex ?? ''}${dazu}`
    case 'diagramm':
      return `${DIAGRAMM_NAMEN[e.diagramm?.art ?? ''] ?? 'Diagramm'}: ${kurz(elementText(e), 400)}`
  }
  return elementText(e)
}

/** Pixelbreite der Bilder: scharf auf einem 4K-Beamer, nicht größer als nötig */
const pixel = (k: Kontext, w: number): number => Math.round(Math.min(2400, Math.max(96, (w * 3840) / k.W)))

async function folieFuer(
  t: Tafelbild,
  tafel: TbTafel,
  o: Ansicht,
  titel: string,
  notizen: string[],
  rechne: BildRechner,
  hintergruende: Map<string, Promise<Uint8Array>>
): Promise<Folie> {
  const f = formatInfo(tafel.format)
  const k = kontextFuer(tafel)
  const schrift = SCHRIFT_PPTX[tafel.schrift ?? 'druck']
  // Wortspeicher unter der Tafel (wie im SVG)
  const woerter = o.luecke && o.wortspeicher ? wortspeicher(tafel, o) : []
  const gw = f.schrift.text * k.H * 0.9
  const band = woerter.length ? umbrechen(`Wortspeicher:  ${woerter.join('   ·   ')}`, k.W * 0.92, gw, k.schrift) : []
  const bandH = band.length ? band.length * gw * ZEILENHOEHE + gw * 1.2 : 0
  const s = Math.min(FOLIE.cx / k.W, FOLIE.cy / (k.H + bandH))
  const m: Masstab = { s, ox: (FOLIE.cx - k.W * s) / 2, oy: (FOLIE.cy - (k.H + bandH) * s) / 2 }

  // Hintergrund: Tafelfläche an ihrer Stelle, einmal je Format und Lage
  const randFarbe = RAND_FARBE[k.medium]
  const schluessel = `${tafel.format}|${Math.round(m.oy)}`
  if (!hintergruende.has(schluessel))
    hintergruende.set(schluessel, rechne(folienHintergrundSvg(tafel, { w: FOLIE.cx / s, h: FOLIE.cy / s }, { x: m.ox / s, y: m.oy / s }, randFarbe), 1920))
  const hintergrundPng = await hintergruende.get(schluessel)!

  const alle = new Map(tafel.elemente.map((e) => [e.id, e]))
  const sichtbar = sichtbareElemente(tafel, o)
  const istLinie = (e: TbElement): boolean => e.typ === 'verbinder' || e.typ === 'pfeil'
  // Linien zuerst (unten), darüber die Flächen – wie im SVG
  const reihenfolge = [...sichtbar.filter(istLinie), ...sichtbar.filter((e) => !istLinie(e))]
  let naechste = 2
  const nummer = new Map<string, number>()
  for (const e of reihenfolge) nummer.set(e.id, naechste++)
  const titelText = (t.inhalt?.titel ?? '').trim()
  let titelVergeben = false
  const formen: Form[] = []
  const bilder: Promise<void>[] = []
  const bild = (e: TbElement, beschreibung: string, nr: number, rand: number): void => {
    const b = elementBildSvg(tafel, e, o, rand)
    const form = {
      art: 'bild' as const,
      nr,
      name: `${ELEMENT_NAMEN[e.typ]}: ${elementName(e)}`,
      beschreibung,
      x: m.ox + b.x * s,
      y: m.oy + b.y * s,
      w: b.w * s,
      h: b.h * s,
      png: new Uint8Array() as Uint8Array
    }
    formen.push(form)
    bilder.push(rechne(b.svg, pixel(k, b.w)).then((png) => void (form.png = png)))
  }

  for (const roh of reihenfolge) {
    const e = inAnsicht(roh, o)
    const nr = nummer.get(e.id)!
    const g = (e.schrift ?? 0.045) * k.H
    switch (e.typ) {
      case 'kasten':
      case 'merksatz':
      case 'text': {
        const istTitel = !titelVergeben && e.typ === 'text' && Boolean(titelText) && e.text.trim() === titelText
        if (istTitel) titelVergeben = true
        const feld = textFeld(k, e, m, nr, schrift, istTitel)
        formen.push(feld)
        // Symbol bzw. Bild oben links im Kasten: als eigenes Bild über dem Textfeld
        const satz = kastenSatz(kastenInhalt(e), e.w * k.W, g, k.schrift)
        if (satz.icon) {
          const icon: TbElement = {
            id: `${e.id}-symbol`,
            typ: e.bild ? 'bild' : 'symbol',
            x: (e.x * k.W + satz.pad) / k.W,
            y: (e.y * k.H + satz.pad) / k.H,
            w: satz.icon / k.W,
            h: satz.icon / k.H,
            text: '',
            farbe: e.farbe === 'grund' ? 'gelb' : e.farbe,
            schritt: e.schritt,
            ...(e.symbol ? { symbol: e.symbol } : {}),
            ...(e.bild ? { bild: e.bild } : {})
          }
          bild(icon, e.bild ? `Bild zu „${elementName(e)}"` : `Symbol „${e.symbol}" zu „${elementName(e)}"`, naechste++, 0)
        }
        break
      }
      case 'pfeil':
      case 'verbinder': {
        const l = linienPunkte(k, e, alle)
        if (!l) break
        const art = e.pfeilArt ?? 'pfeil'
        const von = e.von ? alle.get(e.von) : undefined
        const nach = e.nach ? alle.get(e.nach) : undefined
        const verbunden = (x: TbElement | undefined): boolean =>
          Boolean(x && (x.typ === 'kasten' || x.typ === 'merksatz' || x.typ === 'text') && nummer.has(x.id))
        const text = e.text.trim()
        formen.push({
          art: 'linie',
          nr,
          name: `${ELEMENT_NAMEN[e.typ]}${von ? `: ${elementName(von)}${nach ? ` → ${elementName(nach)}` : ''}` : ''}`,
          beschreibung: `${art === 'linie' ? 'Linie' : 'Pfeil'}${von ? ` von „${elementName(von)}"` : ''}${nach ? ` zu „${elementName(nach)}"` : ''}${
            text ? `: ${text}` : ''
          }`,
          x1: m.ox + l.a.x * s,
          y1: m.oy + l.a.y * s,
          x2: m.ox + l.b.x * s,
          y2: m.oy + l.b.y * s,
          farbe: k.farbe(e.farbe === 'gelb' && k.hell ? 'grund' : e.farbe),
          breite: pfeilStaerke(k) * s,
          spitzeAnfang: art === 'doppelpfeil',
          spitzeEnde: art !== 'linie',
          ...(verbunden(von) && l.vonKante ? { von: { nr: nummer.get(von!.id)!, kante: l.vonKante } } : {}),
          ...(verbunden(nach) && l.nachKante ? { nach: { nr: nummer.get(nach!.id)!, kante: l.nachKante } } : {})
        })
        const b = pfeilBeschriftung(k, l.a, l.b, e, g)
        if (b)
          formen.push({
            art: 'text',
            nr: naechste++,
            name: `Beschriftung: ${kurz(text)}`,
            x: m.ox + (b.mx - b.breite / 2 - b.gg * 0.2) * s,
            y: m.oy + (b.my - b.hoehe / 2) * s,
            w: (b.breite + b.gg * 0.4) * s,
            h: b.hoehe * s,
            absaetze: [{ laeufe: [lauf(k, b.zeilen.join(' '), b.farbe)], groesse: (b.gg * s) / PT, mitte: true }],
            schrift,
            innen: 0,
            fuellung: k.tafel
          })
        break
      }
      case 'diagramm': {
        const d = e.diagramm
        if (d?.art === 'tabelle' && (d.spalten?.length || d.zeilen?.length)) {
          const w = e.w * k.W
          const breiten = tabellenSpalten(d, w)
          const pad = g * 0.35
          const zeilen: { hoehe: number; zellen: { absaetze: Absatz[] }[]; kopf?: boolean }[] = []
          const reihe = (werte: string[], gg: number, kopf: boolean): void => {
            const satz = breiten.map((bb, i) => umbrechen(werte[i] ?? '', bb - 2 * pad, gg, k.schrift))
            const hoehe = Math.max(1, ...satz.map((x) => x.length)) * gg * ZEILENHOEHE + 2 * pad
            zeilen.push({
              hoehe: hoehe * s,
              kopf,
              zellen: breiten.map((_, i) => {
                const farbe: Farbe = kopf ? (i === 0 ? 'grund' : (['gelb', 'blau', 'orange', 'gruen'] as Farbe[])[(i - 1) % 4]) : i === 0 ? 'blau' : 'grund'
                const text = (werte[i] ?? '').trim()
                return { absaetze: text ? text.split('\n').map((z) => ({ laeufe: [lauf(k, z, farbe, kopf || i === 0)], groesse: (gg * s) / PT })) : [] }
              })
            })
          }
          if (d.spalten?.length) reihe(d.spalten, g * 1.05, true)
          for (const z of d.zeilen ?? []) reihe(z, g, false)
          formen.push({
            art: 'tabelle',
            nr,
            name: `Tabelle: ${kurz((d.spalten ?? []).filter(Boolean).join(' | '))}`,
            beschreibung: bildText(e),
            x: m.ox + e.x * k.W * s,
            y: m.oy + e.y * k.H * s,
            spalten: breiten.map((bb) => bb * s),
            zeilen,
            schrift,
            linie: { farbe: k.farbe('grund'), breite: Math.max(1.5, g * 0.06) * s },
            innen: pad * s
          })
          break
        }
        bild(e, bildText(e), nr, g * 0.5)
        break
      }
      case 'symbol':
      case 'bild':
      case 'skizze':
      case 'formel':
        bild(e, bildText(e), nr, g * 0.3)
        break
    }
  }
  if (band.length)
    formen.push({
      art: 'text',
      nr: naechste++,
      name: 'Wortspeicher',
      x: m.ox,
      y: m.oy + k.H * s,
      w: k.W * s,
      h: bandH * s,
      absaetze: [{ laeufe: [lauf(k, `Wortspeicher:  ${woerter.join('   ·   ')}`, 'grund')], groesse: (gw * s) / PT }],
      schrift,
      innen: gw * 0.6 * s,
      fuellung: k.hell ? '#f3f6f9' : '#1b3326'
    })
  await Promise.all(bilder)
  return { titel, hintergrund: randFarbe, hintergrundPng, formen, notizen }
}

/** Sprechernotizen einer Folie: Planungshilfe des Schritts, dazu Merksatz, Lösungen, Hausaufgabe */
export function notizenFuer(t: Tafelbild, tafel: TbTafel, schritt: number | null, n: number): string[] {
  const zeilen: string[] = []
  const f = formatInfo(tafel.format)
  if (schritt === null) zeilen.push(`${f.label} – Lückenfassung`)
  else {
    zeilen.push(`${f.label} – Schritt ${schritt} von ${n}`)
    const plan = t.inhalt?.schritte.find((x) => x.nr === schritt)
    if (plan?.phase) zeilen.push(`Phase: ${plan.phase}`)
    if (plan?.impuls) zeilen.push(`Impulsfrage: ${plan.impuls}`)
    const neu = tafel.elemente.filter((e) => (e.schritt || 1) === schritt && e.typ !== 'verbinder' && e.typ !== 'pfeil')
    if (neu.length) zeilen.push(`Neu an der Tafel: ${neu.map(elementName).join('; ')}`)
  }
  zeilen.push('')
  const merk = tafel.elemente.find((e) => e.typ === 'merksatz')
  const merksatz = merk?.text.trim() || t.inhalt?.merksatz?.text.trim()
  if (merksatz) zeilen.push(`Merksatz: ${merksatz}`)
  const loes = loesungen(tafel)
  if (loes.length) zeilen.push(`Lösungen der Lücken: ${loes.map((l) => `${l.element}: ${l.woerter.join(', ')}`).join(' | ')}`)
  if (t.inhalt?.hausaufgabe?.trim()) zeilen.push(`Hausaufgabe: ${t.inhalt.hausaufgabe.trim()}`)
  return zeilen
}

/** Alle Folien: je Format der schrittweise Aufbau, am Ende auf Wunsch die Lückenfassung */
export async function pptxFolien(t: Tafelbild, formate: FormatId[], mitLuecke: boolean, rechne: BildRechner): Promise<Folie[]> {
  const folien: Folie[] = []
  const hintergruende = new Map<string, Promise<Uint8Array>>()
  for (const tafel of t.tafeln.filter((x) => formate.includes(x.format))) {
    const f = formatInfo(tafel.format)
    const n = t.meta.varianten.schritte ? schrittZahl(tafel) : 1
    for (let s = 1; s <= n; s++) {
      const o: Ansicht = s < n ? { schritt: s } : {}
      folien.push(await folieFuer(t, tafel, o, n > 1 ? `${f.kurz} – Schritt ${s} von ${n}` : f.kurz, notizenFuer(t, tafel, s, n), rechne, hintergruende))
    }
    if (mitLuecke && tafel.elemente.some((e) => e.lueckenWoerter?.length || e.luecke)) {
      folien.push(
        await folieFuer(t, tafel, { luecke: true, wortspeicher: true }, `${f.kurz} – Lückenfassung`, notizenFuer(t, tafel, null, n), rechne, hintergruende)
      )
    }
  }
  return folien
}
