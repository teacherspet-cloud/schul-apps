/**
 * Folgekette nach einer KI-Überarbeitung (26.11.2026, Wunsch der Lehrkraft).
 *
 * Bisher änderte „Überarbeiten" nur den einen Baustein. Aufgaben, die auf das Material aufbauen,
 * blieben stehen – auch wenn ihre Lösung nicht mehr im Text stand. Ebenso spätere Bausteine, die
 * auf DIESE Aufgaben verweisen („Nutze deine Ergebnisse aus Aufgabe 2"), oder Hilfen, Wortspeicher
 * und Phrases zu ihnen. Abgestimmt: Nach einer KI-Überarbeitung passt die App die betroffenen
 * Bausteine AUTOMATISCH an (wie seit 01.10.2026 beim Hörtext), nennt, was sich geändert hat, und
 * Strg+Z nimmt alles in einem Schritt zurück; jeder angepasste Baustein behält seinen alten Stand
 * als abrufbare Fassung. Nach einer Handbearbeitung läuft nichts von selbst.
 *
 * Wer betroffen ist, bestimmt die App ohne KI (`folgeBausteine`), damit die KI nicht das ganze
 * Blatt umschreibt:
 *  - Verweise auf das Material („M{kennung}" bzw. sichtbar „M2"),
 *  - Verweise auf eine betroffene Aufgabe („Aufgabe 3", „task 3") und die Hilfen zu ihr
 *    (`hilfenZuordnung`), und so fort – die Kette läuft weiter, solange neue Glieder dazukommen,
 *  - ohne jeden Verweis auf das Material: die Aufgaben direkt dahinter bis zum nächsten Material
 *    (die übliche Anordnung „Text, dann Aufgaben dazu").
 * Die KI bekommt dann alten und neuen Stand und prüft jedes Glied; was passt, bleibt unverändert.
 */
import { arr, bool, obj, str } from '../../../shared/aiSchema'
import type { Anrede } from '../../../shared/anrede'
import { createRng, randomSeed } from '../../vokabeltest/model/random'
import { anredeFuerMeta } from '../didactics/anrede'
import { aufgabenVerweise, hilfenZuordnung } from '../didactics/aufgabenVerweise'
import { bereinigeKennung, isMaterial, MATERIAL_VERWEIS, materialNummern, refOf, verschluesseleMaterialverweise } from '../didactics/integrity'
import type { LearnerProfile } from '../didactics/profile'
import type { WorksheetMeta, WsBlock } from '../model/types'
import { convertBlock } from './convert'
import { describeBlock } from './describe'
import type { AiCall } from './generate'
import { aufgabenNummern } from './hoertextWunsch'
import { systemPrompt } from './prompts'
import { FLAT_BLOCK } from './schemas'

/** Bausteine, die die KI an einen geänderten Baustein anpassen kann (Bilder, Hörtexte, Videos nicht) */
const ANPASSBAR = new Set<WsBlock['type']>(['task', 'text', 'table', 'grid', 'infoBox', 'phrases', 'scaffold', 'selfCheck'])
/** Höchstens so viele Glieder – mehr wäre kein Nachziehen mehr, sondern ein neues Blatt */
export const MAX_GLIEDER = 12

/** Texte eines Bausteins (ohne Kennungen, Bilddaten und alte Fassungen) */
function texte(wert: unknown): string {
  if (typeof wert === 'string') return wert
  if (Array.isArray(wert)) return wert.map(texte).join('\n')
  if (wert && typeof wert === 'object')
    return Object.entries(wert as Record<string, unknown>)
      .filter(([k]) => !['id', 'ref', 'dataUrl', 'url', 'versions', 'image', 'audio'].includes(k))
      .map(([, v]) => texte(v))
      .join('\n')
  return ''
}

function verweistAufMaterial(text: string, material: WsBlock, nummer: string | undefined): boolean {
  const kennung = bereinigeKennung(refOf(material))
  for (const m of text.matchAll(MATERIAL_VERWEIS)) if (bereinigeKennung(m[1]) === kennung) return true
  return Boolean(nummer && new RegExp(`\\b${nummer}\\b`).test(text))
}

/**
 * Die Glieder der Folgekette in Blattreihenfolge – ohne KI. `bloecke`: alle Bausteine des Blattes
 * bzw. der Fassung (bei der Klassenarbeit über alle Teile, Materialnummern zählen durch).
 */
