/**
 * Bewertungsraster zu einer Aufgabe (Großprogramm 0.4, F2).
 *
 * Ein analytisches Raster: Kriterien in Zeilen, Leistungsstufen in Spalten, in jeder Zelle eine
 * Beschreibung, was auf dieser Stufe zu sehen ist. Es entsteht aus der Aufgabe (und ihrem
 * Erwartungshorizont) und wird als gewöhnliche Tabelle direkt hinter die Aufgabe gesetzt –
 * voreingestellt NUR im Lösungsteil. Über die Einstellung „Nur im Lösungsteil" am Baustein kann
 * die Lehrkraft es auch den Lernenden zeigen (transparente Kriterien vor dem Schreiben).
 *
 * Gliederung nach der üblichen Trennung: bei Schreibaufgaben Inhalt und Sprache (Fremdsprachen)
 * bzw. Inhalt und Darstellung (Deutsch); sonst nach den Anforderungen der Aufgabe.
 */
import type { StructuredRequest } from '@shared/types'
import { arr, int, obj, str } from '../aiSchema'

export interface RasterStufe {
  name: string
  /** Punkte dieser Stufe je Kriterium (leer = ohne Punkte) */
  punkte?: number
}

export interface RasterKriterium {
  name: string
  /** Bereich: inhalt, sprache, darstellung, methode … (für die Gliederung) */
  bereich: string
  /** Eine Beschreibung je Stufe, gleiche Reihenfolge wie `stufen` */
  beschreibungen: string[]
  /** Gewicht bzw. Höchstpunkte dieses Kriteriums */
  punkte?: number
}

export interface Bewertungsraster {
  titel: string
  stufen: RasterStufe[]
  kriterien: RasterKriterium[]
}

const SCHEMA = obj({
  stufen: arr(obj({ name: str('Bezeichnung der Stufe, z. B. „voll erfüllt"'), punkte: int('Anteil der Höchstpunkte in Prozent, den diese Stufe erreicht (100, 66, 33, 0)') })),
  kriterien: arr(
    obj({
      name: str('Kriterium, knapp (z. B. „Aufbau und Gliederung")'),
      bereich: str('inhalt | sprache | darstellung | methode'),
      beschreibungen: arr(str('Was auf dieser Stufe zu sehen ist – konkret auf DIESE Aufgabe bezogen, höchstens 20 Wörter')),
      punkte: int('Höchstpunkte dieses Kriteriums')
    })
  )
})

export interface RasterWunsch {
  /** Lerngruppen-Profil des Programms */
  system: string
  /** Die Aufgabe als Text (Anweisung, Teilaufgaben, Situation) */
  aufgabe: string
  /** Erwartungshorizont, falls vorhanden */
  loesung?: string
  /** Punkte der Aufgabe (0 = ohne Punkte) */
  punkte: number
  /** Bei Schreibaufgaben: Anteil des Inhalts in Prozent und Name des zweiten Teils */
  aufteilung?: { inhalt: number; zweiter: 'Sprache' | 'Darstellung' }
  stufen?: number
}

export function rasterAnfrage(w: RasterWunsch): StructuredRequest {
  const stufen = w.stufen ?? 4
  return {
    system: w.system,
    user: [
      `Erstelle ein analytisches Bewertungsraster zu dieser Aufgabe: ${stufen} Leistungsstufen, 4–7 Kriterien.`,
      'REGELN:',
      '- Die Stufen vom Besten zum Schwächsten, z. B. „voll erfüllt", „überwiegend erfüllt", „teilweise erfüllt", „nicht erfüllt".',
      '- Jede Beschreibung nennt, was auf dieser Stufe an DIESER Aufgabe zu sehen ist (Inhaltspunkte, Textsortenmerkmale, sprachliche Mittel) – keine allgemeinen Floskeln.',
      '- Beobachtbar und unterscheidbar: Benachbarte Stufen unterscheiden sich in einem prüfbaren Merkmal.',
      w.aufteilung
        ? `- Gliederung: Kriterien mit bereich „inhalt" zusammen ${w.aufteilung.inhalt} %, Kriterien mit bereich „${w.aufteilung.zweiter === 'Sprache' ? 'sprache' : 'darstellung'}" zusammen ${100 - w.aufteilung.inhalt} % der Punkte.`
        : '- Gliederung nach den Anforderungen der Aufgabe (Inhalt, Methode, Darstellung).',
      w.punkte > 0 ? `- Die Höchstpunkte aller Kriterien ergeben zusammen GENAU ${w.punkte}.` : '- Ohne Punkte: punkte je Kriterium 0.',
      'AUFGABE:',
      w.aufgabe,
      w.loesung ? `ERWARTUNGSHORIZONT:\n${w.loesung}` : ''
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'bewertungsraster',
    schema: SCHEMA
  }
}

/** Verteilt `summe` verhältnisgleich auf ganze Zahlen (größter Rest zuerst) */
function verteile(gewichte: number[], summe: number): number[] {
  const g = gewichte.map((x) => Math.max(0, x))
  const gesamt = g.reduce((n, x) => n + x, 0) || g.length
  const roh = g.map((x) => ((gesamt === g.length && !g.some(Boolean) ? 1 : x) * summe) / gesamt)
  const ganz = roh.map(Math.floor)
  let rest = summe - ganz.reduce((n, x) => n + x, 0)
  const reihenfolge = roh.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r)
  for (const { i } of reihenfolge) {
    if (rest <= 0) break
    ganz[i]++
    rest--
  }
  return ganz
}

