/*
 * Grammatikformen der Lehrwerke (12.10.2026, App „Grammatikformen" in der Gruppe Organisation).
 *
 * Eingebaut ist die Liste der Lehrkraft für Green Line Niedersachsen (renderer/src/shared/lehrwerkGrammatik.ts,
 * LEHRWERK_GRAMMATIK_EINGEBAUT). Admins und Fachobleute können je Band die Grammatik bearbeiten oder für weitere
 * Lehrwerke anlegen. Abgelegt wie die gemeinsamen Vokabel-Lehrwerke (textbooks.ts):
 *  - Server: EINMAL für alle in <DATEN>/lehrwerke-grammatik/<lehrwerkId>.json; ändern nur Admin bzw. Fachobleute des
 *    Fachs (rolle.ts `darfLehrwerkSprache`), lesen alle Lehrkräfte. Der Server legt die Bearbeitungen beim Start und
 *    nach jedem Speichern über die eingebaute Liste (`wendeGrammatikAn`), damit Kurse, Vorwissen und Zeitform-Sperre
 *    sie gleich nutzen.
 *  - PC: im eigenen Ordner (userData/lehrwerke-grammatik), die eine Lehrkraft darf alles.
 * Je Datei die GANZE Grammatik eines Bands. „Änderungen verwerfen" (löschen) stellt die eingebaute Fassung wieder her.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { gueltigerEintrag, wendeGrammatikAn, type LehrwerkGrammatikEintrag } from '../../../renderer/src/shared/lehrwerkGrammatik'
import { loescheDatei } from './atomar'
import { aufServer, darfLehrwerkSprache } from '../rolle'

function ordner(): string {
  const d = aufServer() ? join(process.env.SCHULAPPS_DATEN || './server-daten', 'lehrwerke-grammatik') : join(app.getPath('userData'), 'lehrwerke-grammatik')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function checkId(id: string): string {
  if (!/^[A-Za-z0-9_-]{2,80}$/.test(id)) throw new Error('Ungültige Lehrwerk-ID.')
  return id
}

/** Alle gespeicherten Bearbeitungen */
export function listeLehrwerkGrammatik(): LehrwerkGrammatikEintrag[] {
  const d = ordner()
  const out: LehrwerkGrammatikEintrag[] = []
  for (const f of readdirSync(d).filter((x) => x.endsWith('.json'))) {
    try {
      const e = JSON.parse(readFileSync(join(d, f), 'utf8')) as unknown
      if (gueltigerEintrag(e)) out.push(e)
    } catch {
      // beschädigte Datei überspringen
    }
  }
  return out
}

/** Bearbeitungen über die eingebaute Liste legen (Server: beim Start; danach nach jedem Speichern/Verwerfen) */
export function ladeLehrwerkGrammatik(): void {
  try {
    wendeGrammatikAn(listeLehrwerkGrammatik())
  } catch {
    // ohne lesbaren Ordner gilt die eingebaute Liste
  }
}

/** Grammatik eines Bands speichern (ersetzt die vorige Fassung) */
export function speichereLehrwerkGrammatik(eintrag: LehrwerkGrammatikEintrag): LehrwerkGrammatikEintrag[] {
  if (!gueltigerEintrag(eintrag)) throw new Error('Die Grammatikformen sind unvollständig.')
  const id = checkId(eintrag.lehrwerkId)
  const vorher = listeLehrwerkGrammatik().find((e) => e.lehrwerkId === id)
  // Fach nach der gespeicherten Fassung UND der neuen – eine geänderte Sprache öffnet kein fremdes Fach
  if (!darfLehrwerkSprache(eintrag.sprache) || (vorher && !darfLehrwerkSprache(vorher.sprache)))
    throw new Error('Die Grammatikformen der Lehrwerke dürfen nur Admins und die Fachobleute des Fachs ändern.')
  const datei = join(ordner(), `${id}.json`)
  const daten: LehrwerkGrammatikEintrag = {
    lehrwerkId: id,
    buch: eintrag.buch.trim(),
    sprache: eintrag.sprache,
    kapitel: eintrag.kapitel,
    // Bewusst ohne Namen der Bearbeiterin/des Bearbeiters: der gemeinsame Ordner ist nicht je Person verschlüsselt
    geaendert: new Date().toISOString()
  }
  writeFileSync(`${datei}.tmp`, JSON.stringify(daten), 'utf8')
  renameSync(`${datei}.tmp`, datei)
  ladeLehrwerkGrammatik()
  return listeLehrwerkGrammatik()
}

/** Bearbeitung verwerfen – danach gilt wieder die eingebaute Grammatik (bzw. keine) */
export function loescheLehrwerkGrammatik(lehrwerkId: string): LehrwerkGrammatikEintrag[] {
  const id = checkId(lehrwerkId)
  const vorher = listeLehrwerkGrammatik().find((e) => e.lehrwerkId === id)
  if (vorher && !darfLehrwerkSprache(vorher.sprache))
    throw new Error('Die Grammatikformen der Lehrwerke dürfen nur Admins und die Fachobleute des Fachs ändern.')
  loescheDatei(join(ordner(), `${id}.json`))
  ladeLehrwerkGrammatik()
  return listeLehrwerkGrammatik()
}
