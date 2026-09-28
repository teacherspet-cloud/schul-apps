// Sammellauf aller Wachen – OHNE echte KI (vorher: node scripts/bauen.mjs).
// Aufruf: node tests/e2e/alle.mjs [Ausgabeordner] [Namensfilter]
//
// Jede Wache startet die App in einem eigenen Wegwerf-Profil: ohne API-Schlüssel und ohne
// bestätigten Abo-Zugang, eine echte KI ist dort also nicht erreichbar. Wachen mit KI-Ablauf
// bringen ihre eigene Attrappe mit. (Eine gemeinsame leere Attrappe verfälscht Wachen, die den
// Hinweis „kein KI-Zugang" prüfen.) Ausgenommen sind Läufe mit echter KI oder ElevenLabs und
// reine Hilfsmittel.
import { spawn } from 'child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const hier = fileURLToPath(new URL('.', import.meta.url))
const out = resolve(process.argv[2] ?? 'test-results/alle')
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null
mkdirSync(out, { recursive: true })

/** Echte KI, echte Vertonung, Hilfsmittel, Proben gegen die eigene Ablage */
const AUSGENOMMEN = /(-echt|^gruendlich|^quality-images|^hoertext-vertonen|^praxistest|^probe-|^pdf-ansehen|^aufraeumen|^pruefen|^warten|^alle)\.mjs$/
const wachen = readdirSync(hier)
  .filter((f) => f.endsWith('.mjs') && !AUSGENOMMEN.test(f))
  .filter((f) => !filter || filter.test(f))
  .sort()

function lauf(datei) {
  return new Promise((fertig) => {
    const name = datei.replace(/\.mjs$/, '')
    const ordner = join(out, name)
    mkdirSync(ordner, { recursive: true })
    const start = Date.now()
    const kind = spawn(process.execPath, [join(hier, datei), ordner], { env: { ...process.env }, cwd: resolve(hier, '../..') })
    let text = ''
    kind.stdout.on('data', (d) => (text += d))
    kind.stderr.on('data', (d) => (text += d))
    const uhr = setTimeout(() => kind.kill(), 10 * 60 * 1000)
    kind.on('close', (code) => {
      clearTimeout(uhr)
      writeFileSync(join(ordner, 'ausgabe.txt'), text)
      const probleme = text.split('\n').filter((z) => z.includes('  !!  '))
      fertig({ name, ok: code === 0, sekunden: Math.round((Date.now() - start) / 1000), probleme, ende: text.trim().split('\n').slice(-3).join(' | ') })
    })
  })
}

const ergebnisse = []
for (const w of wachen) {
  const e = await lauf(w)
  ergebnisse.push(e)
  console.log(
    `${e.ok ? '  ok  ' : '  !!  '} ${e.name} (${e.sekunden} s)${e.ok ? '' : `\n        ${(e.probleme.length ? e.probleme.slice(0, 5) : [e.ende]).join('\n        ')}`}`
  )
}
writeFileSync(join(out, 'ergebnis.json'), JSON.stringify(ergebnisse, null, 1))
const rot = ergebnisse.filter((e) => !e.ok)
console.log(`\n${ergebnisse.length - rot.length} von ${ergebnisse.length} Wachen in Ordnung${rot.length ? `; rot: ${rot.map((e) => e.name).join(', ')}` : ''}`)
process.exit(rot.length ? 1 : 0)
