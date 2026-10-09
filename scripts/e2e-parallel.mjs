// Browsertests parallel (09.10.2026, Vorgabe der Lehrkraft: schneller testen vor Exe/Aufspielen).
// Startet N lokale Testserver (eigene Ports, eigene Datenordner im Temp-Ordner), verteilt die Tests reihum
// (die langen zuerst) und fasst das Ergebnis zusammen. Vorher bauen: `npx electron-vite build` und
// `npx vite build -c vite.server.config.ts`.
// Aufruf: node scripts/e2e-parallel.mjs [--server 4] [--attrappe <attrappe.json>] [test1 test2 …]
//   ohne Testnamen: alle tests/e2e/server-*.mjs
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const wurzel = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const wert = (name, rueck) => {
  const i = args.indexOf(name)
  if (i < 0) return rueck
  const w = args[i + 1]
  args.splice(i, 2)
  return w
}
const anzahl = Math.max(1, Math.min(6, Number(wert('--server', '4')) || 4))
const attrappe = wert('--attrappe', process.env.SCHULAPPS_KI_ATTRAPPE ?? '')
if (!attrappe || !existsSync(attrappe)) {
  console.error('KI-Attrappe fehlt: --attrappe <datei> oder SCHULAPPS_KI_ATTRAPPE setzen.')
  process.exit(2)
}
const alle = readdirSync(join(wurzel, 'tests', 'e2e'))
  .filter((f) => /^server-.+\.mjs$/.test(f))
  .map((f) => f.replace(/^server-|\.mjs$/g, ''))
const tests = args.length ? args : alle
// Bekannt lange Tests zuerst verteilen, damit kein Server am Ende allein weiterläuft
const LANG = ['spiele-medien', 'mehrspieler', 'ordner-mobil', 'vokabelspiele', 'meineklassen', 'regal', 'sprachenlernen', 'reihe-digital', 'grammatiktraining']
tests.sort((a, b) => (LANG.includes(b) ? 1 : 0) - (LANG.includes(a) ? 1 : 0))

const basis = join(tmpdir(), `schulapps-e2e-${Date.now()}`)
const CHROMIUM = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const warte = (ms) => new Promise((r) => setTimeout(r, ms))

async function bereit(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/anmelden`)
      if (r.ok) return true
    } catch {
      /* startet noch */
    }
    await warte(1000)
  }
  return false
}

function lauf(befehl, argumente, env) {
  return new Promise((ok) => {
    const p = spawn(befehl, argumente, { cwd: wurzel, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let text = ''
    p.stdout.on('data', (d) => (text += d))
    p.stderr.on('data', (d) => (text += d))
    p.on('close', (code) => ok({ code, text }))
  })
}

const server = []
const ergebnisse = []
const start = Date.now()
try {
  for (let n = 0; n < anzahl; n++) {
    const port = 18461 + n
    const daten = join(basis, `s${n}`)
    mkdirSync(join(daten, 'geheim'), { recursive: true })
    const p = spawn(process.execPath, ['out/server/start.mjs'], {
      cwd: wurzel,
      env: {
        ...process.env,
        SCHULAPPS_CHROMIUM: CHROMIUM,
        SCHULAPPS_SERVER: '1',
        SCHULAPPS_PORT: String(port),
        SCHULAPPS_DATEN: join(daten, 'daten'),
        SCHULAPPS_SCHLUESSEL: join(daten, 'geheim', 'schluessel'),
        SCHULAPPS_OBERFLAECHE: join(wurzel, 'out', 'renderer'),
        SCHULAPPS_RESSOURCEN: join(wurzel, 'resources'),
        SCHULAPPS_NOTZUGANG_PASSWORT: 'test-notzugang-123',
        SCHULAPPS_KI_ATTRAPPE: attrappe
      },
      stdio: 'ignore'
    })
    server.push({ port, p })
  }
  for (const s of server) if (!(await bereit(s.port))) throw new Error(`Testserver auf ${s.port} startet nicht`)
  console.log(`${anzahl} Testserver bereit, ${tests.length} Tests`)
  const warteschlange = [...tests]
  await Promise.all(
    server.map(async (s) => {
      for (let t = warteschlange.shift(); t; t = warteschlange.shift()) {
        const t0 = Date.now()
        const r = await lauf(process.execPath, [`tests/e2e/server-${t}.mjs`, join(basis, 'e2e', t), `http://localhost:${s.port}`], { SCHULAPPS_KI_ATTRAPPE: attrappe })
        const gut = /Alles in Ordnung/.test(r.text)
        const probleme = r.text.split('\n').filter((z) => z.includes('!!')).slice(0, 6)
        ergebnisse.push({ t, gut, probleme, s: Math.round((Date.now() - t0) / 1000) })
        console.log(`${gut ? 'ok ' : '!! '} ${t} (${Math.round((Date.now() - t0) / 1000)} s, Port ${s.port})`)
        for (const z of probleme) console.log(`     ${z.trim()}`)
      }
    })
  )
} finally {
  for (const s of server) s.p.kill()
}
const fehler = ergebnisse.filter((e) => !e.gut)
console.log(`\n${ergebnisse.length - fehler.length}/${ergebnisse.length} grün in ${Math.round((Date.now() - start) / 60000)} min${fehler.length ? ` – fehlgeschlagen: ${fehler.map((e) => e.t).join(', ')}` : ''}`)
console.log(`Bilder und Daten: ${basis}`)
// Testdaten der Server wegräumen (Bilder der Tests bleiben zum Nachsehen)
for (let n = 0; n < anzahl; n++) rmSync(join(basis, `s${n}`), { recursive: true, force: true })
process.exit(fehler.length ? 1 : 0)