export function folgeBausteine(bloecke: WsBlock[], geaendertId: string): WsBlock[] {
  const start = bloecke.find((b) => b.id === geaendertId)
  if (!start) return []
  const mNummern = materialNummern(bloecke)
  const aNummern = aufgabenNummern(bloecke)
  const hilfen = hilfenZuordnung({ blocks: bloecke })
  const textVon = new Map(bloecke.map((b) => [b.id, texte(b)]))
  const glieder = new Set<string>()
  const offen = [start]
  const bezieht = (b: WsBlock, x: WsBlock): boolean => {
    const t = textVon.get(b.id) ?? ''
    if (isMaterial(x) && verweistAufMaterial(t, x, mNummern.get(x.id))) return true
    const nr = aNummern.get(x.id)
    if (nr === undefined) return false
    return hilfen.get(b.id) === nr || aufgabenVerweise(t).includes(nr)
  }
  while (offen.length && glieder.size < MAX_GLIEDER) {
    const x = offen.shift()!
    for (const b of bloecke) {
      if (b.id === geaendertId || glieder.has(b.id) || !ANPASSBAR.has(b.type) || b.nurLoesung) continue
      if (!bezieht(b, x)) continue
      glieder.add(b.id)
      offen.push(b)
      if (glieder.size >= MAX_GLIEDER) break
    }
    // Material ohne jeden Verweis: die Aufgaben direkt dahinter (bis zum nächsten Material)
    if (x === start && isMaterial(start) && !glieder.size) {
      const i = bloecke.findIndex((b) => b.id === geaendertId)
      for (const b of bloecke.slice(i + 1)) {
        if (isMaterial(b) || b.type === 'divider') break
        if (b.type !== 'task' || glieder.size >= MAX_GLIEDER) continue
        glieder.add(b.id)
        offen.push(b)
      }
    }
  }
  return bloecke.filter((b) => glieder.has(b.id))
}

export const FOLGE_SCHEMA = obj({
  bausteine: arr(
    obj({
      id: str('Kennung des Bausteins, genau wie angegeben'),
      geaendert: bool('true = der Baustein musste angepasst werden; false = er passt unverändert'),
      grund: str('Kurz auf Deutsch, was angepasst wurde (z. B. „Lösung zu b) jetzt 1914"), sonst leer'),
      block: FLAT_BLOCK
    })
  ),
  zusammenfassung: str('Ein bis zwei Sätze auf Deutsch: was sich an den Folgebausteinen geändert hat')
})

/** Auftrag an die KI – ohne KI prüfbar */
export function folgeAuftrag(alt: WsBlock, neu: WsBlock, glieder: WsBlock[], bloecke: WsBlock[], meta: WorksheetMeta): string {
  const aNummern = aufgabenNummern(bloecke)
  const mNummern = materialNummern(bloecke)
  const name = (b: WsBlock): string =>
    aNummern.get(b.id) ? `Aufgabe ${aNummern.get(b.id)}` : mNummern.get(b.id) ? `Material ${mNummern.get(b.id)}` : `Baustein (${b.type})`
  return [
    `Ein Baustein des Arbeitsblatts (${name(alt)}) wurde ${alt === neu ? 'von Hand geändert' : 'überarbeitet'}.Die folgenden Bausteine bauen darauf auf – direkt oder über eine Kette (eine Aufgabe nutzt das Material, eine spätere Aufgabe oder Hilfe nutzt diese Aufgabe).`,
    'Prüfe JEDEN dieser Bausteine gegen den NEUEN Stand:',
    '- Stehen Informationen, nach denen gefragt wird, noch im Material? Stimmen Lösungen, Erwartungshorizont, Zitate, Zeilenangaben, Wortspeicher und Hilfen noch?',
    '- Baut ein Baustein auf etwas auf, das jetzt fehlt oder anders ist (auch über eine geänderte Aufgabe davor), passe ihn so an, dass die Kette wieder schlüssig ist.',
    '- Passt ein Baustein unverändert: geaendert = false und den Baustein unverändert zurückgeben.',
    '- Sonst nur das Nötige ändern: Typ, Zweck, Anforderungsbereich, Operator, Antwortform, Zahl und Reihenfolge der Items und Punkte bleiben, wo es geht.',
    '- Verweise auf Materialien bleiben in der Form „M{kennung}" stehen, wie sie im Baustein stehen.',
    '- Sprache, Anrede und Niveau bleiben wie bisher.',
    '',
    ...(alt === neu
      ? [`--- AKTUELLER Stand (${name(alt)}, von der Lehrkraft geändert; der vorige Stand ist nicht bekannt) ---`, describeBlock(neu), '--- Ende ---']
      : [`--- BISHERIGER Stand (${name(alt)}) ---`, describeBlock(alt), '--- NEUER Stand ---', describeBlock(neu), '--- Ende ---']),
    '',
    'Bausteine der Folgekette (jeder mit Kennung):',
    ...glieder.map((b) => `[${b.id}] ${name(b)}\n${describeBlock(b)}`),
    '',
    `Liefere für JEDEN der ${glieder.length} Bausteine einen Eintrag mit seiner Kennung und dem vollständigen Baustein (gleicher type).`,
    `Fach: ${meta.subjectLabel}, Klasse ${meta.grade}${meta.cefrLevel ? `, Niveau ${meta.cefrLevel}` : ''}. Thema: ${meta.topic}`
  ].join('\n')
}

export interface FolgeAnpassung {
  /** Angepasste Bausteine (gleiche Kennung) */
  bloecke: Map<string, WsBlock>
  gruende: Map<string, string>
  /** Geprüft, aber unverändert */
  unveraendert: string[]
  zusammenfassung: string
}

export const LEERE_FOLGE: FolgeAnpassung = { bloecke: new Map(), gruende: new Map(), unveraendert: [], zusammenfassung: '' }

