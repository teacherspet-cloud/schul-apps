/**
 * KI-Aufträge des Programms „Tafelbilder": Inhalt erzeugen (mit oder ohne Material), ein
 * fotografiertes Tafelbild übernehmen, das ganze Tafelbild oder ein Element überarbeiten bzw.
 * neu erzeugen, zu lange Knoten kürzen. Ohne Oberfläche prüfbar (tests/tafelbild*.test.ts).
 */
import type { StructuredRequest } from '@shared/types'
import { arr, bool, enumOf, int, obj, str, type Schema } from '../../shared/aiSchema'
import { wunschAuftrag, type WunschArt } from '../../shared/kiWunsch'
import { leseSchaltplan } from '../arbeitsblatt/render/schaltplanSvg'
import { FARBEN, formatInfo, type Farbe } from './formate'
import {
  ELEMENT_NAMEN,
  neueId,
  STRUKTUR_NAMEN,
  type Diagramm,
  type DiagrammArt,
  type Niveau,
  type StrukturArt,
  type TafelbildMeta,
  type TbElement,
  type TbInhalt,
  type TbKnoten,
  type TbZeichnung,
  type ZeichnungArt
} from './model'
import { lernzielZeilen } from './lernziele'
import { erlaubteZeichnungen, fachRegeln, inhaltsRegeln, strukturRegel, SYSTEM_GRUNDSAETZE } from './regeln'
import { skizzeFuer, symbolFuer } from './symbole'
import { massstabPasst, ohneAspektPraefix, ordneEreignisse, ordneFluss, ordneKreislauf, pruefeTabelle, pruefeZeitleiste, zeitWert, type InhaltsProblem } from './zeitleiste'

const num = (description?: string): Schema => ({ type: 'number', ...(description ? { description } : {}) })

const STRUKTUR_WERTE: StrukturArt[] = ['netz', 'tabelle', 'fluss', 'zeitleiste', 'kreislauf', 'gliederung']
const ROLLEN: TbKnoten['rolle'][] = ['zentrum', 'aspekt', 'schritt', 'ereignis', 'spalte', 'beispiel']
const ZEICHNUNG_ARTEN: ZeichnungArt[] = ['symbol', 'skizze', 'openmoji', 'kibild', 'diagramm', 'formel']
const DIAGRAMM_ARTEN: DiagrammArt[] = ['zeitstrahl', 'koordinatensystem', 'schaltplan', 'kreislauf', 'kartenskizze', 'tabelle']

const LAGE = obj({ x: num('links, 0–1; -1 = keine Angabe'), y: num('oben, 0–1'), w: num('Breite 0–1'), h: num('Höhe 0–1') })

export const DIAGRAMM_SCHEMA = obj({
  art: enumOf(DIAGRAMM_ARTEN),
  eintraege: arr(obj({ label: str(), wert: str('Jahr bzw. Wert'), x: num(), y: num() })),
  funktionen: arr(str('Funktionsterm in x')),
  bereich: obj({ xMin: num(), xMax: num(), yMin: num(), yMax: num() }),
  schaltplan: str('Netzliste als JSON-Text (nur bei art schaltplan, sonst leer)'),
  spalten: arr(str()),
  zeilen: arr(arr(str())),
  xName: str(),
  yName: str()
})

const KNOTEN_SCHEMA = obj({
  id: str('kurze Kennung, z. B. k1'),
  titel: str('Überschrift des Kastens (1–4 Wörter)'),
  punkte: arr(str('Stichpunkt bzw. kurzer Satz')),
  rolle: enumOf(ROLLEN),
  farbe: enumOf(FARBEN),
  symbol: str('Symbolname aus dem Vorrat oder leer'),
  zeit: str('Datum (Pflicht bei Zeitleiste, sonst leer): Jahr, Tagesdatum oder Epoche – z. B. „1918", „9. November 1918", „44 v. Chr.", „15. Jh.", „vor 66 Mio. Jahren"'),
  niveau: int('1, 2 oder 3'),
  schritt: int('Aufbauschritt ab 1'),
  lueckenWoerter: arr(str()),
  lage: LAGE
})

