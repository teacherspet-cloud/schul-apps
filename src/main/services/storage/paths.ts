import { app } from 'electron'
import { join } from 'path'

/** Pfad zu mitgelieferten Ressourcen (Entwicklung: Projektordner, installiert: resources/). */
export function resourcePath(...parts: string[]): string {
  const base = app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources')
  return join(base, ...parts)
}
