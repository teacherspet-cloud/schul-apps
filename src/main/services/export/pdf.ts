import { BrowserWindow } from 'electron'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'

/** Lädt fertiges HTML in ein unsichtbares Fenster und führt fn damit aus. */
async function withHiddenWindow<T>(html: string, fn: (win: BrowserWindow) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'schulapps-'))
  const file = join(dir, 'druck.html')
  writeFileSync(file, html, 'utf8')
  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } })
  try {
    await win.loadURL(pathToFileURL(file).toString())
    return await fn(win)
  } finally {
    win.destroy()
    rmSync(dir, { recursive: true, force: true })
  }
}

export function htmlToPdf(html: string): Promise<Buffer> {
  return withHiddenWindow(html, (win) => win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true }))
}

/** Druckoptionen aus der Druckvorschau der App; ohne Optionen öffnet sich der Druckdialog von Windows. */
export interface PrintOptions {
  deviceName: string
  copies: number
  duplex: 'simplex' | 'longEdge' | 'shortEdge'
  color: boolean
  /** Seitenbereiche, 1-basiert und einschließlich */
  pages?: { from: number; to: number }[]
}

export function printHtml(html: string, options?: PrintOptions): Promise<void> {
  const settings: Electron.WebContentsPrintOptions = options
    ? {
        silent: true,
        printBackground: true,
        pageSize: 'A4',
        deviceName: options.deviceName,
        copies: Math.max(1, Math.round(options.copies)),
        collate: true,
        duplexMode: options.duplex,
        color: options.color,
        margins: { marginType: 'none' },
        pageRanges: options.pages?.map((r) => ({ from: r.from - 1, to: r.to - 1 }))
      }
    : { silent: false, printBackground: true, pageSize: 'A4' }
  return withHiddenWindow(
    html,
    (win) =>
      new Promise<void>((resolve, reject) => {
        win.webContents.print(settings, (success, reason) => {
          if (success || reason === 'cancelled') resolve()
          else reject(new Error(`Drucken fehlgeschlagen: ${reason}`))
        })
      })
  )
}
