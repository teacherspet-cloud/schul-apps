/**
 * Gemeinsame Fachordner (02.10.2026) – Wunsch der Lehrkraft: „Für die Materialien: private Ordner
 * und gemeinsame Ordner für die Fächer".
 *
 * Privat bleibt alles in der eigenen Ablage (wie am PC). Teilen heißt: Eine KOPIE des Materials
 * geht als Schulpaket (main/services/paket – samt Hörtexten, Design und Maskottchen, ohne
 * Nachteilsausgleich) in den Ordner des Fachs. Wer übernimmt, bekommt eine eigene Kopie in seine
 * Ablage – Änderungen bleiben bei ihm. Sichtbar sind die Ordner der eigenen Fächer
 * (Einstellungen › Schule); löschen darf, wer geteilt hat, und der Admin.
 *
 * Rückmeldungen sind NICHT teilbar: Sie enthalten Namen und Arbeiten von Schülerinnen und Schülern.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FAECHER } from '@shared/faecher'
import { getSettings } from '../main/services/storage/settings'
import { erstellePaket, lesePaketEin, WEGE } from '../main/services/paket/wege'
import { paketVorschau, type PaketArt } from '../main/services/paket/paket'
import { writeAtomic } from '../main/services/storage/atomar'
import { imNutzer } from './kontext'
import { ordner } from './pfade'
import { alsNutzer, json, type Anfrage } from './http'
import { protokolliereServer } from './datenbank'

export const TEILBAR: PaketArt[] = ['arbeitsblatt', 'vokabeltest', 'klassenarbeit', 'lernzielkontrolle', 'grammatiktest', 'elternbrief', 'tafelbild']

export interface FachEintrag {
  id: string
  art: PaketArt
  titel: string
  von: string
  vonName: string
  vonId: string
  datum: string
  groesse: number
}

const fachOrdner = (fach: string): string => {
  if (!FAECHER.some((f) => f.id === fach) && fach !== 'allgemein') throw new Error('Unbekanntes Fach.')
  return ordner('fach', fach)
}
const indexDatei = (fach: string): string => join(fachOrdner(fach), 'index.json')

function lies(fach: string): FachEintrag[] {
  try {
    return JSON.parse(readFileSync(indexDatei(fach), 'utf8')) as FachEintrag[]
  } catch {
    return []
  }
}

const schreib = (fach: string, liste: FachEintrag[]): void => writeAtomic(indexDatei(fach), JSON.stringify(liste, null, 2))

/** Gehört der Pfad zum Fachordner? */
export const fachordnerPfad = (pfad: string): boolean => pfad === '/server/fach' || pfad.startsWith('/server/fach/')

export function fachordnerRoute(): (k: Anfrage) => Promise<boolean> {
  return async (k) => {
    const { url, req, res, sitzung } = k
    // Nur /server/fach und /server/fach/… – nicht /server/fachfarben, /server/fachschaft (09.10.2026: fing GET /server/fachfarben mit 405 ab)
    if (!fachordnerPfad(url.pathname)) return false
    if (!sitzung) return (json(res, 401, { fehler: 'Nicht angemeldet.' }), true)
    const n = sitzung.nutzer
    if (n.rolle === 'schueler') return (json(res, 403, { fehler: 'Nur für Lehrkräfte.' }), true)
    const ich = alsNutzer(n, sitzung.kennung)
    const was = url.pathname.slice('/server/fach'.length).replace(/^\//, '')

    if (req.method === 'GET' && !was) {
      const eigene = imNutzer(ich, () => getSettings().eigeneFaecher ?? [])
      const faecher = (eigene.length ? FAECHER.filter((f) => eigene.includes(f.id)) : FAECHER).map((f) => ({ id: f.id, label: f.label, eintraege: lies(f.id) }))
      return (json(res, 200, { faecher, teilbar: TEILBAR }), true)
    }
    if (req.method !== 'POST') return (json(res, 405, { fehler: 'Nicht erlaubt.' }), true)
    if (typeof req.headers['x-schulapps-token'] !== 'string') return (json(res, 403, { fehler: 'Nur aus der App.' }), true)
    const k0 = (await k.koerper()) as Record<string, unknown>
    const fach = String(k0.fach ?? '')

    if (was === 'teilen') {
      const art = String(k0.art ?? '') as PaketArt
      if (!TEILBAR.includes(art)) return (json(res, 400, { fehler: art === 'rueckmeldung' ? 'Rückmeldungen enthalten Schülerdaten und lassen sich nicht teilen.' : 'Dieses Material lässt sich nicht teilen.' }), true)
      try {
        const { daten, titel } = imNutzer(ich, () => {
          const titel = String((WEGE[art].get(String(k0.id ?? '')) as { name?: string } | null)?.name ?? 'Material')
          return { daten: erstellePaket(titel, [{ art, id: String(k0.id ?? '') }]), titel }
        })
        const id = randomBytes(8).toString('hex')
        writeFileSync(join(fachOrdner(fach), `${id}.schulpaket`), daten)
        schreib(fach, [{ id, art, titel, von: n.benutzer, vonName: n.name, vonId: n.id, datum: new Date().toISOString(), groesse: daten.byteLength }, ...lies(fach)])
        protokolliereServer('fachordner', `Material geteilt (${art}, ${fach})`, n.id)
        return (json(res, 200, { id }), true)
      } catch (e) {
        return (json(res, 400, { fehler: e instanceof Error ? e.message : String(e) }), true)
      }
    }
    const eintrag = lies(fach).find((x) => x.id === String(k0.eintrag ?? ''))
    if (!eintrag) return (json(res, 404, { fehler: 'Nicht (mehr) im Fachordner.' }), true)
    const datei = join(fachOrdner(fach), `${eintrag.id}.schulpaket`)
    if (was === 'uebernehmen') {
      if (!existsSync(datei)) return (json(res, 404, { fehler: 'Die Datei fehlt.' }), true)
      const daten = new Uint8Array(readFileSync(datei))
      paketVorschau(daten) // prüft das Paket vor dem Einlesen
      const neu = imNutzer(ich, () => lesePaketEin(daten))
      return (json(res, 200, { uebernommen: neu }), true)
    }
    if (was === 'loeschen') {
      if (eintrag.vonId !== n.id && n.rolle !== 'admin') return (json(res, 403, { fehler: 'Löschen darf nur, wer geteilt hat.' }), true)
      rmSync(datei, { force: true })
      schreib(
        fach,
        lies(fach).filter((x) => x.id !== eintrag.id)
      )
      return (json(res, 200, { ok: true }), true)
    }
    return (json(res, 404, { fehler: 'Unbekannt.' }), true)
  }
}
