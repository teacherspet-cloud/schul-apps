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
  /**
   * Oberbereich (Paket 12): Bereiche können Unterbereiche haben, beliebig tief – die Oberfläche
   * ist für drei Ebenen gebaut. Beispiel der Lehrkraft: „Der Erste Weltkrieg" › „Ursachen des
   * Ersten Weltkriegs" › „Der Balkan als Krisenherd Europas". Fehlt = oberste Ebene unter dem Fach.
   */
  elternId?: string
  /** Von der Automatik aus Lehrplan, Lehrwerk oder Grammatiktabelle angelegt (nur zur Kennzeichnung) */
  herkunft?: 'lehrplan' | 'lehrwerk' | 'grammatik'
  /**
   * Wortlaut des Lehrplans, wenn der Name daraus gekürzt ist (Paket 13): „Entwicklung der Medien"
   * statt „Entwicklung der Medien seit dem Zeitalter der Hochkulturen bis in die Gegenwart
   * (Längsschnitt)". Erscheint als Tooltip; beim Umbenennen bleibt er – der Lehrplan ist derselbe.
   */
  wortlaut?: string
  /** Stellung unter den Geschwistern (aufsteigend) */
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
  /** 2 seit Paket 12 (Unterbereiche); Dateien der Version 1 werden beim Einlesen übernommen – ihre Bereiche stehen oben */
  version: 2
  bereiche: Themenbereich[]
  /** Schlüssel: `materialSchluessel(moduleId, id)` */
  zuordnungen: Record<string, Zuordnung>
  /** Eigene Reihenfolge je Bereich (per Ziehen); Schlüssel wie oben. `ohne:<fachId>` für „Ohne Themenbereich" */
  reihenfolge: Record<string, string[]>
  /**
   * Automatik je Fach. Seit Paket 12 (Wunsch der Lehrkraft: „vorhandene Materialien AUTOMATISCH
   * einsortiert") ist sie überall an; `false` heißt: in diesem Fach ausdrücklich ausgeschaltet.
   * In Version 1 stand hier nur `true` für Fächer, in denen ein Vorschlag übernommen war.
   */
  automatik: Record<string, boolean>
}

export const leereThemen = (): ThemenDaten => ({ version: 2, bereiche: [], zuordnungen: {}, reihenfolge: {}, automatik: {} })

/** Sortiert die Automatik in diesem Fach ein? (Standard: ja) */
export const automatikAn = (d: Pick<ThemenDaten, 'automatik'>, fachId: string): boolean => d.automatik[fachId] !== false

export const materialSchluessel = (moduleId: string, id: string): string => `${moduleId}:${id}`

/** Ein Vorschlag, den die Lehrkraft mit einem Klick übernimmt (siehe renderer/shared/themenVorschlag.ts) */
export interface BereichsUebernahme {
  fachId: string
  name: string
  /**
   * Oberbereiche von oben nach unten (Namen), unter denen der Bereich liegt – fehlende werden
   * angelegt, vorhandene gleichen Namens wiederverwendet (Paket 12, Hierarchie aus dem Lehrplan).
   */
  pfad?: string[]
  /** Woher die Automatik den Namen hat – Lehrplan, Lehrwerk, Grammatik werden an neu angelegten Bereichen vermerkt */
  herkunft?: string
  /** Wortlaut gekürzter Lehrplantitel je Name (Paket 13) – kommt an die neu angelegten Bereiche */
  wortlaute?: Record<string, string>
  /** Vorhandener Bereich gleichen Namens – dann kommen die Materialien dorthin */
  bereichId?: string
  schluessel: string[]
}

const jetzt = (): string => new Date().toISOString()

/** Herkünfte, die an einem automatisch angelegten Bereich vermerkt werden */
const HERKUNFT = ['lehrplan', 'lehrwerk', 'grammatik'] as const

