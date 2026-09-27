/**
 * „Mit KI beheben" für alle Programme, deren Material aus Arbeitsblatt-Bausteinen besteht
 * (Arbeitsblatt, Lernzielkontrolle, Grammatiktest, Klassenarbeit) – Paket 12.
 *
 * Ein Weg für alle, statt viermal nachgebaut (siehe „Getrennte Erzeugungswege"): Die KI
 * bekommt die Hinweise, den Zusammenhang und das nummerierte Material und antwortet mit
 * höchstens `MAX_AENDERUNGEN` Änderungen (ersetzen, davor/danach einfügen, entfernen). Das
 * Schema ist bewusst eng: keine neue Gliederung, kein neues Blatt – eine Reparatur.
 *
 * Die Änderungen beziehen sich danach auf KENNUNGEN (`Reparatur.anker`), nicht auf Stellen.
 * So lassen sie sich auch in einen Stand einarbeiten, an dem die Lehrkraft während des Auftrags
 * weitergearbeitet hat (shared/kiBeheben.ts, `wendeReparaturAn`).
 */
import type { StructuredRequest } from '@shared/types'
import { arr, enumOf, int, obj, str } from '../../../shared/aiSchema'
import type { Anrede } from '../../../shared/anrede'
import { MAX_AENDERUNGEN, reparaturAuftrag, type Reparatur, type ReparaturArt, type ReparaturKontext } from '../../../shared/kiBeheben'
import { createRng, newId, randomSeed } from '../../vokabeltest/model/random'
import type { WsBlock } from '../model/types'
import { verschluesseleMaterialverweise } from '../didactics/integrity'
import { convertBlock } from './convert'
import { describeBlock } from './describe'
import { FLAT_BLOCK } from './schemas'

type AiCall = <T>(req: StructuredRequest) => Promise<T>

const ARTEN: ReparaturArt[] = ['ersetzen', 'davor', 'danach', 'entfernen']

export const REPARATUR_SCHEMA = obj({
  erklaerung: str('Ein Satz für die Lehrkraft: was geändert wurde'),
  aenderungen: arr(
    obj({
      art: enumOf(ARTEN),
      nummer: int('Nummer des Bausteins (ab 1), auf den sich die Änderung bezieht'),
      block: FLAT_BLOCK
    }),
    `Höchstens ${MAX_AENDERUNGEN} Änderungen`
  )
})

export interface ReparaturAnfrage {
  /** Das Blatt bzw. der Teil, in dem repariert wird (in der Reihenfolge des Dokuments) */
  bloecke: WsBlock[]
  hinweise: string[]
  kontext: ReparaturKontext
  /** Systemanweisung des Programms (Lerngruppe, Stil, Regeln) */
  system: string
  /** Weitere Regeln des Programms (z. B. Landesformat der Lernzielkontrolle) */
  zusatz?: string[]
  anrede: Anrede
  /**
   * Punkte: Arbeitsblätter tragen keine (`'keine'`); Kontrollen und Arbeiten behalten beim
   * Ersetzen die Punkte des alten Bausteins – die Verteilung der Lehrkraft soll eine Reparatur
   * nicht verschieben. Neue Aufgaben übernehmen die Punkte der KI.
   */
  punkte: 'keine' | 'behalten'
}

export interface ReparaturErgebnis {
  aenderungen: Reparatur<WsBlock>[]
  erklaerung: string
}

/** Die Antwort der KI in Änderungen an Kennungen übersetzen (ohne KI prüfbar) */
export function reparaturAus(
  antwort: { erklaerung?: unknown; aenderungen?: unknown } | null | undefined,
  bloecke: WsBlock[],
  anrede: Anrede,
  punkte: ReparaturAnfrage['punkte']
): ReparaturErgebnis {
  const rng = createRng(randomSeed())
  const roh = Array.isArray(antwort?.aenderungen) ? (antwort!.aenderungen as Record<string, unknown>[]) : []
  const aenderungen: Reparatur<WsBlock>[] = []
  for (const a of roh.slice(0, MAX_AENDERUNGEN)) {
    const art = ARTEN.includes(a?.art as ReparaturArt) ? (a.art as ReparaturArt) : null
    const nummer = Number(a?.nummer)
    const alt = Number.isInteger(nummer) ? bloecke[nummer - 1] : undefined
    // Ohne gültigen Bezug ein neuer Baustein ans Ende – ein Ersetzen oder Entfernen ohne Bezug entfällt
    const anker = alt?.id ?? bloecke[bloecke.length - 1]?.id ?? ''
    if (!art || (!alt && (art === 'ersetzen' || art === 'entfernen'))) continue
    if (art === 'entfernen') {
      aenderungen.push({ art, anker })
      continue
    }
    const b = a.block as Record<string, unknown> | undefined
    const roh = convertBlock(art === 'ersetzen' && alt && !b?.type ? { ...b, type: alt.type } : b, rng, [], anrede)
    if (!roh) continue
    // Nummern der KI werden zu Kennungen („M{quelle}"), gezählt über das Blatt; ein ersetzter Baustein steht an der Stelle des alten
    const [neu] = verschluesseleMaterialverweise([roh], art === 'ersetzen' && alt ? bloecke.map((x) => (x.id === alt.id ? roh : x)) : [...bloecke, roh])
    const altePunkte = alt?.type === 'task' ? alt.points : undefined
    const mitPunkten: WsBlock =
      neu.type !== 'task'
        ? neu
        : { ...neu, points: punkte === 'keine' ? 0 : art === 'ersetzen' && altePunkte !== undefined ? altePunkte : Math.max(0, Math.round(neu.points ?? 0)) }
    aenderungen.push({
      art,
      anker,
      // Beim Ersetzen bleibt die Kennung: Zuordnungen (Hörtext, Video, Fassungen) und Hinweise bleiben gültig
      block: art === 'ersetzen' && alt ? { ...mitPunkten, id: alt.id, ...(alt.stars ? { stars: alt.stars } : {}) } : { ...mitPunkten, id: newId(rng) }
    })
  }
  return { aenderungen, erklaerung: typeof antwort?.erklaerung === 'string' ? antwort.erklaerung.trim() : '' }
}

/** Die KI um eine gezielte Reparatur bitten. Wirft, wenn keine brauchbare Änderung zurückkommt. */
export async function repariereBausteine(anfrage: ReparaturAnfrage, ai: AiCall): Promise<ReparaturErgebnis> {
  const material = anfrage.bloecke.map((b, i) => `(${i + 1}) ${describeBlock(b)}`).join('\n\n')
  const antwort = await ai<{ erklaerung: string; aenderungen: unknown[] }>({
    system: anfrage.system,
    user: [
      reparaturAuftrag(anfrage.hinweise, anfrage.kontext),
      ...(anfrage.zusatz ?? []),
      `Material, nummeriert:\n${material}`,
      'Für nicht benötigte Felder leere Werte verwenden.'
    ]
      .filter(Boolean)
      .join('\n\n'),
    schemaName: 'material_reparatur',
    schema: REPARATUR_SCHEMA
  })
  const ergebnis = reparaturAus(antwort, anfrage.bloecke, anfrage.anrede, anfrage.punkte)
  if (!ergebnis.aenderungen.length) throw new Error('Die KI hat keine Änderung geliefert – der Hinweis bleibt stehen.')
  return ergebnis
}
