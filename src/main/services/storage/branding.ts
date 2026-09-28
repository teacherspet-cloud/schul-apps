import { app } from 'electron'
import { existsSync, readFileSync, rmSync } from 'fs'
import { writeAtomic } from './atomar'
import { join } from 'path'

const logoPath = (): string => join(app.getPath('userData'), 'logo.png')

/** Schullogo als data:-URL oder null, wenn keins hinterlegt ist. */
export function getLogo(): string | null {
  const path = logoPath()
  if (!existsSync(path)) return null
  return `data:image/png;base64,${readFileSync(path).toString('base64')}`
}

export function setLogo(dataUrl: string): void {
  const match = /^data:image\/png;base64,(.+)$/s.exec(dataUrl)
  if (!match) throw new Error('Das Logo muss als PNG übergeben werden.')
  writeAtomic(logoPath(), Buffer.from(match[1], 'base64'))
}

export function removeLogo(): void {
  rmSync(logoPath(), { force: true })
}
