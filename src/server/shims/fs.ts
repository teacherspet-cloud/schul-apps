/**
 * Dateien der Nutzer verschlüsselt ablegen (02.10.2026, siehe feldschutz.ts).
 *
 * Im Server-Bündel bekommen die Bausteine aus src/main und src/server dieses Modul statt `fs`
 * (vite.server.config.ts). Alles, was unter <DATEN>/nutzer, <DATEN>/fach und <DATEN>/system geschrieben wird –
 * Einstellungen, Material, Rückmeldungen mit Schülertexten und Namen –, landet mit AES-256-GCM
 * verschlüsselt auf der Platte; beim Lesen wird es wieder entschlüsselt. Ausgenommen sind
 * Audio und Video (werden gestreamt, enthalten keine Namen). Unverschlüsselte Altdateien werden
 * weiter gelesen und beim nächsten Schreiben (bzw. beim Start, `ablageVerschluesseln`) umgestellt.
 *
 * Die Exe am PC nutzt dieses Modul nicht.
 */
import * as echt from 'node:fs'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { extname, join, resolve, sep } from 'node:path'
import { hauptschluessel } from '../geheim'
import { DATEN } from '../pfade'

export * from 'node:fs'

const KOPF = Buffer.from('SAENC1\n')
const OHNE = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm', '.mp4', '.mov'])
// <DATEN>/system (08.10.2026): Ablage ohne angemeldeten Nutzer (Einstellungen, protokoll.log, verbrauch.json)
const BEREICHE = () => [join(DATEN, 'nutzer') + sep, join(DATEN, 'fach') + sep, join(DATEN, 'system') + sep]

const pfadVon = (p: echt.PathOrFileDescriptor): string | null =>
  typeof p === 'string' ? resolve(p) : p instanceof URL ? resolve(p.pathname) : Buffer.isBuffer(p) ? resolve(p.toString()) : null

/** Gehört die Datei zu den geschützten Ablagen? */
export function geschuetzteDatei(p: echt.PathOrFileDescriptor): boolean {
  const pfad = pfadVon(p)
  if (!pfad || OHNE.has(extname(pfad).toLowerCase())) return false
  // Anmeldedaten der KI-Programme (<DATEN>/nutzer/<id>/ki/…) lesen Codex und Claude selbst
  const nutzer = join(DATEN, 'nutzer') + sep
  if (pfad.startsWith(nutzer) && pfad.slice(nutzer.length).split(sep)[1] === 'ki') return false
  // … ebenso ohne angemeldeten Nutzer (<DATEN>/system/ki, serverKiOrdner außerhalb einer Anfrage)
  if (pfad.startsWith(join(DATEN, 'system', 'ki') + sep)) return false
  return BEREICHE().some((b) => pfad.startsWith(b))
}

export const istVerschluesselt = (b: Buffer): boolean => b.length >= KOPF.length + 28 && b.subarray(0, KOPF.length).equals(KOPF)

export function dateiZu(klar: Buffer): Buffer {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', hauptschluessel(), iv)
  const daten = Buffer.concat([c.update(klar), c.final()])
  return Buffer.concat([KOPF, iv, c.getAuthTag(), daten])
}

export function dateiVon(roh: Buffer): Buffer {
  if (!istVerschluesselt(roh)) return roh
  const o = KOPF.length
  const d = createDecipheriv('aes-256-gcm', hauptschluessel(), roh.subarray(o, o + 12))
  d.setAuthTag(roh.subarray(o + 12, o + 28))
  return Buffer.concat([d.update(roh.subarray(o + 28)), d.final()])
}

type Kodierung = BufferEncoding | null | undefined
const kodierungAus = (o: unknown): Kodierung =>
  typeof o === 'string' ? (o as BufferEncoding) : o && typeof o === 'object' ? ((o as { encoding?: BufferEncoding | null }).encoding ?? null) : null

export function readFileSync(p: echt.PathOrFileDescriptor, o?: unknown): string | Buffer {
  const roh = echt.readFileSync(p)
  const klar = dateiVon(roh)
  const k = kodierungAus(o)
  return k ? klar.toString(k) : klar
}

export function writeFileSync(p: echt.PathOrFileDescriptor, daten: string | NodeJS.ArrayBufferView, o?: echt.WriteFileOptions): void {
  if (!geschuetzteDatei(p)) return echt.writeFileSync(p, daten, o)
  const k = kodierungAus(o) ?? 'utf8'
  const klar = typeof daten === 'string' ? Buffer.from(daten, k) : Buffer.from(daten.buffer, daten.byteOffset, daten.byteLength)
  const opts = o && typeof o === 'object' ? { ...o, encoding: null } : undefined
  echt.writeFileSync(p, dateiZu(klar), opts as echt.WriteFileOptions)
}

export function appendFileSync(p: echt.PathOrFileDescriptor, daten: string | Uint8Array, o?: echt.WriteFileOptions): void {
  if (!geschuetzteDatei(p)) return echt.appendFileSync(p, daten, o)
  const alt = echt.existsSync(p as string) ? dateiVon(echt.readFileSync(p)) : Buffer.alloc(0)
  writeFileSync(p, Buffer.concat([alt, typeof daten === 'string' ? Buffer.from(daten, kodierungAus(o) ?? 'utf8') : Buffer.from(daten)]))
}

/** Beim Start: unverschlüsselte Altdateien der Ablagen umschreiben */
export function ablageVerschluesseln(): number {
  let n = 0
  const gehe = (ordner: string): void => {
    if (!echt.existsSync(ordner)) return
    for (const e of echt.readdirSync(ordner, { withFileTypes: true })) {
      const p = join(ordner, e.name)
      if (e.isDirectory()) {
        // Anmeldedaten der KI-Programme (Codex/Claude) verwalten diese selbst
        gehe(p)
      } else if (e.isFile() && geschuetzteDatei(p)) {
        const roh = echt.readFileSync(p)
        if (istVerschluesselt(roh)) continue
        echt.writeFileSync(`${p}.verschl-tmp`, dateiZu(roh))
        echt.renameSync(`${p}.verschl-tmp`, p)
        n++
      }
    }
  }
  for (const b of BEREICHE()) gehe(b)
  return n
}

const standard = { ...echt, readFileSync, writeFileSync, appendFileSync }
export default standard
