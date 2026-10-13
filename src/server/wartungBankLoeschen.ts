/**
 * Einmalige Bereinigung (13.10.2026, von der Lehrkraft ausdrücklich gewünscht: „entferne alle Grammatikübungsaufgaben, die
 * jetzt schon auf dem VPS sind"): die ganze Aufgabenbank der Grammatik (gram_bank, gram_bank_regel) und die Grammatik-
 * Trainings der Kurse, die aus ihr gebaut wurden (info.bank) – samt Lernstand (gram_stand) und Code-Beitritten
 * (gram_gaeste). Andere Grammatik-Trainings bleiben. Die Zeit merkt sich server_einstellungen 'grammatik-bank-geleert':
 * KI-Entwürfe im Browser von davor verwirft „Grammatikformen" beim nächsten Öffnen. Vorher legt das Aufspielen eine
 * Sicherung an. Das Protokoll nennt nur Zahlen.
 */
import type { DatabaseSync } from 'node:sqlite'

const tabelleDa = (d: DatabaseSync, t: string): boolean => Boolean(d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t))

export function grammatikBankLoeschen(d: DatabaseSync): string {
  const aufgaben = tabelleDa(d, 'gram_bank') ? Number((d.prepare('SELECT COUNT(*) AS n FROM gram_bank').get() as { n: number }).n) : 0
  const regeln = tabelleDa(d, 'gram_bank_regel') ? Number((d.prepare('SELECT COUNT(*) AS n FROM gram_bank_regel').get() as { n: number }).n) : 0
  let trainings = 0
  let staende = 0
  if (tabelleDa(d, 'gram_zuweisungen')) {
    const ids = (d.prepare('SELECT id, info FROM gram_zuweisungen').all() as { id: string; info: string | null }[])
      .filter((z) => {
        try {
          const i = JSON.parse(z.info || '{}') as { bank?: unknown }
          return Array.isArray(i.bank) && i.bank.length > 0
        } catch {
          return false
        }
      })
      .map((z) => z.id)
    for (const id of ids) {
      if (tabelleDa(d, 'gram_stand')) staende += Number(d.prepare('DELETE FROM gram_stand WHERE zuweisung_id = ?').run(id).changes)
      if (tabelleDa(d, 'gram_gaeste')) d.prepare('DELETE FROM gram_gaeste WHERE zuweisung_id = ?').run(id)
      d.prepare('DELETE FROM gram_zuweisungen WHERE id = ?').run(id)
      trainings++
    }
  }
  if (tabelleDa(d, 'gram_bank')) d.prepare('DELETE FROM gram_bank').run()
  if (tabelleDa(d, 'gram_bank_regel')) d.prepare('DELETE FROM gram_bank_regel').run()
  if (tabelleDa(d, 'server_einstellungen'))
    d.prepare("INSERT OR REPLACE INTO server_einstellungen (schluessel, wert) VALUES ('grammatik-bank-geleert', ?)").run(JSON.stringify(Date.now()))
  return `${aufgaben} Bank-Aufgaben und ${regeln} Regelkarten gelöscht, ${trainings} Kurs-Trainings aus der Bank (${staende} Lernstände)`
}

/** Eintrag für wartung.ts */
export const GRAMMATIK_BANK_LOESCHEN: [string, (d: DatabaseSync) => string] = ['grammatik-bank-loeschen-2026-10-13', grammatikBankLoeschen]
