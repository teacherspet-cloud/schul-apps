// Zugang über private Abos: Die App ruft das offizielle Kommandozeilenprogramm des Anbieters auf
// (Codex CLI, Claude Code, Antigravity CLI), das mit dem Konto des Nutzers angemeldet ist.
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { delimiter, dirname, join, resolve } from 'path'
import { AiProviderId, ModelOption, StructuredRequest, SubscriptionStatus, SUBSCRIPTIONS } from '@shared/types'
import { getSettings } from '../storage/settings'
import { AiProvider, ChunkListener, Netzfund, RawModel, splitDataUrl } from './provider'
import { generateSvgImage } from './svg'
import { textSammler } from './textstrom'
import { AbbruchFehler } from '@shared/abbruch'

// ---------- Programm finden ----------

const env = process.env
const home = env.USERPROFILE ?? ''
const appData = env.APPDATA ?? join(home, 'AppData', 'Roaming')
const localAppData = env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')

/** Übliche Installationsorte zusätzlich zum Suchpfad (die App wird oft nicht aus einer Konsole gestartet). */
const EXTRA_DIRS: Record<AiProviderId, string[]> = {
  openai: [join(appData, 'npm'), join(localAppData, 'Programs', 'codex'), join(home, '.codex', 'bin')],
  anthropic: [join(home, '.local', 'bin'), join(appData, 'npm')],
  google: [join(localAppData, 'agy', 'bin'), join(home, '.local', 'bin')]
}

const CODEX_NATIVE = join('vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe')

/** Eigener Ordner für Programme, die die App selbst einrichtet (keine Änderung an PATH oder Systemeinstellungen). */
export const MANAGED_DIR = join(localAppData, 'Schul-Apps', 'ki-programme')

export function managedCliPath(provider: AiProviderId): string {
  if (provider === 'openai') return join(MANAGED_DIR, 'codex', 'bin', 'codex.exe')
  if (provider === 'anthropic') return join(MANAGED_DIR, 'claude', 'claude.exe')
  return join(MANAGED_DIR, 'agy', 'agy.exe')
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/**
 * npm legt unter Windows eine .cmd-Datei an, die auf das eigentliche Programm verweist.
 * .cmd-Dateien lassen sich nicht sicher ohne Shell starten, deshalb wird das Ziel (.exe) direkt ermittelt.
 */
export function resolveShim(cmdPath: string, provider: AiProviderId): string | null {
  let text: string
  try {
    text = readFileSync(cmdPath, 'utf8')
  } catch {
    return null
  }
  const dir = dirname(cmdPath)
  const targets = [...text.matchAll(/"%dp0%\\([^"]+)"/g)].map((m) => resolve(dir, m[1]))
  for (const t of targets) {
    if (/\.exe$/i.test(t) && isFile(t) && !/node\.exe$/i.test(t)) return t
    if (/\.js$/i.test(t) && provider === 'openai') {
      // @openai/codex/bin/codex.js startet nur die mitgelieferte codex.exe
      const pkg = dirname(dirname(t))
      for (const base of [join(pkg, 'node_modules', '@openai', 'codex-win32-x64'), join(dirname(pkg), 'codex-win32-x64')]) {
        const exe = join(base, CODEX_NATIVE)
        if (isFile(exe)) return exe
      }
    }
  }
  return null
}

/**
 * Auf dem Server (02.10.2026, src/server): Die KI-Programme sind im Docker-Bild fest eingebaut
 * (SCHULAPPS_CLI_OPENAI / _ANTHROPIC); eigene Pfade der Nutzer gibt es nicht. Jede Lehrkraft
 * bekommt eigene Anmeldeordner unter ihrer Ablage (siehe `cliEnv`) – ihr EIGENES Abo, nie das
 * einer anderen (Nutzungsbedingungen: Konten nicht teilen). Antigravity braucht ein sichtbares
 * Fenster für die Anmeldung und steht auf dem Server deshalb nicht zur Verfügung.
 */
export const aufServer = (): boolean => process.env.SCHULAPPS_SERVER === '1'

/**
 * Anmeldeordner des Nutzers auf dem Server (nur für ihn lesbar). `tmp` (08.10.2026): Arbeitsordner der KI-Aufrufe
 * (Schema, Anweisungen, Bilder von Schülerarbeiten) – je Lehrkraft statt im gemeinsamen /tmp, nach jedem Aufruf gelöscht.
 */
export function serverKiOrdner(teil: 'codex' | 'claude' | 'home' | 'tmp'): string {
  const dir = join(app.getPath('userData'), 'ki', teil)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

export function findCli(provider: AiProviderId): string | null {
  if (aufServer()) {
    if (provider === 'google') return null
    const pfad = (provider === 'openai' ? env.SCHULAPPS_CLI_OPENAI : env.SCHULAPPS_CLI_ANTHROPIC) || `/usr/local/bin/${SUBSCRIPTIONS[provider].command}`
    return isFile(pfad) ? pfad : null
  }
  const custom = getSettings().ai.cliPaths[provider]?.trim()
  if (custom) {
    if (/\.cmd$/i.test(custom)) return resolveShim(custom, provider)
    return isFile(custom) ? custom : null
  }
  if (isFile(managedCliPath(provider))) return managedCliPath(provider)
  const name = SUBSCRIPTIONS[provider].command
  const dirs = [...(env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean), ...EXTRA_DIRS[provider]]
  for (const dir of dirs) {
    const exe = join(dir, `${name}.exe`)
    if (isFile(exe)) return exe
    const cmd = join(dir, `${name}.cmd`)
    if (isFile(cmd)) {
      const target = resolveShim(cmd, provider)
      if (target) return target
    }
  }
  return null
}

// ---------- Programm ausführen ----------

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

/*
 * Die Begrenzung auf drei gleichzeitige Programmaufrufe stand bis 25.09.2026 hier (`slot()`)
 * und galt nur für den Abo-Weg. Sie sitzt jetzt eine Ebene höher (kiPlaetze.ts) und gilt für
 * alle Wege zugleich – eine zweite Schlange hier würde sich mit der ersten gegenseitig
 * blockieren: Eine Anfrage hielte oben einen Platz und wartete unten auf den nächsten.
 */

/**
 * Beendet ein Programm SAMT allem, was es gestartet hat.
 *
 * Unter Windows beendet `child.kill()` nur den obersten Prozess. Claude Code und Codex
 * starten aber eigene Unterprozesse – die liefen nach einem Abbruch weiter und verbrauchten
 * Kontingent für eine Antwort, die niemand mehr haben will. `taskkill /T` nimmt den ganzen
 * Prozessbaum mit (ohne zusätzliches Paket).
 */
export function beendeProzessbaum(child: { pid?: number; kill: (signal?: NodeJS.Signals) => boolean }): void {
  if (process.platform === 'win32' && child.pid) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    killer.on('error', () => child.kill())
    return
  }
  child.kill('SIGKILL')
}

/** Umgebung ohne API-Schlüssel, damit die Programme wirklich die Abo-Anmeldung verwenden. */
export function cliEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(OPENAI_|CODEX_API_KEY|CODEX_ACCESS_TOKEN|ANTHROPIC_|CLAUDECODE|CLAUDE_CODE_|GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENAI_|ELECTRON_)/i.test(k))
      continue
    out[k] = v
  }
  out.NO_COLOR = '1'
  // Claude Code soll sich nicht selbst woandershin aktualisieren; Updates übernimmt die App
  out.DISABLE_AUTOUPDATER = '1'
  // Server: Anmeldung und Einstellungen der Programme je Nutzer (nie geteilt)
  if (aufServer()) {
    out.HOME = serverKiOrdner('home')
    out.CODEX_HOME = serverKiOrdner('codex')
    out.CLAUDE_CONFIG_DIR = serverKiOrdner('claude')
  }
  return out
}

