/**
 * Bewertungstabelle der Rückmeldung (29.09.2026, Wunsch der Lehrkraft): hineinziehen (PDF,
 * Word, Excel, CSV, Foto) oder aus Aufgaben und Erwartungshorizont von der KI entwerfen lassen.
 * Sie gilt für alle Abgaben einer Rückmeldung und lässt sich als Vorlage ablegen
 * (Ablage „bewertungstabellen").
 *
 * Kriterien mit Höchstpunktzahl werden mit Punkten bewertet, die übrigen über Stufen (beste
 * zuerst). Der Erfüllungsgrad für die Einstufung ergibt sich in art.ts (`tabellenSumme`).
 */
import type { StructuredRequest } from '@shared/types'
import { arr, int, obj, str } from '../../shared/aiSchema'
import { newId } from '../vokabeltest/model/random'
import { EINSTUFUNGEN, einstufungVon } from './art'
import { inhalt, type GeleseneDatei } from './aufgabeAusMaterial'
import type { Bewertungstabelle, Rueckmeldung, TabellenKriterium } from './model/types'
import { gerNiveau, oberstufeVon, sprachfach, umfangAusText } from './sprachmassstab'
import { fremdsprachlich, getrennt, inhaltVorgabe } from './teilbewertung'

export const STANDARD_STUFEN = ['voll erfüllt', 'überwiegend erfüllt', 'teilweise erfüllt', 'noch nicht erfüllt']

const TABELLE_SCHEMA = obj({
  titel: str('Titel der Bewertungstabelle'),
  stufen: arr(str('Stufe, beste zuerst (z. B. „voll erfüllt“) – nur für Kriterien ohne Punkte; sonst leere Liste')),
  kriterien: arr(
    obj({
      bereich: str('Bereich, z. B. „Inhalt“ oder „Darstellung/Sprache“ – leer, wenn es keine Bereiche gibt'),
      kriterium: str('Das Kriterium, konkret und prüfbar'),
      punkte: int('Höchstpunktzahl des Kriteriums – 0, wenn über Stufen bewertet wird'),
      deskriptoren: arr(
        str('Beschreibung je Stufe in der Reihenfolge der Stufen (beste zuerst); bei Kriterien mit Punkten je Stufe mit Punktspanne („18–20 P.: …“) – sonst leere Liste')
      )
    })
  )
})

export function tabelleAusDateiAnfrage(dateien: GeleseneDatei[]): StructuredRequest {
  const { text, bilder } = inhalt(dateien)
  return {
    system: 'Du überträgst Bewertungstabellen (Bewertungsraster, Erwartungshorizonte mit Punkten) wortgetreu in eine Datenstruktur. Du erfindest nichts.',
    user: [
      'Übertrage die folgende Bewertungstabelle. Kriterien und Punktzahlen WÖRTLICH übernehmen; Bereiche (z. B. Inhalt, Darstellungsleistung) als „bereich“.',
      'Hat die Tabelle Stufen statt Punkten (z. B. „vollständig / teilweise / nicht“), trage die Stufen in „stufen“ ein und je Kriterium die Beschreibungen in „deskriptoren“; punkte = 0.',
      'Summenzeilen, Notenschlüssel und Unterschriftenfelder gehören NICHT zu den Kriterien.',
      'TABELLE:',
      text
    ].join('\n'),
    ...(bilder.length ? { images: bilder } : {}),
    schemaName: 'rueckmeldung_tabelle',
    schema: TABELLE_SCHEMA
  }
}

/**
 * Sprachliche Kriterien für Schreib- und Sprachmittlungsaufgaben (29.09.2026, Fehlerbericht: eine
 * Abgabe von gut 20 Wörtern bekam 18/20 für Sprachrichtigkeit). Die Bereiche folgen den Rastern
 * von KMK/IQB und der Länder (NRW: kommunikative Textgestaltung, Ausdrucksvermögen/Verfügbarkeit
 * sprachlicher Mittel, Sprachrichtigkeit) – recherche/sprachliche-bewertungsmassstaebe-2026-09-29.md.
 */
