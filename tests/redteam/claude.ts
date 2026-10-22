/**
 * Belastungstest mit echter KI (22.10.2026, KI-Sicherheitsprüfung, Freigabe der Lehrkraft: „durch Claude“).
 * Schickt eine StructuredRequest der Plattform genau so an Claude Code wie der Server über das Claude-Abo
 * (src/main/services/ai/cli.ts › structured: -p, stream-json, keine Werkzeuge, JSON-Schema) – verbraucht das Abo-Kontingent.
 * Nur über `npx vitest run -c vitest.redteam.config.ts` (nicht im normalen Testlauf).
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { StructuredRequest } from '../../src/shared/types'

// Wie cli.ts (JSON_ONLY)
const JSON_ONLY =
  'Beantworte die Anfrage direkt. Führe keine Befehle aus, lies oder ändere keine Dateien (außer ausdrücklich genannten Bildern) und antworte ausschließlich mit JSON, das exakt dem vorgegebenen Schema entspricht.'

export const MODELL = process.env.REDTEAM_MODELL || 'sonnet'
const EXE =
  process.env.REDTEAM_CLAUDE ||
  (process.platform === 'win32' && process.env.APPDATA
    ? join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    : 'claude')

let laufend = 0
const warte: (() => void)[] = []
const PARALLEL = 4

async function platz<T>(fn: () => Promise<T>): Promise<T> {
  if (laufend >= PARALLEL) await new Promise<void>((r) => warte.push(r))
  laufend++
  try {
    return await fn()
  } finally {
    laufend--
    warte.shift()?.()
  }
}

export let aufrufe = 0

export function claude<T = unknown>(req: StructuredRequest, modell = MODELL): Promise<T> {
  return platz(
    () =>
      new Promise<T>((ok, fehler) => {
        aufrufe++
        const cwd = mkdtempSync(join(tmpdir(), 'redteam-'))
        writeFileSync(join(cwd, 'system.txt'), `${req.system}\n\n${JSON_ONLY}`)
        const args = [
          '-p',
          '--input-format',
          'stream-json',
          '--output-format',
          'stream-json',
          '--verbose',
          '--system-prompt-file',
          'system.txt',
          '--tools',
          '',
          '--no-session-persistence',
          '--setting-sources',
          '',
          '--strict-mcp-config',
          '--disable-slash-commands',
          '--json-schema',
          JSON.stringify(req.schema),
          '--model',
          modell
        ]
        // Direkt die Exe starten (ohne Shell – sonst zerlegt cmd.exe das JSON-Schema); Pfad über REDTEAM_CLAUDE änderbar
        const p = spawn(EXE, args, { cwd, windowsHide: true })
        let aus = ''
        let err = ''
        p.stdout.on('data', (d) => (aus += d))
        p.stderr.on('data', (d) => (err += d))
        const uhr = setTimeout(() => p.kill(), 240_000)
        p.on('close', () => {
          clearTimeout(uhr)
          rmSync(cwd, { recursive: true, force: true })
          const ende = aus
            .split(/\r?\n/)
            .filter((l) => l.startsWith('{'))
            .map((l) => {
              try {
                return JSON.parse(l) as { type?: string; subtype?: string; is_error?: boolean; structured_output?: unknown; result?: string }
              } catch {
                return {}
              }
            })
            .reverse()
            .find((e) => e.type === 'result')
          if (ende && !ende.is_error && ende.subtype === 'success') {
            if (ende.structured_output != null) return ok(ende.structured_output as T)
            try {
              return ok(JSON.parse(String(ende.result).replace(/^```(json)?|```$/g, '').trim()) as T)
            } catch {
              /* unten */
            }
          }
          fehler(new Error(`Claude-Aufruf fehlgeschlagen: ${(err || aus).slice(-400)}`))
        })
        const message = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: req.user }] } })
        p.stdin.write(`${message}\n`)
        p.stdin.end()
      })
  )
}

/** Ergebnisse für den Bericht (test-results/redteam/) */
export const protokoll: { kategorie: string; fall: string; ok: boolean; detail: string }[] = []
export function melde(kategorie: string, fall: string, ok: boolean, detail: unknown): void {
  protokoll.push({ kategorie, fall, ok, detail: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600) })
}
