/**
 * PowerPoint-Datei (.pptx) ohne Zusatzpaket – mit fflate gepackt (wie die übrigen Dateien der App).
 *
 * Nachbesserung 30.09.2026: Die Folien bestehen aus BEARBEITBAREN Formen statt aus einem Bild je
 * Folie – Kästen und Merksatz als Textfelder mit Rahmen, Pfeile und Verbinder als Linien (an die
 * Kästen angeschlossen), Tabellen als echte Tabellen. Nur Zeichnungen (Symbol, Skizze, Diagramm,
 * Formel) sind Bilder mit Alternativtext. Die Kreide- bzw. Marker-Optik kommt aus dem
 * Folienhintergrund (Tafelfläche als Bild) und den Farben der Formen. Jede Folie hat
 * Sprechernotizen (Planungshilfe). Aufbau nach ECMA-376 (PresentationML), nur die Teile, die
 * PowerPoint, Keynote und LibreOffice zum Öffnen brauchen.
 */
import { strToU8, zipSync } from 'fflate'

/** Ein Textlauf: Text in einer Farbe, auf Wunsch fett und mit Textmarker dahinter */
export interface Lauf {
  text: string
  farbe: string
  fett?: boolean
  marker?: string
}

export interface Absatz {
  laeufe: Lauf[]
  /** Schriftgrad in Punkt */
  groesse: number
  /** Stichpunkt mit „•" und hängendem Einzug */
  punkt?: boolean
  mitte?: boolean
  /** Abstand davor in Punkt */
  davor?: number
  /** Linker Einzug des ganzen Absatzes (EMU) – z. B. neben einem Symbol */
  einzug?: number
}

export interface Rahmen {
  farbe: string
  /** Strichstärke (EMU) */
  breite: number
  art: 'linie' | 'doppelt' | 'gestrichelt'
  /** Eckenrundung als Anteil der kürzeren Seite (0 … 0,5) */
  rundung: number
}

interface FormBasis {
  /** Eindeutige Nummer auf der Folie (≥ 2) */ nr: number
  name: string
  /** Alternativtext */
  beschreibung?: string
}

export interface TextForm extends FormBasis {
  art: 'text'
  x: number
  y: number
  w: number
  h: number
  absaetze: Absatz[]
  schrift: string
  /** Innenabstand (EMU) */
  innen: number
  rahmen?: Rahmen
  fuellung?: string
  /** Als Folientitel kennzeichnen (Barrierefreiheit: jede Folie hat einen Titel) */
  titel?: boolean
}

export type Anschluss = 'oben' | 'links' | 'unten' | 'rechts'

export interface LinienForm extends FormBasis {
  art: 'linie'
  x1: number
  y1: number
  x2: number
  y2: number
  farbe: string
  breite: number
  spitzeAnfang: boolean
  spitzeEnde: boolean
  /** An Kästen angeschlossen: beim Verschieben in PowerPoint wandert die Linie mit */
  von?: { nr: number; kante: Anschluss }
  nach?: { nr: number; kante: Anschluss }
}

export interface BildForm extends FormBasis {
  art: 'bild'
  x: number
  y: number
  w: number
  h: number
  png: Uint8Array
}

export interface Zelle {
  absaetze: Absatz[]
}

export interface TabellenForm extends FormBasis {
  art: 'tabelle'
  x: number
  y: number
  spalten: number[]
  zeilen: { hoehe: number; zellen: Zelle[]; kopf?: boolean }[]
  schrift: string
  linie: { farbe: string; breite: number }
  innen: number
}

export type Form = TextForm | LinienForm | BildForm | TabellenForm

export interface Folie {
  titel: string
  /** Hintergrundbild der ganzen Folie (Tafelfläche), sonst nur die Farbe */
  hintergrundPng?: Uint8Array
  hintergrund: string
  formen: Form[]
  /** Sprechernotizen: Zeilen */
  notizen: string[]
}

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const KOPF = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
// Steuerzeichen sind in XML nicht erlaubt
const esc = (s: string): string =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
const ganz = (v: number): number => Math.round(v)
const hex = (farbe: string): string => farbe.replace('#', '').toUpperCase()

/** Folienmaße 16:9 in EMU */
export const FOLIE = { cx: 12192000, cy: 6858000 }
/** Punkt in EMU */
export const PT = 12700

const gruppe =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

