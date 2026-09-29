/**
 * `fs/promises` für die iPad-App – dieselben Aufrufe wie shims/fs.ts, als Promise.
 * Der Speicher ist ohnehin im Arbeitsspeicher; asynchron ist hier nur die Hülle.
 */
import * as fs from './fs'

type Pfad = string | URL

const alsPromise =
  <A extends unknown[], R>(fn: (...args: A) => R) =>
  async (...args: A): Promise<R> =>
    fn(...args)

export const readFile = alsPromise((pfad: Pfad, optionen?: Parameters<typeof fs.readFileSync>[1]) => fs.readFileSync(pfad, optionen))
export const writeFile = alsPromise(fs.writeFileSync)
export const appendFile = alsPromise(fs.appendFileSync)
export const mkdir = alsPromise(fs.mkdirSync)
export const readdir = alsPromise((pfad: Pfad, optionen?: { withFileTypes?: boolean }) => fs.readdirSync(pfad, optionen))
export const stat = alsPromise((pfad: Pfad) => fs.statSync(pfad))
export const lstat = stat
export const rename = alsPromise(fs.renameSync)
export const rm = alsPromise(fs.rmSync)
export const rmdir = alsPromise(fs.rmdirSync)
export const unlink = alsPromise(fs.unlinkSync)
export const copyFile = alsPromise(fs.copyFileSync)
export const mkdtemp = alsPromise(fs.mkdtempSync)
export const access = alsPromise(fs.accessSync)

/** Dateigriffe gibt es nicht (nur das KI-Abo nutzt sie, und das ist auf dem iPad ersetzt) */
export async function open(): Promise<never> {
  throw new Error('Dateigriffe gibt es in der iPad-App nicht.')
}

export type FileHandle = never

export default { readFile, writeFile, appendFile, mkdir, readdir, stat, lstat, rename, rm, rmdir, unlink, copyFile, mkdtemp, access, open }