/** Antwort der KI → Raster; Punkte genau auf die Summe gebracht, Beschreibungen passend zur Stufenzahl */
export function rasterAus(daten: unknown, titel: string, punkte: number): Bewertungsraster {
  const d = (daten ?? {}) as { stufen?: unknown; kriterien?: unknown }
  const stufen = (Array.isArray(d.stufen) ? d.stufen : [])
    .map((s) => (s ?? {}) as Record<string, unknown>)
    .filter((s) => String(s.name ?? '').trim())
    .map((s) => ({ name: String(s.name).trim(), anteil: Number(s.punkte) }))
  if (stufen.length < 2) throw new Error('Die KI hat keine Leistungsstufen geliefert.')
  const kriterien = (Array.isArray(d.kriterien) ? d.kriterien : [])
    .map((k) => (k ?? {}) as Record<string, unknown>)
    .filter((k) => String(k.name ?? '').trim())
    .map((k) => {
      const b = (Array.isArray(k.beschreibungen) ? k.beschreibungen : []).map((x) => String(x ?? '').trim())
      return {
        name: String(k.name).trim(),
        bereich: String(k.bereich ?? '').trim() || 'inhalt',
        beschreibungen: stufen.map((_, i) => b[i] ?? ''),
        punkte: Math.max(0, Math.round(Number(k.punkte) || 0))
      }
    })
  if (!kriterien.length) throw new Error('Die KI hat keine Kriterien geliefert.')
  const verteilt = punkte > 0 ? verteile(kriterien.map((k) => k.punkte || 1), punkte) : kriterien.map(() => 0)
  return {
    titel,
    stufen: stufen.map((s) => ({ name: s.name, ...(Number.isFinite(s.anteil) && punkte > 0 ? { punkte: Math.max(0, Math.min(100, Math.round(s.anteil))) } : {}) })),
    kriterien: kriterien.map((k, i) => ({ ...k, ...(punkte > 0 ? { punkte: verteilt[i] } : { punkte: undefined }) }))
  }
}

const BEREICH: Record<string, string> = { inhalt: 'Inhalt', sprache: 'Sprache', darstellung: 'Darstellung', methode: 'Methode' }

/**
 * Das Raster als Tabelle (Kopf: Kriterium, Stufen; Zeilen: Kriterien). Bei Punkten steht in der
 * Stufenspalte der Punktbereich je Kriterium („3 P."), am Kriterium die Höchstpunkte.
 */
export function rasterAlsTabelle(r: Bewertungsraster): { title: string; headers: string[]; rows: string[][] } {
  const mitPunkten = r.kriterien.some((k) => (k.punkte ?? 0) > 0)
  const bereiche = new Set(r.kriterien.map((k) => k.bereich))
  const headers = ['Kriterium', ...r.stufen.map((s) => s.name)]
  const rows = r.kriterien.map((k) => {
    const name = `${bereiche.size > 1 && BEREICH[k.bereich] ? `${BEREICH[k.bereich]}: ` : ''}**${k.name}**${mitPunkten ? ` (${k.punkte} P.)` : ''}`
    return [
      name,
      ...k.beschreibungen.map((b, i) => {
        const anteil = r.stufen[i]?.punkte
        const p = mitPunkten && anteil !== undefined ? ` (${Math.round(((k.punkte ?? 0) * anteil) / 100)} P.)` : ''
        return `${b}${p}`
      })
    ]
  })
  return { title: r.titel, headers, rows }
}