/** Liest eine Datei ein und verwirft, was nicht passt – eine beschädigte Datei darf die Bibliotheken nicht lahmlegen. */
export function pruefeThemen(roh: unknown): ThemenDaten {
  const d = leereThemen()
  if (!roh || typeof roh !== 'object') return d
  const r = roh as Partial<ThemenDaten>
  if (Array.isArray(r.bereiche))
    d.bereiche = r.bereiche.filter(
      (b): b is Themenbereich => !!b && typeof b.id === 'string' && typeof b.fachId === 'string' && typeof b.name === 'string' && b.name.trim() !== ''
    )
  /*
   * Unterbereiche (Paket 12): Ein Verweis auf einen fehlenden Oberbereich, auf einen aus einem
   * anderen Fach oder ein Kreis (A unter B unter A) kann nur aus einer beschädigten Datei stammen
   * – der Bereich rückt dann nach oben, statt samt Inhalt unsichtbar zu werden. Dateien der
   * Version 1 kennen gar keine Oberbereiche; ihre Bereiche stehen danach oben wie bisher.
   */
  const nachId = new Map(d.bereiche.map((b) => [b.id, b]))
  d.bereiche = d.bereiche.map((b) => {
    const { elternId, ...rest } = b
    if (typeof elternId !== 'string') return rest
    const eltern = nachId.get(elternId)
    if (!eltern || eltern.fachId !== b.fachId) return rest
    // Kreis? Den Weg nach oben gehen – kommt man wieder bei sich an, ist er kaputt
    const gesehen = new Set([b.id])
    for (let x: Themenbereich | undefined = eltern; x; x = x.elternId ? nachId.get(x.elternId) : undefined) {
      if (gesehen.has(x.id)) return rest
      gesehen.add(x.id)
    }
    return { ...rest, elternId }
  })
  const ids = new Set(d.bereiche.map((b) => b.id))
  if (r.zuordnungen && typeof r.zuordnungen === 'object')
    for (const [k, z] of Object.entries(r.zuordnungen))
      if (z && (z.von === 'hand' || z.von === 'auto') && (z.bereichId === null || ids.has(z.bereichId)))
        d.zuordnungen[k] = { bereichId: z.bereichId, von: z.von, am: typeof z.am === 'string' ? z.am : '' }
  if (r.reihenfolge && typeof r.reihenfolge === 'object')
    for (const [k, v] of Object.entries(r.reihenfolge)) if (Array.isArray(v)) d.reihenfolge[k] = v.filter((s) => typeof s === 'string')
  if (r.automatik && typeof r.automatik === 'object') for (const [k, v] of Object.entries(r.automatik)) if (typeof v === 'boolean') d.automatik[k] = v
  return d
}

// ---------- Hierarchie (Paket 12) ----------

/** Die Bereiche direkt unter `elternId` (null = oberste Ebene des Fachs), in ihrer Reihenfolge */
export function kinderVon(d: Pick<ThemenDaten, 'bereiche'>, fachId: string, elternId: string | null): Themenbereich[] {
  return d.bereiche
    .filter((b) => b.fachId === fachId && (b.elternId ?? null) === elternId)
    .sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de'))
}

/** Der Weg von oben bis zum Bereich selbst („Der Erste Weltkrieg", „Ursachen …", „Der Balkan …") */
export function pfadVon(d: Pick<ThemenDaten, 'bereiche'>, id: string): Themenbereich[] {
  const nachId = new Map(d.bereiche.map((b) => [b.id, b]))
  const pfad: Themenbereich[] = []
  for (let b = nachId.get(id); b && !pfad.includes(b); b = b.elternId ? nachId.get(b.elternId) : undefined) pfad.unshift(b)
  return pfad
}

/** Alle Unterbereiche eines Bereichs, beliebig tief (ohne ihn selbst) */
export function nachfahrenVon(d: Pick<ThemenDaten, 'bereiche'>, id: string): string[] {
  const out: string[] = []
  const offen = [id]
  while (offen.length) {
    const eltern = offen.pop()!
    for (const b of d.bereiche)
      if (b.elternId === eltern && !out.includes(b.id)) {
        out.push(b.id)
        offen.push(b.id)
      }
  }
  return out
}

/**
 * Welche Bereiche eine EINGESCHRÄNKTE Ansicht zeigt (Paket 15; „nur Arbeitsblätter", Jahrgang):
 * die mit passenden Materialien – direkt oder in einem Unterbereich, beliebig tief – samt den
 * Oberbereichen auf dem Weg dorthin, dazu die in `immer` genannten (eben angelegte, noch leere
 * Bereiche) mit ihren Oberbereichen. Leere und nur mit anderen Materialarten gefüllte Bereiche
 * fallen weg.
 *
 * `direkt`: Zahl der passenden Materialien, die direkt im Bereich liegen.
 */
