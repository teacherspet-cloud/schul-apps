/**
 * Was Node dem Hauptprozess-Code einfach mitgibt: `Buffer` und `process`.
 *
 * MUSS als Erstes geladen werden (mobil/start.ts) – die Dienste greifen beim Laden darauf zu.
 * `process` ist bewusst ein schlichtes Objekt: Bibliotheken, die Node an
 * `Object.prototype.toString.call(process) === '[object process]'` oder an `process.versions.node`
 * erkennen (die KI-SDKs, pdf.js), halten den WKWebView weiter für einen Browser.
 */
import { Buffer } from 'buffer'

const g = globalThis as unknown as { Buffer?: typeof Buffer; process?: Record<string, unknown>; global?: unknown }

if (!g.Buffer) g.Buffer = Buffer
if (!g.global) g.global = globalThis
if (!g.process) {
  g.process = {
    env: {},
    argv: [],
    platform: 'ios',
    resourcesPath: '/',
    versions: {},
    cwd: () => '/',
    nextTick: (fn: (...a: unknown[]) => void, ...a: unknown[]) => queueMicrotask(() => fn(...a)),
    on: () => undefined,
    once: () => undefined,
    emitWarning: () => undefined
  }
} else {
  const p = g.process
  p.env ??= {}
  p.argv ??= []
  p.resourcesPath ??= '/'
}

export {}
