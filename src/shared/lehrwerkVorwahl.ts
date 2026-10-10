/**
 * Lehrwerk vorwählen (09.10.2026, Wunsch der Lehrkraft): Beim Hinzufügen von Vokabeln („Vokabeln hinzufügen") und
 * Grammatik („Grammatik zum Üben freigeben") stehen Lehrwerk und Band der Klasse schon da – die Lehrkraft kann alles ändern.
 *
 * Vorrang:
 *  1. was Kurs bzw. Klasse schon nutzen: Lehrwerk des Kurses, Lehrwerk-Stand der Lerngruppe („Meine Klassen"), Kurse der
 *     gleichnamigen Lerngruppen (dieselbe Klasse),
 *  2. die übliche Reihe der Lehrkraft in dieser Sprache (am häufigsten genutztes Lehrwerk), umgerechnet auf den Jahrgang
 *     der Klasse (Klasse 5 + Green Line → „Green Line 1"; Band mit `grade` = Jahrgang, passendes Land/Schulform zuerst),
 *  3. sonst nichts.
 * Vokabeln: dazu der nächste Abschnitt nach dem höchsten schon im Kurs. Grammatik: die Units bis zum Stand der Klasse.
 */

export interface VorwahlBuch {
  id: string
  name: string
  language: string
  grade?: number
  stateId?: string
  schoolTypeId?: string
  reihe?: string
  units: { name: string; sections: { name: string }[] }[]
}

/** Was der Server über Kurs und Klasse weiß (GET /server/klassen/vorwahl) */
export interface VorwahlDaten {
  sprache: string
  jahrgang: number | null
  /** Lehrwerk (Kennung) und Units des Kurses */
  kursLehrwerk: string | null
  kursUnits: { unit: string; abschnitte: string[] }[]
  /** Lehrwerk-Stand der Lerngruppe (Grammatik-Band, z. B. „Green Line 1", und Unit) – gesetzt oder automatisch (seit 09.10.2026 nur der Band, Unit leer) */
  stand: { buch: string; unit: string } | null
  /** Lehrwerke der Kurse derselben Klasse (gleichnamige Lerngruppen), jüngste zuerst */
  klassenLehrwerke: string[]
  /** Lehrwerke der Lehrkraft in dieser Sprache, häufigste zuerst */
  ueblicheLehrwerke: string[]
  /** Alle Lehrwerke (Bände) des Kurses, aus den Abschnitten (10.10.2026: mehrere Bände je Kurs) */
  kursLehrwerke?: string[]
  /**
   * Für den GANZEN Kurs freigegebene Abschnitte (10.10.2026) – im Dialog „Vokabeln hinzufügen" standardmäßig ausgeblendet.
   * `lehrwerk` = Kennung, falls bekannt; `buch` = Name des Bands.
   */
  freigegeben?: FreiAbschnitt[]
  /** Nur für einzelne Lernende freigegeben (Einzel-Freigaben) – zählt NICHT als freigegeben, nur als Hinweis */
  einzeln?: (FreiAbschnitt & { lernende: number })[]
  /** Grammatik (Themen-Kennungen), die für den ganzen Kurs bzw. die ganze Klasse freigegeben ist */
  grammatikFrei?: string[]
  /** Grammatik nur für einzelne Lernende freigegeben */
  grammatikEinzeln?: { id: string; lernende: number }[]
}

export interface FreiAbschnitt {
  lehrwerk: string
  buch: string
  unit: string
  abschnitt: string
}

export const normName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const reiheVon = (b: Pick<VorwahlBuch, 'reihe' | 'name'>): string => b.reihe || b.name.replace(/\s*\d+\s*$/, '') || b.name

/** Band einer Reihe für einen Jahrgang – Land und Schulform der Schule zuerst */
export function bandFuerJahrgang<B extends VorwahlBuch>(
  buecher: B[],
  reihe: string,
  sprache: string,
  jahrgang: number,
  schule: { land?: string; schulform?: string } = {}
): B | null {
  const passend = buecher.filter((b) => b.language === sprache && reiheVon(b) === reihe && b.grade === jahrgang)
  const punkte = (b: VorwahlBuch): number =>
    (schule.land && b.stateId === schule.land ? 2 : 0) + (schule.schulform && b.schoolTypeId === schule.schulform ? 1 : 0)
  return [...passend].sort((a, b) => punkte(b) - punkte(a))[0] ?? null
}

