/**
 * Sprechprüfung als Teil der Klassenarbeit (01.10.2026, Wunsch der Lehrkraft).
 *
 * Eine Sprechprüfung hat kein Aufgabenblatt zum Beschreiben, sondern
 * (a) Karten für die Prüflinge A/B/C – Monolog mit Material und Vorbereitungszeit, Dialog mit Rolle,
 * (b) einen Prüferbogen mit Ablauf, Zeitplan, Einstiegsfragen, Nachfragen und Protokollfeldern,
 * (c) ein Bewertungsraster je Prüfling nach den Kriterien des Landes mit Punkten und Note,
 * (d) mehrere gleichwertige Kartensätze, damit aufeinanderfolgende Gruppen verschiedene Aufgaben haben.
 *
 * Die KI schreibt nur die Inhalte (Themen, Aufgaben, Material, Fragen, Erwartungen) in EINER Anfrage
 * für alle Kartensätze – so werden sie gleichwertig und unterscheiden sich trotzdem. Zeiten, Ablauf
 * und Raster setzt die App selbst aus den Vorgaben des Landes (shared/sprechen/laender.ts); sie
 * sind damit prüfbar und ändern sich mit den Einstellungen, ohne neue Anfrage.
 *
 * Prüferbogen und Raster sind Lehrkraft-Bausteine (`nurLoesung`): Sie stehen im Erwartungshorizont,
 * die Karten in der Arbeit.
 */
import { arr, enumOf, obj, str } from '../../../shared/aiSchema'
import type { StructuredRequest } from '@shared/types'
import type { ImageBlock, InfoBoxBlock, TableBlock, TextBlock, WsBlock } from '../../arbeitsblatt/model/types'
import { kartenTexte, prueflingsBuchstabe } from '../../../shared/sprechen/karten'
import {
  MAX_KARTENSAETZE,
  pruefungsdauer,
  sprechLand,
  sprechSetupFuer,
  SPRECH_MATERIALIEN,
  type SprechMaterial,
  type SprechSetup
} from '../../../shared/sprechen/laender'
import { bereichsAnteile, punkteJeNote, rasterZeilen } from '../../../shared/sprechen/raster'
import { sprechKompetenzen } from '../../../shared/sprechen/kompetenzen'
import { fachDerArbeit, formatIdFuer } from '../model/faecher'
import { formatById } from '../model/formats'
import { newId } from '../../vokabeltest/model/random'
import type { Exam, ExamPart } from '../model/types'
import { stageForGrade } from '../../arbeitsblatt/didactics/profile'

export type AiCall = <T>(req: StructuredRequest) => Promise<T>

/** Material einer Monologkarte */
export interface SprechMaterialInhalt {
  art: SprechMaterial
  titel: string
  /** Bildbeschreibung bzw. Beschreibung des Cartoons (Grundlage für Bildsuche oder KI-Bild) */
  beschreibung: string
  /** Kurzer Text, Zitat oder Situationsimpuls im Wortlaut */
  text: string
  quelle: string
  /** Diagramm: Kopfzeile und Zeilen */
  kopf: string[]
  zeilen: string[][]
}

export interface SprechKarte {
  monologAufgabe: string
  monologPunkte: string[]
  material: SprechMaterialInhalt
  rolle: string
  rollenAufgabe: string
  rollenPunkte: string[]
}

export interface SprechSatz {
  thema: string
  situation: string
  karten: SprechKarte[]
  nachfragen: string[]
  erwartungMonolog: string[]
  erwartungDialog: string[]
}

export interface SprechDaten {
  einstieg: string[]
  saetze: SprechSatz[]
  hinweise: string[]
}

const MATERIAL_ARTEN = SPRECH_MATERIALIEN.map((m) => m.value)

