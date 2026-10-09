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
  /** Lehrwerk-Stand der Lerngruppe (Grammatik-Band, z. B. „Green Line 1", und Unit) – gesetzt oder automatisch */
  stand: { buch: string; unit: string } | null
  /** Lehrwerke der Kurse derselben Klasse (gleichnamige Lerngruppen), jüngste zuerst */
  klassenLehrwerke: string[]
  /** Lehrwerke der Lehrkraft in dieser Sprache, häufigste zuerst */
  ueblicheLehrwerke: string[]
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
  // 1. Kurs, Stand der Lerngruppe, andere Kurse der Klasse
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