/** Lehrwerk zu einem Grammatik-Band („Green Line 1" → green-line-1, auch „green-line-1-nds") */
export function buchZuBand<B extends VorwahlBuch>(buecher: B[], band: string, sprache: string): B | null {
  const n = normName(band)
  if (!n) return null
  return (
    buecher
      .filter((b) => b.language === sprache && (normName(b.name) === n || normName(b.id).startsWith(n)))
      .sort((a, b) => a.id.length - b.id.length)[0] ?? null
  )
}

/** Das vorzuwählende Lehrwerk (Band) */
export function vorwahlBuch<B extends VorwahlBuch>(d: VorwahlDaten, buecher: B[], schule: { land?: string; schulform?: string } = {}): B | null {
  const nachId = (id: string | null | undefined): B | null => (id ? buecher.find((b) => b.id === id && b.language === d.sprache) ?? null : null)
  // 1. Kurs (mehrere Bände: der neueste bzw. aktuelle, 10.10.2026), Stand der Lerngruppe, andere Kurse der Klasse
  const kursBaende = (d.kursLehrwerke ?? []).map(nachId).filter((b): b is B => Boolean(b))
  if (kursBaende.length) return [...kursBaende].sort((a, b) => bandNummer(b) - bandNummer(a))[0]
  const kurs = nachId(d.kursLehrwerk)
  if (kurs) return kurs
  const stand = d.stand ? buchZuBand(buecher, d.stand.buch, d.sprache) : null
  if (stand) return stand
  for (const id of d.klassenLehrwerke) {
    const b = nachId(id)
    if (b) return b
  }
  // 2. Übliche Reihe der Lehrkraft, Band nach Jahrgang
  if (d.jahrgang)
    for (const id of d.ueblicheLehrwerke) {
      const b = nachId(id)
      if (!b) continue
      const band = bandFuerJahrgang(buecher, reiheVon(b), d.sprache, d.jahrgang, schule)
      if (band) return band
    }
  return null
}

/** Nummer eines Bands (grade, sonst die Zahl am Ende des Namens; Transition/Oberstufe dahinter) */
const bandNummer = (b: Pick<VorwahlBuch, 'name' | 'grade'>): number => {
  const n = /(\d+)\s*$/.exec(b.name)
  if (n) return Number(n[1])
  if (/transition/i.test(b.name)) return 50
  if (/oberstufe/i.test(b.name)) return 60
  return b.grade ?? 0
}

/** Schlüssel eines Abschnitts für `bandStand` */
export const abschnittSchluessel = (unit: string, abschnitt: string): string => `${normName(unit)}|${normName(abschnitt)}`

/** Gehört ein freigegebener Abschnitt zu diesem Band? (Kennung oder Name) */
export const imBand = (f: Pick<FreiAbschnitt, 'lehrwerk' | 'buch'>, b: Pick<VorwahlBuch, 'id' | 'name'>): boolean =>
  (Boolean(f.lehrwerk) && f.lehrwerk === b.id) || (Boolean(f.buch) && normName(f.buch) === normName(b.name))

/**
 * Stand eines Bands für den Dialog „Vokabeln hinzufügen" (10.10.2026, Wunsch der Lehrkraft): welche Abschnitte schon für
 * den ganzen Kurs freigegeben sind (ausgeblendet), welche nur für einzelne (sichtbar, mit Hinweis) und welcher Abschnitt
 * „als Nächstes" dran ist – der erste noch nicht freigegebene nach dem letzten freigegebenen (Buchreihenfolge). Ohne
 * Freigegebenes in diesem Band: kein Vorschlag.
 */
