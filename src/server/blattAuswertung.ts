/**
 * Auswertung eines freigegebenen Blatts für die Lehrkraft (05.10.2026; Rechnungen: shared/blattAuswertung.ts).
 *
 * Je Person: Ampel je Aufgabe (bestes KI-Urteil, Freischaltung der Lehrkraft; ohne Feedback je Aufgabe die
 * Kriterien des Bogens), Hinweise zur Eigenständigkeit (eingefügt, sehr schnell, aus dem Material, gleich wie
 * andere) und der Gesamtwert für die Farbe. Je Aufgabe: wer gleiche oder ähnliche Antworten abgegeben hat.
 *
 * Mitarbeit und Hilfestellungen schätzt auf Knopfdruck die KI der Lehrkraft – mit Kürzeln S1, S2 … statt
 * Namen, nach Schulform, Fach und Jahrgang und in der eingestellten Strenge. Ein Vorschlag, kein Urteil.
 */
import type { StructuredRequest } from '../shared/types'
import { ampelVon, type AufgabenVerlauf, type BlattAufgabe } from '../shared/blattFreigabe'
import {
  eigenstaendigkeit,
  eingabeAuffaellig,
  eingabenAus,
  gesamtwert,
  gleicheAbgaben,
  korrektheit,
  MITARBEIT_NOTEN,
  PLAUS_SCHLUESSEL,
  zuordnungAus,
  ZUORDNUNG_SCHLUESSEL,
  type AmpelStand,
  type Auffaelligkeit,
  type FeldEingabe,
  type MitarbeitNote,
  type Strenge
} from '../shared/blattAuswertung'
import { abschrift } from '../shared/abschrift'

export interface PersonRoh {
  id: string
  name: string
  antworten: Record<string, string>
  verlauf: AufgabenVerlauf
  freigeschaltet: number[]
  /** Geöffnete Hilfekarten je Aufgabe (06.10.2026) */
  hilfen?: Record<string, number>
  eingereicht: number
  /** Kriterien des letzten Bogens (nach dem Einreichen) */
  kriterien: string[]
  /** Letzte Rückmeldung je Aufgabe (Gelungen/Fehlt/Schritt) */
  letzte: Record<string, { gelungen?: string; fehlt?: string; schritt?: string } | undefined>
  /** Stärken und nächste Schritte aus dem Bogen */
  staerken: string[]
  schritte: string[]
}

export interface AufgabeAuswertung {
  nr: number
  ampel: AmpelStand | null
  text: string
  auffaellig: Auffaelligkeit[]
  /** Namen der Personen mit gleicher/ähnlicher Antwort */
  gleichMit: { name: string; gleich: boolean }[]
  rueckmeldung?: { gelungen?: string; fehlt?: string; schritt?: string }
  /** Geöffnete Hilfekarten zu dieser Aufgabe (06.10.2026) */
  hilfekarten?: number
}

export interface PersonAuswertung {
  id: string
  name: string
  eingereicht: number
  korrekt: number | null
  eigen: number
  wert: number | null
  aufgaben: AufgabeAuswertung[]
  /** Geöffnete Hilfekarten insgesamt (06.10.2026) */
  hilfekarten: number
  staerken: string[]
  schritte: string[]
}

/** Antworttext einer Aufgabe aus den Feldern, die ihr zugeordnet sind */
const textDerAufgabe = (antworten: Record<string, string>, zuordnung: Record<string, number>, nr: number): string =>
  Object.entries(zuordnung)
    .filter(([, n]) => n === nr)
    .map(([f]) => antworten[f] ?? '')
    .filter((t) => t.trim())
    .join('\n')

