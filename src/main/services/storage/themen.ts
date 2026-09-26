// Themenbereiche (Paket 10b): eine Datei `themenbereiche.json` unter userData mit den
// Bereichen je Fach und der Zuordnung der Materialien. Warum die Zuordnung hier steht und
// nicht in den Materialien, steht in src/shared/themen.ts. Die Änderungen selbst sind dort
// als reine Funktionen geschrieben; hier wird nur gelesen und atomar geschrieben.
import { app } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { bereichLoeschen, bereichSetzen, BereichsUebernahme, pruefeThemen, ThemenDaten, Themenbereich, uebernehmen, zuordnen, Zuordnung } from '@shared/themen'

/** Dateiname – steht auch in der Sicherung (wartung.ts, DATEIEN) */
export const THEMEN_DATEI = 'themenbereiche.json'

const datei = (): string => join(app.getPath('userData'), THEMEN_DATEI)

export function leseThemen(): ThemenDaten {
  try {
    if (!existsSync(datei())) return pruefeThemen(null)
    return pruefeThemen(JSON.parse(readFileSync(datei(), 'utf8')))
  } catch {
    return pruefeThemen(null)
  }
}

/** Erst in eine Hilfsdatei, dann umbenennen – bei einem Absturz bleibt die alte Fassung erhalten. */
function schreibe(d: ThemenDaten): ThemenDaten {
  const tmp = `${datei()}.tmp`
  writeFileSync(tmp, JSON.stringify(d, null, 1), 'utf8')
  renameSync(tmp, datei())
  return d
}

const neueId = (): string => randomBytes(6).toString('hex')

export const themenBereichSetzen = (b: Pick<Themenbereich, 'id' | 'fachId' | 'name'> & Partial<Themenbereich>): ThemenDaten =>
  schreibe(bereichSetzen(leseThemen(), b))
export const themenBereichLoeschen = (id: string): ThemenDaten => schreibe(bereichLoeschen(leseThemen(), id))
export const themenZuordnen = (eintraege: Record<string, Zuordnung | null>): ThemenDaten => schreibe(zuordnen(leseThemen(), eintraege))
export const themenUebernehmen = (vorschlaege: BereichsUebernahme[], automatik: string[]): ThemenDaten =>
  schreibe(uebernehmen(leseThemen(), vorschlaege, automatik, neueId))

export function themenReihenfolge(schluessel: string, liste: string[]): ThemenDaten {
  const d = leseThemen()
  return schreibe({ ...d, reihenfolge: { ...d.reihenfolge, [schluessel]: liste.filter((s) => typeof s === 'string') } })
}

export function themenAutomatik(fachId: string, an: boolean): ThemenDaten {
  const d = leseThemen()
  const automatik = { ...d.automatik }
  if (an) automatik[fachId] = true
  else delete automatik[fachId]
  return schreibe({ ...d, automatik })
}
