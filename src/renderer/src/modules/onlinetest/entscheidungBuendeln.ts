/**
 * „Zu entscheiden" gebündelt (06.10.2026, Wunsch der Lehrkraft: „ähnliche Fehler bündeln – falsche Schreibweisen,
 * falsche Grammatikphänomene usw. – und gleiche Fehler/Fehlerarten gemeinsam sortiert prüfen").
 *
 * Drei Ebenen: Fehlergruppe (Rechtschreibung, Grammatik …) → Fehlerart („Doppelkonsonant", „3. Person -s") → gleicher
 * Fehler (dieselbe Antwort auf dieselbe Lösung, bei mehreren Lernenden). Gruppe und Art liefert die KI bei der
 * Auswertung (kiBewertung.ts); ältere Bewertungen ohne diese Angabe ordnet ein einfacher Vergleich ein.
 */
import { FEHLER_GRUPPEN, type FehlerGruppe } from './kiBewertung'

export interface Fall<T = unknown> {
  /** Eindeutig: Teilnahme + Einheit */
  schluessel: string
  antwort: string
  loesung: string
  fehlerGruppe?: string
  fehlerArt?: string
  pruefen?: 'kleinerFehler' | 'sinnvoll'
  daten: T
}

export interface Buendel<T> {
  /** „recieve" statt „receive" */
  titel: string
  faelle: Fall<T>[]
}
export interface Art<T> {
  art: string
  buendel: Buendel<T>[]
  anzahl: number
}
export interface Gruppe<T> {
  gruppe: FehlerGruppe
  name: string
  arten: Art<T>[]
  anzahl: number
}

const norm = (s: string): string => s.normalize('NFC').replace(/\s+/g, ' ').trim()

/** Editierabstand (klein gehalten – Antworten sind kurz) */
export function abstand(a: string, b: string): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 3) return 99
  const z = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let vorher = z[0]
    z[0] = i
    for (let j = 1; j <= b.length; j++) {
      const t = z[j]
      z[j] = Math.min(z[j] + 1, z[j - 1] + 1, vorher + (a[i - 1] === b[j - 1] ? 0 : 1))
      vorher = t
    }
  }
  return z[b.length]
}

/** Rückfall ohne KI-Angabe: Groß-/Kleinschreibung, kleine Schreibabweichung, sinnvolle Abweichung, sonst Sonstiges */
export function einordnen(f: Pick<Fall, 'antwort' | 'loesung' | 'fehlerGruppe' | 'fehlerArt' | 'pruefen'>): { gruppe: FehlerGruppe; art: string } {
  if (f.fehlerGruppe && f.fehlerGruppe in FEHLER_GRUPPEN)
    return { gruppe: f.fehlerGruppe as FehlerGruppe, art: f.fehlerArt || FEHLER_GRUPPEN[f.fehlerGruppe as FehlerGruppe] }
  const a = norm(f.antwort)
  // Mehrere Lösungen („a / b"): die nächstliegende zählt
  const loesungen = f.loesung
    .split(/\s*[/;|]\s*/)
    .map(norm)
    .filter(Boolean)
  if (loesungen.some((l) => l.toLowerCase() === a.toLowerCase())) return { gruppe: 'grossklein', art: f.fehlerArt || 'Groß-/Kleinschreibung' }
  const d = Math.min(99, ...loesungen.map((l) => abstand(a.toLowerCase(), l.toLowerCase())))
  const sortiert = (x: string): string => [...x.toLowerCase()].sort().join('')
  const vertauscht = loesungen.some((l) => l.length === a.length && sortiert(l) === sortiert(a))
  if (d <= 2 && a.length >= 3)
    return {
      gruppe: 'rechtschreibung',
      art: f.fehlerArt || (vertauscht ? 'Buchstaben vertauscht' : d === 1 ? 'ein Buchstabe abweichend' : 'zwei Buchstaben abweichend')
    }
  if (f.pruefen === 'sinnvoll') return { gruppe: 'wortwahl', art: f.fehlerArt || 'andere sinnvolle Antwort' }
  return { gruppe: 'andere', art: f.fehlerArt || 'Sonstiges' }
}

/** Bündeln und sortieren: größte Gruppen und Arten zuerst, gleiche Fehler zusammen */
export function buendeln<T>(faelle: Fall<T>[]): Gruppe<T>[] {
  const gruppen = new Map<FehlerGruppe, Map<string, Map<string, Fall<T>[]>>>()
  for (const f of faelle) {
    const { gruppe, art } = einordnen(f)
    const artKey = art.trim().toLowerCase()
    const gleich = `${norm(f.loesung).toLowerCase()}→${norm(f.antwort).toLowerCase()}`
    const g = gruppen.get(gruppe) ?? new Map()
    gruppen.set(gruppe, g)
    const a = g.get(artKey) ?? new Map()
    g.set(artKey, a)
    a.set(gleich, [...(a.get(gleich) ?? []), f])
  }
  const artName = (fs: Fall<T>[]): string => einordnen(fs[0]).art
  return [...gruppen]
    .map(([gruppe, arten]) => {
      const liste: Art<T>[] = [...arten.values()]
        .map((b) => {
          const buendel = [...b.values()]
            .map((fs) => ({ titel: `„${norm(fs[0].antwort) || '—'}" statt „${norm(fs[0].loesung) || '—'}"`, faelle: fs }))
            .sort((x, y) => y.faelle.length - x.faelle.length || x.titel.localeCompare(y.titel, 'de'))
          return { art: artName(buendel[0].faelle), buendel, anzahl: buendel.reduce((s, x) => s + x.faelle.length, 0) }
        })
        .sort((x, y) => y.anzahl - x.anzahl || x.art.localeCompare(y.art, 'de'))
      return { gruppe, name: FEHLER_GRUPPEN[gruppe], arten: liste, anzahl: liste.reduce((s, x) => s + x.anzahl, 0) }
    })
    .sort((x, y) => (x.gruppe === 'andere' ? 1 : 0) - (y.gruppe === 'andere' ? 1 : 0) || y.anzahl - x.anzahl)
}