export const SPRECH_SCHEMA = obj({
  einstieg: arr(str('Einstiegsfrage der Prüferin bzw. des Prüfers in der Zielsprache'), '4 bis 6 Fragen für das Aufwärmgespräch'),
  saetze: arr(
    obj({
      thema: str('Thema des Kartensatzes (deutsch, kurz)'),
      situation: str('Gemeinsame Gesprächssituation für den Dialogteil, in der Zielsprache'),
      karten: arr(
        obj({
          monologAufgabe: str('Monologaufgabe in der Zielsprache, mit Operator'),
          monologPunkte: arr(str('Inhaltspunkt in der Zielsprache'), '3 bis 4 Punkte'),
          material: obj({
            art: enumOf(MATERIAL_ARTEN),
            titel: str('Titel des Materials'),
            beschreibung: str('Bild/Cartoon: genaue Bildbeschreibung (deutsch) für die Bildsuche; sonst leer'),
            text: str('Kurzer Text, Zitat oder Situationsimpuls im Wortlaut in der Zielsprache; sonst leer'),
            quelle: str('Quelle des Zitats bzw. der Daten, sonst leer'),
            kopf: arr(str(), 'Diagramm: Kopfzeile der Datentabelle; sonst leer'),
            zeilen: arr(arr(str()), 'Diagramm: Datenzeilen; sonst leer')
          }),
          rolle: str('Rolle im Dialog in der Zielsprache'),
          rollenAufgabe: str('Auftrag der Rolle in der Zielsprache'),
          rollenPunkte: arr(str('Gesprächspunkt der Rolle in der Zielsprache'), '2 bis 4 Punkte')
        }),
        'genau eine Karte je Prüfling'
      ),
      nachfragen: arr(str('Nachfrage bzw. Impuls für die Prüferin oder den Prüfer in der Zielsprache'), '4 bis 6'),
      erwartungMonolog: arr(str('Erwarteter Inhalt (deutsch, Stichpunkt)')),
      erwartungDialog: arr(str('Erwarteter Inhalt (deutsch, Stichpunkt)'))
    }),
    'genau so viele Kartensätze wie verlangt'
  ),
  hinweise: arr(str('Hinweis für die Prüfenden (deutsch)'), '2 bis 4')
})

const istSek2 = (meta: Exam['meta']): boolean => stageForGrade(meta.grade, meta.schoolTypeId) === 'sek2'

/** Einstellungen des Teils – fehlen sie, die Voreinstellung des Landes */
export const sprechSetup = (exam: Exam, part: ExamPart): SprechSetup => ({
  ...sprechSetupFuer(exam.meta.stateId, exam.meta.grade, istSek2(exam.meta)),
  ...part.sprechen
})

/**
 * „Sprechprüfung" im Aufbau der Arbeit: Die Arbeit besteht dann aus genau diesem Teil – er ersetzt
 * die schriftliche Arbeit. Zeit der Arbeit = Prüfungszeit je Gruppe; Punkte nach dem Format.
 */
export function sprechpruefungAlsArbeit(d: Exam): void {
  const format = formatById(formatIdFuer(d.meta.subjectId, 'speaking'))
  if (!format) return
  const setup = sprechSetupFuer(d.meta.stateId, d.meta.grade, istSek2(d.meta))
  const minuten = pruefungsdauer(setup)
  d.meta.minutes = minuten
  d.parts = [
    {
      id: newId(),
      formatId: format.id,
      label: format.label,
      competence: format.competence,
      weight: 100,
      points: format.defaultPoints ?? 30,
      minutes: minuten,
      gradeGroup: 'other',
      afbMix: { I: 20, II: 50, III: 30 },
      sprechen: { ...setup, ersetztArbeit: true },
      blocks: []
    }
  ]
}

const zahl = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(Number(n) || min)))

