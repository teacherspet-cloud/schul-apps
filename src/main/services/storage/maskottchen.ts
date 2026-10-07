/**
 * Ablage der Maskottchen im Profil: `maskottchen/<id>/figur.json`, `vorlage.png`,
 * `<pose>.png` (26.09.2026).
 *
 * Ältere flache Dateien (`<name>.png` + `<name>.json` direkt im Ordner – so wurden am
 * 26.09.2026 die ersten beiden Figuren abgelegt) werden beim Lesen in Ordner überführt.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { writeAtomic } from './atomar'
import { join } from 'path'
import type { MaskottchenInfo, MaskottchenMeta } from '../../../shared/maskottchen'
import { aufServer, nurAdmin } from '../rolle'

/*
 * Maskottchen der Schule (06.10.2026, Wunsch der Lehrkraft): „Verschiebe dies auf die Verwaltung des Servers mit der
 * weiterhin bestehenden Möglichkeit für Lehrkräfte, sich eigene Maskottchen und Illustrationen hinzuzufügen."
 * Am Server liegen die Figuren der Schule EINMAL in <DATEN>/maskottchen (nur Admins ändern sie, alle lesen sie),
 * die eigenen weiter im Ordner der Lehrkraft. In der Exe gibt es nur die eigenen.
 */
