/**
 * Belegte Themen je Fach für die Vorschläge der Themenbereiche (Paket 10b).
 *
 * Nichts Neues erfunden – nur zusammengetragen, was die App schon aus der Recherche kennt:
 * - Lehrplanthemen der Lernzielkontrolle (lernzielkontrolle/didactics/themenDaten.ts),
 * - Geschichtsthemen der Klassenarbeit (klassenarbeit/model/curriculumGeschichte.ts),
 * - Units der Lehrwerke (shared/lehrwerkThemen.ts, Green Line: Band N = Klasse N + 4),
 * - Grammatikthemen der Sprachenfächer (arbeitsblatt/didactics/grammarTopics.ts).
 *
 * Getrennt von themenVorschlag.ts, damit die Vorschlagslogik ohne die großen Datenlisten
 * prüfbar bleibt.
 */
import { THEMENBLOECKE } from '../modules/lernzielkontrolle/didactics/themen'
import { CURRICULUM_TOPICS } from '../modules/klassenarbeit/model/curriculumGeschichte'
import { GRAMMAR_TOPICS } from '../modules/arbeitsblatt/didactics/grammarTopics'
import { LEHRWERK_THEMEN } from './lehrwerkThemen'
import type { KatalogThema } from './themenVorschlag'

/** Jahrgang eines Lehrwerksbandes: „Green Line 3" → Klasse 7; unbekannt → keine Einschränkung */
function lehrwerkJahrgang(buch: string): number[] | undefined {
  const n = /(\d+)\s*$/.exec(buch)?.[1]
  if (n) return [Number(n) + 4]
  if (/transition/i.test(buch)) return [11]
  return undefined
}

const cache = new Map<string, KatalogThema[]>()

export function katalogFuer(fachId: string): KatalogThema[] {
  const da = cache.get(fachId)
  if (da) return da
  const liste: KatalogThema[] = []
  for (const b of THEMENBLOECKE) if (b.fach === fachId) for (const t of b.themen) liste.push({ name: t, quelle: 'lehrplan', jahrgaenge: b.jahrgaenge })
  if (fachId === 'geschichte') for (const t of CURRICULUM_TOPICS) liste.push({ name: t.label, quelle: 'lehrplan', jahrgaenge: t.grades })
  if (fachId === 'englisch')
    for (const [buch, { kapitel }] of Object.entries(LEHRWERK_THEMEN))
      for (const [key, k] of Object.entries(kapitel))
        liste.push({
          name: `${key}: ${k.titel}`,
          zusatz: [buch, k.thema, k.ort, k.grammatik].filter(Boolean).join(' '),
          quelle: 'lehrwerk',
          jahrgaenge: lehrwerkJahrgang(buch)
        })
  for (const g of GRAMMAR_TOPICS) if (g.subject === fachId) liste.push({ name: g.label, zusatz: g.term, quelle: 'grammatik' })

  // Gleichnamige Themen (mehrere Länder, mehrere Bände) zusammenfassen – die Jahrgänge vereinigen
  const nachName = new Map<string, KatalogThema>()
  for (const t of liste) {
    const k = `${t.quelle}|${t.name}|${t.zusatz ?? ''}`
    const alt = nachName.get(k)
    if (!alt) nachName.set(k, { ...t })
    else if (alt.jahrgaenge && t.jahrgaenge) alt.jahrgaenge = [...new Set([...alt.jahrgaenge, ...t.jahrgaenge])]
    else alt.jahrgaenge = undefined
  }
  const fertig = [...nachName.values()]
  cache.set(fachId, fertig)
  return fertig
}
