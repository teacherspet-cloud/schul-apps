/**
 * Band je Vokabel-Abschnitt nachtragen (10.10.2026, Befund der Lehrkraft: Ein Kurs mit Vokabeln aus Green Line 1 UND
 * Green Line 2 zeigte in „Units", in der Wortliste und unter „Abschnitte und Stand der Lernenden" nur EINEN Band).
 *
 * Ursache: Der Band eines Abschnitts kam aus dem Titel („Green Line 1 - Unit 1 - …"), aus der Lehrwerk-Kennung je
 * Abschnitt (erst seit 09.10.2026 gemerkt) oder – als Rückfall – aus der Herkunft des Kurses (`quelle.lehrwerk`). Die
 * Herkunft nennt aber nur EIN Lehrwerk: Kommt ein anderer Band dazu, ersetzt er sie (server/vokabeln.ts
 * `quelleZusammen`). Ältere Abschnitte ohne Band im Titel („Station 1", seit dem Teilen vom 09.10.2026 auch
 * „Unit 1 · Check-in") fielen so alle in den neuesten Band.
 *
 * Hier wird je Abschnitt ohne Kennung das Lehrwerk bestimmt: nennt der Titel einen Band, das Lehrwerk dieses Namens;
 * sonst über die Wörter des Abschnitts – das Lehrwerk (aus derselben Reihe wie die Herkunft), in dessen Abschnitt gleichen
 * Namens die meisten Wörter stehen (mindestens die Hälfte gefunden). Nennt der Titel keine Unit, kommt sie mit.
 * Rein rechnend: Lehrwerke reicht der Aufrufer herein (server/wartungVokabelBaende.ts).
 */
import { bandImTitel, vergleich, type BuchFuerTeilen, type TeilBasis, type WortBasis } from './abschnitteTeilen'

export interface TeilMitBand extends TeilBasis {
  lehrwerk?: string
  unit?: string
}

interface Fundstelle {
  unit: string
  abschnitt: string
}

/** Wortverzeichnis eines Lehrwerks: Begriff + Übersetzung bzw. nur der Begriff → Fundstellen */
function verzeichnis(buch: BuchFuerTeilen): { beide: Map<string, Fundstelle[]>; begriff: Map<string, Fundstelle[]> } {
  const beide = new Map<string, Fundstelle[]>()
  const begriff = new Map<string, Fundstelle[]>()
  const dazu = (m: Map<string, Fundstelle[]>, k: string, f: Fundstelle): void => {
    const l = m.get(k)
    if (l) l.push(f)
    else m.set(k, [f])
  }
  for (const u of buch.units)
    for (const s of u.sections)
      for (const e of s.entries) {
        if (!e.term) continue
        const f = { unit: u.name, abschnitt: s.name }
        dazu(beide, `${vergleich(e.term)}|${vergleich(e.translation)}`, f)
        dazu(begriff, vergleich(e.term), f)
      }
  return { beide, begriff }
}

/** Nennt der Titel die Unit selbst? („Band - Unit - …", „Unit 1: …", „Unit 1 · Station 1") */
const titelMitUnit = (titel: string): boolean => Boolean(bandImTitel(titel)) || titel.includes(' · ') || /^[^,]+:/.test(titel.trim())

/** Abschnittsnamen im Titel („Check-in, Station 1" bzw. „Unit 1 · Station 1" → Station 1) */
const namenImTitel = (titel: string): string[] => {
  const t = titel.includes(' · ') ? titel.split(' · ').slice(1).join(' · ') : titel
  return t.split(/\s*,\s*/).map(vergleich).filter(Boolean)
}

/**
 * Lehrwerk (und ggf. Unit) je Abschnitt ohne Kennung bestimmen. `teile` deckt die Wörter in Reihenfolge ab (der letzte
 * nimmt den Rest). `buecher` sind die infrage kommenden Lehrwerke (mit `id`). null = nichts geändert.
 */
export function baendeErgaenzen<T extends TeilMitBand, W extends WortBasis>(teile: T[], woerter: W[], buecher: BuchFuerTeilen[]): T[] | null {
  const mitId = buecher.filter((b) => b.id)
  if (!teile.length || !mitId.length || teile.every((t) => t.lehrwerk)) return null
  const verzeichnisse = new Map<string, ReturnType<typeof verzeichnis>>()
  const vz = (b: BuchFuerTeilen): ReturnType<typeof verzeichnis> => {
    let v = verzeichnisse.get(b.id!)
    if (!v) verzeichnisse.set(b.id!, (v = verzeichnis(b)))
    return v
  }
  let geaendert = false
  let start = 0
  const aus = teile.map((t, i) => {
    const ende = i === teile.length - 1 ? woerter.length : Math.min(woerter.length, start + Math.max(0, t.anzahl))
    const bereich = woerter.slice(start, ende)
    start = ende
    if (t.lehrwerk) return t
    // Band im Titel: das Lehrwerk dieses Namens
    const band = bandImTitel(t.titel)
    if (band) {
      const b = mitId.find((x) => vergleich(x.name) === vergleich(band))
      if (!b) return t
      geaendert = true
      return { ...t, lehrwerk: b.id }
    }
    if (!bereich.length) return t
    // Über die Wörter: zuerst Treffer im Abschnitt gleichen Namens, dann alle Treffer
    const namen = namenImTitel(t.titel)
    let bestes: { buch: BuchFuerTeilen; passend: number; alle: number; units: Map<string, number> } | null = null
    for (const b of mitId) {
      const { beide, begriff } = vz(b)
      let passend = 0
      let alle = 0
      const units = new Map<string, number>()
      for (const w of bereich) {
        const fund = beide.get(`${vergleich(w.term)}|${vergleich(w.translation)}`) ?? begriff.get(vergleich(w.term))
        if (!fund?.length) continue
        alle++
        const gleich = fund.filter((f) => namen.includes(vergleich(f.abschnitt)))
        if (gleich.length) passend++
        for (const f of gleich.length ? gleich : fund) units.set(f.unit, (units.get(f.unit) ?? 0) + (gleich.length ? 2 : 1))
      }
      if (alle * 2 < bereich.length) continue
      if (!bestes || passend > bestes.passend || (passend === bestes.passend && alle > bestes.alle)) bestes = { buch: b, passend, alle, units }
    }
    if (!bestes) return t
    geaendert = true
    const unit = titelMitUnit(t.titel) || t.unit ? '' : [...bestes.units.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    return { ...t, lehrwerk: bestes.buch.id, ...(unit ? { unit } : {}) }
  })
  return geaendert ? aus : null
}