/**
 * Die Folgekette eines überarbeiteten Bausteins anpassen. `bloecke`: das Blatt bzw. die Fassung mit
 * dem ALTEN Stand. Kennung, Sterne, Punkte, Material-Kennung, Hörtext-Zuordnung und Layout bleiben.
 */
export async function folgeketteAnpassen(a: {
  bloecke: WsBlock[]
  alt: WsBlock
  neu: WsBlock
  meta: WorksheetMeta
  profile: LearnerProfile
  ai: AiCall
  system?: string
  anrede?: Anrede
  melde?: (text: string) => void
}): Promise<FolgeAnpassung> {
  const glieder = folgeBausteine(a.bloecke, a.alt.id)
  if (!glieder.length) return LEERE_FOLGE
  a.melde?.(`Die KI prüft ${glieder.length === 1 ? 'den Baustein, der' : `${glieder.length} Bausteine, die`} darauf aufbau${glieder.length === 1 ? 't' : 'en'} …`)
  const d = await a.ai<{ bausteine?: { id?: string; geaendert?: boolean; grund?: string; block?: Record<string, unknown> }[]; zusammenfassung?: string }>({
    system: a.system ?? systemPrompt(a.meta, a.profile),
    user: folgeAuftrag(a.alt, a.neu, glieder, a.bloecke, a.meta),
    schemaName: 'folgekette',
    schema: FOLGE_SCHEMA
  })
  return folgeUebernehmen(d, glieder, a.bloecke.map((b) => (b.id === a.alt.id ? a.neu : b)), a.anrede ?? anredeFuerMeta(a.meta))
}

/** Antwort der KI in Bausteine umsetzen – rein, ohne KI */
export function folgeUebernehmen(
  d: { bausteine?: { id?: string; geaendert?: boolean; grund?: string; block?: Record<string, unknown> }[]; zusammenfassung?: string } | null | undefined,
  glieder: WsBlock[],
  dokument: WsBlock[],
  anrede: Anrede
): FolgeAnpassung {
  const out: FolgeAnpassung = { bloecke: new Map(), gruende: new Map(), unveraendert: [], zusammenfassung: String(d?.zusammenfassung ?? '').trim() }
  for (const e of d?.bausteine ?? []) {
    const alt = glieder.find((g) => g.id === String(e?.id ?? '').trim())
    if (!alt || !e.geaendert || !e.block) continue
    const roh = convertBlock({ ...e.block, type: alt.type }, createRng(randomSeed()), [], anrede)
    if (!roh || roh.type !== alt.type) continue
    const neu = {
      ...roh,
      id: alt.id,
      ...(alt.stars ? { stars: alt.stars } : {}),
      ...(alt.ref ? { ref: alt.ref } : {}),
      ...(alt.seitenFormat ? { seitenFormat: alt.seitenFormat } : {}),
      ...(alt.seitenFormatFest ? { seitenFormatFest: true } : {}),
      ...(alt.pageBreakBefore ? { pageBreakBefore: true } : {}),
      ...(alt.type === 'task' && roh.type === 'task'
        ? {
            points: roh.parts.length === alt.parts.length || !roh.points ? alt.points : roh.points,
            ...(alt.audioId ? { audioId: alt.audioId } : {}),
            ...(alt.skill ? { skill: alt.skill } : {})
          }
        : {})
    } as WsBlock
    const [verschluesselt] = verschluesseleMaterialverweise([neu], dokument.map((b) => (b.id === alt.id ? neu : b)))
    out.bloecke.set(alt.id, verschluesselt)
    if (e.grund?.trim()) out.gruende.set(alt.id, e.grund.trim())
  }
  out.unveraendert = glieder.filter((g) => !out.bloecke.has(g.id)).map((g) => g.id)
  return out
}

/** Meldung für die Lehrkraft */
export function folgeMeldung(anp: FolgeAnpassung, bloecke: WsBlock[]): string {
  if (!anp.bloecke.size && !anp.unveraendert.length) return ''
  const aNummern = aufgabenNummern(bloecke)
  const mNummern = materialNummern(bloecke)
  const name = (id: string): string => {
    const b = bloecke.find((x) => x.id === id)
    if (aNummern.get(id)) return `Aufgabe ${aNummern.get(id)}`
    if (mNummern.get(id)) return mNummern.get(id)!
    return b?.type === 'phrases' ? 'Formulierungshilfen' : b?.type === 'scaffold' ? 'Hilfe' : 'ein Baustein'
  }
  return [
    anp.bloecke.size
      ? `Mit angepasst: ${[...anp.bloecke.keys()].map((id) => `${name(id)}${anp.gruende.get(id) ? ` (${anp.gruende.get(id)})` : ''}`).join('; ')}.`
      : '',
    anp.unveraendert.length ? `Geprüft, passt weiter: ${anp.unveraendert.map(name).join(', ')}.` : '',
    anp.bloecke.size ? 'Strg+Z nimmt alles in einem Schritt zurück; der vorige Stand jedes Bausteins bleibt als Entwurf abrufbar.' : ''
  ]
    .filter(Boolean)
    .join(' ')
}
