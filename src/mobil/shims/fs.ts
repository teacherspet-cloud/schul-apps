/**
 * `fs` für die iPad-App: dieselben synchronen Aufrufe wie Node, auf dem Speicher-Dateisystem
 * (vfs/speicher.ts). Nur, was der Hauptprozess-Code tatsächlich nutzt – mit den Fehlern von
 * Node (code 'ENOENT' usw.), weil der Code darüber sich darauf verlässt („Datei fehlt → Vorgabe").
 */
import { Buffer } from 'buffer'
import { normiere, vfs, VfsFehler } from '../vfs/speicher'
import * as versprochen from './fs-promises'

type Kodierung = 'utf8' | 'utf-8' | 'base64' | 'latin1' | 'binary' | 'hex' | 'ascii'
type LeseOptionen = Kodierung | { encoding?: Kodierung | null; flag?: string } | null | undefined
type SchreibOptionen = Kodierung | { encoding?: Kodierung | null; flag?: string; mode?: number } | null | undefined
type Pfad = string | URL

const kodierungVon = (o: LeseOptionen | SchreibOptionen): Kodierung | undefined => (typeof o === 'string' ? o : o?.encoding ?? undefined)

function alsBytes(daten: string | Uint8Array | ArrayBufferView, o?: SchreibOptionen): Uint8Array {
  if (typeof daten === 'string') return new Uint8Array(Buffer.from(daten, (kodierungVon(o) ?? 'utf8') as BufferEncoding))
  if (daten instanceof Uint8Array) return new Uint8Array(daten)
  return new Uint8Array(daten.buffer.slice(daten.byteOffset, daten.byteOffset + daten.byteLength))
}

export function existsSync(pfad: Pfad): boolean {
  try {
    return vfs.existiert(normiere(pfad))
  } catch {
    return false
  }
}

export function readFileSync(pfad: Pfad): Buffer
export function readFileSync(pfad: Pfad, optionen: Kodierung | { encoding: Kodierung }): string
export function readFileSync(pfad: Pfad, optionen?: LeseOptionen): string | Buffer
export function readFileSync(pfad: Pfad, optionen?: LeseOptionen): string | Buffer {
  const bytes = vfs.lies(normiere(pfad))
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const k = kodierungVon(optionen)
  return k ? buf.toString(k as BufferEncoding) : Buffer.from(buf)
}

export function writeFileSync(pfad: Pfad, daten: string | Uint8Array | ArrayBufferView, optionen?: SchreibOptionen): void {
  const flag = typeof optionen === 'object' && optionen ? optionen.flag : undefined
  if (flag?.startsWith('a')) return appendFileSync(pfad, daten, optionen)
  vfs.schreibe(normiere(pfad), alsBytes(daten, optionen))
}

export function appendFileSync(pfad: Pfad, daten: string | Uint8Array | ArrayBufferView, optionen?: SchreibOptionen): void {
  vfs.anhaengen(normiere(pfad), alsBytes(daten, optionen))
}

export function mkdirSync(pfad: Pfad, optionen?: { recursive?: boolean; mode?: number } | number): string | undefined {
  const rekursiv = typeof optionen === 'object' && Boolean(optionen?.recursive)
  return vfs.ordnerAnlegen(normiere(pfad), rekursiv)
}

export class Dirent {
  constructor(public name: string, private ordner: boolean, public parentPath: string) {}
  get path(): string {
    return this.parentPath
  }
  isFile(): boolean {
    return !this.ordner
  }
  isDirectory(): boolean {
    return this.ordner
  }
  isSymbolicLink(): boolean {
    return false
  }
}

export function readdirSync(pfad: Pfad): string[]
export function readdirSync(pfad: Pfad, optionen: { withFileTypes: true }): Dirent[]
export function readdirSync(pfad: Pfad, optionen?: { withFileTypes?: boolean; encoding?: string } | string): string[] | Dirent[]
export function readdirSync(pfad: Pfad, optionen?: { withFileTypes?: boolean; encoding?: string } | string): string[] | Dirent[] {
  const p = normiere(pfad)
  const eintraege = vfs.liste(p)
  if (typeof optionen === 'object' && optionen?.withFileTypes) return eintraege.map((e) => new Dirent(e.name, e.ordner, p))
  return eintraege.map((e) => e.name)
}