/** Der Auftrag an die KI */
export function sprechPrompt(exam: Exam, part: ExamPart): string {
  const m = exam.meta
  const s = sprechSetup(exam, part)
  const fach = fachDerArbeit(m.subjectId)
  const k = sprechKompetenzen(m.stateId, m.schoolTypeId, m.grade)
  const saetze = zahl(s.kartensaetze, 1, MAX_KARTENSAETZE)
  const materialien = s.material.map((x) => SPRECH_MATERIALIEN.find((y) => y.value === x)?.label ?? x)
  return [
    `Erstelle die Inhalte einer Sprechprüfung im Fach ${m.subjectLabel}, Klasse ${m.grade}, Niveau ${m.cefrLevel}.`,
    `Thema: ${m.topic}`,
    m.content ? `Inhalte der Unterrichtseinheit: ${m.content}` : '',
    part.notes ? `Vorgaben der Lehrkraft: ${part.notes}` : '',
    '',
    `Aufbau: ${s.gruppe === 3 ? 'Dreiergruppe' : 'Paarprüfung'}; Teil 1 Einstieg (${s.aufwaermen} min), Teil 2 ${k.monolog} (je Prüfling ${
      s.monolog
    } min, Vorbereitung ${s.vorbereitung} min), Teil 3 ${k.dialog} (${s.dialog} min gemeinsam).`,
    `Erzeuge GENAU ${saetze} gleichwertige Kartensätze mit je GENAU ${s.gruppe} Karten (Prüfling ${Array.from({ length: s.gruppe }, (_, i) =>
      prueflingsBuchstabe(i)
    ).join(', ')}).`,
    '- Gleichwertig heißt: gleicher Schwierigkeitsgrad, gleiche Operatoren, gleicher Umfang – aber ein jeweils ANDERER Teilaspekt des Themas, damit aufeinanderfolgende Gruppen nichts weitergeben können.',
    '- Innerhalb eines Satzes bekommt jeder Prüfling ein ANDERES Material, aber Material derselben Art und Schwierigkeit.',
    `- Erlaubte Materialarten: ${materialien.join(
      ', '
    )}. Ein Diagramm hat höchstens 5 Zeilen mit erfundenen, plausiblen Werten und nennt in "quelle" "fiktive Daten". Zitate nur, wenn Wortlaut und Urheber sicher bekannt sind – sonst einen kurzen Impulstext.`,
    '- Bilder und Cartoons werden NICHT gezeichnet: Beschreibe sie so genau, dass sich ein passendes Foto finden oder ein Bild erzeugen lässt.',
    `- Der Dialogteil ist eine gemeinsame Situation mit einem Ziel (sich einigen, planen, abwägen); jede Rolle hat eigene Gesprächspunkte, die zu Rede und Gegenrede führen.`,
    `- Karten, Einstiegsfragen und Nachfragen in der Zielsprache (${fach.label}), auf Niveau ${m.cefrLevel}; Erwartungen und Hinweise auf Deutsch.`,
    '- Keine Lösungen auf den Karten, keine Formulierungshilfen.'
  ]
    .filter(Boolean)
    .join('\n')
}

const SYSTEM =
  'Du bist eine erfahrene Fremdsprachenlehrkraft und erstellst Material für mündliche Prüfungen (Sprechprüfungen) nach den KMK-Bildungsstandards. Antworte nur mit den verlangten Daten.'

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const liste = (v: unknown): string[] => (Array.isArray(v) ? v.map(s).filter(Boolean) : [])

/** Bringt die Antwort der KI in eine feste Form (fehlende Felder, zu viele oder zu wenige Karten) */
export function normalisiereSprechDaten(roh: unknown, setup: SprechSetup): SprechDaten {
  const r = (roh ?? {}) as Record<string, unknown>
  const saetzeRoh = Array.isArray(r.saetze) ? (r.saetze as Record<string, unknown>[]) : []
  const anzahl = zahl(setup.kartensaetze, 1, MAX_KARTENSAETZE)
  const saetze = saetzeRoh.slice(0, anzahl).map((satz): SprechSatz => {
    const kartenRoh = Array.isArray(satz.karten) ? (satz.karten as Record<string, unknown>[]) : []
    const karten = kartenRoh.slice(0, setup.gruppe).map((k): SprechKarte => {
      const mat = (k.material ?? {}) as Record<string, unknown>
      const art = MATERIAL_ARTEN.includes(mat.art as SprechMaterial) ? (mat.art as SprechMaterial) : 'situation'
      return {
        monologAufgabe: s(k.monologAufgabe),
        monologPunkte: liste(k.monologPunkte),
        material: {
          art,
          titel: s(mat.titel),
          beschreibung: s(mat.beschreibung),
          text: s(mat.text),
          quelle: s(mat.quelle),
          kopf: liste(mat.kopf),
          zeilen: Array.isArray(mat.zeilen) ? (mat.zeilen as unknown[]).map(liste).filter((z) => z.length) : []
        },
        rolle: s(k.rolle),
        rollenAufgabe: s(k.rollenAufgabe),
        rollenPunkte: liste(k.rollenPunkte)
      }
    })
    return {
      thema: s(satz.thema),
      situation: s(satz.situation),
      karten,
      nachfragen: liste(satz.nachfragen),
      erwartungMonolog: liste(satz.erwartungMonolog),
      erwartungDialog: liste(satz.erwartungDialog)
    }
  })
  return { einstieg: liste(r.einstieg), saetze, hinweise: liste(r.hinweise) }
}