export function bereicheMitInhalt(d: Pick<ThemenDaten, 'bereiche'>, direkt: ReadonlyMap<string, number>, immer: Iterable<string> = []): Set<string> {
  const nachId = new Map(d.bereiche.map((b) => [b.id, b]))
  const out = new Set<string>()
  const mitOberen = (id: string): void => {
    for (let b = nachId.get(id); b && !out.has(b.id); b = b.elternId ? nachId.get(b.elternId) : undefined) out.add(b.id)
  }
  for (const [id, n] of direkt) if (n > 0) mitOberen(id)
  for (const id of immer) mitOberen(id)
  return out
}

/**
 * Der oberste Bereich über einem Bereich (bzw. er selbst, wenn er oben steht).
 *
 * Er ist das ÜBERTHEMA im Kopf der Materialien (Paket 11/12): Ein Blatt in „Der Erste Weltkrieg
 * › Ursachen › Der Balkan als Krisenherd" trägt „Der Erste Weltkrieg" – die Unterrichtseinheit.
 * Der Unterbereich ist meist schon das Thema des Blattes selbst; im Kopf daneben stünde es
 * doppelt. Wer es anders will, trägt das Überthema am Material von Hand ein.
 */
export function obersterBereich(d: Pick<ThemenDaten, 'bereiche'>, id: string): Themenbereich | null {
  return pfadVon(d, id)[0] ?? null
}

const gleicherName = (a: string, b: string): boolean => a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de')

/** Legt einen Bereich an oder benennt ihn um. Zwei gleichnamige Bereiche in einem Fach wären nicht auseinanderzuhalten. */
export function bereichSetzen(d: ThemenDaten, b: Pick<Themenbereich, 'id' | 'fachId' | 'name'> & Partial<Themenbereich>): ThemenDaten {
  const name = b.name.trim().slice(0, 80)
  if (!name) throw new Error('Der Themenbereich braucht einen Namen.')
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(b.id)) throw new Error('Ungültige Kennung eines Themenbereichs.')
  const alt = d.bereiche.find((x) => x.id === b.id)
  const fachId = alt?.fachId ?? b.fachId
  // Der Oberbereich bleibt beim Umbenennen, wie er ist – verschoben wird mit `bereichVerschieben`
  const elternId = alt ? alt.elternId : b.elternId
  if (elternId && !d.bereiche.some((x) => x.id === elternId && x.fachId === fachId)) throw new Error('Den übergeordneten Themenbereich gibt es nicht mehr.')
  // Gleiche Namen nur unter verschiedenen Oberbereichen – „Quellen" darf es in zwei Einheiten geben
  if (d.bereiche.some((x) => x.id !== b.id && x.fachId === fachId && (x.elternId ?? null) === (elternId ?? null) && gleicherName(x.name, name)))
    throw new Error(elternId ? `Einen Unterbereich „${name}“ gibt es dort schon.` : `Einen Themenbereich „${name}“ gibt es in diesem Fach schon.`)
  const reihenfolge = alt?.reihenfolge ?? b.reihenfolge ?? Math.max(0, ...kinderVon(d, fachId, elternId ?? null).map((x) => x.reihenfolge + 1))
  const herkunft = alt?.herkunft ?? b.herkunft
  const wortlautRoh = alt?.wortlaut ?? b.wortlaut
  const wortlaut = typeof wortlautRoh === 'string' ? wortlautRoh.trim().slice(0, 400) : ''
  const neu: Themenbereich = {
    id: b.id,
    fachId,
    name,
    ...(elternId ? { elternId } : {}),
    ...(herkunft ? { herkunft } : {}),
    ...(wortlaut ? { wortlaut } : {}),
    reihenfolge,
    angelegt: alt?.angelegt ?? b.angelegt ?? jetzt(),
    ...((b.beschreibung ?? alt?.beschreibung) ? { beschreibung: (b.beschreibung ?? alt?.beschreibung)!.trim() } : {})
  }
  return { ...d, bereiche: alt ? d.bereiche.map((x) => (x.id === b.id ? neu : x)) : [...d.bereiche, neu] }
}

