/**
 * Themenbereiche (Paket 10b, 26.09.2026) – Datenmodell und reine Änderungen.
 *
 * Wunsch der Lehrkraft: Die Bibliotheken gruppierten nach Fach › Jahrgang bzw. nach dem
 * wörtlichen Themen-Text. Aus „Fotosynthese", „Photosynthese – Versuch" und „Licht und
 * Blattgrün" wurden drei Ordner mit je einem Blatt. Jetzt gibt es je Fach eigene, von der
 * Lehrkraft benannte Bereiche („Ökologie", „Zelle") – eine Unterrichtseinheit. Alle
 * Materialarten teilen sie sich: das Arbeitsblatt, die Lernzielkontrolle und der Vokabeltest
 * zur selben Einheit liegen im selben Bereich. Der Jahrgang ist nur noch ein Filter.
 *
 * WO DIE ZUORDNUNG STEHT – und warum nicht im Material selbst:
 * Die Zuordnung gehört fachlich zum Material, liegt aber in EINER Datei neben den Bereichen,
 * geschlüsselt nach „<Programm>:<Kennung>". Stünde sie in den Kopfdaten der Materialien,
 * müsste (1) jedes der fünf Programme sie beim automatischen Sichern mitschleppen – ein
 * vergessenes Feld in einem Programm, und das nächste Sichern löschte die Zuordnung still
 * (siehe „Getrennte Erzeugungswege"); (2) jedes Verschieben schriebe das Material neu und
 * setzte dabei „zuletzt bearbeitet" – die Startseite zeigte umsortierte Materialien als
 * gerade bearbeitet. Damit sie trotzdem am Material hängt, zieht „Kopie anlegen" die
 * Zuordnung mit und „Löschen" räumt sie weg (shared/components/Bibliothek.tsx).
 *
 * VOKABELLISTEN gehören bewusst NICHT dazu (geprüft 26.09.2026): Sie sind Bestand, kein
 * Unterrichtsmaterial – nach Lehrwerk und Unit schon geordnet, über Jahre gewachsen und beim
 * Zurücksetzen geschützt (wartung.ts, `lehrwerke`), während diese Datei zurückgesetzt wird.
 * Eine Liste dient mehreren Einheiten und Jahrgängen; in EINEN Bereich passt sie selten. Was
 * im Unterricht daraus entsteht – der Vokabeltest –, wird zugeordnet.
 *
 * Dieses Modul ist ohne Electron und ohne React geschrieben: Der Hauptprozess wendet die
 * Änderungen an (main/services/storage/themen.ts), die Tests prüfen sie direkt
 * (tests/themenbereiche.test.ts).
 */

export interface Themenbereich {
  id: string
  /** Fachkennung wie in shared/fachfarben.ts (`fachIdVon`), bei unbekannten Fächern der Name in Kleinbuchstaben */
  fachId: string
  name: string
  beschreibung?: string
  /** Stellung unter den Bereichen des Fachs (aufsteigend) */
  reihenfolge: number
  angelegt: string
}

/**
 * Zuordnung eines Materials.
 * - `von: 'hand'`: von der Lehrkraft gesetzt (Ziehen, „Verschieben nach …", „Neu in diesem
 *   Bereich"). Die Automatik fasst es NIE wieder an.
 * - `von: 'auto'`: von der Automatik einsortiert. Bleibt ebenfalls stehen (nichts springt
 *   ungefragt um), wird aber als „automatisch" gekennzeichnet.
 * - `bereichId: null`: ausdrücklich „Ohne Themenbereich" – auch das sortiert die Automatik
 *   nicht mehr ein. Materialien OHNE Eintrag sind dagegen noch nicht einsortiert.
 */
export interface Zuordnung {
  bereichId: string | null
  von: 'hand' | 'auto'
  /** Wann gesetzt – zum Aufräumen verwaister Einträge (siehe `verwaisteSchluessel`) */
  am: string
}

export interface ThemenDaten {
  version: 1
  bereiche: Themenbereich[]
  /** Schlüssel: `materialSchluessel(moduleId, id)` */
  zuordnungen: Record<string, Zuordnung>
  /** Eigene Reihenfolge je Bereich (per Ziehen); Schlüssel wie oben. `ohne:<fachId>` für „Ohne Themenbereich" */
  reihenfolge: Record<string, string[]>
  /** Fächer, in denen neue Materialien automatisch einsortiert werden (eingeschaltet mit dem ersten übernommenen Vorschlag) */
  automatik: Record<string, boolean>
}

export const leereThemen = (): ThemenDaten => ({ version: 1, bereiche: [], zuordnungen: {}, reihenfolge: {}, automatik: {} })

export const materialSchluessel = (moduleId: string, id: string): string => `${moduleId}:${id}`

/** Ein Vorschlag, den die Lehrkraft mit einem Klick übernimmt (siehe renderer/shared/themenVorschlag.ts) */
export interface BereichsUebernahme {
  fachId: string
  name: string
  /** Vorhandener Bereich gleichen Namens – dann kommen die Materialien dorthin */
  bereichId?: string
  schluessel: string[]
}

const jetzt = (): string => new Date().toISOString()