/** Erzeugt Karten und Prüferbogen-Inhalte (eine Anfrage) */
export async function generateSprechDaten(exam: Exam, part: ExamPart, ai: AiCall): Promise<SprechDaten> {
  const setup = sprechSetup(exam, part)
  const roh = await ai<unknown>({
    system: SYSTEM,
    user: sprechPrompt(exam, part),
    schema: SPRECH_SCHEMA,
    schemaName: 'speaking_exam'
  })
  return normalisiereSprechDaten(roh, setup)
}

let zaehler = 0
const id = (praefix: string): string => `${praefix}-${Date.now().toString(36)}-${(zaehler++).toString(36)}`

const info = (title: string, body: string, extra: Partial<InfoBoxBlock> = {}): InfoBoxBlock => ({
  id: id('sp'),
  type: 'infoBox',
  variant: 'regel',
  title,
  body,
  ...extra
})
const punkte = (xs: string[]): string => xs.map((x) => `- ${x}`).join('\n')

/** Material einer Karte als Baustein(e) */
function materialBausteine(mat: SprechMaterialInhalt, titel: string): WsBlock[] {
  if (mat.art === 'bild' || mat.art === 'cartoon') {
    const bild: ImageBlock = {
      id: id('sp-bild'),
      type: 'image',
      role: 'material',
      description: mat.beschreibung || mat.titel,
      caption: mat.titel || titel,
      widthPercent: 60,
      search: mat.beschreibung || mat.titel,
      side: 'none'
    }
    return [bild]
  }
  if (mat.art === 'diagramm' && mat.kopf.length && mat.zeilen.length) {
    const tab: TableBlock = {
      id: id('sp-tab'),
      type: 'table',
      title: [mat.titel || titel, mat.quelle].filter(Boolean).join(' – '),
      headers: mat.kopf,
      rows: mat.zeilen
    }
    return [tab]
  }
  if (mat.text) {
    const text: TextBlock = {
      id: id('sp-text'),
      type: 'text',
      title: mat.titel || titel,
      body: mat.art === 'zitat' ? `„${mat.text.replace(/^[„"“]|[“"”]$/g, '')}“` : mat.text,
      lineNumbers: false,
      source: mat.quelle,
      glossary: [],
      language: 'target'
    }
    return [text]
  }
  return []
}

/** Die Karten eines Satzes (für die Prüflinge) */
export function kartenBausteine(exam: Exam, setup: SprechSetup, satz: SprechSatz, nr: number): WsBlock[] {
  const t = kartenTexte(fachDerArbeit(exam.meta.subjectId).sprache)
  const out: WsBlock[] = [
    {
      id: id('sp-satz'),
      type: 'divider',
      title: `${t.satz} ${nr}${satz.thema ? ` – ${satz.thema}` : ''}`,
      pageBreakBefore: nr > 1
    }
  ]
  satz.karten.forEach((k, i) => {
    const wer = `${t.pruefling} ${prueflingsBuchstabe(i)}`
    out.push(
      info(
        `${wer} · ${t.monolog}`,
        [
          t.vorbereitung(setup.vorbereitung),
          '',
          `${t.aufgabe}: ${k.monologAufgabe}`,
          k.monologPunkte.length ? `\n${t.punkte}\n${punkte(k.monologPunkte)}` : '',
          '',
          t.sprechzeit(setup.monolog)
        ]
          .filter((z, j, a) => z !== '' || (a[j - 1] ?? '') !== '')
          .join('\n')
      ),
      ...materialBausteine(k.material, `${t.material} ${prueflingsBuchstabe(i)}`)
    )
  })
  satz.karten.forEach((k, i) => {
    const wer = `${t.pruefling} ${prueflingsBuchstabe(i)}`
    out.push(
      info(
        `${wer} · ${t.dialog}`,
        [
          satz.situation ? `${t.gemeinsam}: ${satz.situation}` : '',
          `${t.rolle}: ${k.rolle}`,
          `${t.aufgabe}: ${k.rollenAufgabe}`,
          punkte(k.rollenPunkte),
          t.sprechzeit(setup.dialog)
        ]
          .filter(Boolean)
          .join('\n')
      )
    )
  })
  return out
}