/**
 * Einen Bereich (samt Unterbereichen) unter einen anderen hängen – oder nach oben (`null`).
 * Abgewiesen wird, was einen Kreis ergäbe (unter sich selbst oder einen eigenen Unterbereich)
 * und ein Name, den es am Ziel schon gibt.
 */
export function bereichVerschieben(d: ThemenDaten, id: string, elternId: string | null): ThemenDaten {
  const b = d.bereiche.find((x) => x.id === id)
  if (!b) throw new Error('Den Themenbereich gibt es nicht mehr.')
  if ((b.elternId ?? null) === elternId) return d
  if (elternId) {
    const ziel = d.bereiche.find((x) => x.id === elternId)
    if (!ziel || ziel.fachId !== b.fachId) throw new Error('Themenbereiche lassen sich nur innerhalb eines Fachs verschieben.')
    if (elternId === id || nachfahrenVon(d, id).includes(elternId)) throw new Error('Ein Themenbereich kann nicht in seinen eigenen Unterbereich.')
  }
  if (d.bereiche.some((x) => x.id !== id && x.fachId === b.fachId && (x.elternId ?? null) === elternId && gleicherName(x.name, b.name)))
    throw new Error(`Dort gibt es schon einen Bereich „${b.name}“.`)
  const reihenfolge = Math.max(0, ...kinderVon(d, b.fachId, elternId).map((x) => x.reihenfolge + 1))
  const neu: Themenbereich = { ...b, reihenfolge }
  if (elternId) neu.elternId = elternId
  else delete neu.elternId
  return { ...d, bereiche: d.bereiche.map((x) => (x.id === id ? neu : x)) }
}

/**
 * Löscht einen Bereich MIT seinen Unterbereichen. Die Materialien darin rücken in den
 * Oberbereich des gelöschten Bereichs – bei einem obersten nach „Ohne Themenbereich" – und
 * bleiben dort, bis jemand sie verschiebt. Material geht dabei nie verloren.
 */
export function bereichLoeschen(d: ThemenDaten, id: string): ThemenDaten {
  const weg = new Set([id, ...nachfahrenVon(d, id)])
  const ziel = d.bereiche.find((b) => b.id === id)?.elternId ?? null
  const zuordnungen: Record<string, Zuordnung> = {}
  for (const [k, z] of Object.entries(d.zuordnungen)) zuordnungen[k] = z.bereichId && weg.has(z.bereichId) ? { ...z, bereichId: ziel, am: jetzt() } : z
  const reihenfolge = { ...d.reihenfolge }
  for (const x of weg) delete reihenfolge[x]
  return { ...d, bereiche: d.bereiche.filter((b) => !weg.has(b.id)), zuordnungen, reihenfolge }
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
  /** Bereich dieses Namens unter `elternId` – vorhanden oder neu angelegt */
  const bereichFuer = (fachId: string, name: string, elternId: string | undefined, quelle?: string, wortlaut?: string): string => {
    const da = neu.bereiche.find((b) => b.fachId === fachId && b.elternId === elternId && gleicherName(b.name, name))
    if (da) return da.id
    const id = neueId()
    const herkunft = HERKUNFT.find((h) => h === quelle)
    neu = bereichSetzen(neu, { id, fachId, name, ...(elternId ? { elternId } : {}), ...(herkunft ? { herkunft } : {}), ...(wortlaut ? { wortlaut } : {}) })
    return id
  }
  for (const v of vorschlaege) {
    let id = v.bereichId && neu.bereiche.some((b) => b.id === v.bereichId) ? v.bereichId : undefined
    if (!id && v.pfad?.length) {
      // Hierarchie aus dem Lehrplan: die Oberbereiche der Reihe nach finden oder anlegen
      let eltern: string | undefined
      for (const name of v.pfad) eltern = bereichFuer(v.fachId, name, eltern, v.herkunft, v.wortlaute?.[name])
      id = bereichFuer(v.fachId, v.name, eltern, v.herkunft, v.wortlaute?.[v.name])
    }
    // Ohne Pfad wie bisher: ein gleichnamiger Bereich irgendwo im Fach nimmt die Materialien auf
    id ??= neu.bereiche.find((b) => b.fachId === v.fachId && gleicherName(b.name, v.name))?.id
    id ??= bereichFuer(v.fachId, v.name, undefined, v.herkunft, v.wortlaute?.[v.name])
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