/**
 * Ein Programm aufrufen und seine Ausgabe einsammeln.
 *
 * `onData` meldet, wie viel Text bereits eingetroffen ist – der einzige Fortschritt, den ein
 * Kommandozeilen-Anbieter hergeben kann.
 *
 * Wie viel das wert ist, hängt am Programm, und das ist nachgemessen:
 * - Claude Code und Antigravity laufen mit `--output-format stream-json` und schreiben
 *   fortlaufend Ereignisse – dort wächst die Zahl während der Arbeit.
 * - Codex schreibt in `exec` NICHTS, bis es fertig ist, und dann die ganze Antwort auf
 *   einmal. Dort springt die Meldung erst am Ende. Die Oberfläche darf deshalb keinen
 *   Balken zeigen, der stillsteht; sie zeigt stattdessen die verstrichene Zeit.
 */
function run(
  exe: string,
  args: string[],
  opts: { cwd: string; stdin?: string; timeoutMs: number; onData?: (chars: number) => void; signal?: AbortSignal }
): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    if (opts.signal?.aborted) return reject(new AbbruchFehler())
    const umgebung = cliEnv()
    /*
     * Server (08.10.2026): Codex legt seine SQLite-Dateien (Protokolle logs_2, Zustand state_5, Erinnerungen memories_1 …)
     * sonst dauerhaft in CODEX_HOME ab – mit Teilen der Anfragen. Umgeleitet in den Arbeitsordner, der nach dem Aufruf
     * gelöscht wird. CODEX_SQLITE_HOME ist an Codex 0.154.0 nachgeprüft (die Dateien landen dort).
     */
    if (aufServer()) umgebung.CODEX_SQLITE_HOME = join(opts.cwd, '.codex-zustand')
    const child = spawn(exe, args, { cwd: opts.cwd, env: umgebung, windowsHide: true })
    // Abbruch durch die Lehrkraft: Programm samt Unterprozessen beenden
    const beiAbbruch = (): void => {
      clearTimeout(timer)
      beendeProzessbaum(child)
      reject(new AbbruchFehler())
    }
    opts.signal?.addEventListener('abort', beiAbbruch, { once: true })
    /*
     * Sammler statt `stdout += d`: Die Ausgabe kommt in Stücken, deren Grenzen an beliebigen
     * Bytes liegen. Jedes Stück für sich umzuwandeln zerriss Zeichen, die über die Grenze
     * reichten – siehe `textstrom.ts`.
     */
    const aus = textSammler()
    const fehler = textSammler()
    const timer = setTimeout(() => {
      beendeProzessbaum(child)
      reject(new Error(`Das Programm hat nicht innerhalb von ${Math.round(opts.timeoutMs / 60000)} Minuten geantwortet.`))
    }, opts.timeoutMs)
    child.stdout.on('data', (d: Buffer) => {
      aus.push(d)
      opts.onData?.(aus.laenge())
    })
    child.stderr.on('data', (d: Buffer) => fehler.push(d))
    child.on('error', (e) => {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', beiAbbruch)
      reject(new Error(`Programm konnte nicht gestartet werden: ${e.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', beiAbbruch)
      resolvePromise({ code, stdout: aus.text(), stderr: fehler.text() })
    })
    child.stdin.on('error', () => undefined)
    child.stdin.end(opts.stdin ?? '')
  })
}

/** Wurzel der Arbeitsordner – je Anfrage entsteht darunter ein eigener. */
const workRoot = (): string => (aufServer() ? serverKiOrdner('tmp') : join(app.getPath('temp'), 'schul-apps-ki'))

/**
 * Arbeitsordner aufräumen, die kein Lauf mehr braucht.
 *
 * Im Normalfall räumt `withWorkDir` selbst auf. Wird die App hart beendet – abgestürzt,
 * über den Task-Manager geschlossen, Rechner ausgeschaltet –, kommt es nicht mehr dazu, und
 * der Ordner bleibt mitsamt Schema und Anweisungen liegen. Über Wochen sammeln sich so
 * Dutzende an. Deshalb beim Start einmal durchgehen und alles entfernen, was älter ist als
 * die längste mögliche Anfrage.
 *
 * `maxAgeMs` mit Sicherheitsabstand über dem Zeitlimit einer Anfrage: Ein Ordner, der gerade
 * benutzt wird, darf niemals gelöscht werden – auch nicht, wenn zwei Fenster zugleich laufen.
 */
export function cleanupWorkDirs(maxAgeMs = 2 * 60 * 60 * 1000): number {
  const root = workRoot()
  if (!existsSync(root)) return 0
  const limit = Date.now() - maxAgeMs
  let removed = 0
  for (const name of readdirSync(root)) {
    const dir = join(root, name)
    try {
      if (statSync(dir).mtimeMs > limit) continue
      rmSync(dir, { recursive: true, force: true, maxRetries: 2 })
      removed++
    } catch {
      // Ein Ordner, der sich nicht entfernen lässt, ist kein Grund zum Abbruch
    }
  }
  return removed
}

/** Leerer Arbeitsordner je Anfrage, damit keine Projekteinstellungen oder Dateien des Nutzers einfließen. */
function withWorkDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = join(workRoot(), randomUUID())
  mkdirSync(dir, { recursive: true })
  return fn(dir).finally(() => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
    } catch {
      // Aufräumen ist nicht kritisch
    }
  })
}

function writeImages(dir: string, images: string[] = []): string[] {
  return images.map((url, i) => {
    const { mimeType, data } = splitDataUrl(url)
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
    const file = join(dir, `bild-${i + 1}.${ext}`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    return file
  })
}

const TIMEOUT_MS = 12 * 60 * 1000

const JSON_ONLY =
  'Beantworte die Anfrage direkt. Führe keine Befehle aus, lies oder ändere keine Dateien (außer ausdrücklich genannten Bildern) und antworte ausschließlich mit JSON, das exakt dem vorgegebenen Schema entspricht.'

export const IMAGE_TIMEOUT_MS = 6 * 60 * 1000

const IMAGE_ONLY = 'Führe keine anderen Aktionen aus (keine Befehle, keine weiteren Dateien). Antworte danach nur mit „fertig".'

function codexHome(): string {
  if (aufServer()) return serverKiOrdner('codex')
  return process.env.CODEX_HOME || join(home, '.codex')
}

/** Neuestes Bild in einem Ordner (auch in Unterordnern). */
export function newestImage(dir: string): string | null {
  if (!existsSync(dir)) return null
  const files = (readdirSync(dir, { recursive: true }) as string[])
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .map((f) => join(dir, f))
    .filter(isFile)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return files[0] ?? null
}

function imageFileAsDataUrl(file: string): string {
  const ext = file.split('.').pop()!.toLowerCase()
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`
}

export function parseJsonText<T>(text: string): T {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
  try {
    return JSON.parse(trimmed) as T
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as T
    throw new Error('Die KI hat kein gültiges JSON geliefert. Bitte erneut versuchen.')
  }
}

function lastLines(text: string, n = 4): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-n)
    .join(' ')
    .slice(0, 600)
}

function notFound(provider: AiProviderId): Error {
  const s = SUBSCRIPTIONS[provider]
  return new Error(`${s.program} ist noch nicht eingerichtet. Bitte in den Einstellungen unter „Künstliche Intelligenz" auf „Einrichten" klicken.`)
}

// ---------- OpenAI: Codex CLI ----------

export class CodexCliProvider implements AiProvider {
  constructor(private exe: string) {}

  /** Nutzt die Bildgenerierung von ChatGPT; Codex legt das Bild unter CODEX_HOME/generated_images/<Sitzung> ab. */
  generateImage(prompt: string, _model?: string, signal?: AbortSignal): Promise<string> {
    return withWorkDir(async (cwd) => {
      const text = `Erzeuge mit deinem Bildgenerierungswerkzeug genau ein Bild nach dieser Beschreibung:\n\n${prompt}\n\n${IMAGE_ONLY}`
      const args = [
        'exec',
        '--skip-git-repo-check',
        '--ephemeral',
        '--sandbox',
        'read-only',
        '--color',
        'never',
        '--json',
        ...codexLeanArgs({
          keepImageGeneration: true,
          cwd,
          instructions: 'You create exactly one image with your image generation tool when asked. Do nothing else and answer briefly.'
        }),
        '-'
      ]
      const res = await run(this.exe, args, { cwd, stdin: text, timeoutMs: IMAGE_TIMEOUT_MS, signal })
      const threadId = /"thread_id"\s*:\s*"([^"]+)"/.exec(res.stdout)?.[1]
      const dir = threadId ? join(codexHome(), 'generated_images', threadId) : null
      try {
        const file = dir ? newestImage(dir) : null
        if (file) return imageFileAsDataUrl(file)
      } finally {
        if (dir) rmSync(dir, { recursive: true, force: true })
      }
      if (res.code !== 0) throw new Error(describeCodexError(res))
      const said = res.stdout
        .split(/\r?\n/)
        .map((line) => {
          try {
            const ev = JSON.parse(line) as { item?: { type?: string; text?: string } }
            return ev.item?.type === 'agent_message' ? ev.item.text : undefined
          } catch {
            return undefined
          }
        })
        .filter(Boolean)
        .pop()
      throw new Error(
        `Codex hat kein Bild erzeugt${said ? ` (Antwort: „${said}")` : ''}. Möglicherweise ist die Bildgenerierung im Abo gerade nicht verfügbar oder das Kontingent erschöpft.`
      )
    })
  }

  async listModels(): Promise<RawModel[]> {
    return withWorkDir(async (cwd) => {
      const res = await run(this.exe, ['debug', 'models'], { cwd, timeoutMs: 60_000 })
      const json = parseJsonText<{ models: { slug: string; display_name?: string; visibility?: string; priority?: number }[] }>(res.stdout)
      return json.models
        .filter((m) => m.visibility !== 'hide')
        .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
        .map((m) => ({ id: m.slug, label: m.display_name }))
    })
  }

  structured<T>(req: StructuredRequest, model: string, onChunk?: ChunkListener, signal?: AbortSignal): Promise<T> {
    return withWorkDir(async (cwd) => {
      const images = writeImages(cwd, req.images)
      writeFileSync(join(cwd, 'schema.json'), JSON.stringify(req.schema))
      const args = ['exec']
      for (const img of images) args.push('--image', img)
      args.push('--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '--color', 'never', '--output-schema', 'schema.json', '-o', 'antwort.txt')
      args.push(
        ...codexLeanArgs({ cwd, instructions: 'You answer requests directly and only in the requested JSON format. Do not use tools, do not run commands.' }),
        '-c',
        'model_reasoning_effort="low"'
      )
      if (model) args.push('--model', model)
      args.push('-')
      const prompt = `${req.system}\n\n${JSON_ONLY}\n\n---\n\n${req.user}`
      const res = await run(this.exe, args, { cwd, stdin: prompt, timeoutMs: TIMEOUT_MS, onData: onChunk, signal })
      const answerFile = join(cwd, 'antwort.txt')
      if (res.code === 0 && existsSync(answerFile)) return parseJsonText<T>(readFileSync(answerFile, 'utf8'))
      throw new Error(describeCodexError(res))
    })
  }

  /**
   * Sucht im offenen Netz – mit dem Websuche-Werkzeug von Codex.
   *
   * Nur so kommen aktuelle Texte infrage: Zeitungskommentare, Reden, Statistiken. Die
   * Archive, die die App selbst durchsucht (Wikisource, Projekt Gutenberg), enthalten
   * fast ausschließlich Älteres.
   *
   * Verlangt werden AUSSCHLIESSLICH Angaben zur Fundstelle, nie der Wortlaut: Den lädt die
   * App anschließend selbst von der genannten Adresse und misst ihn. Eine erfundene Adresse
   * fällt dabei auf, ein „ungefähr richtig" wiedergegebener Text nicht.
   */
  websuche(auftrag: string, model: string, signal?: AbortSignal): Promise<Netzfund[]> {
    return withWorkDir(async (cwd) => {
      writeFileSync(join(cwd, 'schema.json'), JSON.stringify(NETZFUND_SCHEMA))
      const args = ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '--color', 'never']
      args.push('--output-schema', 'schema.json', '-o', 'antwort.txt')
      args.push(
        ...codexLeanArgs({
          cwd,
          webSearch: true,
          instructions: 'You search the web for real, published sources and report only where they are. You never quote or reproduce their text.'
        }),
        /*
         * Mittlere statt niedriger Denkstufe: Eine gruendliche Suche heisst mehrere
         * Anfragen, geoeffnete Seiten und ein Abwaegen zwischen den Funden. Auf der
         * niedrigsten Stufe bricht Codex nach dem ersten Treffer ab.
         */
        '-c',
        'model_reasoning_effort="medium"'
      )
      if (model) args.push('--model', model)
      args.push('-')
      const res = await run(this.exe, args, { cwd, stdin: `${auftrag}\n\n${NETZFUND_HINWEIS}`, timeoutMs: TIMEOUT_MS, signal })
      const answerFile = join(cwd, 'antwort.txt')
      if (res.code !== 0 || !existsSync(answerFile)) throw new Error(describeCodexError(res))
      return netzfunde(parseJsonText(readFileSync(answerFile, 'utf8')))
    })
  }
}

