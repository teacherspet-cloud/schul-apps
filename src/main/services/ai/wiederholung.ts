/**
 * Eine KI-Anfrage einmal wiederholen, wenn die Antwort unbrauchbar ist (27.09.2026,
 * Großprogramm 0.4, Paket Verlässlichkeit).
 *
 * Wiederholt wird GENAU EINMAL und nur bei Fehlern, die beim zweiten Versuch verschwinden
 * können: kaputtes JSON, eine Antwort, die dem Schema nicht entspricht, eine abgeschnittene oder
 * leere Antwort, ein Serverfehler (5xx, „overloaded"). Nie nach einem Abbruch durch die
 * Lehrkraft, nie bei Schlüssel-, Guthaben- oder Berechtigungsfehlern. Jede Wiederholung kostet
 * Kontingent – sie wird protokolliert und im Verbrauch gezählt.
 */
import type { StructuredRequest } from '@shared/types'
import { pruefeSchema } from '@shared/schemaPruefung'
import { protokolliere } from '../protokoll'

export type Fehlerart = 'json' | 'schema' | 'abgeschnitten' | 'leer' | 'server'

export class SchemaVerletzt extends Error {
  constructor(public abweichungen: string[]) {
    super(`Die Antwort der KI passt nicht zum verlangten Aufbau (${abweichungen.slice(0, 3).join('; ')}).`)
  }
}

/** Lässt sich dieser Fehler durch einen zweiten Versuch beheben? */
export function wiederholbar(e: unknown): Fehlerart | null {
  if (e instanceof SchemaVerletzt) return 'schema'
  const m = e instanceof Error ? e.message : String(e)
  if (/abgebrochen|aborted|abort/i.test(m) || (e as { name?: string })?.name === 'AbortError') return null
  if (e instanceof SyntaxError || /JSON|Unexpected (token|end)|Unterminated string|Expected .* after/i.test(m)) return 'json'
  if (/abgeschnitten|max_tokens|zu lang/i.test(m)) return 'abgeschnitten'
  if (/keine Antwort geliefert/i.test(m)) return 'leer'
  if (/\b(500|502|503|504|529)\b|overloaded|internal server error|bad gateway|service unavailable/i.test(m)) return 'server'
  return null
}

const HINWEIS: Record<Fehlerart, string> = {
  json: 'Deine vorige Antwort war kein gültiges JSON. Antworte ausschließlich mit gültigem JSON nach dem vorgegebenen Schema.',
  schema: 'Deine vorige Antwort verletzte das vorgegebene Schema. Halte dich genau an alle Pflichtfelder und Datentypen.',
  abgeschnitten: 'Deine vorige Antwort wurde abgeschnitten, weil sie zu lang war. Fasse dich knapper, ohne Pflichtfelder wegzulassen.',
  leer: '',
  server: ''
}

export interface WiederholungsBericht {
  art: Fehlerart
  meldung: string
}

/**
 * Führt den Aufruf aus, prüft die Antwort gegen `req.schema` und wiederholt einmal.
 * `beiWiederholung` meldet den Grund (Protokoll, Verbrauch).
 */
export async function mitWiederholung<T>(
  req: StructuredRequest,
  aufruf: (r: StructuredRequest) => Promise<T>,
  beiWiederholung: (b: WiederholungsBericht) => void = () => undefined
): Promise<T> {
  try {
    const antwort = await aufruf(req)
    // Nur fehlende Pflichtfelder und falsche Typen lohnen eine (kostenpflichtige) Wiederholung – überzählige Felder stören die Verarbeitung nicht
    const abweichungen = (req.schema ? pruefeSchema(req.schema, antwort) : []).filter((a) => !a.endsWith('nicht vorgesehen'))
    if (abweichungen.length) throw new SchemaVerletzt(abweichungen)
    return antwort
  } catch (e) {
    const art = wiederholbar(e)
    if (!art) throw e
    beiWiederholung({ art, meldung: e instanceof Error ? e.message : String(e) })
    const zusatz = HINWEIS[art]
    const zweite = await aufruf(zusatz ? { ...req, system: `${req.system}\n\n${zusatz}` } : req)
    /*
     * Weicht auch die zweite Antwort vom Schema ab, wird sie trotzdem geliefert – wie vor der
     * Prüfung. Die Verarbeitung ist tolerant gebaut; eine strengere Prüfung darf nichts scheitern
     * lassen, was vorher ging. Die Abweichung steht im Protokoll.
     */
    const rest = req.schema ? pruefeSchema(req.schema, zweite) : []
    if (rest.length)
      protokolliere(
        'warnung',
        'ki',
        `${req.schemaName ?? 'Anfrage'}: auch die Wiederholung weicht vom Schema ab, wird trotzdem verwendet: ${rest.slice(0, 3).join('; ')}`
      )
    return zweite
  }
}
