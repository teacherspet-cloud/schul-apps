/**
 * Wohin „Öffnen" eines Hintergrund-Auftrags in Sprachenlernen führt (09.10.2026, Befund der Lehrkraft: „Öffnen" bei
 * Grammatik-Aufträgen zeigte oben einen Fehler – die Kennungen der Aufträge wurden als Kurs-Kennung gelesen).
 *
 * Kennungen (docId) der Aufträge – eindeutig je Auftrag, das Ziel steckt darin:
 *  - `g:<gid>`                    eine Grammatik: Kurs öffnen, darin das Grammatik-Fenster
 *  - `mehr:<gid>:<zeit>`          „+ Aufgaben" zu einer Grammatik → wie `g:<gid>`
 *  - `kursg:<vokId>:<zeit>`       neue Grammatik für einen Kurs (Entwurf erscheint in seiner Grammatik) → Kurs, Grammatik
 *  - `extra:<vokId>:<sid>:<zeit>` Förder-/Forderaufgaben für eine Person → Kurs, Grammatik (dort der Entwurf)
 *  - `grammatik-<zeit>`, `extra-<zeit>` (ältere bzw. ohne Kurs) → Übersicht
 *  - ältere `mehr-<gid>-<zeit>` → wie `g:<gid>`
 *  - sonst: eine Kurs-Kennung
 */
export type SprachenlernenZiel =
  | { art: 'kurs'; id: string }
  | { art: 'grammatik'; gid: string }
  | { art: 'kursGrammatik'; vokId: string }
  | { art: 'uebersicht' }

export const mehrAufgabenDocId = (gid: string, zeit = Date.now()): string => `mehr:${gid}:${zeit}`
export const kursGrammatikDocId = (vokId: string | undefined, zeit = Date.now()): string => (vokId ? `kursg:${vokId}:${zeit}` : `grammatik-${zeit}`)
export const extraDocId = (vokId: string, schuelerId: string, zeit = Date.now()): string => `extra:${vokId}:${schuelerId}:${zeit}`

export function sprachenlernenZiel(docId: string): SprachenlernenZiel {
  const id = (docId ?? '').trim()
  if (!id) return { art: 'uebersicht' }
  if (id.startsWith('g:')) return id.length > 2 ? { art: 'grammatik', gid: id.slice(2) } : { art: 'uebersicht' }
  const teile = id.split(':')
  if (teile[0] === 'mehr' && teile[1]) return { art: 'grammatik', gid: teile[1] }
  if ((teile[0] === 'kursg' || teile[0] === 'extra') && teile[1]) return { art: 'kursGrammatik', vokId: teile[1] }
  const alt = /^mehr-(.+)-\d+$/.exec(id)
  if (alt) return { art: 'grammatik', gid: alt[1] }
  if (/^(grammatik|extra|mehr|kursg)[-:]/.test(id)) return { art: 'uebersicht' }
  return { art: 'kurs', id }
}
