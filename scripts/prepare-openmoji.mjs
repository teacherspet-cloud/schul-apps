// Bündelt die schwarzen OpenMoji-SVGs in EINER Datei und erzeugt einen kompakten Suchindex.
// Eine Datei statt über 2.000 Einzeldateien verkürzt das Entpacken der portablen .exe beim Start erheblich.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

const src = 'node_modules/openmoji'
const dest = 'resources/openmoji'
const data = JSON.parse(readFileSync(join(src, 'data/openmoji.json'), 'utf8'))

try {
  // Alter Ordner mit Einzeldateien (frühere Versionen); wird ohnehin nicht mehr mitgebaut
  rmSync(join(dest, 'svg'), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
} catch {
  console.warn('Hinweis: resources/openmoji/svg konnte nicht gelöscht werden (z. B. durch Dropbox gesperrt).')
}
mkdirSync(dest, { recursive: true })
const index = []
const svgs = {}
for (const e of data) {
  if (e.skintone || e.group === 'flags' || e.group === 'component') continue
  const file = join(src, 'black/svg', `${e.hexcode}.svg`)
  if (!existsSync(file)) continue
  svgs[e.hexcode] = readFileSync(file, 'utf8').replace(/\s+/g, ' ').trim()
  index.push({
    h: e.hexcode,
    a: e.annotation,
    t: [e.tags, e.openmoji_tags].filter(Boolean).join(', '),
    g: e.subgroups || e.group
  })
}
writeFileSync(join(dest, 'index.json'), JSON.stringify(index))
writeFileSync(join(dest, 'svgs.json'), JSON.stringify(svgs))
copyFileSync(join(src, 'LICENSE.txt'), join(dest, 'LICENSE.txt'))
console.log(`OpenMoji: ${index.length} Symbole in svgs.json gebündelt.`)