/** Was von einer Websuche zurückkommen soll: Fundstellen, kein Wortlaut. */
const NETZFUND_SCHEMA = {
  type: 'object',
  properties: {
    funde: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titel: { type: 'string' },
          urheber: { type: 'string', description: 'Verfasser bzw. herausgebendes Organ, sonst leer' },
          jahr: { type: 'string', description: 'Erscheinungsjahr bzw. Datum, sonst leer' },
          url: { type: 'string', description: 'vollständige https-Adresse der Seite mit dem Volltext' },
          auszug: { type: 'string', description: 'ein bis zwei Sätze, worum es geht – KEIN Zitat' }
        },
        required: ['titel', 'urheber', 'jahr', 'url', 'auszug'],
        additionalProperties: false
      }
    }
  },
  required: ['funde'],
  additionalProperties: false
}

const NETZFUND_HINWEIS = [
  'Suche im Netz nach Seiten, die den VOLLSTÄNDIGEN Text frei zugänglich enthalten.',
  'SUCHE GRÜNDLICH – die Lehrkraft hat das ausdrücklich verlangt:',
  '- Benutze die Websuche mehrfach. Eine einzelne Anfrage genügt nicht.',
  '- Probiere verschiedene Formulierungen: mit Urheber und Titel, mit Textsorte und Jahr, mit dem Sachthema, und in der Sprache des gesuchten Textes.',
  '- Schau über die ersten Treffer hinaus und öffne mehrere Seiten, bevor du dich entscheidest.',
  '- Wird nichts gefunden, weiche auf verwandte Suchbegriffe aus, statt aufzugeben.',
  'Nenne nur Seiten, die du tatsächlich geöffnet hast. Rate keine Adresse.',
  'Gib KEINEN Wortlaut wieder – nur Titel, Urheber, Jahr, Adresse und ein bis zwei eigene Sätze, worum es geht.',
  'Meide Seiten hinter einer Bezahlschranke, reine Übersichts- und Suchseiten sowie Shops.',
  'Antworte am Ende ausschließlich im geforderten JSON-Format.'
].join('\n')

