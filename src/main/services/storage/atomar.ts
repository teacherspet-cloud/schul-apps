/**
 * Absturzsicheres Schreiben (27.09.2026, Befund der Bestandsaufnahme).
 *
 * Erst in eine Hilfsdatei mit Zufallsendung, dann umbenennen: Bricht das Programm mitten im
 * Schreiben ab (Absturz, Stromausfall, Dropbox hält die Datei), bleibt die alte Fassung ganz.
 * Bis dahin schrieben nur die Materialordner so; Einstellungen, Schlüssel, Vokabel-Bibliothek,
 * Logo, Piktogramme, Maskottchen und Hörtexte wurden direkt überschrieben – eine halb
 * geschriebene settings.json hätte beim nächsten Start alle Einstellungen verloren.
 */
import { randomBytes } from 'crypto'
import { renameSync, rmSync, writeFileSync } from 'fs'

/*
 * Kurz gesperrte Dateien (29.09.2026, „Löschen klappt erst beim zweiten Mal"): Unter Windows
 * halten Dropbox, der Virenscanner oder die Indexsuche eine Datei oft für einen Augenblick fest.
 * Umbenennen und Löschen scheitern dann mit EPERM/EBUSY/EACCES, obwohl es eine Zehntelsekunde
 * später ginge. `rmSync` wiederholt nur mit `recursive` – deshalb hier selbst, mit kurzer Pause.
 */
const VORUEBERGEHEND = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'])
const VERSUCHE = 8
const PAUSE_MS = 60

function warte(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Führt `fn` aus und wiederholt es bei einer vorübergehenden Sperre; andere Fehler und die letzte Sperre werden geworfen. */
export function mitWiederholung<T>(fn: () => T, versuche = VERSUCHE, pauseMs = PAUSE_MS): T {
  for (let i = 1; ; i++) {
    try {
      return fn()
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code
      if (i >= versuche || !code || !VORUEBERGEHEND.has(code)) throw e
      warte(pauseMs * i)
    }
  }
}

export function writeAtomic(file: string, content: string | Uint8Array): void {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
  try {
    if (typeof content === 'string') writeFileSync(tmp, content, 'utf8')
    else writeFileSync(tmp, content)
    mitWiederholung(() => renameSync(tmp, file))
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
}

/**
 * Datei löschen – eine fehlende Datei ist kein Fehler, eine gesperrte wird erneut versucht.
 * Bleibt sie gesperrt, kommt der Fehler bei der Lehrkraft an, statt still zu verschwinden.
 */
export function loescheDatei(file: string): void {
  try {
    mitWiederholung(() => rmSync(file, { force: true }))
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code
    throw new Error(
      `Die Datei ließ sich nicht löschen${code ? ` (${code})` : ''}. Vermutlich hält ein anderes Programm (etwa Dropbox) sie gerade fest. Ein erneuter Versuch in einem Moment hilft meist.`
    )
  }
}
