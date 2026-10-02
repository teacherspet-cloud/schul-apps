/**
 * KI-Bewertung offener Antworten im Onlinetest (02.10.2026).
 *
 * Gesammelt je Aufgabe über alle Abgaben: EINE Anfrage statt einer je Schülerin oder Schüler
 * (Kontingent). Die KI sieht nur Kennungen (A1, A2 …), Aufgabenstellung, Erwartung und Antwort –
 * nie einen Namen. Ganz oder gar nicht (keine halben Punkte, Entscheidung der Lehrkraft).
 *
 * Maßstab (Faustregel der App, von der Lehrkraft überstimmbar): richtig ist eine Antwort, die die
 * Aufgabe erfüllt (z. B. das vorgegebene Wort benutzt), inhaltlich passt und sprachlich korrekt
 * ist. Andere Formulierungen als die Musterlösung sind ausdrücklich richtig, wenn sie das leisten.
 */
import type { StructuredRequest } from '@shared/types'

export interface KiFall {
  /** Kennung für die KI (A1 …) – wird auf Teilnahme und Feld zurückgeführt */
  id: string
  frage: string
  erwartung: string
  antwort: string
}

export interface KiUrteil {
  id: string
  richtig: boolean
  begruendung: string
}

export function kiAnfrage(zielsprache: string, niveau: string, faelle: KiFall[]): StructuredRequest {
  return {
    schemaName: 'onlinetest_bewertung',
    system: [
      `Du bewertest Antworten aus einem Vokabeltest (Zielsprache: ${zielsprache}, Niveau ${niveau}) für eine Lehrkraft.`,
      'Jede Antwort ist entweder RICHTIG (volle Punkte) oder FALSCH (0 Punkte) – Teilpunkte gibt es nicht.',
      'RICHTIG, wenn die Antwort die Aufgabe erfüllt (z. B. das vorgegebene Wort tatsächlich benutzt), inhaltlich zur Aufgabe passt und sprachlich korrekt ist (Rechtschreibung des geprüften Wortes, Grammatik).',
      'Die Erwartung ist EINE mögliche Lösung: Andere Formulierungen sind richtig, wenn sie dasselbe leisten. Sei fair, aber nicht großzügig: Ein falsch geschriebenes Zielwort oder ein falscher Satzbau ist falsch.',
      'Bei Begründungen (Odd one out, Korrekturen): richtig, wenn die Begründung sachlich stimmt und das Gemeinte klar wird – auch kurz.',
      'Leere oder sinnlose Antworten sind falsch.',
      'begruendung: ein kurzer Satz auf Deutsch für die Lehrkraft, warum (bei falsch: was fehlt oder falsch ist).'
    ].join('\n'),
    user: faelle.map((f) => `${f.id}\nAufgabe: ${f.frage}\nErwartung (Beispiel): ${f.erwartung || '–'}\nAntwort: ${f.antwort.trim() || '(leer)'}`).join('\n\n'),
    schema: {
      type: 'object',
      properties: {
        urteile: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, richtig: { type: 'boolean' }, begruendung: { type: 'string' } },
            required: ['id', 'richtig', 'begruendung'],
            additionalProperties: false
          }
        }
      },
      required: ['urteile'],
      additionalProperties: false
    }
  }
}

/** Urteile nur für bekannte Kennungen, je Kennung das erste */
export function urteileAus(antwort: unknown, faelle: KiFall[]): Map<string, KiUrteil> {
  const out = new Map<string, KiUrteil>()
  const bekannt = new Set(faelle.map((f) => f.id))
  const liste = (antwort as { urteile?: unknown })?.urteile
  if (!Array.isArray(liste)) return out
  for (const u of liste as Partial<KiUrteil>[]) {
    if (typeof u?.id !== 'string' || !bekannt.has(u.id) || out.has(u.id) || typeof u.richtig !== 'boolean') continue
    out.set(u.id, { id: u.id, richtig: u.richtig, begruendung: String(u.begruendung ?? '').slice(0, 300) })
  }
  return out
}