function netzfunde(data: unknown): Netzfund[] {
  const funde = (data as { funde?: unknown[] })?.funde
  if (!Array.isArray(funde)) return []
  return funde
    .map((f) => f as Partial<Netzfund>)
    .filter((f) => typeof f.url === 'string' && /^https:\/\//.test(f.url))
    .map((f) => ({
      titel: String(f.titel ?? '').trim() || f.url!,
      urheber: String(f.urheber ?? '').trim() || undefined,
      jahr: String(f.jahr ?? '').trim() || undefined,
      url: f.url!,
      auszug: String(f.auszug ?? '').trim()
    }))
}

/**
 * Codex ist ein Programmier-Agent und schickt standardmäßig viele eigene Anweisungen mit (Skills, Plugins, Agenten, Werkzeuge).
 * Für reine Textaufträge wird das abgeschaltet – das spart pro Anfrage einen großen Teil der Tokens.
 */
export function codexLeanArgs(opts: { keepImageGeneration?: boolean; webSearch?: boolean; cwd?: string; instructions?: string } = {}): string[] {
  const features = [
    'apps',
    'plugins',
    'remote_plugin',
    'plugin_sharing',
    'skill_search',
    'goals',
    'browser_use',
    'browser_use_external',
    'computer_use',
    'in_app_browser',
    'hooks',
    'personality',
    'tool_suggest',
    'mentions_v2',
    'shell_tool',
    'unified_exec',
    'view_image',
    'code_mode_host',
    'workspace_dependencies',
    'sleep_tool',
    'multi_agent'
  ]
  /*
   * Der „code mode host" traegt BEIDE Werkzeuge, die die App von Codex nutzt: die
   * Bildgenerierung und die Websuche. Fuer beide darf er nicht abgeschaltet werden.
   *
   * Nachgemessen am 24.09.2026 mit einem echten Aufruf: Mit abgeschaltetem Host meldete
   * Codex „Code Mode is unavailable because code-mode host is disabled. Code mode will fail
   * closed", suchte NICHT – und nannte trotzdem eine Adresse. Die war erfunden (404). Mit
   * eingeschaltetem Host liefen echte Suchanfragen, und die Adresse stimmte.
   *
   * Das ist genau der Fehler, den man sonst nicht bemerkt: Es kam ja eine Antwort.
   */
  const ohneHost = features.filter((f) => f !== 'code_mode_host')
  // Bilder erzeugen soll die Websuche trotzdem nicht – das kostet Kontingent und war nicht bestellt
  const disabled = opts.keepImageGeneration ? ohneHost : opts.webSearch ? [...ohneHost, 'image_generation'] : [...features, 'image_generation']
  const off = [
    'agents.enabled',
    'include_permissions_instructions',
    'include_environment_context',
    'include_collaboration_mode_instructions',
    'include_skills_usage_instructions',
    'include_plugin_usage_instructions',
    'include_apps_usage_instructions',
    'include_apps_instructions'
  ]
  const args = [...disabled.flatMap((f) => ['--disable', f]), ...off.flatMap((k) => ['-c', `${k}=false`])]
  /*
   * Nichts dauerhaft ablegen (08.10.2026, Datenschutz auf dem Server): kein Verlauf, keine „Erinnerungen" aus früheren
   * Anfragen. Alle Schlüssel an Codex 0.154.0 mit --strict-config nachgeprüft (history.persistence kennt „save-all" und
   * „none"; memories ist ein Feature und hat generate_memories/use_memories). --ephemeral setzen die Aufrufe selbst.
   */
  args.push('--disable', 'memories', '-c', 'history.persistence="none"', '-c', 'memories.generate_memories=false', '-c', 'memories.use_memories=false')
  // Textprotokolle (log_dir) auf dem Server in den Arbeitsordner – er wird nach dem Aufruf gelöscht
  if (aufServer() && opts.cwd) args.push('-c', `log_dir="${join(opts.cwd, '.codex-log').replace(/\\/g, '/')}"`)
  /*
   * Websuche einschalten.
   *
   * Sie liefert nur FUNDSTELLEN; den Wortlaut laedt die App anschliessend selbst.
   *
   * Nur dieser eine Schalter: `--enable standalone_web_search` war ebenfalls im Versuch,
   * Codex meldet ihn aber als „under development … may behave unpredictably" – und er war
   * nicht noetig. Ein instabiler Schalter, der nichts beitraegt, ist reines Risiko.
   */
  if (opts.webSearch) args.push('-c', 'tools.web_search=true')
  // Kurze eigene Grundanweisung statt der langen Programmierer-Anweisungen von Codex (spart etwa 3.500 Tokens je Anfrage)
  if (opts.cwd && opts.instructions) {
    const file = join(opts.cwd, 'anweisungen.md')
    writeFileSync(file, `${opts.instructions}\n`)
    args.push('-c', `model_instructions_file="${file.replace(/\\/g, '/')}"`)
  }
  return args
}

/** „try again at 12:22 PM" → „12:22 Uhr" */
function resetTime(text: string): string | null {
  const m = /try again at (\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(text)
  if (!m) return null
  let hour = Number(m[1])
  if (m[3]?.toUpperCase() === 'PM' && hour < 12) hour += 12
  if (m[3]?.toUpperCase() === 'AM' && hour === 12) hour = 0
  return `${String(hour).padStart(2, '0')}:${m[2]} Uhr`
}

function describeCodexError(res: RunResult): string {
  const all = `${res.stderr}\n${res.stdout}`
  if (/401|Unauthorized|not logged in|login/i.test(all)) {
    return 'Codex ist nicht mit einem ChatGPT-Konto angemeldet. Bitte in den Einstellungen unter „Künstliche Intelligenz" auf „Mit ChatGPT anmelden" klicken.'
  }
  if (/usage limit|rate limit|429|quota/i.test(all)) {
    const at = resetTime(all)
    return `Die Nutzungsgrenze des ChatGPT-Abos ist erreicht${at ? ` – wieder verfügbar ab ${at}` : ''}. Die Grenze gilt für alle Modelle gemeinsam (je 5 Stunden bzw. je Woche); kleinere Modelle und der Sparmodus verbrauchen deutlich weniger.`
  }
  if (/model/i.test(all) && /not (found|supported|available)/i.test(all)) {
    return 'Das gewählte Modell steht mit diesem ChatGPT-Abo nicht zur Verfügung. Bitte in den Einstellungen „Voreinstellung" wählen.'
  }
  return `Codex meldet einen Fehler: ${lastLines(res.stderr || res.stdout) || `Exitcode ${res.code}`}`
}

// ---------- Anthropic: Claude Code ----------

interface ClaudeResult {
  type: 'result'
  subtype: string
  is_error?: boolean
  result?: string
  structured_output?: unknown
  errors?: string[]
}

/** Längere Schemas passen nicht in die Windows-Befehlszeile; dann wird das Schema als Text mitgegeben. */
const MAX_INLINE_SCHEMA = 20_000

export class ClaudeCliProvider implements AiProvider {
  constructor(private exe: string) {}

  /** Claude erzeugt keine Rasterbilder, sondern zeichnet eine Vektorgrafik. */
  generateImage(prompt: string, model: string, signal?: AbortSignal): Promise<string> {
    return generateSvgImage(this, model, prompt, signal)
  }

  async listModels(): Promise<RawModel[]> {
    return [
      { id: 'opus', label: 'Opus – stärkstes Modell' },
      { id: 'sonnet', label: 'Sonnet – ausgewogen' },
      { id: 'haiku', label: 'Haiku – schnell, schont das Kontingent' }
    ]
  }

  structured<T>(req: StructuredRequest, model: string, onChunk?: ChunkListener, signal?: AbortSignal): Promise<T> {
    return withWorkDir(async (cwd) => {
      const schema = JSON.stringify(req.schema)
      const inline = schema.length <= MAX_INLINE_SCHEMA
      const system = inline ? `${req.system}\n\n${JSON_ONLY}` : `${req.system}\n\n${JSON_ONLY}\n\nJSON-Schema:\n${schema}`
      writeFileSync(join(cwd, 'system.txt'), system)
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
        '--disable-slash-commands'
      ]
      if (inline) args.push('--json-schema', schema)
      if (model) args.push('--model', model)
      const content: unknown[] = (req.images ?? []).map((url) => {
        const { mimeType, data } = splitDataUrl(url)
        return { type: 'image', source: { type: 'base64', media_type: mimeType, data } }
      })
      content.push({ type: 'text', text: req.user })
      const message = JSON.stringify({ type: 'user', message: { role: 'user', content } })
      const res = await run(this.exe, args, { cwd, stdin: `${message}\n`, timeoutMs: TIMEOUT_MS, onData: onChunk, signal })

      const events = res.stdout
        .split(/\r?\n/)
        .filter((l) => l.startsWith('{'))
        .map((l) => {
          try {
            return JSON.parse(l) as { type?: string }
          } catch {
            return {}
          }
        })
      const result = events.reverse().find((e): e is ClaudeResult => e.type === 'result')
      if (result && !result.is_error && result.subtype === 'success') {
        if (result.structured_output !== undefined && result.structured_output !== null) return result.structured_output as T
        if (result.result) return parseJsonText<T>(result.result)
      }
      throw new Error(describeClaudeError(res, result))
    })
  }

  /**
   * Websuche über das WebSearch-Werkzeug von Claude Code.
   *
   * Sonst sind ALLE Werkzeuge abgeschaltet (`--tools ''`). Hier wird genau eines freigegeben,
   * und auch nur, um Fundstellen zu bekommen – den Wortlaut lädt die App selbst.
   */
  websuche(auftrag: string, model: string, signal?: AbortSignal): Promise<Netzfund[]> {
    return withWorkDir(async (cwd) => {
      const schema = JSON.stringify(NETZFUND_SCHEMA)
      writeFileSync(
        join(cwd, 'system.txt'),
        `You search the web for real, published sources and report only where they are. You never quote or reproduce their text.\n\n${JSON_ONLY}`
      )
      const args = [
        '-p',
        '--output-format',
        'stream-json',
        '--verbose',
        '--system-prompt-file',
        'system.txt',
        '--tools',
        'WebSearch,WebFetch',
        '--no-session-persistence',
        '--setting-sources',
        '',
        '--strict-mcp-config',
        '--disable-slash-commands',
        '--json-schema',
        schema
      ]
      if (model) args.push('--model', model)
      const res = await run(this.exe, args, { cwd, stdin: `${auftrag}\n\n${NETZFUND_HINWEIS}`, timeoutMs: TIMEOUT_MS, signal })
      const events = res.stdout
        .split(/\r?\n/)
        .filter((l) => l.startsWith('{'))
        .map((l) => {
          try {
            return JSON.parse(l) as { type?: string }
          } catch {
            return {}
          }
        })
      const result = events.reverse().find((e): e is ClaudeResult => e.type === 'result')
      if (result && !result.is_error && result.subtype === 'success') {
        if (result.structured_output !== undefined && result.structured_output !== null) return netzfunde(result.structured_output)
        if (result.result) return netzfunde(parseJsonText(result.result))
      }
      throw new Error(describeClaudeError(res, result))
    })
  }
}

function describeClaudeError(res: RunResult, result?: ClaudeResult): string {
  const text = [result?.result, ...(result?.errors ?? []), res.stderr].filter(Boolean).join(' ')
  if (/not logged in|login|authenticat|401|invalid api key/i.test(text)) {
    return 'Claude Code ist nicht angemeldet. Bitte in den Einstellungen unter „Künstliche Intelligenz" auf „Mit Claude anmelden" klicken.'
  }
  if (/usage limit|rate limit|limit reached|429/i.test(text)) {
    return 'Die Nutzungsgrenze des Claude-Abos ist erreicht. Bitte später erneut versuchen.'
  }
  return `Claude Code meldet einen Fehler: ${lastLines(text) || `Exitcode ${res.code}`}`
}

const TARIF_NAME: Record<string, string> = {
  free: 'kostenlos',
  plus: 'Plus',
  pro: 'Pro',
  team: 'Business',
  business: 'Business',
  enterprise: 'Enterprise',
  edu: 'Edu'
}

/** Tarif des angemeldeten ChatGPT-Kontos aus der Anmeldung von Codex (nur der Tarif wird gelesen, 03.10.2026) */
export function chatgptTarif(datei = join(codexHome(), 'auth.json')): string | undefined {
  try {
    const auth = JSON.parse(readFileSync(datei, 'utf8')) as { tokens?: { id_token?: string } }
    const teil = String(auth.tokens?.id_token ?? '').split('.')[1]
    if (!teil) return undefined
    const daten = JSON.parse(Buffer.from(teil, 'base64url').toString('utf8')) as Record<string, { chatgpt_plan_type?: string } | undefined>
    return daten['https://api.openai.com/auth']?.chatgpt_plan_type?.toLowerCase() || undefined
  } catch {
    return undefined
  }
}

async function claudeStatus(exe: string): Promise<Pick<SubscriptionStatus, 'loggedIn' | 'account' | 'detail' | 'tarif' | 'warnung'>> {
  const res = await withWorkDir((cwd) => run(exe, ['auth', 'status'], { cwd, timeoutMs: 30_000 }))
  try {
    const json = JSON.parse(res.stdout) as { loggedIn?: boolean; authMethod?: string; subscriptionType?: string; email?: string }
    const viaSubscription = json.authMethod === 'claude.ai'
    const tarif = json.subscriptionType?.toLowerCase()
    return {
      loggedIn: Boolean(json.loggedIn) && viaSubscription,
      account: json.email ? `${json.email}${json.subscriptionType ? ` (${json.subscriptionType})` : ''}` : undefined,
      ...(tarif ? { tarif } : {}),
      ...(tarif === 'free'
        ? { warnung: 'Dieses Claude-Konto nutzt den kostenlosen Tarif – Claude Code ist darin nicht oder nur stark begrenzt nutzbar.' }
        : {}),
      detail: json.loggedIn && !viaSubscription ? 'Claude Code ist nicht mit einem Claude-Abo, sondern anders angemeldet (z. B. API-Schlüssel).' : undefined
    }
  } catch {
    return { loggedIn: res.code === 0 }
  }
}

// ---------- Google: Antigravity CLI ----------

interface AgyResult {
  type?: string
  event?: string
  status?: string
  response?: string
  error?: string
  structured_output?: unknown
}

export class AgyCliProvider implements AiProvider {
  constructor(private exe: string) {}

  /** Experimentell: Antigravity soll das Bild mit seiner Bildgenerierung erzeugen und im Arbeitsordner ablegen. */
  generateImage(prompt: string, model: string, signal?: AbortSignal): Promise<string> {
    return withWorkDir(async (cwd) => {
      const text = `Erzeuge mit deinem Bildgenerierungswerkzeug genau ein Bild nach dieser Beschreibung und speichere es als „bild.png" im aktuellen Arbeitsordner:\n\n${prompt}\n\n${IMAGE_ONLY}`
      const args = ['--input-format', 'stream-json', '--output-format', 'stream-json', '--mode', 'accept-edits', '--print-timeout', '6m']
      if (model) args.push('--model', model)
      const message = JSON.stringify({ event: 'user', message: { content: [{ type: 'text', text }] } })
      const res = await run(this.exe, args, { cwd, stdin: `${message}\n`, timeoutMs: IMAGE_TIMEOUT_MS, signal })
      // Bild im Arbeitsordner oder an einem in der Ausgabe genannten Ort
      const mentioned = [...res.stdout.matchAll(/[A-Za-z]:\\\\?[^"'\s]+?\.(?:png|jpe?g|webp)/g)].map((m) => m[0].replace(/\\\\/g, '\\'))
      const file = newestImage(cwd) ?? mentioned.find((p) => isFile(p)) ?? null
      if (file) return imageFileAsDataUrl(file)
      if (res.code !== 0) throw new Error(describeAgyError(res))
      throw new Error('Antigravity hat kein Bild erzeugt. Die Bildgenerierung über die Antigravity CLI ist experimentell.')
    })
  }

  async listModels(): Promise<RawModel[]> {
    const res = await withWorkDir((cwd) => run(this.exe, ['models'], { cwd, timeoutMs: 60_000 }))
    if (res.code !== 0) return []
    // Eine Zeile je Modell, die Kennung steht vorne (Format nicht dokumentiert, daher tolerant gelesen)
    return res.stdout
      .split(/\r?\n/)
      .map((line) => /^\s*[-*•]?\s*([a-z][a-z0-9.-]*\d[a-z0-9.-]*)\b[\s:–-]*(.*)$/i.exec(line))
      .filter((m): m is RegExpExecArray => Boolean(m))
      .map((m) => ({ id: m[1], label: m[2].trim() ? `${m[1]} – ${m[2].trim()}` : m[1] }))
  }

  structured<T>(req: StructuredRequest, model: string, onChunk?: ChunkListener, signal?: AbortSignal): Promise<T> {
    return withWorkDir(async (cwd) => {
      writeFileSync(join(cwd, 'schema.json'), JSON.stringify(req.schema))
      const images = writeImages(cwd, req.images).map((f) => f.slice(cwd.length + 1))
      const imageNote = images.length ? `\n\nDie Bilder zu dieser Anfrage liegen im Arbeitsordner: ${images.join(', ')}. Sieh sie dir genau an.` : ''
      const text = `${req.system}\n\n${JSON_ONLY}${imageNote}\n\n---\n\n${req.user}`
      const args = ['--input-format', 'stream-json', '--output-format', 'stream-json', '--json-schema', join(cwd, 'schema.json'), '--print-timeout', '11m']
      if (model) args.push('--model', model)
      const message = JSON.stringify({ event: 'user', message: { content: [{ type: 'text', text }] } })
      const res = await run(this.exe, args, { cwd, stdin: `${message}\n`, timeoutMs: TIMEOUT_MS, onData: onChunk, signal })

      const events = res.stdout
        .split(/\r?\n/)
        .filter((l) => l.startsWith('{'))
        .map((l) => {
          try {
            return JSON.parse(l) as AgyResult
          } catch {
            return {}
          }
        })
      const result = events.reverse().find((e) => e.type === 'result' || e.event === 'result' || e.status !== undefined)
      if (result && (!result.status || result.status === 'SUCCESS')) {
        if (result.structured_output !== undefined && result.structured_output !== null) return result.structured_output as T
        if (result.response) return parseJsonText<T>(result.response)
      }
      throw new Error(describeAgyError(res, result))
    })
  }
}

function describeAgyError(res: RunResult, result?: AgyResult): string {
  const text = [result?.error, result?.response, res.stderr].filter(Boolean).join(' ')
  if (/authentication required|not signed in|login|401/i.test(text)) {
    return 'Antigravity CLI ist nicht angemeldet. Bitte in den Einstellungen unter „Künstliche Intelligenz" auf „Mit Google anmelden" klicken.'
  }
  if (/quota|limit|429|exhausted/i.test(text)) return 'Das Kontingent des Google-Abos ist erschöpft. Bitte später erneut versuchen.'
  return `Antigravity CLI meldet einen Fehler: ${lastLines(text) || `Exitcode ${res.code}`}`
}

// ---------- Gemeinsam ----------

export function createCliProvider(provider: AiProviderId): AiProvider {
  const exe = findCli(provider)
  if (!exe) throw notFound(provider)
  if (provider === 'anthropic') return new ClaudeCliProvider(exe)
  if (provider === 'google') return new AgyCliProvider(exe)
  return new CodexCliProvider(exe)
}

export async function subscriptionStatus(provider: AiProviderId): Promise<SubscriptionStatus> {
  const path = findCli(provider)
  if (!path) return { provider, path: null, loggedIn: false, detail: 'Programm nicht gefunden.' }
  const managed = path === managedCliPath(provider)
  const version = await withWorkDir((cwd) => run(path, ['--version'], { cwd, timeoutMs: 30_000 }))
    .then((r) => lastLines(r.stdout, 1) || undefined)
    .catch(() => undefined)
  try {
    if (provider === 'anthropic') return { provider, path, managed, version, ...(await claudeStatus(path)) }
    if (provider === 'openai') {
      const res = await withWorkDir((cwd) => run(path, ['login', 'status'], { cwd, timeoutMs: 30_000 }))
      const text = `${res.stdout} ${res.stderr}`
      const chatgpt = /chatgpt/i.test(text)
      const tarif = res.code === 0 && chatgpt ? chatgptTarif() : undefined
      return {
        provider,
        path,
        managed,
        version,
        loggedIn: res.code === 0 && chatgpt,
        account: res.code === 0 && chatgpt ? `Mit ChatGPT-Konto angemeldet${tarif ? ` (${TARIF_NAME[tarif] ?? tarif})` : ''}` : undefined,
        ...(tarif ? { tarif } : {}),
        ...(tarif === 'free'
          ? {
              warnung:
                'Dieses ChatGPT-Konto nutzt den kostenlosen Tarif: Codex bietet damit nur Ersatzmodelle und erzeugt keine Bilder. Für die App ein Konto mit Plus, Pro, Business oder Edu anmelden („Anderes Konto").'
            }
          : {}),
        detail: res.code === 0 && !chatgpt ? 'Codex ist nicht mit ChatGPT, sondern z. B. mit einem API-Schlüssel angemeldet.' : undefined
      }
    }
    // Antigravity hat keine Statusabfrage; „agy models" gelingt nur mit Anmeldung
    const res = await withWorkDir((cwd) => run(path, ['models'], { cwd, timeoutMs: 60_000 }))
    const text = `${res.stdout} ${res.stderr}`
    return { provider, path, managed, version, loggedIn: res.code === 0 ? true : /sign in/i.test(text) ? false : null }
  } catch (e) {
    return { provider, path, managed, version, loggedIn: null, detail: e instanceof Error ? e.message : String(e) }
  }
}

export async function subscriptionModels(provider: AiProviderId): Promise<ModelOption[]> {
  const standard: ModelOption = { id: '', label: 'Voreinstellung des Programms', recommended: true }
  try {
    const models = await createCliProvider(provider).listModels()
    return [standard, ...models.map((m) => ({ id: m.id, label: m.label ?? m.id }))]
  } catch {
    return [standard]
  }
}
