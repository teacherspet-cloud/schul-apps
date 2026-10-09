/**
 * Material aus Unterrichtsreihen in den Bibliotheken (09.10.2026, Befund der Lehrkraft am Server: „In den Bibliotheken
 * stehen viele Dokumente ‚Ursachen, Verlauf und Folgen des Ersten Weltkriegs‘ – die hat eine Unterrichtsreihe erzeugt.").
 *
 * Abgestimmt:
 *  - Material, das zu einer Reihe gehört, ist in allen Bibliotheken, in „Zuletzt bearbeitet" und in der Suche zunächst
 *    ausgeblendet. Ein Schalter im Kopf jeder Bibliothek blendet es ein (je Gerät gemerkt); eingeblendet trägt es die
 *    Marke „Reihe: <Titel>". Findet eine Suche NUR solches Material, erscheint es trotzdem – mit Hinweis.
 *  - Die Zugehörigkeit steht NICHT am Dokument, sondern ergibt sich aus den Schritten der Reihen (Arbeitsblatt
 *    `inhalt.quelle`, Test `test.docId`, Onlinefassung `inhalt.blatt.quelle`). So braucht Altbestand keine Nachtragung,
 *    und wer eine Reihe löscht oder einen Schritt vom Dokument löst, sieht es sofort wieder als gewöhnliches Material.
 *  - Löschen einer Reihe: „Reihe und Material löschen" oder „Nur die Reihe löschen" – Material, das auch eine ANDERE
 *    Reihe nutzt, bleibt immer stehen.
 *
 * Gemeinsam für Server (Liste der Reihen) und Oberfläche; ohne Oberfläche prüfbar (tests/reiheMaterial.test.ts).
 */
import type { Reihe } from './reihe'

/** Ein Dokument der Ablage, auf das ein Schritt verweist */
export interface MaterialVerweis {
  /** Programm aus modules/registry.ts */
  moduleId: string
  docId: string
}

/** Zu welcher Reihe ein Dokument gehört */
export interface ReiheVerweis {
  reiheId: string
  titel: string
}

/** Kennung → Reihe (die zuerst genannte, wenn mehrere Reihen dasselbe Dokument nutzen) */
export type ReiheZuordnung = Map<string, ReiheVerweis>

/** Art der Onlinefassung („Lernzielkontrolle", „Grammatiktest") → Programm */
function modulDerFassung(art: string): string | null {
  const a = art.trim().toLocaleLowerCase('de')
  if (a.startsWith('lernziel')) return 'lernzielkontrolle'
  if (a.startsWith('grammatik')) return 'grammatiktest'
  if (a.startsWith('klassenarbeit')) return 'klassenarbeit'
  if (a.startsWith('vokabel')) return 'vokabeltest'
  return null
}

/** Alle Dokumente der Ablage, auf die die Schritte einer Reihe verweisen – jedes nur einmal */
export function materialVerweise(r: Pick<Reihe, 'schritte'>): MaterialVerweis[] {
  const liste: MaterialVerweis[] = []
  const dazu = (moduleId: string | null, docId: unknown): void => {
    if (!moduleId || typeof docId !== 'string' || !docId.trim()) return
    if (!liste.some((m) => m.docId === docId)) liste.push({ moduleId, docId })
  }
  for (const s of r.schritte ?? []) {
    const i = s.inhalt as { art?: string; quelle?: unknown; blatt?: { art?: unknown; quelle?: unknown } } | undefined
    if (i?.art === 'arbeitsblatt') dazu('arbeitsblatt', i.quelle)
    if (i?.art === 'onlinetest' && i.blatt) dazu(modulDerFassung(String(i.blatt.art ?? '')), i.blatt.quelle)
    if (s.test) dazu(s.test.modul, s.test.docId)
  }
  return liste
}

/** Eine Reihe, wie sie die Liste `/server/reihen` nennt */
export interface ReiheMitMaterial {
  id: string
  titel: string
  material?: MaterialVerweis[]
  /** Für „Zuletzt bearbeitet" auf der Startseite (09.10.2026): die Reihe als Ganzes */
  fach?: string
  fachId?: string
  oberthema?: string
  schritte?: number
  geaendert?: string
}