const thema = (name: string): string =>
  `${KOPF}<a:theme xmlns:a="${NS_A}" name="${name}"><a:themeElements><a:clrScheme name="Schul-Apps"><a:dk1><a:srgbClr val="1D1D1F"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="23402F"/></a:dk2><a:lt2><a:srgbClr val="F4F2EA"/></a:lt2><a:accent1><a:srgbClr val="1556B0"/></a:accent1><a:accent2><a:srgbClr val="A64300"/></a:accent2><a:accent3><a:srgbClr val="1B6E2A"/></a:accent3><a:accent4><a:srgbClr val="B71C1C"/></a:accent4><a:accent5><a:srgbClr val="F8E46C"/></a:accent5><a:accent6><a:srgbClr val="A8D8FF"/></a:accent6><a:hlink><a:srgbClr val="1556B0"/></a:hlink><a:folHlink><a:srgbClr val="6B3FA0"/></a:folHlink></a:clrScheme><a:fontScheme name="Schul-Apps"><a:majorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Schul-Apps"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`

function rels(liste: [string, string, string][]): string {
  return `${KOPF}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${liste
    .map(([id, typ, ziel]) => `<Relationship Id="${id}" Type="${typ}" Target="${ziel}"/>`)
    .join('')}</Relationships>`
}

// ---------- Text ----------

const groesseXml = (pt: number): number => Math.max(100, Math.round(pt * 100))

function laufXml(l: Lauf, groesse: number, schrift: string): string {
  const marker = l.marker ? `<a:highlight><a:srgbClr val="${hex(l.marker)}"/></a:highlight>` : ''
  return `<a:r><a:rPr lang="de-DE" sz="${groesseXml(groesse)}" b="${l.fett ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${hex(
    l.farbe
  )}"/></a:solidFill>${marker}<a:latin typeface="${esc(schrift)}"/><a:cs typeface="${esc(schrift)}"/></a:rPr><a:t>${esc(l.text)}</a:t></a:r>`
}

function absatzXml(a: Absatz, schrift: string): string {
  const punktEinzug = Math.round(a.groesse * PT * 0.9)
  const marL = (a.einzug ?? 0) + (a.punkt ? punktEinzug : 0)
  // Zeilenabstand wie auf der Tafel (1,25 × Schriftgrad; „einfach" in PowerPoint ≈ 1,2)
  const innen = `<a:lnSpc><a:spcPct val="104000"/></a:lnSpc><a:spcBef><a:spcPts val="${Math.round(
    (a.davor ?? 0) * 100
  )}"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft>${a.punkt ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : '<a:buNone/>'}`
  const laeufe = a.laeufe
    .filter((l) => l.text)
    .map((l) => laufXml(l, a.groesse, schrift))
    .join('')
  return `<a:p><a:pPr marL="${ganz(marL)}" indent="${a.punkt ? -punktEinzug : 0}" algn="${
    a.mitte ? 'ctr' : 'l'
  }">${innen}</a:pPr>${laeufe}<a:endParaRPr lang="de-DE" sz="${groesseXml(a.groesse)}" dirty="0"><a:latin typeface="${esc(schrift)}"/></a:endParaRPr></a:p>`
}

const LEER_ABSATZ = '<a:p><a:endParaRPr lang="de-DE" dirty="0"/></a:p>'

function textKoerper(absaetze: Absatz[], schrift: string, innen: number): string {
  const i = ganz(innen)
  const inhalt = absaetze.length ? absaetze.map((a) => absatzXml(a, schrift)).join('') : LEER_ABSATZ
  return `<p:txBody><a:bodyPr wrap="square" lIns="${i}" tIns="${i}" rIns="${i}" bIns="${i}" rtlCol="0" anchor="t"><a:normAutofit/></a:bodyPr><a:lstStyle/>${inhalt}</p:txBody>`
}

const linieXml = (farbe: string, breite: number, art: Rahmen['art'] = 'linie', ende = ''): string =>
  `<a:ln w="${ganz(breite)}" cap="rnd"${art === 'doppelt' ? ' cmpd="dbl"' : ''}><a:solidFill><a:srgbClr val="${hex(farbe)}"/></a:solidFill>${
    art === 'gestrichelt' ? '<a:prstDash val="dash"/>' : ''
  }<a:round/>${ende}</a:ln>`

const beschreibung = (f: FormBasis): string => (f.beschreibung ? ` descr="${esc(f.beschreibung)}"` : '')

