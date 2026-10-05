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
 *
 * Seit 02.10.2026 (Wunsch der Lehrkraft) prüft die KI auch die automatisch als falsch gewerteten
 * Wort-Antworten darauf, ob sie im Zusammenhang sinnvoll sind, und unterscheidet kleine Fehler
 * (Rechtschreibung, Präposition, Artikel …). Beides entscheidet die Lehrkraft – die KI vergibt
 * dafür keine Punkte (Urteil „kleinerFehler" bzw. „vertretbar").
 */
import type { StructuredRequest } from '@shared/types'

export interface KiFall {
  /** Kennung für die KI (A1 …) – wird auf Teilnahme und Feld zurückgeführt */
  id: string
  frage: string
  erwartung: string
  antwort: string
  /** Wortlösung (genau): Die Erwartung ist DIE Lösung, geprüft wird nur, ob die Abweichung vertretbar ist */
  wortloesung?: boolean
}

export type KiUrteilArt = 'richtig' | 'kleinerFehler' | 'vertretbar' | 'falsch'

export interface KiUrteil {
  id: string
  urteil: KiUrteilArt
  /** richtig = volle Punkte (nur bei urteil „richtig") */
  richtig: boolean
  begruendung: string
}

/**
 * `andere` (05.10.2026): Grammatiktest oder Lernzielkontrolle – dann zählt, ob die Antwort die Aufgabe inhaltlich
 * trifft (Fachbegriffe, Zusammenhänge), nicht die Wortgenauigkeit eines Vokabeltests.
 */
export function kiAnfrage(zielsprache: string, niveau: string, faelle: KiFall[], andere?: { art: string; fach: string }): StructuredRequest {
  return {
    schemaName: 'onlinetest_bewertung',
    system: [
      andere
        ? `Du bewertest Antworten aus einem Onlinetest (${andere.art}, Fach ${andere.fach}) für eine Lehrkraft. Maßstab ist, ob die Antwort die Aufgabe fachlich trifft – andere Formulierungen sind richtig, wenn sie dasselbe leisten; bei Fremdsprachen (Grammatik) zählt zusätzlich die sprachliche Richtigkeit.`
        : `Du bewertest Antworten aus einem Vokabeltest (Zielsprache: ${zielsprache}, Niveau ${niveau}) für eine Lehrkraft.`,
      'Jede Antwort ist entweder RICHTIG (volle Punkte) oder FALSCH (0 Punkte) – Teilpunkte gibt es nicht.',
      'RICHTIG, wenn die Antwort die Aufgabe erfüllt (z. B. das vorgegebene Wort tatsächlich benutzt), inhaltlich zur Aufgabe passt und sprachlich korrekt ist (Rechtschreibung des geprüften Wortes, Grammatik).',
      'Die Erwartung ist EINE mögliche Lösung: Andere Formulierungen sind richtig, wenn sie dasselbe leisten. Sei fair, aber nicht großzügig: Ein falsch geschriebenes Zielwort oder ein falscher Satzbau ist falsch.',
      'Bei Begründungen (Odd one out, Korrekturen): richtig, wenn die Begründung sachlich stimmt und das Gemeinte klar wird – auch kurz.',
      'Leere oder sinnlose Antworten sind falsch.',
      'Urteile (urteil):',
      '- "richtig": erfüllt die Aufgabe vollständig und ist korrekt.',
      '- "kleinerFehler": im Kern richtig, aber mit einem kleinen sprachlichen Fehler – Rechtschreibfehler (ein Buchstabe vertauscht/fehlt), falsche Präposition, fehlender/falscher Artikel, falsche Endung. Die Lehrkraft entscheidet, ob es trotzdem den Punkt gibt.',
      '- "vertretbar": weicht von der Lösung ab, ist im Zusammenhang aber sinnvoll und korrekt (z. B. ein passendes Synonym in einer Lücke). Die Lehrkraft entscheidet.',
      '- "falsch": passt nicht, falsches Wort, sinnlos oder leer.',
      'Fälle mit „Wortlösung": Die Lösung ist vorgegeben und die Antwort wurde bereits als abweichend erkannt. Prüfe nur, ob die Abweichung ein kleiner Fehler ist oder die Antwort im Zusammenhang trotzdem sinnvoll wäre – sonst "falsch". Nie "richtig".',
      'begruendung: ein kurzer Satz auf Deutsch für die Lehrkraft, warum (bei falsch: was fehlt oder falsch ist; bei kleinerFehler: welcher Fehler).'
    ].join('\n'),
    user: faelle
      .map(
        (f) =>
          `${f.id}${f.wortloesung ? ' (Wortlösung)' : ''}\nAufgabe: ${f.frage}\n${f.wortloesung ? 'Lösung' : 'Erwartung (Beispiel)'}: ${f.erwartung || '–'}\nAntwort: ${f.antwort.trim() || '(leer)'}`
      )
      .join('\n\n'),
    schema: {
      type: 'object',
      properties: {
        urteile: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              urteil: { type: 'string', enum: ['richtig', 'kleinerFehler', 'vertretbar', 'falsch'] },
              begruendung: { type: 'string' }
            },
            required: ['id', 'urteil', 'begruendung'],
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
  const wort = new Set(faelle.filter((f) => f.wortloesung).map((f) => f.id))
  for (const u of liste as Partial<KiUrteil>[]) {
    if (typeof u?.id !== 'string' || !bekannt.has(u.id) || out.has(u.id)) continue
    // Ältere Form (richtig: boolean) bleibt lesbar
    let urteil: KiUrteilArt | null = ['richtig', 'kleinerFehler', 'vertretbar', 'falsch'].includes(String(u.urteil))
      ? (u.urteil as KiUrteilArt)
      : typeof u.richtig === 'boolean'
        ? u.richtig
          ? 'richtig'
          : 'falsch'
        : null
    if (!urteil) continue
    // Eine Wortlösung, die nicht genau stimmt, gibt die KI nie selbst frei – das entscheidet die Lehrkraft
    if (urteil === 'richtig' && wort.has(u.id)) urteil = 'vertretbar'
    out.set(u.id, { id: u.id, urteil, richtig: urteil === 'richtig', begruendung: String(u.begruendung ?? '').slice(0, 300) })
  }
  return out
}
