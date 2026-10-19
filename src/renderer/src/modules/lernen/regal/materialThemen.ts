/**
 * Materialien der Lernenden nach Überthemen (19.10.2026, abgestimmt mit der Lehrkraft; Zuordnung am Server,
 * ueberthemen.ts – mit der Benennung der Lehrkraft). Aufbau wie die Vokabelseiten:
 *  - Schuljahre absteigend (das neueste oben),
 *  - im neuesten Schuljahr das neueste Überthema oben (Oberstufe: späteres Halbjahr oben),
 *  - in früheren Schuljahren chronologisch (Oberstufe nach Halbjahren Q1.1 → Q2.2),
 *  - „Weitere Materialien" (ohne passendes Überthema) jeweils zuletzt.
 */
export interface ThemenInfo {
  thema: string
  schluessel: string
  schuljahr: number
  jahrgang: number | null
  semester?: string
  rang: number
  modul?: string
  erstellt: string
}

export interface ThemenStand {
  eintraege: Record<string, ThemenInfo>
  schuljahr: number
}

export interface Themengruppe<T> {
  schluessel: string
  name: string
  semester?: string
  items: T[]
}

export interface Jahrgruppe<T> {
  schuljahr: number
  jahrgang: number | null
  themen: Themengruppe<T>[]
}

const ms = (iso: string | undefined): number => (iso ? Date.parse(iso) || 0 : 0)

/** `key` = "<art>:<id>" wie am Server (Tests: "test:<code>") */
export function themenGruppieren<T extends { key: string }>(items: T[], st: ThemenStand | null, nurSchuljahr?: number): Jahrgruppe<T>[] {
  const jetzt = st?.schuljahr ?? 0
  const jahre = new Map<number, { jahrgang: number | null; themen: Map<string, Themengruppe<T> & { zeiten: number[] }> }>()
  for (const it of items) {
    const info = st?.eintraege[it.key]
    const sj = info?.schuljahr ?? jetzt
    if (nurSchuljahr !== undefined && sj !== nurSchuljahr) continue
    if (!jahre.has(sj)) jahre.set(sj, { jahrgang: info?.jahrgang ?? null, themen: new Map() })
    const j = jahre.get(sj)!
    if (j.jahrgang === null && info?.jahrgang) j.jahrgang = info.jahrgang
    const sch = info?.schluessel ?? 'weitere'
    if (!j.themen.has(sch)) j.themen.set(sch, { schluessel: sch, name: info?.thema ?? 'Weitere Materialien', ...(info?.semester ? { semester: info.semester } : {}), items: [], zeiten: [] })
    const t = j.themen.get(sch)!
    t.items.push(it)
    t.zeiten.push(ms(info?.erstellt))
  }
  const sortiert = [...jahre.entries()].sort((a, b) => b[0] - a[0])
  return sortiert.map(([schuljahr, j], i) => {
    const neuestes = i === 0
    const weitere = (t: Themengruppe<T>): number => (t.schluessel === 'weitere' ? 1 : 0)
    const themen = [...j.themen.values()]
      .map((t) => {
        // Material im Überthema: im neuesten Jahr Neuestes oben, früher der Reihe nach
        const paare = t.items.map((x, k) => ({ x, z: t.zeiten[k] })).sort((a, b) => (neuestes ? b.z - a.z : a.z - b.z))
        return { ...t, items: paare.map((p) => p.x), neu: Math.max(0, ...t.zeiten), alt: Math.min(...t.zeiten) }
      })
      .sort((a, b) =>
        neuestes
          ? weitere(a) - weitere(b) || (b.semester ?? '').localeCompare(a.semester ?? '') || b.neu - a.neu
          : weitere(a) - weitere(b) || (a.semester ?? '').localeCompare(b.semester ?? '') || a.alt - b.alt
      )
      .map(({ zeiten: _z, neu: _n, alt: _a, ...t }) => t as Themengruppe<T>)
    return { schuljahr, jahrgang: j.jahrgang, themen }
  })
}