export const INHALT_SCHEMA = obj({
  titel: str('Überschrift als Leitfrage'),
  struktur: enumOf(STRUKTUR_WERTE),
  strukturGrund: str(),
  impuls: str('Einstieg/Arbeitsauftrag mit Operator (linkes Feld) – kurz; leer, wenn keiner'),
  knoten: arr(KNOTEN_SCHEMA),
  beziehungen: arr(obj({ von: str(), nach: str(), beschriftung: str(), art: enumOf(['pfeil', 'doppelpfeil', 'linie']) })),
  aspekte: arr(str('Vergleichsaspekt (nur Tabelle)')),
  merksatz: obj({ titel: str('z. B. „Merke!"'), text: str(), lueckenWoerter: arr(str()) }),
  hausaufgabe: str('kurz, mit Operator; leer, wenn keine'),
  zeichnungen: arr(
    obj({
      art: enumOf(ZEICHNUNG_ARTEN),
      bezug: str('id des Knotens oder leer'),
      name: str('Symbolname, Skizzenvorlage oder Suchwort'),
      prompt: str('nur kibild'),
      tex: str('nur formel'),
      diagramm: DIAGRAMM_SCHEMA,
      beschriftung: str(),
      schritt: int()
    })
  ),
  farbLegende: arr(obj({ farbe: enumOf(FARBEN), bedeutung: str() })),
  schritte: arr(obj({ nr: int(), phase: str(), impuls: str() }))
})

// ---------- Anfrage ----------

export interface MaterialText {
  name: string
  text: string
}

function lerngruppe(m: TafelbildMeta, schule = ''): string {
  return [
    `Fach: ${m.subjectLabel}`,
    `Klasse ${m.grade}`,
    m.schoolTypeName,
    m.stateId ? `Bundesland ${m.stateId}` : '',
    m.bilingual?.an ? `bilingual (${m.bilingual.spracheLabel || m.bilingual.sprache})` : '',
    schule ? `Schule: ${schule}` : ''
  ]
    .filter(Boolean)
    .join(', ')
}