function textFormXml(f: TextForm): string {
  const geo = f.rahmen
    ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(
        Math.min(0.5, Math.max(0, f.rahmen.rundung)) * 100000
      )}"/></a:avLst></a:prstGeom>`
    : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
  const fuellung = f.fuellung ? `<a:solidFill><a:srgbClr val="${hex(f.fuellung)}"/></a:solidFill>` : '<a:noFill/>'
  const linie = f.rahmen ? linieXml(f.rahmen.farbe, f.rahmen.breite, f.rahmen.art) : '<a:ln><a:noFill/></a:ln>'
  const nvSp = f.titel ? '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr>' : '<p:cNvSpPr txBox="1"/><p:nvPr/>'
  return `<p:sp><p:nvSpPr><p:cNvPr id="${f.nr}" name="${esc(f.name)}"${beschreibung(f)}/>${nvSp}</p:nvSpPr><p:spPr><a:xfrm><a:off x="${ganz(f.x)}" y="${ganz(
    f.y
  )}"/><a:ext cx="${ganz(Math.max(1, f.w))}" cy="${ganz(Math.max(1, f.h))}"/></a:xfrm>${geo}${fuellung}${linie}</p:spPr>${textKoerper(
    f.absaetze,
    f.schrift,
    f.innen
  )}</p:sp>`
}

/** Anschlussstellen der Formen rect/roundRect: 0 oben, 1 links, 2 unten, 3 rechts */
const STELLE: Record<Anschluss, number> = { oben: 0, links: 1, unten: 2, rechts: 3 }

function linienFormXml(f: LinienForm): string {
  const x = Math.min(f.x1, f.x2)
  const y = Math.min(f.y1, f.y2)
  const flip = `${f.x2 < f.x1 ? ' flipH="1"' : ''}${f.y2 < f.y1 ? ' flipV="1"' : ''}`
  const spitze = (an: boolean, tag: string): string => (an ? `<a:${tag} type="arrow" w="med" len="med"/>` : '')
  const an = [
    f.von ? `<a:stCxn id="${f.von.nr}" idx="${STELLE[f.von.kante]}"/>` : '',
    f.nach ? `<a:endCxn id="${f.nach.nr}" idx="${STELLE[f.nach.kante]}"/>` : ''
  ].join('')
  const linie = linieXml(f.farbe, f.breite, 'linie', spitze(f.spitzeAnfang, 'headEnd') + spitze(f.spitzeEnde, 'tailEnd'))
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${f.nr}" name="${esc(f.name)}"${beschreibung(
    f
  )}/><p:cNvCxnSpPr>${an}</p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm${flip}><a:off x="${ganz(x)}" y="${ganz(y)}"/><a:ext cx="${ganz(
    Math.abs(f.x2 - f.x1)
  )}" cy="${ganz(Math.abs(f.y2 - f.y1))}"/></a:xfrm><a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom><a:noFill/>${linie}</p:spPr></p:cxnSp>`
}