export function sprachKriterienAnweisung(r: Rueckmeldung): string[] {
  const m = r.meta
  if (!sprachfach(m.subjectId) || m.subjectId === 'latein') return []
  const oberstufe = oberstufeVon(m)
  const fremd = fremdsprachlich(m.subjectId)
  const umfang = umfangAusText(r.grundlage.aufgaben, r.grundlage.erwartung)
  const art = r.grundlage.teile?.find(getrennt)?.art ?? 'schreiben'
  const inhalt = fremd ? inhaltVorgabe(m.stateId, m.grade, art, m.schoolTypeId).inhalt : 0
  const niveau = gerNiveau(m.grade, m.subjectId, oberstufe)
  return [
    'Gliedere in die Bereiche „Inhalt“ und „Darstellung/Sprache“ (Bereichsname genau so).',
    fremd
      ? `Gewichtung, wenn das Material nichts anderes angibt: Inhalt etwa ${inhalt} %, Darstellung/Sprache etwa ${100 - inhalt} % der Punkte.`
      : 'Gewichtung, wenn das Material nichts anderes angibt: Inhalt bzw. Verstehensleistung deutlich höher als die Darstellungsleistung (üblich etwa 70 : 30).',
    'Für Schreib- und Sprachmittlungsaufgaben im Bereich „Darstellung/Sprache“ mindestens diese drei Kriterien, jeweils mit Stufenbeschreibungen (deskriptoren, beste Stufe zuerst):',
    `  1. Kommunikative Textgestaltung: Textsortenmerkmale, Adressaten- und Situationsbezug, Aufbau, Gliederung, Kohärenz, Leserführung${umfang ? ` und der verlangte Umfang (${umfang.stelle})` : ' und angemessener Umfang'}.`,
    fremd
      ? '  2. Ausdrucksvermögen/Verfügbarkeit sprachlicher Mittel: Spektrum und Komplexität von Wortschatz und Satzbau, Präzision, Differenziertheit, Idiomatik, Variation, Eigenständigkeit (keine Übernahme deutscher Strukturen).'
      : '  2. Ausdruck und Stil: Wortschatz, Satzbau, Fachsprache, Stil- und Registerangemessenheit, Präzision und Variation.',
    '  3. Sprachrichtigkeit (Grammatik, Wortschatz, Orthografie, Zeichensetzung) IM VERHÄLTNIS ZUR KOMPLEXITÄT: Die beste Stufe verlangt weitgehende Korrektheit auch bei komplexen Strukturen und angemessenem Umfang; wenige, einfache, fehlerfreie Sätze reichen höchstens für eine mittlere Stufe; ein deutlich zu kurzer Text ist sprachlich nur eingeschränkt bewertbar.',
    `Maßstab der Stufen: ${m.schoolTypeName || 'Sekundarstufe'}, Klasse ${m.grade}${niveau ? `, erwartetes Niveau GER ${niveau}` : ''}${oberstufe ? '; Oberstufe: Ist Inhalt oder Sprache ungenügend, höchstens 3 Notenpunkte' : ''}.`
  ]
}