export class Stats {
  size: number
  mtimeMs: number
  ctimeMs: number
  birthtimeMs: number
  atimeMs: number
  mtime: Date
  ctime: Date
  birthtime: Date
  atime: Date
  mode: number
  constructor(groesse: number, mtime: number, private ordner: boolean) {
    this.size = groesse
    this.mtimeMs = this.ctimeMs = this.birthtimeMs = this.atimeMs = mtime
    this.mtime = new Date(mtime)
    this.ctime = new Date(mtime)
    this.birthtime = new Date(mtime)
    this.atime = new Date(mtime)
    this.mode = ordner ? 0o40755 : 0o100644
  }
  isFile(): boolean {
    return !this.ordner
  }
  isDirectory(): boolean {
    return this.ordner
  }
  isSymbolicLink(): boolean {
    return false
  }
}

export function statSync(pfad: Pfad, optionen?: { throwIfNoEntry?: boolean }): Stats {
  try {
    const w = vfs.werte(normiere(pfad))
    return new Stats(w.groesse, w.mtime, w.ordner)
  } catch (e) {
    if (optionen?.throwIfNoEntry === false && (e as VfsFehler).code === 'ENOENT') return undefined as unknown as Stats
    throw e
  }
}

export const lstatSync = statSync

export function renameSync(von: Pfad, nach: Pfad): void {
  vfs.benenneUm(normiere(von), normiere(nach))
}

export function rmSync(pfad: Pfad, optionen?: { recursive?: boolean; force?: boolean; maxRetries?: number }): void {
  vfs.entferne(normiere(pfad), { recursive: optionen?.recursive, force: optionen?.force }, 'rm')
}

export function rmdirSync(pfad: Pfad, optionen?: { recursive?: boolean }): void {
  vfs.entferne(normiere(pfad), { recursive: optionen?.recursive }, 'rmdir')
}

export function unlinkSync(pfad: Pfad): void {
  const p = normiere(pfad)
  if (vfs.istOrdner(p)) throw new VfsFehler('EISDIR', 'unlink', p)
  vfs.entferne(p, {}, 'unlink')
}

export function utimesSync(pfad: Pfad, _atime: number | Date, mtime: number | Date): void {
  // Node nimmt Sekunden (Zahl) oder Date
  vfs.setzeZeit(normiere(pfad), typeof mtime === 'number' ? mtime * 1000 : mtime.getTime())
}

export function copyFileSync(von: Pfad, nach: Pfad): void {
  vfs.schreibe(normiere(nach), new Uint8Array(vfs.lies(normiere(von))), 'copyfile')
}

export function mkdtempSync(vorsatz: string): string {
  const zeichen = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  for (;;) {
    let rest = ''
    const zufall = crypto.getRandomValues(new Uint8Array(6))
    for (const z of zufall) rest += zeichen[z % zeichen.length]
    const p = normiere(vorsatz + rest)
    if (vfs.existiert(p)) continue
    vfs.ordnerAnlegen(p)
    return p
  }
}

/** Streams gibt es nicht – die Module, die sie brauchen (KI-Abo, Netzzugang), sind auf dem iPad ersetzt */
export function createReadStream(): never {
  throw new Error('createReadStream gibt es in der iPad-App nicht.')
}
export function createWriteStream(): never {
  throw new Error('createWriteStream gibt es in der iPad-App nicht.')
}

export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 }

export function accessSync(pfad: Pfad): void {
  const p = normiere(pfad)
  if (!vfs.existiert(p)) throw new VfsFehler('ENOENT', 'access', p)
}

export const promises = versprochen

export default {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  lstatSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  copyFileSync,
  utimesSync,
  mkdtempSync,
  createReadStream,
  createWriteStream,
  accessSync,
  constants,
  Dirent,
  Stats,
  promises
}