/** Liest eine Datei ein und verwirft, was nicht passt – eine beschädigte Datei darf die Bibliotheken nicht lahmlegen. */
export function pruefeThemen(roh: unknown): ThemenDaten {
  const d = leereThemen()
  if (!roh || typeof roh !== 'object') return d
  const r = roh as Partial<ThemenDaten>
  if (Array.isArray(r.bereiche))
    d.bereiche = r.bereiche.filter(
      (b): b is Themenbereich => !!b && typeof b.id === 'string' && typeof b.fachId === 'string' && typeof b.name === 'string' && b.name.trim() !== ''
    )
  const ids = new Set(d.bereiche.map((b) => b.id))
  if (r.zuordnungen && typeof r.zuordnungen === 'object')
    for (const [k, z] of Object.entries(r.zuordnungen))
      if (z && (z.von === 'hand' || z.von === 'auto') && (z.bereichId === null || ids.has(z.bereichId)))
        d.zuordnungen[k] = { bereichId: z.bereichId, von: z.von, am: typeof z.am === 'string' ? z.am : '' }
  if (r.reihenfolge && typeof r.reihenfolge === 'object')
    for (const [k, v] of Object.entries(r.reihenfolge)) if (Array.isArray(v)) d.reihenfolge[k] = v.filter((s) => typeof s === 'string')
  if (r.automatik && typeof r.automatik === 'object') for (const [k, v] of Object.entries(r.automatik)) if (v === true) d.automatik[k] = true
  return d
}

const gleicherName = (a: string, b: string): boolean => a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de')

/** Legt einen Bereich an oder benennt ihn um. Zwei gleichnamige Bereiche in einem Fach wären nicht auseinanderzuhalten. */
export function bereichSetzen(d: ThemenDaten, b: Pick<Themenbereich, 'id' | 'fachId' | 'name'> & Partial<Themenbereich>): ThemenDaten {
  const name = b.name.trim().slice(0, 80)
  if (!name) throw new Error('Der Themenbereich braucht einen Namen.')
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(b.id)) throw new Error('Ungültige Kennung eines Themenbereichs.')
  if (d.bereiche.some((x) => x.id !== b.id && x.fachId === b.fachId && gleicherName(x.name, name)))
    throw new Error(`Einen Themenbereich „${name}“ gibt es in diesem Fach schon.`)
  const alt = d.bereiche.find((x) => x.id === b.id)
  const reihenfolge = alt?.reihenfolge ?? b.reihenfolge ?? Math.max(0, ...d.bereiche.filter((x) => x.fachId === b.fachId).map((x) => x.reihenfolge + 1))
  const neu: Themenbereich = {
    id: b.id,
    fachId: alt?.fachId ?? b.fachId,
    name,
    reihenfolge,
    angelegt: alt?.angelegt ?? b.angelegt ?? jetzt(),
    ...((b.beschreibung ?? alt?.beschreibung) ? { beschreibung: (b.beschreibung ?? alt?.beschreibung)!.trim() } : {})
  }
  return { ...d, bereiche: alt ? d.bereiche.map((x) => (x.id === b.id ? neu : x)) : [...d.bereiche, neu] }
}

/** Löscht einen Bereich; seine Materialien landen in „Ohne Themenbereich" (und bleiben dort, bis jemand sie verschiebt). */
export function bereichLoeschen(d: ThemenDaten, id: string): ThemenDaten {
  const zuordnungen: Record<string, Zuordnung> = {}
  for (const [k, z] of Object.entries(d.zuordnungen)) zuordnungen[k] = z.bereichId === id ? { ...z, bereichId: null, am: jetzt() } : z
  const reihenfolge = { ...d.reihenfolge }
  delete reihenfolge[id]
  return { ...d, bereiche: d.bereiche.filter((b) => b.id !== id), zuordnungen, reihenfolge }
}

/** Setzt oder entfernt (null) Zuordnungen. Unbekannte Bereiche werden abgewiesen. */
export function zuordnen(d: ThemenDaten, eintraege: Record<string, Zuordnung | null>): ThemenDaten {
  const ids = new Set(d.bereiche.map((b) => b.id))
  const zuordnungen = { ...d.zuordnungen }
  for (const [k, z] of Object.entries(eintraege)) {
    if (z === null) {
      delete zuordnungen[k]
      continue
    }
    if (z.bereichId !== null && !ids.has(z.bereichId)) throw new Error('Den Themenbereich gibt es nicht mehr.')
    zuordnungen[k] = { bereichId: z.bereichId, von: z.von, am: z.am || jetzt() }
  }
  return { ...d, zuordnungen }
}

/** Übernimmt Vorschläge: legt fehlende Bereiche an, ordnet zu (automatisch) und schaltet die Automatik ein. */
export function uebernehmen(d: ThemenDaten, vorschlaege: BereichsUebernahme[], automatikSchluessel: string[], neueId: () => string): ThemenDaten {
  let neu = d
  for (const v of vorschlaege) {
    let id = v.bereichId && neu.bereiche.some((b) => b.id === v.bereichId) ? v.bereichId : undefined
    id ??= neu.bereiche.find((b) => b.fachId === v.fachId && gleicherName(b.name, v.name))?.id
    if (!id) {
      id = neueId()
      neu = bereichSetzen(neu, { id, fachId: v.fachId, name: v.name })
    }
    const eintraege: Record<string, Zuordnung> = {}
    // Von Hand Zugeordnetes bleibt, wo es ist – auch wenn es im Vorschlag auftaucht
    for (const k of v.schluessel) if (neu.zuordnungen[k]?.von !== 'hand') eintraege[k] = { bereichId: id, von: 'auto', am: jetzt() }
    neu = zuordnen(neu, eintraege)
  }
  const automatik = { ...neu.automatik }
  for (const k of automatikSchluessel) automatik[k] = true
  return { ...neu, automatik }
}

/** Einträge, zu denen es kein Material mehr gibt und die älter als einen Tag sind („Neu in diesem Bereich" ohne gesichertes Material) */
export function verwaisteSchluessel(d: ThemenDaten, vorhanden: Set<string>, heute = Date.now()): string[] {
  const TAG = 24 * 60 * 60 * 1000
  return Object.entries(d.zuordnungen)
    .filter(([k, z]) => !vorhanden.has(k) && heute - (Date.parse(z.am) || 0) > TAG)
    .map(([k]) => k)
}
