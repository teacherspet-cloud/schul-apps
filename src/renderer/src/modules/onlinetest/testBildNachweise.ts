/**
 * Bildnachweise für Lernende in Onlinetest und Onlineblatt (23.10.2026, Bildnachweise) – gesammelt für die kleine Liste
 * „Bildnachweise“ am Fuß. Reine Funktionen (Tests: tests/bildNachweiseLernende.test.ts).
 *  - Test: Nachweise der Bilder in Aufgaben (schon ohne Lösungswort, kern.ts) und im Material (kernBlatt.ts).
 *  - Blatt: das Onlineblatt ist die Druckfassung – deren Schlussseite „Bildnachweise“ bzw. Abschnitt „Bilder“ des
 *    Quellenanhangs (arbeitsblatt/render/SheetPages.tsx) wird hier wieder ausgelesen.
 */
import type { OnlineAufgabe } from './kern'
import type { NachweisEintrag } from '../../shared/components/BildNachweis'

export function testBildNachweise(aufgaben: Pick<OnlineAufgabe, 'titel' | 'art' | 'bildnachweise' | 'eintraege'>[]): NachweisEintrag[] {
  const aus: NachweisEintrag[] = []
  for (const a of aufgaben) {
    const label = a.art === 'material' ? 'Material' : a.titel
    for (const n of a.bildnachweise ?? []) aus.push({ label, text: n })
    for (const e of a.eintraege ?? []) if (e.bild && e.bildNachweis) aus.push({ label, text: e.bildNachweis })
  }
  return aus
}

const ENTITAETEN: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' }
const alsText = (html: string): string =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
      ENTITAETEN[e.toLowerCase()] ??
      (e.startsWith('#x') ? String.fromCodePoint(parseInt(e.slice(2), 16)) : e.startsWith('#') ? String.fromCodePoint(Number(e.slice(1))) : m)
    )
    .replace(/\s+/g, ' ')
    .trim()

/** Einträge einer Liste `<li><b>Bild 1 – …</b>: Nachweis</li>` */
function listenEintraege(ul: string): NachweisEintrag[] {
  const aus: NachweisEintrag[] = []
  for (const m of ul.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const label = alsText(m[1].match(/<b[^>]*>([\s\S]*?)<\/b>/i)?.[1] ?? '')
    const rest = alsText(m[1].replace(/<b[^>]*>[\s\S]*?<\/b>/i, '')).replace(/^:\s*/, '')
    const text = /^ki[- ]?generiert/i.test(rest) ? 'KI-generiert' : rest ? `Bild: ${rest}` : ''
    if (text) aus.push({ ...(label ? { label } : {}), text })
  }
  return aus
}

/** Bildnachweise aus dem HTML eines Onlineblatts (Schlussseite bzw. Quellenanhang, Abschnitt „Bilder“) */
export function blattBildNachweise(html: string): NachweisEintrag[] {
  const s = String(html ?? '')
  const aus: NachweisEintrag[] = []
  // Quellenanhang: <section><h3>Bilder</h3><ul>…</ul></section>
  for (const m of s.matchAll(/<h3[^>]*>\s*Bilder\s*<\/h3>\s*<ul[^>]*>([\s\S]*?)<\/ul>/gi)) aus.push(...listenEintraege(m[1]))
  // Schlussseite: <h2>Bildnachweise</h2><ul>…</ul>
  for (const m of s.matchAll(/<h2[^>]*>\s*Bildnachweise\s*<\/h2>\s*<ul[^>]*>([\s\S]*?)<\/ul>/gi)) aus.push(...listenEintraege(m[1]))
  return aus
}
