/**
 * Woher die Verben einer Aufgabe kommen (30.09.2026): Liste des Lehrwerk-Bandes (auf Wunsch mit den
 * früheren Bänden derselben Reihe), sonst die Standardliste der Sprache bis zum Lernjahr. Dazu die
 * Verben, die in einer Vokabelliste stehen – der Vokabeltest bietet sie an.
 */
import { grundformVon, verbSchluessel, VERB_SPALTEN, type VerbEintrag, type VerbListe, type VerbListeMeta, type VerbSprache } from '@shared/verben'
import { standardBis, standardListe } from './standard'
import { formateFuerLernjahr, immerDeutsch, spaltenFuerLernjahr, verbzahlFuerLernjahr, ZIELFORM, type VerbAufgabe } from './formate'

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })

/** Frühere Bände derselben Reihe und Sprache: zu Green Line 3 die Liste von Green Line 2 (und 1) */
export function fruehereBaende(alle: VerbListeMeta[], liste: Pick<VerbListeMeta, 'id' | 'reihe' | 'band' | 'sprache'>): VerbListeMeta[] {
  if (!liste.reihe || !liste.band) return []
  return alle
    .filter((l) => l.id !== liste.id && l.sprache === liste.sprache && l.reihe === liste.reihe && l.band && collator.compare(l.band, liste.band!) < 0)
    .sort((a, b) => collator.compare(a.band!, b.band!))
}

/**
 * Listen zusammenführen – ohne Dubletten. Steht ein Verb in mehreren Bänden, gilt die Fassung des
 * späteren Bandes (Reihenfolge: früheste zuerst).
 */
export function fuehreZusammen(listen: Pick<VerbListe, 'eintraege' | 'sprache' | 'id'>[]): VerbEintrag[] {
  const nachSchluessel = new Map<string, VerbEintrag>()
  for (const l of listen) {
    for (const e of l.eintraege) {
      const k = verbSchluessel(grundformVon(e, l.sprache))
      if (!k) continue
      // Die Kennung bekommt die Liste vorangestellt – Einträge verschiedener Bände haben sonst gleiche Kennungen
      nachSchluessel.delete(k)
      nachSchluessel.set(k, { ...e, id: `${l.id}:${e.id}` })
    }
  }
  return [...nachSchluessel.values()]
}

/** Alle Verben, aus denen gewählt werden kann */
export async function ladeVerbPool(a: Pick<VerbAufgabe, 'quelle' | 'listeId' | 'kumulativ' | 'sprache' | 'lernjahr'>): Promise<VerbEintrag[]> {
  if (a.quelle === 'standard' || !a.listeId) return standardBis(a.sprache, a.lernjahr)
  const alle = await window.api.verbLists.list()
  const eigene = alle.find((l) => l.id === a.listeId)
  if (!eigene) return standardBis(a.sprache, a.lernjahr)
  const ids = [...(a.kumulativ ? fruehereBaende(alle, eigene).map((l) => l.id) : []), eigene.id]
  const listen = await Promise.all(ids.map((id) => window.api.verbLists.get(id)))
  return fuehreZusammen(listen)
}

/**
 * Verben einer Vokabelliste in der Verbliste finden: „to go" → go – went – gone. Gesucht wird
 * zuerst in der Lehrwerksliste, dann in der Standardliste.
 */
export function verbenAusVokabeln(vokabeln: { term: string }[], pool: VerbEintrag[], sprache: VerbSprache): VerbEintrag[] {
  const quellen = [...pool, ...standardListe(sprache)]
  const out: VerbEintrag[] = []
  const gesehen = new Set<string>()
  for (const v of vokabeln) {
    const k = verbSchluessel(v.term)
    if (!k || gesehen.has(k)) continue
    const treffer = quellen.find((e) => verbSchluessel(grundformVon(e, sprache)) === k)
    if (treffer) {
      gesehen.add(k)
      out.push(treffer)
    }
  }
  return out
}

/** Eine neue Aufgabe mit den Voreinstellungen des Lernjahrs */
export function neueVerbAufgabe(sprache: VerbSprache, lernjahr: number, seed = Math.floor(Math.random() * 2 ** 31)): VerbAufgabe {
  const lj = Math.max(1, lernjahr)
  const verben = standardBis(sprache, lj)
  const n = verbzahlFuerLernjahr(lj, sprache)
  // Aus der Standardliste zuerst die Verben der jüngsten Lernjahre – sie sind gerade dran
  const auswahl = [...verben].sort((a, b) => b.lernjahr - a.lernjahr).slice(0, n)
  const spalten = spaltenFuerLernjahr(sprache, lj)
  const grund = VERB_SPALTEN[sprache].find((s) => s.grundform)?.id ?? spalten[0]
  return {
    sprache,
    quelle: 'standard',
    kumulativ: true,
    lernjahr: lj,
    verben: auswahl,
    formate: formateFuerLernjahr(lj, sprache),
    anzahl: {},
    spalten,
    vorgabe: grund,
    zielform: ZIELFORM[sprache],
    rechtschreibung: 'halb',
    anweisungDeutsch: immerDeutsch(sprache),
    seed
  }
}

/** Gruppen gleicher Verben in einer Liste (Indizes) – für den Hinweis „doppelt" beim Einpflegen */
export function dubletten(eintraege: VerbEintrag[], sprache: VerbSprache): number[][] {
  const gruppen = new Map<string, number[]>()
  eintraege.forEach((e, i) => {
    const k = verbSchluessel(grundformVon(e, sprache))
    if (k) gruppen.set(k, [...(gruppen.get(k) ?? []), i])
  })
  return [...gruppen.values()].filter((g) => g.length > 1)
}

/**
 * Eine Verbliste als Vokabeln (30.09.2026) – für die Vokabelliste „aus Lehrwerk: unregelmäßige
 * Verben Green Line 3": Grundform als Wort, die übrigen Formen als Anmerkung, Deutsch als Übersetzung.
 */
export function vokabelnAusVerbliste(liste: Pick<VerbListe, 'eintraege' | 'sprache'>): { term: string; translation: string; pos: string; note?: string }[] {
  const spalten = VERB_SPALTEN[liste.sprache]
  return liste.eintraege.map((e) => {
    const formen = spalten.filter((s) => !s.grundform && !s.deutsch).map((s) => e.formen[s.id]).filter((x) => x && !/^[-–—]+$/.test(x))
    const note = [formen.join(' – '), e.hinweis].filter(Boolean).join('; ')
    return { term: grundformVon(e, liste.sprache), translation: e.formen.de ?? '', pos: 'verb', ...(note ? { note } : {}) }
  })
}
