/**
 * Lernende umbenennen, ohne dass Ergebnisse verloren gehen (09.10.2026, Wunsch der Lehrkraft: „alle Ergebnisse müssen
 * bei der Person bleiben"). Gemeinsam für „Namen ändern" in „Meine Klassen" (klassenGaeste.ts) und die einmalige
 * Wartung (wartungGastname.ts).
 *
 * Fast alles hängt an der Kennung (`schueler_id`/`nutzer_id`): Abgaben von Blättern, Rückmeldungen, Reihen-Stände,
 * Vokabel-/Grammatik-Stand, Teilnahmen an Tests – dort erscheint nach dem Umbenennen von selbst der neue Name.
 * Über den NAMEN verbunden sind nur Test-Gäste: Wer einen Onlinetest ohne Konto schreibt („Wie heißt du?"), bekommt
 * für diesen Test ein eigenes Gastkonto; die Testhistorie („Meine Klassen", Testschnitt) fasst diese Konten über den
 * Namen zusammen. Deshalb werden beim Umbenennen eines Gastes auch die Test-Gastkonten mit dem ALTEN Namen
 * umbenannt, die in Tests seiner Lerngruppen geschrieben haben und an keiner anderen Freigabe hängen (reine
 * Test-Gäste). Alles in einer Transaktion, über den geschützten Zugang (Namen bleiben verschlüsselt).
 */
import type { DatabaseSync } from 'node:sqlite'
import { datenbank } from './datenbank'
import { registerVergessen } from './namensschutz'

/** Tabellen, die Gäste mit einer Freigabe verbinden (wie gaeste.ts) */
const ZUORDNUNGEN = ['blatt_gaeste', 'vok_gaeste', 'feedback_gaeste', 'reihe_gaeste', 'gram_gaeste'] as const

const tabelleDa = (d: DatabaseSync, t: string): boolean => Boolean(d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t))
const spalteDa = (d: DatabaseSync, t: string, s: string): boolean =>
  (d.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((x) => x.name === s)

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase()

const liste = (roh: unknown): string[] => {
  try {
    const x = JSON.parse(String(roh ?? '[]')) as unknown
    return Array.isArray(x) ? x.map(String) : []
  } catch {
    return []
  }
}

/** Lerngruppen, zu denen ein Gast gehört: eingetragen oder per Code an einem Kurs der Lerngruppe */
function gruppenDesGastes(d: DatabaseSync, id: string, benutzer: string): Set<string> {
  const gruppen = new Set<string>()
  if (tabelleDa(d, 'lerngruppen'))
    for (const g of d.prepare('SELECT * FROM lerngruppen').all() as { id: string; mitglieder: string }[])
      if (liste(g.mitglieder).some((b) => b.toLowerCase() === benutzer.toLowerCase())) gruppen.add(g.id)
  for (const [gaeste, kurse] of [
    ['vok_gaeste', 'vok_zuweisungen'],
    ['gram_gaeste', 'gram_zuweisungen']
  ] as const) {
    if (!tabelleDa(d, gaeste) || !tabelleDa(d, kurse)) continue
    for (const z of d.prepare(`SELECT k.lerngruppe_id AS l FROM ${gaeste} g JOIN ${kurse} k ON k.id = g.zuweisung_id WHERE g.nutzer_id = ?`).all(id) as {
      l: string
    }[])
      if (z.l) gruppen.add(z.l)
  }
  return gruppen
}

/**
 * Person umbenennen; Antwort: Anzahl mit umbenannter Test-Gastkonten (gleiche Person, Ergebnisse über den Namen).
 * `d`: geschützter Datenbankzugang (Vorgabe: `datenbank()`; die Wartung gibt ihren eigenen).
 */
export function lernendeUmbenennen(nutzerId: string, neu: string, d: DatabaseSync = datenbank()): number {
  const n = d.prepare('SELECT * FROM nutzer WHERE id = ?').get(nutzerId) as { id: string; benutzer: string; name: string; quelle: string } | undefined
  if (!n) return 0
  const alt = String(n.name ?? '')
  let mit = 0
  d.exec('SAVEPOINT umbenennen')
  try {
    d.prepare('UPDATE nutzer SET name = ? WHERE id = ?').run(neu, nutzerId)
    if (n.quelle === 'gast' && norm(alt) !== norm(neu) && tabelleDa(d, 'teilnahmen') && tabelleDa(d, 'onlinetests') && spalteDa(d, 'onlinetests', 'lerngruppe_id')) {
      const gruppen = gruppenDesGastes(d, nutzerId, String(n.benutzer ?? ''))
      if (gruppen.size) {
        const kandidaten = new Set<string>()
        for (const z of d.prepare('SELECT t.schueler_id AS s, o.lerngruppe_id AS l FROM teilnahmen t JOIN onlinetests o ON o.id = t.test_id').all() as {
          s: string
          l: string
        }[])
          if (z.s !== nutzerId && gruppen.has(z.l)) kandidaten.add(z.s)
        const vorhanden = ZUORDNUNGEN.filter((t) => tabelleDa(d, t))
        for (const k of kandidaten) {
          const x = d.prepare('SELECT * FROM nutzer WHERE id = ?').get(k) as { name: string; quelle: string } | undefined
          if (!x || x.quelle !== 'gast' || norm(String(x.name ?? '')) !== norm(alt)) continue
          // Nur reine Test-Gäste: hängt das Konto an einer anderen Freigabe, ist es womöglich eine andere Person
          if (vorhanden.some((t) => d.prepare(`SELECT 1 FROM ${t} WHERE nutzer_id = ?`).get(k))) continue
          d.prepare('UPDATE nutzer SET name = ? WHERE id = ?').run(neu, k)
          mit++
        }
      }
    }
    d.exec('RELEASE umbenennen')
  } catch (e) {
    d.exec('ROLLBACK TO umbenennen')
    d.exec('RELEASE umbenennen')
    throw e
  }
  // Der Namensschutz kennt danach den neuen Namen
  registerVergessen()
  return mit
}
