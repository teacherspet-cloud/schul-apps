/**
 * Varianten eines Tafelbilds – alle aus denselben Elementen, ohne zweite Datenhaltung:
 * - Lückentafelbild: Fachbegriffe als gleich lange Lücken (R39: die Länge verrät nichts),
 *   ganze Elemente als Schreibzeilen; auf Wunsch mit Wortspeicher.
 * - Schrittweiser Aufbau: nur Elemente bis Schritt n (Präsentation, PowerPoint, Planungshilfe).
 * - Differenziert ★/★★/★★★: ★ zeigt den Kern (Überschrift, Merksatz, Grundbegriffe), ★★ dazu die
 *   Aspekte, ★★★ alles – dieselbe Überschrift und derselbe Merksatz, damit das Lernziel gleich
 *   bleibt (R40, Zwei-Fassungen-Modell der Digitalen Schule NRW).
 */
import { elementText, type Niveau, type TbElement, type TbTafel } from './model'

export interface Ansicht {
  /** Nur Elemente bis zu diesem Schritt */
  schritt?: number
  luecke?: boolean
  niveau?: Niveau
  wortspeicher?: boolean
}

export const LUECKE = '__________'

const regexEscape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Lückenwörter im Text durch gleich lange Lücken ersetzen (ganze Wörter, Groß-/Kleinschreibung egal) */
export function lueckenText(text: string, woerter: string[] | undefined): string {
  let t = text
  const liste = [...new Set((woerter ?? []).map((w) => w.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
  for (const w of liste) t = t.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${regexEscape(w)}(?=$|[^\\p{L}\\p{N}])`, 'giu'), `$1${LUECKE}`)
  return t
}

/** Ganzes Element als Schreibzeilen – gleich viele Zeilen wie der Text, damit die Höhe bleibt */
export const schreibzeilen = (text: string): string =>
  text
    .split('\n')
    .map(() => '_____________________________')
    .join('\n')

export function sichtbar(e: TbElement, a: Ansicht, alle: Map<string, TbElement>): boolean {
  if (a.niveau && (e.niveau ?? 1) > a.niveau) return false
  if (a.schritt !== undefined && (e.schritt || 1) > a.schritt) return false
  if (e.typ === 'verbinder') {
    const von = e.von ? alle.get(e.von) : undefined
    const nach = e.nach ? alle.get(e.nach) : undefined
    if (e.von && (!von || !sichtbar(von, a, alle))) return false
    if (e.nach && (!nach || !sichtbar(nach, a, alle))) return false
    if (!e.nach && !e.zielPunkt) return false
  }
  return true
}

export function sichtbareElemente(t: TbTafel, a: Ansicht): TbElement[] {
  const alle = new Map(t.elemente.map((e) => [e.id, e]))
  return t.elemente.filter((e) => sichtbar(e, a, alle))
}

/** Element, wie es in der Ansicht erscheint (Lücken eingesetzt) */
export function inAnsicht(e: TbElement, a: Ansicht): TbElement {
  if (!a.luecke) return e
  if (e.luecke && (e.typ === 'kasten' || e.typ === 'text' || e.typ === 'merksatz')) return { ...e, text: schreibzeilen(e.text) }
  if (!e.lueckenWoerter?.length) return e
  const w = e.lueckenWoerter
  const d = e.diagramm
  return {
    ...e,
    text: lueckenText(e.text, w),
    ...(d
      ? {
          diagramm: {
            ...d,
            ...(d.zeilen ? { zeilen: d.zeilen.map((z) => z.map((c, i) => (i === 0 ? c : lueckenText(c, w)))) } : {}),
            eintraege: d.eintraege.map((x) => ({ ...x, label: lueckenText(x.label, w) }))
          }
        }
      : {})
  }
}

/** Alle Lückenwörter der sichtbaren Elemente – alphabetisch (die Reihenfolge verrät nichts) */
export function wortspeicher(t: TbTafel, a: Ansicht): string[] {
  const woerter = new Set<string>()
  for (const e of sichtbareElemente(t, a)) {
    for (const w of e.lueckenWoerter ?? []) if (elementText(e).toLowerCase().includes(w.toLowerCase())) woerter.add(w.trim())
    if (e.luecke) for (const w of e.lueckenWoerter ?? []) woerter.add(w.trim())
  }
  return [...woerter].filter(Boolean).sort((x, y) => x.localeCompare(y, 'de'))
}

/** Lösungen der Lückenfassung je Element (für die Planungshilfe, R39) */
export function loesungen(t: TbTafel): { element: string; woerter: string[] }[] {
  return t.elemente.filter((e) => e.lueckenWoerter?.length || e.luecke).map((e) => ({ element: e.titel || e.text.split('\n')[0].slice(0, 40), woerter: e.luecke ? [e.text] : (e.lueckenWoerter ?? []) }))
}

export const NIVEAU_NAMEN: Record<Niveau, string> = { 1: '★ grundlegend', 2: '★★ mittel', 3: '★★★ erweitert' }