const kuerze = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)} …[gekürzt]` : s)

export function systemAuftrag(m: TafelbildMeta): string {
  return [...SYSTEM_GRUNDSAETZE, '', ...fachRegeln(`${m.subjectId} ${m.subjectLabel}`)].join('\n')
}

/**
 * Gewählte Lernziele steuern das Tafelbild (Wunsch 30.09.2026): Struktur, Merksatz und Sicherung
 * halten genau das Ergebnis fest, das die Ziele verlangen; Impuls und Hausaufgabe nutzen ihre Operatoren.
 */
export function lernzielRegeln(lernziel: string): string[] {
  const ziele = lernzielZeilen(lernziel)
  if (!ziele.length) return []
  return [
    `LERNZIELE (verbindlich) – die Schülerinnen und Schüler …\n${ziele.map((z) => `- ${z}`).join('\n')}`,
    '- Das Tafelbild sichert GENAU diese Ziele: Jedes Ziel findet sich in Knoten oder Merksatz wieder (dieselben Fachbegriffe); nichts, was zu keinem Ziel gehört.',
    '- Der Merksatz hält das Ergebnis zum wichtigsten Lernziel fest (Ergebnissicherung); Impuls und Hausaufgabe nutzen den Operator eines Lernziels.'
  ]
}

/** Erzeugen aus Thema, Lernziel und (optional) Material */
export function inhaltAnfrage(m: TafelbildMeta, material: MaterialText[], bilder: string[], wunsch = ''): StructuredRequest {
  const formate = m.formate.map((f) => formatInfo(f).label).join(', ')
  const foto = m.modus === 'foto'
  return {
    system: systemAuftrag(m),
    user: [
      foto
        ? 'Übernimm das FOTOGRAFIERTE TAFELBILD (Bild im Anhang) als sauberes, bearbeitbares Tafelbild: Übertrage alle Texte wörtlich (Rechtschreibung verbessern), erkenne Kästen, Pfeile, Farben und Symbole, gib je Knoten in „lage" die ungefähre Position auf dem Foto an (0–1). Erfinde nichts hinzu; Unleserliches als „[?]".'
        : 'Entwirf ein Tafelbild.',
      `Lerngruppe: ${lerngruppe(m)}.`,
      m.thema.trim() ? `Thema: ${m.thema.trim()}.` : '',
      ...lernzielRegeln(m.lernziel),
      `Tafelformate (die App setzt je Format ein eigenes Layout): ${formate}.`,
      foto ? 'STRUKTUR: wie auf dem Foto (struktur passend wählen).' : strukturRegel(m),
      ...inhaltsRegeln(m),
      material.length
        ? [
            'MATERIAL DER LEHRKRAFT – werte es aus und fasse das für die Stunde Wesentliche im Tafelbild zusammen; übernimm Fachbegriffe, Beispiele und Reihenfolge; erfinde nichts, was dem Material widerspricht:',
            ...material.map((x, i) => `[M${i + 1}] ${x.name}\n${kuerze(x.text, 6000)}`)
          ].join('\n')
        : '',
      bilder.length && !foto ? `Dazu ${bilder.length} Bild(er) aus dem Material im Anhang (Fotos von Tafelbildern, Buchseiten, Hefteinträgen).` : '',
      m.wuensche.trim() ? `WÜNSCHE DER LEHRKRAFT: ${m.wuensche.trim()}` : '',
      wunsch.trim() ? `ÄNDERUNGSWUNSCH: ${wunsch.trim()}` : '',
      'FORMALES: Knoten-ids eindeutig (k1, k2 …); Beziehungen nur zwischen vorhandenen ids; farbLegende nennt JEDE benutzte Farbe außer „grund" mit ihrer Bedeutung; Felder ohne Inhalt leer bzw. 0; lage mit -1, wenn keine Angabe.'
    ]
      .filter(Boolean)
      .join('\n'),
    ...(bilder.length ? { images: bilder } : {}),
    schemaName: 'tafelbild_inhalt',
    schema: INHALT_SCHEMA
  }
}

/** Das ganze Tafelbild überarbeiten (Zauberstab oben) bzw. neu erzeugen (Kreis oben) */
export function ganzesAnfrage(m: TafelbildMeta, inhalt: TbInhalt, art: WunschArt, wunsch: string, material: MaterialText[], bilder: string[]): StructuredRequest {
  if (art === 'neu') {
    const a = inhaltAnfrage(m, material, bilder, wunsch)
    return { ...a, user: `${wunschAuftrag('neu', wunsch).replace(/den Baustein/g, 'das Tafelbild')}\n\n${a.user}` }
  }
  const a = inhaltAnfrage({ ...m, modus: 'neu' }, material, bilder)
  return {
    ...a,
    user: [
      'Überarbeite das VORHANDENE Tafelbild. Struktur und Kernaussagen bleiben erkennbar; ids der Knoten bleiben, wo der Knoten bleibt.',
      wunsch.trim() ? `Änderungswunsch der Lehrkraft (genau umsetzen, alles andere möglichst beibehalten): ${wunsch.trim()}` : 'Verbessere es didaktisch nach den Regeln.',
      `VORHANDENES TAFELBILD (JSON):\n${JSON.stringify(inhaltKurz(inhalt))}`,
      '',
      a.user
    ].join('\n')
  }
}

const inhaltKurz = (i: TbInhalt): unknown => ({
  titel: i.titel,
  struktur: i.struktur,
  impuls: i.impuls,
  knoten: i.knoten.map((k) => ({ id: k.id, titel: k.titel, punkte: k.punkte, rolle: k.rolle, farbe: k.farbe, zeit: k.zeit, niveau: k.niveau, schritt: k.schritt })),
  beziehungen: i.beziehungen,
  aspekte: i.aspekte,
  merksatz: i.merksatz,
  hausaufgabe: i.hausaufgabe
})

// ---------- Element ----------

export const ELEMENT_SCHEMA = obj({
  titel: str('Überschrift (leer, wenn das Element keine hat)'),
  text: str('Inhalt; Stichpunkte je Zeile mit „• " beginnen'),
  lueckenWoerter: arr(str()),
  symbol: str('Symbolname aus dem Vorrat oder leer'),
  tex: str('nur Formel'),
  prompt: str('nur Bild: englische Bildbeschreibung'),
  diagramm: DIAGRAMM_SCHEMA,
  mitDiagramm: bool('true, wenn diagramm ausgefüllt ist')
})

export function elementAnfrage(m: TafelbildMeta, e: TbElement, umgebung: TbElement[], art: WunschArt, wunsch: string): StructuredRequest {
  const name = ELEMENT_NAMEN[e.typ]
  const nachbarn = umgebung
    .filter((x) => x.id !== e.id && (x.typ === 'kasten' || x.typ === 'merksatz' || x.typ === 'text'))
    .map((x) => `- ${x.titel ? `${x.titel}: ` : ''}${x.text.replace(/\n/g, ' ')}`)
    .slice(0, 12)
  return {
    system: systemAuftrag(m),
    user: [
      wunschAuftrag(art, wunsch).replace(/den Baustein/g, `das Element (${name})`),
      `Lerngruppe: ${lerngruppe(m)}. Thema: ${m.thema || '–'}.${m.lernziel.trim() ? ` Lernziele: ${lernzielZeilen(m.lernziel).join('; ')}.` : ''}`,
      ...inhaltsRegeln(m).filter((z) => /TEXTMENGE|SPRACHE|STIL|LÜCKEN|Keine Lücken|OPERATOREN|BILINGUAL/.test(z)),
      `ELEMENT (${name}): ${JSON.stringify({ titel: e.titel ?? '', text: e.text, lueckenWoerter: e.lueckenWoerter ?? [], symbol: e.symbol ?? '', tex: e.tex ?? '', diagramm: e.diagramm ?? null })}`,
      nachbarn.length ? `ÜBRIGES TAFELBILD (nur zur Orientierung, nicht wiederholen):\n${nachbarn.join('\n')}` : '',
      'Das Element soll in seinen Platz passen: ungefähr so lang wie bisher, außer der Wunsch verlangt es anders. Unbenutzte Felder leer, mitDiagramm false, wenn kein Diagramm.'
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'tafelbild_element',
    schema: ELEMENT_SCHEMA
  }
}

export interface ElementAntwort {
  titel?: string
  text: string
  lueckenWoerter: string[]
  symbol?: string
  tex?: string
  prompt?: string
  diagramm?: Diagramm
}

export function elementAus(d: unknown, e: TbElement): ElementAntwort {
  const o = (d ?? {}) as Record<string, unknown>
  const t = (x: unknown): string => String(x ?? '').trim()
  const text = t(o.text)
  if (!text && !t(o.tex) && !o.mitDiagramm && !t(o.prompt)) throw new Error('Die KI hat kein Element geliefert.')
  const woerter = Array.isArray(o.lueckenWoerter) ? o.lueckenWoerter.map(t).filter(Boolean) : []
  return {
    ...(t(o.titel) || e.titel ? { titel: t(o.titel) } : {}),
    text: text || e.text,
    lueckenWoerter: woerter.filter((w) => `${t(o.titel)} ${text}`.toLowerCase().includes(w.toLowerCase())),
    ...(symbolFuer(t(o.symbol)) ? { symbol: symbolFuer(t(o.symbol)) } : {}),
    ...(t(o.tex) ? { tex: t(o.tex) } : {}),
    ...(t(o.prompt) ? { prompt: t(o.prompt) } : {}),
    ...(o.mitDiagramm && o.diagramm ? { diagramm: diagrammAus(o.diagramm) ?? undefined } : {})
  }
}

// ---------- Kürzen ----------

export function kuerzenAnfrage(m: TafelbildMeta, inhalt: TbInhalt, ids: string[], grenze: number): StructuredRequest {
  const knoten = inhalt.knoten.filter((k) => ids.includes(k.id))
  return {
    system: systemAuftrag(m),
    user: [
      `Diese Kästen eines Tafelbilds (${lerngruppe(m)}) sind zu lang für die Tafel. Kürze sie: höchstens ${grenze} Wörter je Stichpunkt, höchstens 4 Stichpunkte je Kasten, Fachbegriffe bleiben. Gleiche ids.`,
      JSON.stringify(knoten.map((k) => ({ id: k.id, titel: k.titel, punkte: k.punkte })))
    ].join('\n'),
    schemaName: 'tafelbild_kuerzen',
    schema: obj({ knoten: arr(obj({ id: str(), titel: str(), punkte: arr(str()) })) })
  }
}

export function kuerzenAus(d: unknown, inhalt: TbInhalt): TbInhalt {
  const liste = ((d as { knoten?: unknown })?.knoten ?? []) as { id?: unknown; titel?: unknown; punkte?: unknown }[]
  const neu = structuredClone(inhalt)
  for (const x of Array.isArray(liste) ? liste : []) {
    const k = neu.knoten.find((y) => y.id === String(x.id))
    if (!k) continue
    const punkte = Array.isArray(x.punkte) ? x.punkte.map((p) => String(p).trim()).filter(Boolean) : []
    if (punkte.length) k.punkte = punkte
    if (String(x.titel ?? '').trim()) k.titel = String(x.titel).trim()
    k.lueckenWoerter = k.lueckenWoerter.filter((w) => `${k.titel} ${k.punkte.join(' ')}`.toLowerCase().includes(w.toLowerCase()))
  }
  return neu
}

// ---------- Antwort lesen ----------

/**
 * Zeitstrahl als Zeichnung: Marken chronologisch (stabil), maßstabsgerecht, wenn die Abstände es
 * erlauben (R29), sonst gleichmäßig. Ohne lesbare Zeit bleibt die Reihenfolge der KI.
 */
export function zeitPositionen<T extends { wert?: string; x?: number }>(liste: T[]): T[] {
  const werte = liste.map((e) => zeitWert(e.wert))
  if (liste.length && werte.every((w) => w !== null)) {
    const sortiert = liste.map((e, i) => ({ e, w: werte[i]!, i })).sort((a, b) => a.w - b.w || a.i - b.i)
    const min = sortiert[0].w
    const max = sortiert[sortiert.length - 1].w
    const massstab = massstabPasst(sortiert.map((x) => x.w))
    const stufen = [...new Set(sortiert.map((x) => x.w))]
    return sortiert.map((x) => ({
      ...x.e,
      x: max <= min ? 0.5 : massstab ? (x.w - min) / (max - min) : stufen.indexOf(x.w) / Math.max(1, stufen.length - 1)
    }))
  }
  return liste.map((e, i) => ({ ...e, x: liste.length > 1 ? i / (liste.length - 1) : 0.5 }))
}

const text = (x: unknown): string => String(x ?? '').trim()
const zahl = (x: unknown, d = 0): number => (Number.isFinite(Number(x)) ? Number(x) : d)

export function diagrammAus(roh: unknown): Diagramm | null {
  const o = (roh ?? {}) as Record<string, unknown>
  const art = DIAGRAMM_ARTEN.includes(o.art as DiagrammArt) ? (o.art as DiagrammArt) : null
  if (!art) return null
  const eintraege = (Array.isArray(o.eintraege) ? o.eintraege : [])
    .map((e) => {
      const x = (e ?? {}) as Record<string, unknown>
      return { label: text(x.label), wert: text(x.wert), x: zahl(x.x), y: zahl(x.y) }
    })
    .filter((e) => e.label || e.wert)
  const d: Diagramm = { art, eintraege }
  const b = (o.bereich ?? {}) as Record<string, unknown>
  if (art === 'koordinatensystem') {
    d.funktionen = (Array.isArray(o.funktionen) ? o.funktionen : []).map(text).filter(Boolean).slice(0, 4)
    const xMin = zahl(b.xMin, -5)
    const xMax = zahl(b.xMax, 5)
    const yMin = zahl(b.yMin, -5)
    const yMax = zahl(b.yMax, 5)
    d.bereich = xMax > xMin && yMax > yMin ? { xMin, xMax, yMin, yMax } : { xMin: -5, xMax: 5, yMin: -5, yMax: 5 }
    if (text(o.xName)) d.xName = text(o.xName)
    if (text(o.yName)) d.yName = text(o.yName)
  }
  if (art === 'schaltplan') {
    try {
      const spec = leseSchaltplan(JSON.parse(text(o.schaltplan) || 'null')).spec
      if (!spec) return null
      d.schaltplan = spec
    } catch {
      return null
    }
  }
  if (art === 'tabelle') {
    d.spalten = (Array.isArray(o.spalten) ? o.spalten : []).map(text)
    d.zeilen = (Array.isArray(o.zeilen) ? o.zeilen : []).map((z) => (Array.isArray(z) ? z.map(text) : []))
    if (!d.zeilen.length) return null
  }
  if (art === 'kartenskizze') d.eintraege = d.eintraege.map((e) => ({ ...e, x: Math.min(0.95, Math.max(0.05, e.x ?? 0.5)), y: Math.min(0.95, Math.max(0.05, e.y ?? 0.5)) }))
  if (art === 'zeitstrahl') d.eintraege = zeitPositionen(d.eintraege)
  if ((art === 'zeitstrahl' || art === 'kreislauf' || art === 'kartenskizze') && !d.eintraege.length) return null
  return d
}

const farbe = (x: unknown, d: Farbe = 'grund'): Farbe => (FARBEN.includes(x as Farbe) ? (x as Farbe) : d)
const niveau = (x: unknown): Niveau => Math.min(3, Math.max(1, Math.round(zahl(x, 1)))) as Niveau

/** Antwort der KI prüfen und in einen sauberen Inhalt bringen */
export function inhaltAus(daten: unknown, meta: Pick<TafelbildMeta, 'struktur' | 'varianten' | 'regler' | 'quellen' | 'modus'>): TbInhalt {
  const d = (daten ?? {}) as Record<string, unknown>
  const roh = Array.isArray(d.knoten) ? d.knoten : []
  const ids = new Set<string>()
  const knoten: TbKnoten[] = []
  for (const [i, r] of roh.entries()) {
    const o = (r ?? {}) as Record<string, unknown>
    let id = text(o.id) || `k${i + 1}`
    while (ids.has(id)) id = `${id}_`
    ids.add(id)
    const punkte = (Array.isArray(o.punkte) ? o.punkte : []).map(text).filter(Boolean)
    const titel = text(o.titel)
    if (!titel && !punkte.length) continue
    const l = (o.lage ?? {}) as Record<string, unknown>
    const lage = zahl(l.x, -1) >= 0 && zahl(l.w, -1) > 0 ? { x: zahl(l.x), y: zahl(l.y), w: zahl(l.w), h: Math.max(0, zahl(l.h)) } : undefined
    const woerter = (Array.isArray(o.lueckenWoerter) ? o.lueckenWoerter : []).map(text).filter(Boolean)
    const alles = `${titel} ${punkte.join(' ')}`.toLowerCase()
    knoten.push({
      id,
      titel,
      punkte,
      rolle: ROLLEN.includes(o.rolle as TbKnoten['rolle']) ? (o.rolle as TbKnoten['rolle']) : 'aspekt',
      farbe: farbe(o.farbe),
      ...(symbolFuer(text(o.symbol)) && meta.regler.zeichnungen > 0 ? { symbol: symbolFuer(text(o.symbol)) } : {}),
      ...(text(o.zeit) ? { zeit: text(o.zeit) } : {}),
      niveau: meta.varianten.niveaus ? niveau(o.niveau) : 1,
      schritt: Math.max(1, Math.round(zahl(o.schritt, 2))),
      // Lückenwörter nur, wenn sie wirklich im Text stehen (sonst bliebe die Lücke unsichtbar)
      lueckenWoerter: meta.varianten.luecke ? woerter.filter((w) => alles.includes(w.toLowerCase())).slice(0, 2) : [],
      ...(lage ? { lage } : {})
    })
  }
  if (!knoten.length) throw new Error('Die KI hat kein Tafelbild geliefert.')
  let struktur: StrukturArt = STRUKTUR_WERTE.includes(d.struktur as StrukturArt) ? (d.struktur as StrukturArt) : 'gliederung'
  // Die Vorgabe der Lehrkraft gilt, auch wenn die KI anders wählt
  if (meta.struktur !== 'auto') struktur = meta.struktur
  if (meta.modus === 'foto' && knoten.filter((k) => k.lage).length >= knoten.length / 2) struktur = 'frei'
  if (struktur === 'netz' && !knoten.some((k) => k.rolle === 'zentrum')) knoten[0].rolle = 'zentrum'
  const beziehungen = (Array.isArray(d.beziehungen) ? d.beziehungen : [])
    .map((b) => {
      const o = (b ?? {}) as Record<string, unknown>
      return { von: text(o.von), nach: text(o.nach), beschriftung: text(o.beschriftung), art: (['pfeil', 'doppelpfeil', 'linie'].includes(o.art as string) ? o.art : 'pfeil') as 'pfeil' }
    })
    .filter((b) => ids.has(b.von) && ids.has(b.nach) && b.von !== b.nach)
  const m = (d.merksatz ?? {}) as Record<string, unknown>
  const merksatzText = text(m.text)
  const erlaubt = erlaubteZeichnungen(meta)
  const zeichnungen: TbZeichnung[] = []
  if (meta.regler.zeichnungen > 0)
    for (const z of Array.isArray(d.zeichnungen) ? d.zeichnungen : []) {
      const o = (z ?? {}) as Record<string, unknown>
      const art = o.art as ZeichnungArt
      if (!ZEICHNUNG_ARTEN.includes(art) || !erlaubt.includes(art)) continue
      const bezug = ids.has(text(o.bezug)) ? text(o.bezug) : ''
      const basis = { art, bezug, schritt: Math.max(1, Math.round(zahl(o.schritt, 2))), ...(text(o.beschriftung) ? { beschriftung: text(o.beschriftung) } : {}) }
      if (art === 'symbol') {
        const s = symbolFuer(text(o.name))
        if (s) zeichnungen.push({ ...basis, symbol: s })
      } else if (art === 'skizze') {
        const s = skizzeFuer(text(o.name))
        if (s) zeichnungen.push({ ...basis, vorlage: s })
      } else if (art === 'openmoji') {
        if (text(o.name)) zeichnungen.push({ ...basis, suchwort: text(o.name) })
      } else if (art === 'kibild') {
        if (text(o.prompt)) zeichnungen.push({ ...basis, prompt: text(o.prompt) })
      } else if (art === 'formel') {
        if (text(o.tex)) zeichnungen.push({ ...basis, bezug: '', tex: text(o.tex).replace(/^\$+|\$+$/g, '') })
      } else if (art === 'diagramm') {
        const dg = diagrammAus(o.diagramm)
        if (dg) zeichnungen.push({ ...basis, bezug: '', diagramm: dg })
      }
    }
  // Höchstens zwei KI-Bilder (Kosten, Wartezeit)
  let kiBilder = 0
  const gefiltert = zeichnungen.filter((z) => z.art !== 'kibild' || ++kiBilder <= 2)
  const legende = (Array.isArray(d.farbLegende) ? d.farbLegende : [])
    .map((l) => ({ farbe: farbe((l as Record<string, unknown>)?.farbe), bedeutung: text((l as Record<string, unknown>)?.bedeutung) }))
    .filter((l) => l.farbe !== 'grund' && l.bedeutung)
  const schritte = (Array.isArray(d.schritte) ? d.schritte : [])
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>
      return { nr: Math.max(1, Math.round(zahl(o.nr, 1))), phase: text(o.phase), impuls: text(o.impuls) }
    })
    .filter((s) => s.phase || s.impuls)
  return ordneInhalt({
    titel: text(d.titel) || 'Tafelbild',
    struktur,
    strukturGrund: text(d.strukturGrund),
    impuls: text(d.impuls),
    knoten,
    beziehungen,
    ...(Array.isArray(d.aspekte) && d.aspekte.length ? { aspekte: d.aspekte.map(text).filter(Boolean) } : {}),
    merksatz:
      meta.varianten.merksatz && merksatzText
        ? {
            titel: text(m.titel) || 'Merke!',
            text: merksatzText,
            lueckenWoerter: meta.varianten.luecke
              ? (Array.isArray(m.lueckenWoerter) ? m.lueckenWoerter : []).map(text).filter((w) => w && merksatzText.toLowerCase().includes(w.toLowerCase())).slice(0, 2)
              : []
          }
        : null,
    hausaufgabe: text(d.hausaufgabe),
    zeichnungen: gefiltert,
    farbLegende: legende.length ? legende : standardLegende(knoten),
    schritte
  })
}

/**
 * Reihenfolge des Inhalts deterministisch machen (Nachbesserung 30.09.2026) – die KI liefert
 * Ereignisse, Stationen und Schritte oft ungeordnet:
 * - Zeitleiste: Knoten chronologisch; der Aufbau (schritt) folgt der Zeit.
 * - Kreislauf: Stationen in Pfeilrichtung; Flussdiagramm: Schritte in Pfeilrichtung.
 * - Tabelle: wiederholte Aspektnamen am Anfang der Einträge fallen weg.
 */
export function ordneInhalt(inhalt: TbInhalt): TbInhalt {
  const i = { ...inhalt }
  if (i.struktur === 'zeitleiste') {
    const geordnet = ordneEreignisse(i.knoten).map((e) => e.knoten)
    const schritte = geordnet.map((k) => k.schritt).sort((a, b) => a - b)
    i.knoten = geordnet.map((k, j) => ({ ...k, schritt: schritte[j] }))
  } else if (i.struktur === 'kreislauf') {
    const zentrum = i.knoten.filter((k) => k.rolle === 'zentrum')
    i.knoten = [...zentrum, ...ordneKreislauf(i.knoten.filter((k) => k.rolle !== 'zentrum'), i.beziehungen)]
  } else if (i.struktur === 'fluss') i.knoten = ordneFluss(i.knoten, i.beziehungen)
  else if (i.struktur === 'tabelle' && i.aspekte?.length) {
    const aspekte = i.aspekte
    i.knoten = i.knoten.map((k) => (k.rolle === 'spalte' ? { ...k, punkte: k.punkte.map((p, j) => (aspekte[j] ? ohneAspektPraefix(p, aspekte[j]) : p)) } : k))
  }
  return i
}

/** Fehler der KI-Antwort, die eine Korrekturanfrage auslösen (Datum fehlt, Spalten passen nicht) */
export function inhaltsProbleme(inhalt: TbInhalt): InhaltsProblem[] {
  if (inhalt.struktur === 'zeitleiste') return pruefeZeitleiste(inhalt)
  if (inhalt.struktur === 'tabelle') return pruefeTabelle(inhalt)
  return []
}

export const KORREKTUR_SCHEMA = obj({
  knoten: arr(obj({ id: str(), titel: str('unverändert, außer der Titel war falsch'), zeit: str('Datum (Zeitleiste), sonst leer'), punkte: arr(str()) }))
})

/** Korrekturanfrage: nur die fehlerhaften Knoten, mit genauer Anweisung */
export function korrekturAnfrage(m: TafelbildMeta, inhalt: TbInhalt, probleme: InhaltsProblem[]): StructuredRequest {
  const betroffen = new Set(probleme.map((p) => p.knoten).filter(Boolean))
  const knoten = inhalt.knoten.filter((k) => !betroffen.size || betroffen.has(k.id))
  const aspekte = (inhalt.aspekte ?? []).filter(Boolean)
  return {
    system: systemAuftrag(m),
    user: [
      `Die Knoten eines Tafelbilds (${lerngruppe(m)}, Thema: ${m.thema || inhalt.titel}) haben Fehler. Korrigiere GENAU diese Fehler; alles andere bleibt wörtlich, die ids bleiben.`,
      'FEHLER:',
      ...probleme.map((p) => `- ${p.text}`),
      inhalt.struktur === 'zeitleiste'
        ? 'ZEITLEISTE: Gib für JEDEN Knoten im Feld „zeit" ein genaues, lesbares Datum an – das Jahr; wo es auf den Tag ankommt, Tag und Monat („9. November 1918"); vor Christus „44 v. Chr."; Jahrhunderte „15. Jh."; Erdgeschichte „vor 66 Mio. Jahren". Das Datum muss zum Titel und zu den Punkten passen (historisch korrekt). punkte leer lassen, wenn sie stimmen.'
        : '',
      inhalt.struktur === 'tabelle'
        ? `TABELLE: Jede Spalte hat in „punkte" GENAU ${aspekte.length} Einträge – einen je Aspekt, in dieser Reihenfolge: ${aspekte.join(' | ')}. Ohne Aussage zu einem Aspekt: „–". Den Aspektnamen nicht wiederholen. zeit leer.`
        : '',
      `KNOTEN (JSON): ${JSON.stringify(knoten.map((k) => ({ id: k.id, titel: k.titel, punkte: k.punkte, zeit: k.zeit ?? '' })))}`
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'tafelbild_korrektur',
    schema: KORREKTUR_SCHEMA
  }
}

/** Korrektur übernehmen (nur gelieferte, nicht leere Felder) und neu ordnen */
export function korrekturAus(d: unknown, inhalt: TbInhalt): TbInhalt {
  const liste = ((d as { knoten?: unknown })?.knoten ?? []) as { id?: unknown; titel?: unknown; zeit?: unknown; punkte?: unknown }[]
  const neu = structuredClone(inhalt)
  for (const x of Array.isArray(liste) ? liste : []) {
    const k = neu.knoten.find((y) => y.id === text(x.id))
    if (!k) continue
    if (text(x.zeit)) k.zeit = text(x.zeit)
    if (text(x.titel)) k.titel = text(x.titel)
    const punkte = Array.isArray(x.punkte) ? x.punkte.map(text).filter(Boolean) : []
    if (punkte.length) k.punkte = punkte
    const alles = `${k.titel} ${k.punkte.join(' ')}`.toLowerCase()
    k.lueckenWoerter = k.lueckenWoerter.filter((w) => alles.includes(w.toLowerCase()))
  }
  return ordneInhalt(neu)
}

/** Legende, wenn die KI keine liefert – aus den benutzten Farben (R21) */
export function standardLegende(knoten: Pick<TbKnoten, 'farbe'>[]): { farbe: Farbe; bedeutung: string }[] {
  const b: Partial<Record<Farbe, string>> = {
    gelb: 'Fachbegriff, Überschrift',
    orange: 'Merksatz, Ergebnis',
    rot: 'Problem, Widerspruch',
    blau: 'Beispiel, Ergänzung',
    gruen: 'Lösung, positiv'
  }
  const benutzt = new Set<Farbe>(['gelb', 'orange', ...knoten.map((k) => k.farbe)])
  return [...benutzt].filter((f) => f !== 'grund').map((f) => ({ farbe: f, bedeutung: b[f] ?? '' }))
}

export const strukturName = (s: StrukturArt): string => STRUKTUR_NAMEN[s]

/** Stil der KI-Bilder je Medium */
export function bildStil(prompt: string, kreide: boolean): string {
  return kreide
    ? `${prompt}. Simple white chalk line drawing on a dark green school blackboard, few strokes, no text, no letters, clear outline, flat, centered.`
    : `${prompt}. Simple black marker line drawing on plain white background, few strokes, no text, no letters, clear outline, flat, centered.`
}

export const neueKnotenId = (): string => neueId('k')