export function bandStand(
  buch: Pick<VorwahlBuch, 'id' | 'name' | 'units'>,
  d: Pick<VorwahlDaten, 'freigegeben' | 'einzeln' | 'kursLehrwerk' | 'kursUnits'>
): { frei: Set<string>; einzeln: Map<string, number>; naechster: { unit: string; abschnitt: string } | null } {
  const schluessel = abschnittSchluessel
  const frei = new Set<string>()
  for (const f of d.freigegeben ?? []) if (imBand(f, buch)) frei.add(schluessel(f.unit, f.abschnitt))
  // Ältere Kurse ohne Angaben je Abschnitt: die Herkunft des Kurses
  if (d.kursLehrwerk === buch.id) for (const u of d.kursUnits) for (const a of u.abschnitte) frei.add(schluessel(u.unit, a))
  const einzeln = new Map<string, number>()
  for (const f of d.einzeln ?? []) if (imBand(f, buch) && !frei.has(schluessel(f.unit, f.abschnitt))) einzeln.set(schluessel(f.unit, f.abschnitt), f.lernende)
  const folge = buch.units.flatMap((u) => u.sections.map((s) => ({ unit: u.name, abschnitt: s.name })))
  let letzter = -1
  for (const [i, f] of folge.entries()) if (frei.has(schluessel(f.unit, f.abschnitt))) letzter = i
  const naechster = letzter < 0 ? null : folge.slice(letzter + 1).find((f) => !frei.has(schluessel(f.unit, f.abschnitt))) ?? null
  return { frei, einzeln, naechster }
}

/**
 * Grammatik „als Nächstes" (10.10.2026): die erste sicher zugeordnete Form in der Reihenfolge des Lehrwerks
 * (Einträge der Units, wie grammatikAuswahl.ts `unitEintraege`), die für Kurs bzw. Klasse noch nicht freigegeben ist –
 * nach der letzten freigegebenen. Ohne Freigegebenes: die erste Form des Bands.
 */
export function naechsteGrammatik(
  eintraege: { kapitel: string; ids: string[]; sicher: boolean }[],
  frei: Iterable<string>
): { id: string; kapitel: string } | null {
  const f = new Set(frei)
  // Je Form ihre erste Stelle im Buch (spätere Wiederholungen verschieben den Stand nicht)
  const da = new Set<string>()
  const folge = eintraege
    .filter((e) => e.sicher)
    .flatMap((e) => e.ids.map((id) => ({ id, kapitel: e.kapitel })))
    .filter((x) => !da.has(x.id) && Boolean(da.add(x.id)))
  let letzter = -1
  for (const [i, x] of folge.entries()) if (f.has(x.id)) letzter = i
  return folge.slice(letzter + 1).find((x) => !f.has(x.id)) ?? null
}

/** Nächster Abschnitt nach dem höchsten schon im Kurs (Buchreihenfolge, auch über die Unit hinaus); ohne Bisheriges: keiner */
export function naechsterAbschnitt(
  buch: Pick<VorwahlBuch, 'units'>,
  bisher: { unit: string; abschnitte: string[] }[]
): { unit: string; abschnitt: string } | null {
  const folge = buch.units.flatMap((u) => u.sections.map((s) => ({ unit: u.name, abschnitt: s.name })))
  let hoechster = -1
  for (const [i, f] of folge.entries())
    if (bisher.some((u) => u.unit === f.unit && (u.abschnitte.includes(f.abschnitt) || !u.abschnitte.length))) hoechster = i
  if (hoechster < 0) return null
  return folge[hoechster + 1] ?? null
}

/** Grammatik: Units vom Anfang des Bands bis zum Stand der Klasse (Stand der Lerngruppe, sonst höchste Unit des Kurses) */
export function grammatikUnits(kapitel: string[], band: string, d: Pick<VorwahlDaten, 'stand' | 'kursUnits'>): string[] {
  let bis = -1
  if (d.stand && normName(d.stand.buch) === normName(band)) bis = kapitel.indexOf(d.stand.unit)
  if (bis < 0) for (const u of d.kursUnits) bis = Math.max(bis, kapitel.indexOf(u.unit))
  return bis < 0 ? [] : kapitel.slice(0, bis + 1)
}