export function auswerten(
  aufgaben: BlattAufgabe[],
  personen: PersonRoh[],
  materialText: string
): { personen: PersonAuswertung[]; gleich: { nr: number; gruppen: { namen: string[]; gleich: boolean }[] }[] } {
  const nummern = aufgaben.map((a) => a.nr)
  const name = new Map(personen.map((p) => [p.id, p.name]))
  // Gleiche/ähnliche Antworten je Aufgabe
  const texte = new Map<string, Record<number, string>>()
  for (const p of personen) {
    const z = zuordnungAus(p.antworten[ZUORDNUNG_SCHLUESSEL])
    texte.set(p.id, Object.fromEntries(nummern.map((nr) => [nr, textDerAufgabe(p.antworten, z, nr)])))
  }
  const gleich = nummern.map((nr) => {
    const gruppen = gleicheAbgaben(Object.fromEntries(personen.map((p) => [p.id, texte.get(p.id)?.[nr] ?? ''])))
    return { nr, gruppen: gruppen.map((g) => ({ ids: g.personen, gleich: g.gleich })) }
  })
  const aus = personen.map((p): PersonAuswertung => {
    const z = zuordnungAus(p.antworten[ZUORDNUNG_SCHLUESSEL])
    const eingaben = eingabenAus(p.antworten[PLAUS_SCHLUESSEL])
    const mitFeedback = Object.keys(p.verlauf).length > 0 || p.freigeschaltet.length > 0
    const liste = aufgaben.map((a, i): AufgabeAuswertung => {
      const text = texte.get(p.id)?.[a.nr] ?? ''
      // Eingabeverhalten der Felder dieser Aufgabe zusammen
      const summe = Object.entries(z)
        .filter(([, n]) => n === a.nr)
        .reduce<FeldEingabe>(
          (s, [f]) => {
            const e = eingaben[f]
            return e ? { g: s.g + e.g, e: s.e + e.e, ms: s.ms + e.ms, n: s.n + e.n } : s
          },
          { g: 0, e: 0, ms: 0, n: 0 }
        )
      const auffaellig = eingabeAuffaellig(summe)
      const ab = text.trim() ? abschrift(text, materialText) : null
      if (ab && ab.anteil >= 0.4)
        auffaellig.push({ art: 'material', text: `${Math.round(ab.anteil * 100)} % wörtlich aus dem Material`, gewicht: Math.min(1, ab.anteil) })
      const gruppe = gleich.find((g) => g.nr === a.nr)?.gruppen.find((g) => g.ids.includes(p.id))
      const andere = (gruppe?.ids ?? []).filter((id) => id !== p.id).map((id) => ({ name: name.get(id) ?? '', gleich: Boolean(gruppe?.gleich) }))
      if (andere.length)
        auffaellig.push({
          art: gruppe?.gleich ? 'gleich' : 'aehnlich',
          text: `${gruppe?.gleich ? 'Gleich' : 'Sehr ähnlich'} wie ${andere.map((x) => x.name).join(', ')}`,
          gewicht: gruppe?.gleich ? 0.8 : 0.5
        })
      // Ampel: mit Feedback je Aufgabe aus dem Verlauf; sonst aus dem Bogen (Kriterium i ≈ Aufgabe i), sonst offen
      let ampel: AmpelStand | null = null
      if (mitFeedback) {
        const v = p.verlauf[String(a.nr)]
        ampel = v?.length || p.freigeschaltet.includes(a.nr) ? ampelVon(v, p.freigeschaltet.includes(a.nr)) : text.trim() ? null : 'rot'
      } else if (p.kriterien.length) {
        const k = p.kriterien[Math.min(i, p.kriterien.length - 1)]
        ampel = k === 'sicher' ? 'gruen' : k === 'teilweise' ? 'gelb' : 'rot'
      }
      const hk = p.hilfen?.[String(a.nr)] ?? 0
      return {
        nr: a.nr,
        ampel,
        text,
        auffaellig,
        gleichMit: andere,
        ...(p.letzte[String(a.nr)] ? { rueckmeldung: p.letzte[String(a.nr)] } : {}),
        ...(hk ? { hilfekarten: hk } : {})
      }
    })
    const korrekt = korrektheit(liste.map((l) => l.ampel))
    const eigen = eigenstaendigkeit(
      liste.map((l) => l.auffaellig),
      liste.filter((l) => l.text.trim()).length || 1
    )
    return {
      hilfekarten: liste.reduce((n, l) => n + (l.hilfekarten ?? 0), 0),
      id: p.id,
      name: p.name,
      eingereicht: p.eingereicht,
      korrekt,
      eigen,
      wert: gesamtwert(korrekt, eigen),
      aufgaben: liste,
      staerken: p.staerken,
      schritte: p.schritte
    }
  })
  return {
    personen: aus,
    gleich: gleich.map((g) => ({ nr: g.nr, gruppen: g.gruppen.map((x) => ({ namen: x.ids.map((id) => name.get(id) ?? ''), gleich: x.gleich })) }))
  }
}

const STRENGE_TEXT: Record<Strenge, string> = {
  milde: 'Bewerte wohlwollend: Bemühen und Ansätze zählen deutlich; „--" nur, wenn praktisch nichts bearbeitet wurde.',
  normal: 'Bewerte ausgewogen nach den üblichen Erwartungen für Schulform, Fach und Jahrgang.',
  streng: 'Bewerte streng: „++" nur für vollständige, treffende und eigenständige Bearbeitung; Abschrift und Lücken wiegen schwer.'
}

/** Kontext der Lerngruppe für die Einschätzung */
export interface AuswertungsKontext {
  fach: string
  jahrgang?: number
  schulform?: string
  land?: string
  titel: string
}

