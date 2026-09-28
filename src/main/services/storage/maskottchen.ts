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

function dir(): string {
  const d = join(app.getPath('userData'), 'maskottchen')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
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

function leseFigur(id: string): MaskottchenInfo | null {
  const ordner = join(dir(), id)
  const metaDatei = join(ordner, 'figur.json')
  if (!existsSync(metaDatei)) return null
  const meta = JSON.parse(readFileSync(metaDatei, 'utf8')) as MaskottchenMeta
  const posen: Record<string, string> = {}
  for (const f of readdirSync(ordner)) {
    if (!f.endsWith('.png') || f === 'vorlage.png') continue
    posen[f.slice(0, -4)] = pngDataUrl(join(ordner, f))
  }
  const vorlage = existsSync(join(ordner, 'vorlage.png')) ? pngDataUrl(join(ordner, 'vorlage.png')) : (posen.winkend ?? '')
  return { ...meta, id, vorlage, posen }
}

export function listMaskottchen(): MaskottchenInfo[] {
  migriere()
  const root = dir()
  return readdirSync(root)
    .filter((f) => statSync(join(root, f)).isDirectory())
    .map((id) => leseFigur(id))
    .filter((m): m is MaskottchenInfo => Boolean(m))
    .sort((a, b) => a.angelegt.localeCompare(b.angelegt))
}

/** Figur anlegen oder Vorlage/Angaben ersetzen. */
export function saveMaskottchen(eingabe: { id: string; name: string; beschreibung: string; quelle: 'ki' | 'upload'; vorlage?: string }): MaskottchenInfo {
  const id = sicher(eingabe.id)
  const ordner = join(dir(), id)
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
  const info = leseFigur(id)
  if (!info) throw new Error('Die Figur konnte nicht gespeichert werden.')
  return info
}

export function savePose(id: string, pose: string, dataUrl: string): MaskottchenInfo {
  const k = sicher(id)
  const p = sicher(pose)
  const ordner = join(dir(), k)
  if (!existsSync(join(ordner, 'figur.json'))) throw new Error('Die Figur gibt es nicht.')
  writeAtomic(join(ordner, `${p}.png`), dataUrlBytes(dataUrl))
  const info = leseFigur(k)
  if (!info) throw new Error('Die Pose konnte nicht gespeichert werden.')
  return info
}

export function deletePose(id: string, pose: string): MaskottchenInfo | null {
  const k = sicher(id)
  rmSync(join(dir(), k, `${sicher(pose)}.png`), { force: true })
  return leseFigur(k)
}

export function deleteMaskottchen(id: string): MaskottchenInfo[] {
  rmSync(join(dir(), sicher(id)), { recursive: true, force: true })
  return listMaskottchen()
}
