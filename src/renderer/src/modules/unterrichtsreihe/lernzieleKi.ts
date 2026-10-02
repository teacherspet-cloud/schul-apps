/**
 * Lernziele einer Unterrichtsreihe und ihrer Schritte (02.10.2026, Wunsch der Lehrkraft): „anhand
 * der Kerncurricula des jeweiligen Bundeslandes vom Lehrer ausgewählt oder von der KI generiert".
 *
 * Grundlage ist der Auszug aus dem Kerncurriculum (resources/lehrplaene/<LAND>.json, amtlich
 * belegte Themen samt Quelle), den die Lehrkraft beim Oberthema wählt. Die KI formuliert daraus
 * überprüfbare Kompetenzen (mit Operator) UND die Schülerfassung „Ich kann …".
 */
import type { StructuredRequest } from '@shared/types'
import type { Lernziel, Reihe, Schritt } from '@shared/reihe'

type Ki = <T>(req: StructuredRequest) => Promise<T>

const SCHEMA = {
  type: 'object',
  properties: {
    lernziele: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, ichKann: { type: 'string' } },
        required: ['text', 'ichKann'],
        additionalProperties: false
      }
    }
  },
  required: ['lernziele'],
  additionalProperties: false
}

const REGELN = [
  'REGELN:',
  '- "text": Kompetenz für die Lehrkraft – ein Satz mit Operator (nennen, beschreiben, erklären, vergleichen, beurteilen …), konkret auf Gegenstand und Jahrgang bezogen, überprüfbar.',
  '- "ichKann": dieselbe Kompetenz für die Lernenden – „Ich kann …", höchstens 18 Wörter, in einfacher Sprache des Jahrgangs, ohne Fachbegriffe, die erst gelernt werden sollen, ohne Prozent- oder Notenangaben.',
  '- Keine allgemeinen Formeln („Ich kann mich mit dem Thema auseinandersetzen"); jedes Ziel ein anderer Aspekt.',
  '- Nur, was das Kerncurriculum für diesen Jahrgang hergibt; nichts erfinden, was dort nicht angelegt ist.'
].join('\n')

const kopf = (r: Pick<Reihe, 'fachLabel' | 'grade' | 'stateId' | 'schoolTypeId'>): string =>
  `${r.fachLabel}, Klasse ${r.grade}, Schulform ${r.schoolTypeId}, Bundesland ${r.stateId}`

const bereinigt = (roh: unknown, hoechstens: number, quelle?: string): Lernziel[] =>
  ((roh as { lernziele?: { text?: unknown; ichKann?: unknown }[] })?.lernziele ?? [])
    .map((l) => ({ text: String(l.text ?? '').trim(), ichKann: String(l.ichKann ?? '').trim(), ...(quelle ? { quelle } : {}) }))
    .filter((l) => l.text && l.ichKann)
    .slice(0, hoechstens)

/** Übergeordnete Lernziele der Reihe (3–5) aus dem Kerncurriculum */
export async function reihenLernziele(r: Reihe, kc: { auszug: string[]; quelle: string }, ki: Ki): Promise<Lernziel[]> {
  const d = await ki({
    system: `Du planst eine Unterrichtsreihe (${kopf(r)}) und formulierst ihre übergeordneten Lernziele aus dem Kerncurriculum.`,
    user: [
      REGELN,
      '- 3 bis 5 Lernziele, die zusammen die ganze Reihe abdecken.',
      `OBERTHEMA: ${r.oberthema || r.titel}`,
      r.titel ? `TITEL DER REIHE: ${r.titel}` : '',
      kc.auszug.length
        ? `AUSZUG AUS DEM KERNCURRICULUM (${kc.quelle}):\n${kc.auszug.map((a) => `- ${a}`).join('\n')}`
        : 'Kein Auszug vorhanden – orientiere dich am üblichen Kerncurriculum dieses Landes und Jahrgangs.',
      r.schritte.length ? `GEPLANTE SCHRITTE: ${r.schritte.map((s) => s.titel).join('; ')}` : ''
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'reihe_lernziele',
    schema: SCHEMA
  })
  return bereinigt(d, 5, kc.quelle || undefined)
}

/** Lernziele eines Schritts (1–3), eingeordnet unter die Ziele der Reihe */
export async function schrittLernziele(r: Reihe, s: Schritt, beschreibung: string, ki: Ki): Promise<Lernziel[]> {
  const d = await ki({
    system: `Du formulierst die Lernziele EINES Schritts einer Unterrichtsreihe (${kopf(r)}), abgeleitet aus genau diesem Schritt.`,
    user: [
      REGELN,
      '- 1 bis 3 Lernziele; jedes ordnet sich einem Ziel der Reihe unter und nennt den konkreten Gegenstand dieses Schritts.',
      `REIHE: ${r.titel} (Oberthema: ${r.oberthema})`,
      r.lernziele.length ? `ZIELE DER REIHE:\n${r.lernziele.map((l) => `- ${l.text}`).join('\n')}` : '',
      `SCHRITT: ${s.titel} (${s.inhalt.art})`,
      beschreibung ? `INHALT DES SCHRITTS:\n${beschreibung.slice(0, 6000)}` : ''
    ]
      .filter(Boolean)
      .join('\n'),
    schemaName: 'schritt_lernziele',
    schema: SCHEMA
  })
  return bereinigt(d, 3)
}

/** Fehlende Schülerfassungen („Ich kann …") zu ausgewählten Kerncurriculum-Zielen */
export async function ichKannFormulieren(r: Reihe, ziele: Lernziel[], ki: Ki): Promise<Lernziel[]> {
  const offen = ziele.filter((z) => !z.ichKann.trim())
  if (!offen.length) return ziele
  const d = await ki({
    system: `Du formulierst Lernziele einer Unterrichtsreihe (${kopf(r)}) für die Lernenden um.`,
    user: [
      REGELN,
      '- Gib GENAU so viele Lernziele zurück wie unten stehen, in derselben Reihenfolge; "text" ist eine geschärfte Fassung der Vorlage.',
      `OBERTHEMA: ${r.oberthema || r.titel}`,
      'VORLAGEN:',
      ...offen.map((z, i) => `${i + 1}. ${z.text}`)
    ].join('\n'),
    schemaName: 'ich_kann',
    schema: SCHEMA
  })
  const neu = bereinigt(d, offen.length)
  let i = 0
  return ziele.map((z) => {
    if (z.ichKann.trim()) return z
    const n = neu[i++]
    return n ? { ...z, ichKann: n.ichKann } : z
  })
}
