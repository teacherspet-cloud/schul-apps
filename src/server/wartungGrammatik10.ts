/**
 * Einmalige Bereinigung (09.10.2026, von der Lehrkraft bestätigt): Alle Grammatiktrainings EINER Lehrkraft für ihre
 * 10. Klassen löschen – die Aufgaben waren für Klasse 10 am Gymnasium viel zu leicht. Danach fügt die Lehrkraft die
 * Formen über „Grammatik hinzufügen" neu hinzu; die neue Niveau-Abstimmung (lernen/grammatikNiveau.ts) greift.
 *
 * Betroffen: gram_zuweisungen dieser Lehrkraft, deren Lerngruppe (entschlüsselt) mit „10" beginnt („10b", nicht
 * „100"), direkt oder über den verbundenen Vokabelkurs (`vok_id` → vok_zuweisungen.lerngruppe_id). Gelöscht wie über
 * POST /server/grammatik/<id>/loeschen (grammatik.ts): die Zeile, dazu Lernstand (gram_stand) und Code-Beitritte
 * (gram_gaeste); Gäste, die danach in keinem Training mehr sind, verlieren ihr Konto. Es ist ein echtes Löschen – nichts
 * gilt danach noch als „schon im Kurs". Das Protokoll nennt nur Zahlen.
 */
import type { DatabaseSync } from 'node:sqlite'

export const LEHRKRAFT_10 = '9c33542bd1e6434b9496'

const tabelleDa = (d: DatabaseSync, t: string): boolean => Boolean(d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t))
const spalteDa = (d: DatabaseSync, t: string, s: string): boolean =>
  (d.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((x) => x.name === s)

/** Klassenname der 10. Jahrgangsstufe („10b", „10 a", „10") */
export const istKlasse10 = (name: string): boolean => /^\s*10(?!\d)/.test(name)

/** Ergebnis: Satz fürs Wartungsprotokoll (nur Zahlen) */
export function grammatikKlasse10Loeschen(d: DatabaseSync, lehrkraftId = LEHRKRAFT_10): string {
  if (!tabelleDa(d, 'gram_zuweisungen') || !tabelleDa(d, 'lerngruppen') || !spalteDa(d, 'gram_zuweisungen', 'lehrkraft_id'))
    return 'keine Grammatik – nichts gelöscht'
  const zehn = new Set(
    (d.prepare('SELECT id, name FROM lerngruppen').all() as { id: string; name: string }[]).filter((g) => istKlasse10(String(g.name ?? ''))).map((g) => g.id)
  )
  const kursGruppe = new Map<string, string>()
  if (tabelleDa(d, 'vok_zuweisungen') && spalteDa(d, 'vok_zuweisungen', 'lehrkraft_id'))
    for (const k of d.prepare('SELECT id, lerngruppe_id FROM vok_zuweisungen WHERE lehrkraft_id = ?').all(lehrkraftId) as { id: string; lerngruppe_id: string }[])
      kursGruppe.set(k.id, String(k.lerngruppe_id ?? ''))
  const mitVok = spalteDa(d, 'gram_zuweisungen', 'vok_id')
  const zeilen = (d.prepare('SELECT * FROM gram_zuweisungen WHERE lehrkraft_id = ?').all(lehrkraftId) as Record<string, unknown>[]).filter(
    (z) => zehn.has(String(z.lerngruppe_id ?? '')) || (mitVok && Boolean(z.vok_id) && zehn.has(kursGruppe.get(String(z.vok_id)) ?? ''))
  )
  const standDa = tabelleDa(d, 'gram_stand')
  const gaesteDa = tabelleDa(d, 'gram_gaeste')
  const nutzerDa = tabelleDa(d, 'nutzer') && spalteDa(d, 'nutzer', 'quelle')
  const vokGaesteDa = tabelleDa(d, 'vok_gaeste')
  let staende = 0
  let konten = 0
  for (const z of zeilen) {
    const id = String(z.id)
    const gaeste = gaesteDa ? (d.prepare('SELECT nutzer_id FROM gram_gaeste WHERE zuweisung_id = ?').all(id) as { nutzer_id: string }[]).map((g) => g.nutzer_id) : []
    if (standDa) staende += Number((d.prepare('SELECT COUNT(*) AS n FROM gram_stand WHERE zuweisung_id = ?').get(id) as { n: number }).n)
    // Ausdrücklich, auch ohne Fremdschlüssel (ON DELETE CASCADE)
    if (standDa) d.prepare('DELETE FROM gram_stand WHERE zuweisung_id = ?').run(id)
    if (gaesteDa) d.prepare('DELETE FROM gram_gaeste WHERE zuweisung_id = ?').run(id)
    d.prepare('DELETE FROM gram_zuweisungen WHERE id = ?').run(id)
    // Gäste ohne weiteres Training verlieren ihr Konto (wie beim Löschen über die Oberfläche)
    if (nutzerDa)
      for (const n of gaeste) {
        const gast = d.prepare("SELECT 1 FROM nutzer WHERE id = ? AND quelle = 'gast'").get(n)
        const nochDa =
          (gaesteDa && d.prepare('SELECT 1 FROM gram_gaeste WHERE nutzer_id = ?').get(n)) ||
          (vokGaesteDa && d.prepare('SELECT 1 FROM vok_gaeste WHERE nutzer_id = ?').get(n))
        if (gast && !nochDa) {
          d.prepare('DELETE FROM nutzer WHERE id = ?').run(n)
          konten++
        }
      }
  }
  return `${zeilen.length} Grammatiktrainings der 10. Klassen gelöscht (${staende} Lernstände, ${konten} Gastkonten)`
}

/** Eintrag für wartung.ts */
export const GRAMMATIK_KLASSE10: [string, (d: DatabaseSync) => string] = ['grammatik-klasse10-loeschen-2026-10-09', (d) => grammatikKlasse10Loeschen(d)]