/** Prüferbogen: Ablauf, Zeitplan, Einstiegsfragen, Nachfragen, Erwartungen, Protokoll */
export function prueferBausteine(exam: Exam, setup: SprechSetup, daten: SprechDaten): WsBlock[] {
  const land = sprechLand(exam.meta.stateId)
  const k = sprechKompetenzen(exam.meta.stateId, exam.meta.schoolTypeId, exam.meta.grade)
  const dauer = pruefungsdauer(setup)
  const buchstaben = Array.from({ length: setup.gruppe }, (_, i) => prueflingsBuchstabe(i))
  // Zeitplan: Minuten fortlaufend ab Beginn der Prüfung (Vorbereitung davor)
  let t = 0
  const zeile = (phase: string, min: number, wer: string, was: string): string[] => {
    const von = t
    t += min
    return [phase, `${von}–${t} min`, wer, was]
  }
  const zeitplan: string[][] = [
    ['Vorbereitung', `${setup.vorbereitung} min vorher`, buchstaben.join(', '), 'Karten Teil 2 und 3 lesen, Notizen in Stichpunkten'],
    zeile('Teil 1 · Einstieg', setup.aufwaermen, 'Prüfende, alle', 'kurzes Gespräch zu Person und Thema (nicht oder gering gewichtet)'),
    ...buchstaben.map((b) => zeile(`Teil 2 · Monolog ${b}`, setup.monolog, b, `${k.monolog} mit Material; danach 1–2 Nachfragen`)),
    zeile('Teil 3 · Dialog', setup.dialog, buchstaben.join(', '), `${k.dialog}: Situation, Rollen, Einigung`),
    ['Beratung', 'danach', 'Prüfende', 'Raster ausfüllen, Note festlegen']
  ]
  const out: WsBlock[] = [
    {
      id: id('sp-pb'),
      type: 'divider',
      title: 'Prüferbogen',
      nurLoesung: true,
      pageBreakBefore: true
    },
    info(
      'Ablauf und Rahmen',
      [
        `${land.bezeichnung} · ${setup.gruppe === 3 ? 'Dreiergruppe' : 'Paarprüfung'} · Prüfungszeit je Gruppe ${dauer} min, Vorbereitung ${
          setup.vorbereitung
        } min`,
        `Geprüft werden „${k.monolog}" und „${k.dialog}" (${k.quelle}).`,
        setup.ersetztArbeit ? `Ersetzt eine schriftliche Klassenarbeit. ${land.regel}` : 'Zählt nicht als Ersatz einer schriftlichen Klassenarbeit.',
        'Kartensätze reihum ausgeben: Aufeinanderfolgende Gruppen bekommen verschiedene Sätze.',
        'Zwei Prüfende: eine Person führt das Gespräch, die andere protokolliert und bewertet.'
      ].join('\n'),
      { nurLoesung: true, variant: 'wissen' }
    ),
    {
      id: id('sp-zeit'),
      type: 'table',
      title: 'Zeitplan',
      headers: ['Phase', 'Zeit', 'Wer', 'Was'],
      rows: zeitplan,
      nurLoesung: true
    },
    info('Teil 1 · Einstiegsfragen', punkte(daten.einstieg), {
      nurLoesung: true,
      variant: 'wissen'
    })
  ]
  daten.saetze.forEach((satz, i) => {
    out.push(
      info(
        `Kartensatz ${i + 1}${satz.thema ? ` – ${satz.thema}` : ''}: Nachfragen und Erwartungen`,
        [
          'Nachfragen und Impulse:',
          punkte(satz.nachfragen),
          '',
          'Erwartet im Monolog (beispielhaft, nicht verbindlich):',
          punkte(satz.erwartungMonolog),
          '',
          'Erwartet im Dialog (beispielhaft, nicht verbindlich):',
          punkte(satz.erwartungDialog)
        ].join('\n'),
        { nurLoesung: true, variant: 'wissen' }
      )
    )
  })
  out.push(
    info('Hinweise für die Prüfenden', punkte([...daten.hinweise, ...land.unsicher.map((u) => `Hinweis zur Vorgabe: ${u}`)]), {
      nurLoesung: true,
      variant: 'wissen'
    }),
    {
      id: id('sp-prot'),
      type: 'table',
      title: 'Protokoll (Datum, Gruppe, Kartensatz, Beobachtungen)',
      headers: ['Prüfling', 'Kartensatz', 'Monolog: Beobachtungen', 'Dialog: Beobachtungen'],
      rows: buchstaben.map((b) => [b, '', '', '']),
      rowHeightsMm: buchstaben.map(() => 22),
      nurLoesung: true
    }
  )
  return out
}

