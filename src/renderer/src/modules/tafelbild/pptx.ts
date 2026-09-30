/**
 * PowerPoint-Datei (.pptx) ohne Zusatzpaket – mit fflate gepackt (wie die übrigen Dateien der App).
 *
 * Je Folie ein Bild der Tafel im Format 16:9; so bauen die Folien das Tafelbild Schritt für
 * Schritt auf, genau wie in der Präsentation der App. Der Alternativtext jeder Folie enthält die
 * Texte der Tafel (Barrierefreiheit, LISA-Checkliste). Aufbau nach ECMA-376 (PresentationML),
 * nur die Teile, die PowerPoint, Keynote und LibreOffice zum Öffnen brauchen.
 */
import { strToU8, zipSync } from 'fflate'

export interface Folie {
  png: Uint8Array
  /** Pixelmaße des Bildes */
  breite: number
  hoehe: number
  /** Hintergrund der Folie (Farbe der Tafel), #rrggbb */
  hintergrund: string
  titel: string
  /** Alternativtext */
  beschreibung: string
}

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const KOPF = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Folienmaße 16:9 in EMU */
export const FOLIE = { cx: 12192000, cy: 6858000 }

const gruppe = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

const THEMA = `${KOPF}<a:theme xmlns:a="${NS_A}" name="Schul-Apps"><a:themeElements><a:clrScheme name="Schul-Apps"><a:dk1><a:srgbClr val="1D1D1F"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="23402F"/></a:dk2><a:lt2><a:srgbClr val="F4F2EA"/></a:lt2><a:accent1><a:srgbClr val="1556B0"/></a:accent1><a:accent2><a:srgbClr val="A64300"/></a:accent2><a:accent3><a:srgbClr val="1B6E2A"/></a:accent3><a:accent4><a:srgbClr val="B71C1C"/></a:accent4><a:accent5><a:srgbClr val="F8E46C"/></a:accent5><a:accent6><a:srgbClr val="A8D8FF"/></a:accent6><a:hlink><a:srgbClr val="1556B0"/></a:hlink><a:folHlink><a:srgbClr val="6B3FA0"/></a:folHlink></a:clrScheme><a:fontScheme name="Schul-Apps"><a:majorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Schul-Apps"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`

function rels(liste: [string, string, string][]): string {
  return `${KOPF}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${liste
    .map(([id, typ, ziel]) => `<Relationship Id="${id}" Type="${typ}" Target="${ziel}"/>`)
    .join('')}</Relationships>`
}

function folieXml(f: Folie, nr: number): string {
  // Bild einpassen und mittig setzen (Seitenverhältnis bleibt)
  const v = f.breite / f.hoehe
  let cx = FOLIE.cx
  let cy = Math.round(cx / v)
  if (cy > FOLIE.cy) {
    cy = FOLIE.cy
    cx = Math.round(cy * v)
  }
  const x = Math.round((FOLIE.cx - cx) / 2)
  const y = Math.round((FOLIE.cy - cy) / 2)
  const farbe = f.hintergrund.replace('#', '').toUpperCase()
  return `${KOPF}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld name="${esc(f.titel)}"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${farbe}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${gruppe}<p:pic><p:nvPicPr><p:cNvPr id="${nr + 1}" name="${esc(f.titel)}" descr="${esc(f.beschreibung)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

export function pptxDatei(folien: Folie[], titel: string): Uint8Array {
  const n = folien.length
  const dateien: Record<string, Uint8Array> = {}
  const text = (pfad: string, inhalt: string): void => void (dateien[pfad] = strToU8(inhalt))

  text(
    '[Content_Types].xml',
    `${KOPF}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${folien
      .map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
      .join('')}</Types>`
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
    `${KOPF}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(titel)}</dc:title><dc:creator>Schul-Apps</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${jetzt}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${jetzt}</dcterms:modified></cp:coreProperties>`
  )
  text(
    'docProps/app.xml',
    `${KOPF}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Schul-Apps</Application><Slides>${n}</Slides><PresentationFormat>Bildschirmpräsentation (16:9)</PresentationFormat></Properties>`
  )
  text(
    'ppt/presentation.xml',
    `${KOPF}<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${folien
      .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`)
      .join('')}</p:sldIdLst><p:sldSz cx="${FOLIE.cx}" cy="${FOLIE.cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`
  )
  text(
    'ppt/_rels/presentation.xml.rels',
    rels([
      ['rId1', `${REL}/slideMaster`, 'slideMasters/slideMaster1.xml'],
      ...folien.map((_, i): [string, string, string] => [`rId${i + 2}`, `${REL}/slide`, `slides/slide${i + 1}.xml`]),
      [`rId${n + 2}`, `${REL}/presProps`, 'presProps.xml'],
      [`rId${n + 3}`, `${REL}/viewProps`, 'viewProps.xml'],
      [`rId${n + 4}`, `${REL}/theme`, 'theme/theme1.xml'],
      [`rId${n + 5}`, `${REL}/tableStyles`, 'tableStyles.xml']
    ])
  )
  text('ppt/presProps.xml', `${KOPF}<p:presentationPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"/>`)
  text(
    'ppt/viewProps.xml',
    `${KOPF}<p:viewPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="72008" cy="72008"/></p:viewPr>`
  )
  text('ppt/tableStyles.xml', `${KOPF}<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`)
  text('ppt/theme/theme1.xml', THEMA)
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
  folien.forEach((f, i) => {
    text(`ppt/slides/slide${i + 1}.xml`, folieXml(f, i + 1))
    text(
      `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      rels([
        ['rId1', `${REL}/slideLayout`, '../slideLayouts/slideLayout1.xml'],
        ['rId2', `${REL}/image`, `../media/bild${i + 1}.png`]
      ])
    )
    dateien[`ppt/media/bild${i + 1}.png`] = f.png
  })
  // [Content_Types].xml muss als erster Eintrag im Archiv stehen – die Reihenfolge von Object.keys bleibt erhalten
  return zipSync(dateien, { level: 6 })
}
