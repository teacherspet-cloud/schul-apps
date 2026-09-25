/**
 * Bauen mit Nachkontrolle.
 *
 * Das Projekt liegt in einem Dropbox-Ordner. Dropbox greift auf `out/renderer/assets` zu,
 * während electron-vite dort schreibt, und räumt die frisch erzeugten Bündel gelegentlich
 * gleich wieder weg. Die App startet dann mit `ERR_FILE_NOT_FOUND` und einem leeren Fenster –
 * ein Fehlerbild, das wie ein Absturz aussieht, aber keiner ist. Das hat mehrfach Testläufe
 * gekostet, bis die Ursache klar war.
 *
 * Deshalb hier: bauen, prüfen, ob die in index.html verlangten Dateien wirklich liegen, und
 * im Zweifel neu bauen. Erst wenn das dreimal misslingt, ist es ein echtes Problem.
 *
 * Aufruf: node scripts/bauen.mjs
 */
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const html = join(root, 'out/renderer/index.html')

/** Die Dateien, die index.html verlangt – und ob sie liegen. */
function fehlende() {
  if (!existsSync(html)) return ['out/renderer/index.html']
  const text = readFileSync(html, 'utf8')
  const verlangt = [...text.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => m[1])
  return verlangt.filter((f) => !existsSync(join(root, 'out/renderer', f)))
}

for (let versuch = 1; versuch <= 3; versuch++) {
  execSync('npx electron-vite build', { stdio: versuch === 1 ? 'inherit' : 'ignore' })
  // Dropbox braucht einen Moment; erst danach ist das Ergebnis aussagekräftig
  execSync(process.platform === 'win32' ? 'powershell -NoProfile -Command "Start-Sleep -Seconds 2"' : 'sleep 2', { stdio: 'ignore' })
  const fehlt = fehlende()
  if (!fehlt.length) {
    console.log(`\nBau vollständig (Versuch ${versuch}).`)
    process.exit(0)
  }
  console.warn(`\nVersuch ${versuch}: ${fehlt.length} Datei(en) fehlen nach dem Bauen – vermutlich hat Dropbox dazwischengefunkt:\n  ${fehlt.join('\n  ')}`)
}

console.error('\nNach drei Versuchen fehlen weiterhin Dateien. Hier hilft, den Ordner „out" von der Dropbox-Synchronisierung auszunehmen.')
process.exit(1)