/** Bewertungsraster je Prüfling mit Punkten und Notenschlüssel */
export function rasterBausteine(exam: Exam, part: ExamPart, setup: SprechSetup): WsBlock[] {
  const land = sprechLand(exam.meta.stateId)
  const zeilen = rasterZeilen(land.kriterien, part.points)
  const anteile = bereichsAnteile(land.kriterien)
  const buchstaben = Array.from({ length: setup.gruppe }, (_, i) => prueflingsBuchstabe(i))
  const oberstufe = stageForGrade(exam.meta.grade, exam.meta.schoolTypeId) === 'sek2'
  const raster: TableBlock = {
    id: id('sp-raster'),
    type: 'table',
    title: `Bewertungsraster (${part.points} Punkte; Inhalt/Kommunikation ${anteile.inhalt} %, Sprache ${anteile.sprache} %)`,
    headers: ['Kriterium', 'volle Punktzahl, wenn …', 'max.', ...buchstaben.map((b) => `Prüfling ${b}`)],
    rows: [
      ...zeilen.map((z) => [
        `${z.kriterium.label} (${z.gewicht} %)`,
        `${z.kriterium.oben} Mitte: ${z.kriterium.mitte} Unten: ${z.kriterium.unten}`,
        String(z.punkte),
        ...buchstaben.map(() => '')
      ]),
      ['Summe', '', String(part.points), ...buchstaben.map(() => '')],
      [oberstufe ? 'Notenpunkte' : 'Note', '', '', ...buchstaben.map(() => '')]
    ],
    colWidths: setup.gruppe === 3 ? [19, 36, 9, 12, 12, 12] : [21, 41, 9, 14.5, 14.5],
    nurLoesung: true
  }
  const schluessel: TableBlock = {
    id: id('sp-schluessel'),
    type: 'table',
    title: 'Notenschlüssel der Sprechprüfung',
    headers: ['Note', ...punkteJeNote(part.points, exam.meta.gradeScaleThresholds).map((n) => String(n.note))],
    rows: [['ab Punkten', ...punkteJeNote(part.points, exam.meta.gradeScaleThresholds).map((n) => String(n.ab))]],
    nurLoesung: true
  }
  return [
    {
      id: id('sp-bw'),
      type: 'divider',
      title: 'Bewertung',
      nurLoesung: true,
      pageBreakBefore: true
    },
    raster,
    schluessel,
    info('Kriterien und Fundstelle', [`Kriterien und Gewichtung: ${land.lehrplan}.`, ...land.quellen.map((q) => `Quelle: ${q}`)].join('\n'), {
      nurLoesung: true,
      variant: 'wissen'
    })
  ]
}

/** Alle Bausteine des Teils: Karten je Satz, dann Prüferbogen und Raster */
export function sprechBausteine(exam: Exam, part: ExamPart, daten: SprechDaten): WsBlock[] {
  const setup = sprechSetup(exam, part)
  return [
    ...daten.saetze.flatMap((satz, i) => kartenBausteine(exam, setup, satz, i + 1)),
    ...prueferBausteine(exam, setup, daten),
    ...rasterBausteine(exam, part, setup)
  ]
}
