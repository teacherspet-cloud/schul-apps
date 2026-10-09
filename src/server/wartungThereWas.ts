/**
 * Einmalige Bereinigung (09.10.2026, Befund der Lehrkraft): Zu „There is / There are" in Klasse 5 hatte die KI auch
 * Aufgaben mit „There was / There were" geschrieben – das simple past kennt die Lerngruppe noch nicht. Künftig sperrt
 * die Erzeugung unbekannte Zeitformen (shared/zeitformSperre.ts); diese Wartung räumt die schon freigegebenen Pakete auf.
 *
 * Betroffen: Grammatik (gram_zuweisungen) mit dem Thema „There is / There are" (Katalogkennung `en.verb.there_is` oder
 * Titel/Thema) für Klasse 5 (`info.jahrgang` 5 oder Lerngruppe – direkt oder über den Kurs – beginnt mit „5").
 * Entfernt werden nur Aufgaben, deren Satz, Lösungen oder Satzbau-Teile (auch mit eingesetzter Lösung) „there was" /
 * „there were" enthalten (auch „was there …?", „there wasn't"); alle anderen behalten ihre Kennung. Beispiele der
 * Regelkarten mit diesen Formen fallen weg. Der Lernstand entfernter Aufgaben darf bleiben (er wird nicht mehr gezeigt).
 *
 * Paket, Titel, Angaben und Gruppennamen sind verschlüsselt (feldschutz.ts): gelesen und geschrieben wird über den
 * geschützten Zugang, den `datenbank()` der Wartung übergibt. Das Protokoll nennt nur Zahlen.
 */
import type { DatabaseSync } from 'node:sqlite'

const tabelleDa = (d: DatabaseSync, t: string): boolean => Boolean(d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t))
const spalteDa = (d: DatabaseSync, t: string, s: string): boolean =>
  (d.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((x) => x.name === s)

const json = <T>(roh: unknown, ersatz: T): T => {
  try {
    return typeof roh === 'string' && roh ? (JSON.parse(roh) as T) : ersatz
  } catch {
    return ersatz
  }
}

/** „There is / There are" am Titel oder Thema */
const THEMA_TITEL = /there\s+is\s*\/\s*(?:there\s+)?are/i
/** Vergangenheit von „there is" */
export const THERE_WAS = /\bthere\s+(?:was|were)\b|\b(?:was|were)(?:n['’]t|\s+not)?\s+there\b/i

interface Aufgabe {
  id?: string
  art?: string
  satz?: string
  loesungen?: string[]
  teile?: string[]
}

/** Enthält die Aufgabe „there was/were" – im Satz, in einer Lösung, in den Teilen oder im Satz mit eingesetzter Lösung? */
export function hatThereWas(a: Aufgabe): boolean {
  const satz = String(a.satz ?? '')
  const loes = Array.isArray(a.loesungen) ? a.loesungen.map(String) : []
  const texte = [satz, ...loes, (Array.isArray(a.teile) ? a.teile : []).join(' '), ...(satz.includes('___') ? loes.map((l) => satz.replace(/_{3,}/, l)) : [])]
  return texte.some((t) => THERE_WAS.test(t))
}

/** Ergebnis: Satz fürs Wartungsprotokoll (nur Zahlen) */
export function thereWasEntfernen(d: DatabaseSync): string {
  if (!tabelleDa(d, 'gram_zuweisungen')) return 'keine Grammatik – nichts geändert'
  const mitInfo = spalteDa(d, 'gram_zuweisungen', 'info')
  const mitVok = spalteDa(d, 'gram_zuweisungen', 'vok_id')
  // Lerngruppen-Namen (entschlüsselt) und die Lerngruppe je Vokabelkurs
  const gruppenName = new Map<string, string>()
  if (tabelleDa(d, 'lerngruppen'))
    for (const g of d.prepare('SELECT id, name FROM lerngruppen').all() as { id: string; name: string }[]) gruppenName.set(g.id, String(g.name ?? ''))
  const kursGruppe = new Map<string, string>()
  if (mitVok && tabelleDa(d, 'vok_zuweisungen') && spalteDa(d, 'vok_zuweisungen', 'lerngruppe_id'))
    for (const k of d.prepare('SELECT id, lerngruppe_id FROM vok_zuweisungen').all() as { id: string; lerngruppe_id: string }[])
      kursGruppe.set(k.id, String(k.lerngruppe_id ?? ''))
  const klasse5 = (gruppe: string): boolean => /^\s*5(?!\d)/.test(gruppenName.get(gruppe) ?? '')

  let pakete = 0
  let aufgaben = 0
  for (const z of d.prepare('SELECT * FROM gram_zuweisungen').all() as Record<string, unknown>[]) {
    const info = mitInfo ? json<{ themen?: unknown; jahrgang?: unknown }>(z.info, {}) : {}
    const themen = Array.isArray(info.themen) ? info.themen.map(String) : []
    const istThema = themen.some((t) => t.split('/')[0] === 'en.verb.there_is') || THEMA_TITEL.test(String(z.titel ?? '')) || THEMA_TITEL.test(String(z.thema ?? ''))
    if (!istThema) continue
    const gruppe = String(z.lerngruppe_id ?? '')
    const ueberKurs = mitVok && z.vok_id ? (kursGruppe.get(String(z.vok_id)) ?? '') : ''
    if (!(Number(info.jahrgang) === 5 || klasse5(gruppe) || klasse5(ueberKurs))) continue
    const paket = json<{ regeln?: { id?: string; titel?: string; beispiele?: string[] }[]; aufgaben?: Aufgabe[] } | null>(z.paket, null)
    if (!paket || !Array.isArray(paket.aufgaben)) continue
    const bleiben = paket.aufgaben.filter((a) => !hatThereWas(a))
    const weg = paket.aufgaben.length - bleiben.length
    if (!weg) continue
    const regeln = (Array.isArray(paket.regeln) ? paket.regeln : []).map((r) =>
      Array.isArray(r.beispiele) ? { ...r, beispiele: r.beispiele.filter((b) => !THERE_WAS.test(String(b))) } : r
    )
    d.prepare('UPDATE gram_zuweisungen SET paket = ? WHERE id = ?').run(JSON.stringify({ ...paket, regeln, aufgaben: bleiben }), String(z.id))
    pakete++
    aufgaben += weg
  }
  return `${aufgaben} Aufgaben mit „there was/were" aus ${pakete} Paketen „There is / There are" (Klasse 5) entfernt`
}

/** Eintrag für wartung.ts */
export const THERE_WAS_KLASSE5: [string, (d: DatabaseSync) => string] = ['there-was-klasse5-2026-10-09', thereWasEntfernen]