/** Zuordnung Dokument → Reihe aus der Liste der Reihen */
export function zuordnungAus(reihen: ReiheMitMaterial[]): ReiheZuordnung {
  const karte: ReiheZuordnung = new Map()
  for (const r of reihen)
    for (const m of r.material ?? []) if (!karte.has(m.docId)) karte.set(m.docId, { reiheId: r.id, titel: r.titel })
  return karte
}

/**
 * Bibliotheksliste filtern: Material aus Reihen nur, wenn eingeblendet. Das gerade im Programm offene Dokument (`offen`)
 * bleibt immer stehen – wer ein Blatt aus der Reihe heraus öffnet und zur Bibliothek wechselt, soll es dort finden.
 */
export function ohneReiheMaterial<T>(
  liste: T[],
  id: (e: T) => string,
  zuordnung: ReiheZuordnung,
  opts: { einblenden: boolean; offen?: string | null }
): { sichtbar: T[]; ausReihen: number } {
  const ausReihen = liste.filter((e) => zuordnung.has(id(e))).length
  if (opts.einblenden || !ausReihen) return { sichtbar: liste, ausReihen }
  return { sichtbar: liste.filter((e) => !zuordnung.has(id(e)) || id(e) === opts.offen), ausReihen }
}

/**
 * Suchergebnis: Material aus Reihen ist ausgeblendet – findet die Suche aber NUR solches, erscheint es doch (`nurReihe`
 * = mit Hinweis „Nur Treffer aus Unterrichtsreihen"). Sonst stünde da „Nichts gefunden", obwohl es das Dokument gibt.
 */
export function suchtrefferMitReihen<T>(
  treffer: T[],
  id: (e: T) => string,
  zuordnung: ReiheZuordnung,
  einblenden: boolean
): { liste: T[]; nurReihe: boolean } {
  if (einblenden) return { liste: treffer, nurReihe: false }
  const eigene = treffer.filter((e) => !zuordnung.has(id(e)))
  if (eigene.length || !treffer.length) return { liste: eigene, nurReihe: false }
  return { liste: treffer, nurReihe: true }
}

/**
 * Was beim Löschen einer Reihe mit „Reihe und Material löschen" wegfällt: ihr Material – außer dem, das auch eine andere
 * Reihe nutzt (`bleibt`, sonst fehlte dort plötzlich das Blatt).
 */
export function loeschPlan(reiheId: string, reihen: ReiheMitMaterial[]): { loeschen: MaterialVerweis[]; bleibt: MaterialVerweis[] } {
  const eigene = reihen.find((r) => r.id === reiheId)?.material ?? []
  const anderswo = new Set(reihen.filter((r) => r.id !== reiheId).flatMap((r) => (r.material ?? []).map((m) => m.docId)))
  return { loeschen: eigene.filter((m) => !anderswo.has(m.docId)), bleibt: eigene.filter((m) => anderswo.has(m.docId)) }
}

/** Wie viele freigegebene Blätter (Freigaben an Lernende) aus diesem Material entstanden sind */
export function freigabenAus(material: MaterialVerweis[], freigaben: { einstellungen?: { quelle?: { docId?: string } | null } }[]): number {
  const ids = new Set(material.map((m) => m.docId))
  return freigaben.filter((f) => ids.has(f.einstellungen?.quelle?.docId ?? '')).length
}

export type LoeschWahl = 'mit-material' | 'nur-reihe' | 'abbrechen'

/**
 * Rückfrage beim Löschen einer Reihe: Mit Material „Zugehöriges Material ebenfalls löschen? (n Dokumente)" mit drei
 * Wegen; ohne Material (oder nur mit Material, das auch andere Reihen nutzen) die schlichte Rückfrage.
 */
export function loeschFrage(
  reiheId: string,
  reihen: ReiheMitMaterial[],
  freigaben: { einstellungen?: { quelle?: { docId?: string } | null } }[] = []
): { anzahl: number; bleibt: number; freigegeben: number; wahl: LoeschWahl[] } {
  const plan = loeschPlan(reiheId, reihen)
  const anzahl = plan.loeschen.length
  return {
    anzahl,
    bleibt: plan.bleibt.length,
    freigegeben: freigabenAus(plan.loeschen, freigaben),
    wahl: anzahl ? ['mit-material', 'nur-reihe', 'abbrechen'] : ['nur-reihe', 'abbrechen']
  }
}