export function mitarbeitAnfrage(kontext: AuswertungsKontext, aufgaben: BlattAufgabe[], personen: PersonAuswertung[], strenge: Strenge): StructuredRequest {
  const zeilen = personen.map((p, i) => {
    const je = p.aufgaben
      .map(
        (a) =>
          `  Aufgabe ${a.nr}: ${a.ampel === 'gruen' ? 'treffend' : a.ampel === 'gelb' ? 'teilweise treffend' : a.ampel === 'rot' ? (a.text.trim() ? 'noch nicht treffend' : 'nicht bearbeitet') : 'nicht eingeschätzt'}` +
          (a.auffaellig.length
            ? ` – Hinweise: ${a.auffaellig.map((x) => (x.art === 'gleich' || x.art === 'aehnlich' ? (x.art === 'gleich' ? 'gleich wie andere' : 'ähnlich wie andere') : x.text)).join('; ')}`
            : '') +
          (a.rueckmeldung?.fehlt ? ` – noch offen: ${a.rueckmeldung.fehlt}` : '')
      )
      .join('\n')
    return `S${i + 1} (${p.eingereicht ? `${p.eingereicht}× eingereicht` : 'nicht eingereicht'}):\n${je}`
  })
  return {
    system:
      'Du bist eine erfahrene Lehrkraft und schätzt die Mitarbeit von Lernenden bei einem Arbeitsblatt ein. Du formulierst sachlich, knapp und förderorientiert. Es geht um einen Vorschlag, den die Lehrkraft prüft.',
    user: [
      `ARBEITSBLATT: „${kontext.titel}" · Fach: ${kontext.fach || 'unbekannt'}${kontext.jahrgang ? ` · Jahrgang ${kontext.jahrgang}` : ''}${kontext.schulform ? ` · Schulform: ${kontext.schulform}` : ''}${kontext.land ? ` · Bundesland: ${kontext.land}` : ''}`,
      `AUFGABEN:\n${aufgaben.map((a) => `- Aufgabe ${a.nr}: ${a.anweisung.slice(0, 300)}`).join('\n')}`,
      'Regeln:',
      '- Schlage je Person eine Mitarbeitsnote vor: „++" (sehr gut), „+" (gut), „0" (befriedigend), „-" (mangelhaft ansatzweise), „--" (unzureichend).',
      '- Grundlage: Vollständigkeit, Treffsicherheit und Eigenständigkeit, gemessen an den Erwartungen für Schulform, Fach und Jahrgang.',
      `- Strenge: ${STRENGE_TEXT[strenge]}`,
      '- Hinweise zu Eingefügtem, Tempo, Material-Abschrift oder gleichen Antworten sind Indizien, keine Beweise – berücksichtige sie maßvoll und nenne sie in der Begründung.',
      '- hilfen: 1–3 konkrete Hilfestellungen, die diese Person als Nächstes braucht (z. B. „Tippkarte zu Aufgabe 2: Belege mit Zeilenangabe", „Satzanfänge für die Begründung"). Keine Lösungen.',
      '- begruendung: ein bis zwei Sätze für die Lehrkraft.',
      '- Verwende nur die Kennungen S1, S2 …; erfinde keine Namen.',
      'LERNENDE:',
      zeilen.join('\n\n')
    ].join('\n'),
    schemaName: 'blatt_mitarbeit',
    schema: {
      type: 'object',
      properties: {
        personen: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kennung: { type: 'string' },
              note: { type: 'string', enum: MITARBEIT_NOTEN },
              begruendung: { type: 'string' },
              hilfen: { type: 'array', items: { type: 'string' } }
            },
            required: ['kennung', 'note', 'begruendung', 'hilfen'],
            additionalProperties: false
          }
        }
      },
      required: ['personen'],
      additionalProperties: false
    }
  }
}

export interface MitarbeitVorschlag {
  note: MitarbeitNote
  begruendung: string
  hilfen: string[]
}

/**
 * KI-Antwort → je Personen-Kennung (Datenbank-ID) ein Vorschlag; Unbekanntes fällt weg. Die Kürzel S1, S2 …
 * in Begründung und Hilfen werden wieder zu Namen – die KI hat nur Kürzel gesehen.
 */
export function mitarbeitAus(roh: unknown, personen: { id: string; name?: string }[]): Record<string, MitarbeitVorschlag> {
  const klar = (t: string): string => t.replace(/\bS(\d{1,3})\b/g, (k, n: string) => personen[Number(n) - 1]?.name || k)
  const liste = Array.isArray((roh as { personen?: unknown })?.personen) ? ((roh as { personen: unknown[] }).personen as Record<string, unknown>[]) : []
  const aus: Record<string, MitarbeitVorschlag> = {}
  for (const x of liste) {
    const i = Number(/^S(\d+)$/i.exec(String(x.kennung ?? '').trim())?.[1]) - 1
    const p = personen[i]
    const note = String(x.note ?? '') as MitarbeitNote
    if (!p || !MITARBEIT_NOTEN.includes(note)) continue
    aus[p.id] = {
      note,
      begruendung: klar(String(x.begruendung ?? '').slice(0, 600)),
      hilfen: (Array.isArray(x.hilfen) ? x.hilfen : [])
        .map((h) => klar(String(h).slice(0, 240)))
        .filter(Boolean)
        .slice(0, 4)
    }
  }
  return aus
}