function bildFormXml(f: BildForm, rId: string): string {
  return `<p:pic><p:nvPicPr><p:cNvPr id="${f.nr}" name="${esc(f.name)}"${beschreibung(
    f
  )}/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${ganz(
    f.x
  )}" y="${ganz(f.y)}"/><a:ext cx="${ganz(Math.max(1, f.w))}" cy="${ganz(
    Math.max(1, f.h)
  )}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
}

/** Tabelle ohne Tabellenformat („Kein Format, kein Raster"): nur die Linien der Tafel */
const OHNE_FORMAT = '{2D5ABB26-0587-4C30-8999-92F81FD0307C}'

function tabellenFormXml(f: TabellenForm): string {
  const ln = (tag: string, an: boolean, dick = 1): string =>
    an
      ? `<a:${tag} w="${ganz(f.linie.breite * dick)}" cap="flat" cmpd="sng"><a:solidFill><a:srgbClr val="${hex(
          f.linie.farbe
        )}"/></a:solidFill><a:prstDash val="solid"/></a:${tag}>`
      : `<a:${tag} w="0"><a:noFill/></a:${tag}>`
  const n = f.spalten.length
  const i = ganz(f.innen)
  const zeilen = f.zeilen
    .map((z) => {
      const zellen = Array.from({ length: n }, (_, s) => {
        const absaetze = (z.zellen[s]?.absaetze ?? []).map((a) => absatzXml(a, f.schrift)).join('') || LEER_ABSATZ
        const rand = `${ln('lnL', false)}${ln('lnR', s < n - 1)}${ln('lnT', false)}${ln('lnB', true, z.kopf ? 1.6 : 1)}`
        return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${absaetze}</a:txBody><a:tcPr marL="${i}" marR="${i}" marT="${i}" marB="${i}">${rand}<a:noFill/></a:tcPr></a:tc>`
      })
      return `<a:tr h="${ganz(z.hoehe)}">${zellen.join('')}</a:tr>`
    })
    .join('')
  const breite = f.spalten.reduce((a, b) => a + b, 0)
  const hoehe = f.zeilen.reduce((a, z) => a + z.hoehe, 0)
  const raster = f.spalten.map((b) => `<a:gridCol w="${ganz(b)}"/>`).join('')
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${f.nr}" name="${esc(f.name)}"${beschreibung(
    f
  )}/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${ganz(f.x)}" y="${ganz(
    f.y
  )}"/><a:ext cx="${ganz(breite)}" cy="${ganz(
    hoehe
  )}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr><a:tableStyleId>${OHNE_FORMAT}</a:tableStyleId></a:tblPr><a:tblGrid>${raster}</a:tblGrid>${zeilen}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
}

// ---------- Folien und Notizen ----------

function folieXml(f: Folie, bildIds: Map<Form, string>, hintergrundId: string | null): string {
  const bg = hintergrundId
    ? `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${hintergrundId}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>`
    : `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex(f.hintergrund)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
  const formen = f.formen
    .map((x) =>
      x.art === 'text' ? textFormXml(x) : x.art === 'linie' ? linienFormXml(x) : x.art === 'bild' ? bildFormXml(x, bildIds.get(x) ?? '') : tabellenFormXml(x)
    )
    .join('')
  return `${KOPF}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld name="${esc(
    f.titel
  )}">${bg}<p:spTree>${gruppe}${formen}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

const NOTIZ_BILD = '<a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm>'
const NOTIZ_TEXT = '<a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm>'

function notizenXml(f: Folie): string {
  const absaetze = (f.notizen.length ? f.notizen : ['']).map((z) => `<a:p><a:r><a:rPr lang="de-DE" dirty="0"/><a:t>${esc(z)}</a:t></a:r></a:p>`).join('')
  return `${KOPF}<p:notes xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>${gruppe}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Folienbild"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notizen"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${absaetze}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`
}

const NOTIZ_MASTER = `${KOPF}<p:notesMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${gruppe}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Folienbildplatzhalter"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr>${NOTIZ_BILD}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notizenplatzhalter"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr>${NOTIZ_TEXT}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="de-DE"/><a:t>Notizen</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`

// ---------- Paket ----------

export function pptxDatei(folien: Folie[], titel: string): Uint8Array {
  const n = folien.length
  const dateien: Record<string, Uint8Array> = {}
  const text = (pfad: string, inhalt: string): void => void (dateien[pfad] = strToU8(inhalt))

  // Bilder: gleiche Bilddaten (z. B. der Hintergrund aller Folien eines Formats) nur einmal ablegen
  const medien = new Map<Uint8Array, string>()
  const medium = (png: Uint8Array): string => {
    let name = medien.get(png)
    if (!name) {
      name = `bild${medien.size + 1}.png`
      medien.set(png, name)
    }
    return name
  }
  const folienRels: [string, string, string][][] = []
  const folienXml: string[] = []
  folien.forEach((f, i) => {
    const liste: [string, string, string][] = [
      ['rId1', `${REL}/slideLayout`, '../slideLayouts/slideLayout1.xml'],
      ['rId2', `${REL}/notesSlide`, `../notesSlides/notesSlide${i + 1}.xml`]
    ]
    const ids = new Map<Form, string>()
    let hintergrundId: string | null = null
    if (f.hintergrundPng) {
      hintergrundId = `rId${liste.length + 1}`
      liste.push([hintergrundId, `${REL}/image`, `../media/${medium(f.hintergrundPng)}`])
    }
    for (const x of f.formen) {
      if (x.art !== 'bild') continue
      const id = `rId${liste.length + 1}`
      liste.push([id, `${REL}/image`, `../media/${medium(x.png)}`])
      ids.set(x, id)
    }
    folienRels.push(liste)
    folienXml.push(folieXml(f, ids, hintergrundId))
  })

  const folienTypen = folien
    .map(
      (_, i) =>
        `<Override PartName="/ppt/slides/slide${
          i + 1
        }.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/notesSlides/notesSlide${
          i + 1
        }.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`
    )
    .join('')
  text(
    '[Content_Types].xml',
    `${KOPF}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${folienTypen}</Types>`
  )
  text(
    '_rels/.rels',
    rels([
      ['rId1', `${REL}/officeDocument`, 'ppt/presentation.xml'],
      ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'],
      ['rId3', `${REL}/extended-properties`, 'docProps/app.xml']
    ])
  )
  const jetzt = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  text(
    'docProps/core.xml',
    `${KOPF}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(
      titel
    )}</dc:title><dc:creator>Schul-Apps</dc:creator><dc:language>de-DE</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${jetzt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${jetzt}</dcterms:modified></cp:coreProperties>`
  )
  text(
    'docProps/app.xml',
    `${KOPF}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Schul-Apps</Application><Slides>${n}</Slides><Notes>${n}</Notes><PresentationFormat>Bildschirmpräsentation (16:9)</PresentationFormat></Properties>`
  )
  // Beziehungen der Präsentation: Master, Folien, Notizenmaster, Einstellungen, Design
  const nm = `rId${n + 2}`
  const folienIds = folien.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')
  text(
    'ppt/presentation.xml',
    `${KOPF}<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="${nm}"/></p:notesMasterIdLst><p:sldIdLst>${folienIds}</p:sldIdLst><p:sldSz cx="${FOLIE.cx}" cy="${FOLIE.cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`
  )
  text(
    'ppt/_rels/presentation.xml.rels',
    rels([
      ['rId1', `${REL}/slideMaster`, 'slideMasters/slideMaster1.xml'],
      ...folien.map((_, i): [string, string, string] => [`rId${i + 2}`, `${REL}/slide`, `slides/slide${i + 1}.xml`]),
      [nm, `${REL}/notesMaster`, 'notesMasters/notesMaster1.xml'],
      [`rId${n + 3}`, `${REL}/presProps`, 'presProps.xml'],
      [`rId${n + 4}`, `${REL}/viewProps`, 'viewProps.xml'],
      [`rId${n + 5}`, `${REL}/theme`, 'theme/theme1.xml'],
      [`rId${n + 6}`, `${REL}/tableStyles`, 'tableStyles.xml']
    ])
  )
  text('ppt/presProps.xml', `${KOPF}<p:presentationPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"/>`)
  text(
    'ppt/viewProps.xml',
    `${KOPF}<p:viewPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="80000"/></p:normalViewPr><p:gridSpacing cx="72008" cy="72008"/></p:viewPr>`
  )
  text('ppt/tableStyles.xml', `${KOPF}<a:tblStyleLst xmlns:a="${NS_A}" def="${OHNE_FORMAT}"/>`)
  text('ppt/theme/theme1.xml', thema('Schul-Apps'))
  text('ppt/theme/theme2.xml', thema('Schul-Apps Notizen'))
  text(
    'ppt/slideMasters/slideMaster1.xml',
    `${KOPF}<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${gruppe}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`
  )
  text(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    rels([
      ['rId1', `${REL}/slideLayout`, '../slideLayouts/slideLayout1.xml'],
      ['rId2', `${REL}/theme`, '../theme/theme1.xml']
    ])
  )
  text(
    'ppt/slideLayouts/slideLayout1.xml',
    `${KOPF}<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1"><p:cSld name="Leer"><p:spTree>${gruppe}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  )
  text('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rId1', `${REL}/slideMaster`, '../slideMasters/slideMaster1.xml']]))
  text('ppt/notesMasters/notesMaster1.xml', NOTIZ_MASTER)
  text('ppt/notesMasters/_rels/notesMaster1.xml.rels', rels([['rId1', `${REL}/theme`, '../theme/theme2.xml']]))
  folien.forEach((f, i) => {
    text(`ppt/slides/slide${i + 1}.xml`, folienXml[i])
    text(`ppt/slides/_rels/slide${i + 1}.xml.rels`, rels(folienRels[i]))
    text(`ppt/notesSlides/notesSlide${i + 1}.xml`, notizenXml(f))
    text(
      `ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`,
      rels([
        ['rId1', `${REL}/notesMaster`, '../notesMasters/notesMaster1.xml'],
        ['rId2', `${REL}/slide`, `../slides/slide${i + 1}.xml`]
      ])
    )
  })
  for (const [png, name] of medien) dateien[`ppt/media/${name}`] = png
  // [Content_Types].xml muss als erster Eintrag im Archiv stehen – die Reihenfolge von Object.keys bleibt erhalten
  return zipSync(dateien, { level: 6 })
}