export function tabelleEntwurfAnfrage(r: Rueckmeldung): StructuredRequest {
  const art = einstufungVon(r.meta)
  const mitPunkten = art === 'notenpunkte' || art === 'note' || art === 'noteTendenz'
  const skala = EINSTUFUNGEN.find((e) => e.id === art)?.label ?? 'ohne Einstufung'
  const sprache = sprachKriterienAnweisung(r)
  return {
    system: `Du bist eine erfahrene Lehrkraft für ${r.meta.subjectLabel} (Klasse ${r.meta.grade}, ${r.meta.schoolTypeName || 'Sekundarstufe'}) und entwirfst kriteriengeleitete Bewertungstabellen, wie sie Fachkonferenzen verwenden.`,
    user: [
      'Entwirf eine Bewertungstabelle zu dieser Aufgabe – Kriterien aus Aufgabenstellung und Erwartungshorizont, konkret und an der Arbeit prüfbar, 4–10 Kriterien.',
      mitPunkten
        ? 'Bewertet wird mit PUNKTEN (Bewertungseinheiten): je Kriterium eine Höchstpunktzahl nach Gewicht und Anforderungsbereich; „stufen“ bleibt leer.'
        : 'Bewertet wird über STUFEN statt Punkten (vier Stufen, beste zuerst); je Kriterium eine kurze Beschreibung jeder Stufe; punkte = 0.',
      ...(sprache.length
        ? sprache
        : [
            r.meta.subjectId === 'latein'
              ? 'Gliedere in die Bereiche „Inhalt“ und „Darstellung/Sprache“, wie in Sprachfächern üblich.'
              : 'Gliedere nach Aufgaben oder Anforderungsbereichen, wenn es hilft.'
          ]),
      `Einstufung der Lehrkraft: ${skala}.`,
      r.meta.schwerpunkt.trim() ? `SCHWERPUNKT DER LEHRKRAFT: ${r.meta.schwerpunkt.trim()}` : '',
      `AUFGABE${r.grundlage.titel ? ` (${r.grundlage.titel})` : ''}:`,
      r.grundlage.aufgaben,
      r.grundlage.erwartung ? `ERWARTUNGSHORIZONT:\n${r.grundlage.erwartung}` : ''
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'rueckmeldung_tabelle',
    schema: TABELLE_SCHEMA
  }
}

export function tabelleAus(daten: unknown, quelle: Bewertungstabelle['quelle']): Bewertungstabelle {
  const d = (daten ?? {}) as Record<string, unknown>
  const liste = (x: unknown): string[] => (Array.isArray(x) ? x.map((s) => String(s ?? '').trim()).filter(Boolean) : [])
  const stufen = liste(d.stufen)
  const kriterien: TabellenKriterium[] = (Array.isArray(d.kriterien) ? d.kriterien : [])
    .map((k) => (k ?? {}) as Record<string, unknown>)
    .filter((k) => String(k.kriterium ?? '').trim())
    .map((k) => {
      const punkte = Math.round(Number(k.punkte) || 0)
      const deskriptoren = liste(k.deskriptoren)
      return {
        id: newId(),
        kriterium: String(k.kriterium).trim(),
        ...(String(k.bereich ?? '').trim() ? { bereich: String(k.bereich).trim() } : {}),
        ...(punkte > 0 ? { punkte } : {}),
        // Stufenbeschreibungen auch bei Punkten (29.09.2026) – die KI bewertet danach
        ...(deskriptoren.length ? { deskriptoren } : {})
      }
    })
  if (!kriterien.length) throw new Error('In der Tabelle wurden keine Kriterien erkannt.')
  return {
    titel: String(d.titel ?? '').trim() || 'Bewertungstabelle',
    kriterien,
    // Ohne erkannte Stufen gelten die Standardstufen – für Kriterien ohne Punkte
    stufen: stufen.length >= 2 ? stufen : STANDARD_STUFEN,
    quelle,
    ...(quelle === 'ki' ? { entwurf: true } : {})
  }
}

/** Leere Tabelle zum Selbst-Ausfüllen */
export const leereTabelle = (): Bewertungstabelle => ({
  titel: 'Bewertungstabelle',
  kriterien: [{ id: newId(), kriterium: '', punkte: 4 }],
  stufen: STANDARD_STUFEN,
  quelle: 'eigen'
})

/** Die Tabelle als Text für die Bogen-Anfrage (mit Kennungen, die die KI zurückgibt) */
export function tabelleText(t: Bewertungstabelle): string {
  const zeilen = t.kriterien.map((k) => {
    const art = k.punkte ? `max. ${k.punkte} Punkte` : `Stufen: ${t.stufen.map((s, i) => `${i} = ${s}`).join(', ')}`
    const desk = !k.punkte && k.deskriptoren?.length
      ? ` (${k.deskriptoren.map((d, i) => `${i}: ${d}`).join('; ')})`
      : k.deskriptoren?.length
        ? ` (Stufen: ${k.deskriptoren.join('; ')})`
        : ''
    return `- [${k.id}] ${k.bereich ? `${k.bereich}: ` : ''}${k.kriterium} – ${art}${desk}`
  })
  return [`BEWERTUNGSTABELLE „${t.titel}":`, ...zeilen].join('\n')
}

/** Excel-Tabelle als Text (Zellen mit Tabulator) – die KI ordnet sie dann ein */
export async function excelAlsText(file: File): Promise<string> {
  const { readSheet } = await import('read-excel-file/browser')
  const rows = await readSheet(file)
  return rows.map((r) => r.map((c) => (c == null ? '' : String(c))).join('\t')).join('\n')
}