function dir(schule = false): string {
  const d = schule ? join(process.env.SCHULAPPS_DATEN || './server-daten', 'maskottchen') : join(app.getPath('userData'), 'maskottchen')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

/** Liegt die Figur bei der Schule? Dann dürfen nur Admins sie ändern. */
function bereichVon(id: string): boolean {
  if (!aufServer() || existsSync(join(dir(), id, 'figur.json'))) return false
  if (!existsSync(join(dir(true), id, 'figur.json'))) return false
  nurAdmin('Die Maskottchen der Schule')
  return true
}

const sicher = (id: string): string => {
  const k = String(id).replace(/[^a-z0-9-]/gi, '')
  if (!k) throw new Error('Ungültige Kennung')
  return k
}

const pngDataUrl = (file: string): string => `data:image/png;base64,${readFileSync(file).toString('base64')}`

function dataUrlBytes(dataUrl: string): Buffer {
  const komma = dataUrl.indexOf(',')
  if (komma < 0 || !/^data:image\/png;base64/i.test(dataUrl)) throw new Error('Das Bild muss ein PNG als data:-Adresse sein.')
  return Buffer.from(dataUrl.slice(komma + 1), 'base64')
}

/** Flache Dateien der ersten Fassung in Ordner überführen. */
function migriere(): void {
  const root = dir()
  for (const f of readdirSync(root)) {
    if (!f.endsWith('.json') || statSync(join(root, f)).isDirectory()) continue
    const id = f.slice(0, -5)
    const png = join(root, `${id}.png`)
    if (!existsSync(png)) continue
    const ziel = join(root, id)
    mkdirSync(ziel, { recursive: true })
    let alt: { name?: string; beschreibung?: string; pose?: string; quelle?: string; erstellt?: string } = {}
    try {
      alt = JSON.parse(readFileSync(join(root, f), 'utf8'))
    } catch {
      /* leer */
    }
    const meta: MaskottchenMeta = {
      id,
      name: alt.name ?? id,
      beschreibung: alt.beschreibung ?? '',
      quelle: alt.quelle === 'upload' ? 'upload' : 'ki',
      angelegt: alt.erstellt ?? new Date().toISOString()
    }
    writeAtomic(join(ziel, 'figur.json'), JSON.stringify(meta, null, 2))
    renameSync(png, join(ziel, 'vorlage.png'))
    // Die erste Fassung war die Pose „winkend" – sie zählt gleich als Pose
    if (alt.pose === 'winkend') writeFileSync(join(ziel, 'winkend.png'), readFileSync(join(ziel, 'vorlage.png')))
    rmSync(join(root, f), { force: true })
  }
}

function leseFigur(id: string, schule = false): MaskottchenInfo | null {
  const ordner = join(dir(schule), id)
  const metaDatei = join(ordner, 'figur.json')
  if (!existsSync(metaDatei)) return null
  const meta = JSON.parse(readFileSync(metaDatei, 'utf8')) as MaskottchenMeta
  const posen: Record<string, string> = {}
  for (const f of readdirSync(ordner)) {
    if (!f.endsWith('.png') || f === 'vorlage.png') continue
    posen[f.slice(0, -4)] = pngDataUrl(join(ordner, f))
  }
  const vorlage = existsSync(join(ordner, 'vorlage.png')) ? pngDataUrl(join(ordner, 'vorlage.png')) : (posen.winkend ?? '')
  return { ...meta, id, vorlage, posen, ...(schule ? { schule: true } : {}) }
}

function figurenIn(schule: boolean): MaskottchenInfo[] {
  const root = dir(schule)
  return readdirSync(root)
    .filter((f) => statSync(join(root, f)).isDirectory())
    .map((id) => leseFigur(id, schule))
    .filter((m): m is MaskottchenInfo => Boolean(m))
    .sort((a, b) => a.angelegt.localeCompare(b.angelegt))
}

/** Eigene Figuren, am Server dazu die der Schule (eigene gleicher Kennung haben Vorrang) */
export function listMaskottchen(): MaskottchenInfo[] {
  migriere()
  const eigene = figurenIn(false)
  if (!aufServer()) return eigene
  const ids = new Set(eigene.map((m) => m.id))
  return [...figurenIn(true).filter((m) => !ids.has(m.id)), ...eigene]
}

/** Figur anlegen oder Vorlage/Angaben ersetzen. */
export function saveMaskottchen(eingabe: { id: string; name: string; beschreibung: string; quelle: 'ki' | 'upload'; vorlage?: string; schule?: boolean }): MaskottchenInfo {
  const id = sicher(eingabe.id)
  // Neue Figur der Schule (Verwaltung) oder Änderung an einer bestehenden der Schule
  const schule = aufServer() && (eingabe.schule === true ? (nurAdmin('Die Maskottchen der Schule'), true) : bereichVon(id))
  const ordner = join(dir(schule), id)
  mkdirSync(ordner, { recursive: true })
  const vorhanden = existsSync(join(ordner, 'figur.json')) ? (JSON.parse(readFileSync(join(ordner, 'figur.json'), 'utf8')) as MaskottchenMeta) : null
  const meta: MaskottchenMeta = {
    id,
    name: eingabe.name.trim() || vorhanden?.name || id,
    beschreibung: eingabe.beschreibung.trim(),
    quelle: eingabe.quelle,
    angelegt: vorhanden?.angelegt ?? new Date().toISOString()
  }
  writeAtomic(join(ordner, 'figur.json'), JSON.stringify(meta, null, 2))
  if (eingabe.vorlage) writeAtomic(join(ordner, 'vorlage.png'), dataUrlBytes(eingabe.vorlage))
  const info = leseFigur(id, schule)
  if (!info) throw new Error('Die Figur konnte nicht gespeichert werden.')
  return info
}

export function savePose(id: string, pose: string, dataUrl: string): MaskottchenInfo {
  const k = sicher(id)
  const p = sicher(pose)
  const schule = bereichVon(k)
  const ordner = join(dir(schule), k)
  if (!existsSync(join(ordner, 'figur.json'))) throw new Error('Die Figur gibt es nicht.')
  writeAtomic(join(ordner, `${p}.png`), dataUrlBytes(dataUrl))
  const info = leseFigur(k, schule)
  if (!info) throw new Error('Die Pose konnte nicht gespeichert werden.')
  return info
}

export function deletePose(id: string, pose: string): MaskottchenInfo | null {
  const k = sicher(id)
  const schule = bereichVon(k)
  rmSync(join(dir(schule), k, `${sicher(pose)}.png`), { force: true })
  return leseFigur(k, schule)
}

export function deleteMaskottchen(id: string): MaskottchenInfo[] {
  const k = sicher(id)
  rmSync(join(dir(bereichVon(k)), k), { recursive: true, force: true })
  return listMaskottchen()
}
