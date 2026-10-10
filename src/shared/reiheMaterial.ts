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
 * Seit 10.10.2026 (Entscheidung der Lehrkraft): Ausgeblendet wird nur Material, das FÜR die Reihe ENTSTANDEN ist (von
 * der KI für einen Platzhalter erzeugt, Test aus der Reihe). Ein selbst erstelltes Blatt, das die Lehrkraft später in
 * eine Reihe holt (von Hand oder per KI-Planung „vorhandenes Material"), bleibt gewöhnliches Material der Bibliothek –
 * mit der Marke „Reihe: …", aber sichtbar; „Reihe und Material löschen" lässt es ebenfalls stehen.
 *  - Marke am Schritt: Arbeitsblatt `inhalt.erzeugt` (true beim Erzeugen, false beim Auswählen); Tests aus der Reihe
 *    (`test.docId`, Onlinefassung `inhalt.blatt.quelle`) entstehen immer für die Reihe.
 *  - Altbestand ohne Marke: erzeugt, wenn der Schritt es deutlich zeigt (KI-Entwurf, Rolle bzw. „schrittweise"-Vorschlag
 *    vom Erzeugen); sonst unklar – dann entscheidet der Name des Dokuments: Erzeugtes heißt „<Reihe> – <Schritt>"
 *    (`materialName`). Im Zweifel bleibt es SICHTBAR.
 *
 * Gemeinsam für Server (Liste der Reihen) und Oberfläche; ohne Oberfläche prüfbar (tests/reiheMaterial.test.ts).
 */
import type { Reihe } from './reihe'

/** Ein Dokument der Ablage, auf das ein Schritt verweist */
export interface MaterialVerweis {
  /** Programm aus modules/registry.ts */
  moduleId: string
  docId: string
  /** Für die Reihe entstanden (true), in die Reihe geholt (false) oder Altbestand ohne Marke (fehlt) – siehe oben */
  erzeugt?: boolean
}

/** Zu welcher Reihe ein Dokument gehört */
export interface ReiheVerweis {
  reiheId: string
  titel: string
  /** wie `MaterialVerweis.erzeugt` */
  erzeugt?: boolean
}

/** Name eines Dokuments, wie ihn das Erzeugen in der Reihe vergibt („<Reihe> – <Schritt>" bzw. nur der Titel der Reihe) */
export function nameAusReihe(name: string | undefined, reiheTitel: string): boolean {
  const n = (name ?? '').trim().toLocaleLowerCase('de')
  const t = reiheTitel.trim().toLocaleLowerCase('de')
  if (!n || !t) return false
  return n === t || n.startsWith(`${t} – `)
}

/** Wird dieses Dokument als Material der Reihe ausgeblendet? (Marke, sonst Name – im Zweifel nein) */
export function istReiheMaterial(verweis: ReiheVerweis | undefined, name?: string): boolean {
  if (!verweis) return false
  if (verweis.erzeugt !== undefined) return verweis.erzeugt
  return nameAusReihe(name, verweis.titel)
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
  const dazu = (moduleId: string | null, docId: unknown, erzeugt: boolean | undefined): void => {
    if (!moduleId || typeof docId !== 'string' || !docId.trim()) return
    const da = liste.find((m) => m.docId === docId)
    if (!da) liste.push({ moduleId, docId, ...(erzeugt === undefined ? {} : { erzeugt }) })
    // Mehrere Schritte mit demselben Dokument: erzeugt geht vor unklar, unklar vor „hereingeholt"
    else if (rang(erzeugt) > rang(da.erzeugt)) {
      if (erzeugt === undefined) delete da.erzeugt
      else da.erzeugt = erzeugt
    }
  }
  for (const s of r.schritte ?? []) {
    const i = s.inhalt as
      | { art?: string; quelle?: unknown; erzeugt?: unknown; zweck?: unknown; schrittweiseGrund?: unknown; blatt?: { art?: unknown; quelle?: unknown } }
      | undefined
    if (i?.art === 'arbeitsblatt') {
      // Marke vom Erzeugen bzw. Auswählen; Altbestand: deutliche Spuren des Erzeugens, sonst unklar (Name entscheidet)
      const erzeugt = typeof i.erzeugt === 'boolean' ? i.erzeugt : s.kiEntwurf || i.zweck || i.schrittweiseGrund ? true : undefined
      dazu('arbeitsblatt', i.quelle, erzeugt)
    }
    // Tests entstehen immer in der Reihe („Test hier erstellen")
    if (i?.art === 'onlinetest' && i.blatt) dazu(modulDerFassung(String(i.blatt.art ?? '')), i.blatt.quelle, true)
    if (s.test) dazu(s.test.modul, s.test.docId, true)
  }
  return liste
}

const rang = (e: boolean | undefined): number => (e === true ? 2 : e === undefined ? 1 : 0)

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

/**
 * Zuordnung Dokument → Reihe aus der Liste der Reihen – ALLE verknüpften Dokumente (für die Marke „Reihe: …"). Nutzen
 * mehrere Reihen dasselbe Dokument, gilt die erste – außer eine spätere hat es erzeugt (bzw. ist unklar, wo die erste es
 * nur hereingeholt hat): Dann zählt diese, damit Erzeugtes ausgeblendet bleibt.
 */
export function zuordnungAus(reihen: ReiheMitMaterial[]): ReiheZuordnung {
  const karte: ReiheZuordnung = new Map()
  for (const r of reihen)
    for (const m of r.material ?? []) {
      const da = karte.get(m.docId)
      if (da && rang(m.erzeugt) <= rang(da.erzeugt)) continue
      karte.set(m.docId, { reiheId: r.id, titel: r.titel, ...(m.erzeugt === undefined ? {} : { erzeugt: m.erzeugt }) })
    }
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
  opts: { einblenden: boolean; offen?: string | null; name?: (e: T) => string | undefined }
): { sichtbar: T[]; ausReihen: number } {
  const verborgen = (e: T): boolean => istReiheMaterial(zuordnung.get(id(e)), opts.name?.(e))
  const ausReihen = liste.filter(verborgen).length
  if (opts.einblenden || !ausReihen) return { sichtbar: liste, ausReihen }
  return { sichtbar: liste.filter((e) => !verborgen(e) || id(e) === opts.offen), ausReihen }
}

/**
 * Suchergebnis: Material aus Reihen ist ausgeblendet – findet die Suche aber NUR solches, erscheint es doch (`nurReihe`
 * = mit Hinweis „Nur Treffer aus Unterrichtsreihen"). Sonst stünde da „Nichts gefunden", obwohl es das Dokument gibt.
 */
export function suchtrefferMitReihen<T>(
  treffer: T[],
  id: (e: T) => string,
  zuordnung: ReiheZuordnung,
  einblenden: boolean,
  name?: (e: T) => string | undefined
): { liste: T[]; nurReihe: boolean } {
  if (einblenden) return { liste: treffer, nurReihe: false }
  const eigene = treffer.filter((e) => !istReiheMaterial(zuordnung.get(id(e)), name?.(e)))
  if (eigene.length || !treffer.length) return { liste: eigene, nurReihe: false }
  return { liste: treffer, nurReihe: true }
}

/**
 * Was beim Löschen einer Reihe mit „Reihe und Material löschen" wegfällt: ihr Material – außer dem, das auch eine andere
 * Reihe nutzt (`bleibt`, sonst fehlte dort plötzlich das Blatt). Seit 10.10.2026 nur, was für die Reihe ENTSTANDEN ist
 * (Marke bzw. Name, `istReiheMaterial`); in die Reihe geholtes eigenes Material bleibt immer stehen.
 */
export function loeschPlan(
  reiheId: string,
  reihen: ReiheMitMaterial[],
  /** Name eines Dokuments (für Altbestand ohne Marke) – ohne Namen zählt nur die Marke */
  name?: (docId: string) => string | undefined
): { loeschen: MaterialVerweis[]; bleibt: MaterialVerweis[] } {
  const reihe = reihen.find((r) => r.id === reiheId)
  const eigene = (reihe?.material ?? []).filter((m) =>
    istReiheMaterial({ reiheId, titel: reihe?.titel ?? '', ...(m.erzeugt === undefined ? {} : { erzeugt: m.erzeugt }) }, name?.(m.docId))
  )
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
  freigaben: { einstellungen?: { quelle?: { docId?: string } | null } }[] = [],
  name?: (docId: string) => string | undefined
): { anzahl: number; bleibt: number; freigegeben: number; wahl: LoeschWahl[] } {
  const plan = loeschPlan(reiheId, reihen, name)
  const anzahl = plan.loeschen.length
  return {
    anzahl,
    bleibt: plan.bleibt.length,
    freigegeben: freigabenAus(plan.loeschen, freigaben),
    wahl: anzahl ? ['mit-material', 'nur-reihe', 'abbrechen'] : ['nur-reihe', 'abbrechen']
  }
}
