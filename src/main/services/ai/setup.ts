// Einrichtung des Abo-Zugangs direkt in der App: offizielles Programm des Anbieters herunterladen
// (mit Prüfsumme), in einen eigenen Ordner der App legen und die Anmeldung im Browser starten.
import { ChildProcess, spawn } from 'child_process'
import { createHash, randomUUID } from 'crypto'
import { app, shell } from 'electron'
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'fs'
import { FileHandle, open } from 'fs/promises'
import { dirname, join, normalize, sep } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { createGunzip } from 'zlib'
import { AiProviderId, SetupEvent } from '@shared/types'
import { abo, aufServer, cliEnv, findCli, managedCliPath, MANAGED_DIR } from './cli'
import { textSammler } from './textstrom'

type Emit = (event: SetupEvent) => void

// ---------- Herunterladen ----------

interface Download {
  url: string
  /** Erwartete Prüfsumme */
  hash: { algorithm: 'sha256' | 'sha512'; value: string; encoding: 'hex' | 'base64' }
  size?: number
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Abruf fehlgeschlagen (${res.status}): ${url}`)
  return (await res.json()) as T
}

async function download(provider: AiProviderId, d: Download, target: string, emit: Emit): Promise<void> {
  const res = await fetch(d.url)
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen (${res.status}).`)
  const total = Number(res.headers.get('content-length')) || d.size || 0
  const hash = createHash(d.hash.algorithm)
  let received = 0
  let lastEmit = 0
  const body = Readable.fromWeb(res.body as import('stream/web').ReadableStream)
  body.on('data', (chunk: Buffer) => {
    hash.update(chunk)
    received += chunk.length
    if (Date.now() - lastEmit > 250) {
      lastEmit = Date.now()
      emit({ provider, type: 'progress', message: 'Wird heruntergeladen …', received, total })
    }
  })
  mkdirSync(dirname(target), { recursive: true })
  await pipeline(body, createWriteStream(target))
  emit({ provider, type: 'progress', message: 'Prüfsumme wird kontrolliert …', received: total, total })
  if (hash.digest(d.hash.encoding).toLowerCase() !== d.hash.value.toLowerCase()) {
    rmSync(target, { force: true })
    throw new Error('Die Prüfsumme des Downloads stimmt nicht. Die Datei wurde verworfen – bitte erneut versuchen.')
  }
}

// ---------- tar.gz entpacken (npm-Paket von Codex) ----------

/** Entpackt aus einem .tgz alle Dateien unterhalb von `prefix` nach `dest` (ohne das Präfix). Liefert die Anzahl der Dateien. */
export async function extractTgz(file: string, prefix: string, dest: string): Promise<number> {
  const chunks = createReadStream(file, { highWaterMark: 1 << 20 })
    .pipe(createGunzip())
    [Symbol.asyncIterator]() as AsyncIterator<Buffer>
  let buf: Buffer = Buffer.alloc(0)
  let ended = false
  /** Liest nach, bis mindestens n Bytes gepuffert sind; false am Ende des Archivs. */
  const need = async (n: number): Promise<boolean> => {
    while (buf.length < n && !ended) {
      const next = await chunks.next()
      if (next.done) ended = true
      else buf = buf.length ? Buffer.concat([buf, next.value]) : next.value
    }
    return buf.length >= n
  }
  const destRoot = normalize(dest) + sep
  let longName: string | null = null
  let count = 0

  while (await need(512)) {
    const header = buf.subarray(0, 512)
    buf = buf.subarray(512)
    if (header.every((b) => b === 0)) continue
    const field = (start: number, len: number): string =>
      header
        .subarray(start, start + len)
        .toString('utf8')
        .replace(/\0[\s\S]*$/, '')
    const size = parseInt(field(124, 12).trim() || '0', 8)
    const type = field(156, 1)
    const padding = (512 - (size % 512)) % 512
    const ustarPrefix = field(345, 155)
    let name = ustarPrefix ? `${ustarPrefix}/${field(0, 100)}` : field(0, 100)

    if (type === 'L' || type === 'x') {
      // Lange Dateinamen (GNU) bzw. PAX-Erweiterung gelten für den nächsten Eintrag
      if (!(await need(size + padding))) throw new Error('Das Archiv ist unvollständig.')
      const data = buf.subarray(0, size).toString('utf8')
      buf = buf.subarray(size + padding)
      longName = type === 'L' ? data.replace(/\0[\s\S]*$/, '') : (/(?:^|\n)\d+ path=([^\n]*)\n/.exec(data)?.[1] ?? null)
      continue
    }
    if (longName) {
      name = longName
      longName = null
    }

    let handle: FileHandle | null = null
    if ((type === '0' || type === '') && name.startsWith(prefix)) {
      const target = normalize(join(dest, name.slice(prefix.length)))
      if (!target.startsWith(destRoot)) throw new Error('Ungültiger Pfad im Archiv.')
      mkdirSync(dirname(target), { recursive: true })
      handle = await open(target, 'w')
      count++
    }
    try {
      let remaining = size
      while (remaining > 0) {
        if (!buf.length && !(await need(1))) throw new Error('Das Archiv ist unvollständig.')
        const part = buf.subarray(0, Math.min(buf.length, remaining))
        if (handle) await handle.write(part)
        remaining -= part.length
        buf = buf.subarray(part.length)
      }
    } finally {
      await handle?.close()
    }
    if (padding) {
      if (!(await need(padding))) break
      buf = buf.subarray(padding)
    }
  }
  return count
}

// ---------- Installation je Anbieter ----------

const tempFile = (name: string): string => join(app.getPath('temp'), 'schul-apps-ki', `${randomUUID()}-${name}`)

/** Ersetzt einen Programmordner erst, wenn der neue vollständig ist (laufende Programme blockieren sonst halbfertig). */
function swapDir(fresh: string, target: string): void {
  const old = `${target}.alt-${Date.now()}`
  if (existsSync(target)) {
    try {
      renameSync(target, old)
    } catch {
      rmSync(fresh, { recursive: true, force: true })
      throw new Error('Das Programm wird gerade verwendet. Bitte laufende KI-Anfragen abwarten und erneut versuchen.')
    }
  }
  renameSync(fresh, target)
  rmSync(old, { recursive: true, force: true, maxRetries: 3 })
}

async function installCodex(emit: Emit): Promise<void> {
  const provider = 'openai'
  emit({ provider, type: 'progress', message: 'Neueste Version wird ermittelt …' })
  const latest = await getJson<{ version: string }>('https://registry.npmjs.org/@openai/codex/latest')
  const meta = await getJson<{ dist: { tarball: string; integrity: string } }>(
    `https://registry.npmjs.org/@openai/codex/${encodeURIComponent(`${latest.version}-win32-x64`)}`
  )
  const [algorithm, value] = meta.dist.integrity.split('-')
  if (algorithm !== 'sha512') throw new Error('Unbekanntes Prüfsummenformat.')
  const archive = tempFile('codex.tgz')
  try {
    await download(provider, { url: meta.dist.tarball, hash: { algorithm, value, encoding: 'base64' } }, archive, emit)
    emit({ provider, type: 'progress', message: 'Wird entpackt …' })
    const target = join(MANAGED_DIR, 'codex')
    const fresh = `${target}.neu`
    rmSync(fresh, { recursive: true, force: true })
    const files = await extractTgz(archive, 'package/vendor/x86_64-pc-windows-msvc/', fresh)
    if (!files || !existsSync(join(fresh, 'bin', 'codex.exe'))) throw new Error('Das Codex-Paket enthält kein Programm für Windows.')
    swapDir(fresh, target)
  } finally {
    rmSync(archive, { force: true })
  }
}

async function installClaude(emit: Emit): Promise<void> {
  const provider = 'anthropic'
  const base = 'https://downloads.claude.ai/claude-code-releases'
  emit({ provider, type: 'progress', message: 'Neueste Version wird ermittelt …' })
  const res = await fetch(`${base}/latest`)
  const version = (await res.text()).trim()
  if (!/^\d+\.\d+\.\d+/.test(version)) throw new Error('Die Version von Claude Code konnte nicht ermittelt werden.')
  const manifest = await getJson<{ platforms: Record<string, { checksum: string; size?: number }> }>(`${base}/${version}/manifest.json`)
  const platform = manifest.platforms['win32-x64']
  if (!platform) throw new Error('Claude Code ist für dieses System nicht verfügbar.')
  await installSingleExe(
    provider,
    { url: `${base}/${version}/win32-x64/claude.exe`, hash: { algorithm: 'sha256', value: platform.checksum, encoding: 'hex' }, size: platform.size },
    emit
  )
}

async function installAgy(emit: Emit): Promise<void> {
  const provider = 'google'
  emit({ provider, type: 'progress', message: 'Neueste Version wird ermittelt …' })
  const manifest = await getJson<{ version: string; url: string; sha512: string }>(
    'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/windows_amd64.json'
  )
  await installSingleExe(provider, { url: manifest.url, hash: { algorithm: 'sha512', value: manifest.sha512, encoding: 'hex' } }, emit)
}

async function installSingleExe(provider: AiProviderId, d: Download, emit: Emit): Promise<void> {
  const target = managedCliPath(provider)
  const fresh = `${target}.neu`
  await download(provider, d, fresh, emit)
  try {
    if (existsSync(target)) rmSync(target)
  } catch {
    rmSync(fresh, { force: true })
    throw new Error('Das Programm wird gerade verwendet. Bitte laufende KI-Anfragen abwarten und erneut versuchen.')
  }
  renameSync(fresh, target)
}

const installing = new Set<AiProviderId>()

export async function installCli(provider: AiProviderId, emit: Emit): Promise<string> {
  // Server: Die Programme sind im Docker-Bild eingebaut – nichts herunterzuladen
  if (aufServer()) {
    const pfad = findCli(provider)
    if (!pfad) throw new Error(provider === 'google' ? 'Antigravity steht auf dem Server nicht zur Verfügung.' : 'Das KI-Programm fehlt auf dem Server.')
    return pfad
  }
  if (installing.has(provider)) throw new Error('Die Einrichtung läuft bereits.')
  installing.add(provider)
  try {
    if (provider === 'openai') await installCodex(emit)
    else if (provider === 'anthropic') await installClaude(emit)
    else await installAgy(emit)
    const path = findCli(provider)
    if (!path) throw new Error(`${abo(provider).program} konnte nicht eingerichtet werden.`)
    emit({ provider, type: 'installed', message: `${abo(provider).program} ist eingerichtet.` })
    return path
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    emit({ provider, type: 'error', message })
    throw new Error(message)
  } finally {
    installing.delete(provider)
  }
}

// ---------- Anmeldung ----------

/*
 * Laufende Anmeldungen – je Datenordner und Anbieter: Auf dem Server (02.10.2026) melden sich
 * mehrere Lehrkräfte gleichzeitig an, jede in ihrem eigenen Ordner. Am PC ist es einer.
 */
const logins = new Map<string, ChildProcess>()
const loginSchluessel = (provider: AiProviderId): string => `${app.getPath('userData')}|${provider}`

/** Anmeldeseite aus der Ausgabe des Programms (für „Anmeldeseite erneut öffnen"). */
export function findLoginUrl(output: string, mitGeraetecode = aufServer()): string | undefined {
  // eslint-disable-next-line no-control-regex
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '')
  // Nur auf dem Server: Anmeldung mit Gerätecode (https://auth.openai.com/codex/device) – am PC nie
  const muster = mitGeraetecode ? /https:\/\/[^\s"'<>]*(?:oauth|authorize|\/device)[^\s"'<>]*/ : /https:\/\/[^\s"'<>]*(?:oauth|authorize)[^\s"'<>]*/
  return muster.exec(clean)?.[0]
}

/** Einmal-Code der Anmeldung mit Gerätecode (Codex auf dem Server, z. B. „ABCD-12345") */
export function findGeraeteCode(output: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '').replace(/https:\/\/\S+/g, '')
  return /\b[A-Z0-9]{4,5}-[A-Z0-9]{4,6}\b/.exec(clean)?.[0]
}

function workDir(): string {
  const dir = join(app.getPath('temp'), 'schul-apps-ki', `login-${randomUUID()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Startet die offizielle Anmeldung des Programms. Die Zugangsdaten werden ausschließlich auf der Anmeldeseite
 * des Anbieters im Browser eingegeben; die App sieht sie nie.
 */
export function startLogin(provider: AiProviderId, emit: Emit, isLoggedIn: () => Promise<boolean>): void {
  cancelLogin(provider)
  const exe = findCli(provider)
  if (!exe) throw new Error(`${abo(provider).program} ist noch nicht eingerichtet.`)
  const cwd = workDir()

  if (provider === 'google') {
    startAgyLogin(exe, cwd, emit, isLoggedIn)
    return
  }

  // Server: ChatGPT per Gerätecode – der Rücksprung auf localhost ginge dort ins Leere
  const args = provider === 'openai' ? (aufServer() ? ['login', '--device-auth'] : ['login']) : ['auth', 'login', '--claudeai']
  const child = spawn(exe, args, { cwd, env: cliEnv(), windowsHide: true })
  logins.set(loginSchluessel(provider), child)
  // Auch hier stückweise Ausgabe – siehe `textstrom.ts`
  const sammler = textSammler()
  let urlSent = false
  const onData = (d: Buffer): void => {
    sammler.push(d)
    const output = sammler.text()
    const url = findLoginUrl(output)
    const geraeteCode = provider === 'openai' && aufServer() ? findGeraeteCode(output) : undefined
    // Gerätecode: erst melden, wenn auch der Code da ist
    if (url && !urlSent && (!aufServer() || provider !== 'openai' || geraeteCode)) {
      urlSent = true
      if (geraeteCode) {
        emit({
          provider,
          type: 'login-url',
          url,
          needsCode: false,
          message: `Den Link öffnen, bei ChatGPT anmelden und diesen Code eingeben: ${geraeteCode} (15 Minuten gültig). Danach geht es hier automatisch weiter.`
        })
        return
      }
      emit({
        provider,
        type: 'login-url',
        url,
        needsCode: provider === 'anthropic',
        message:
          provider === 'anthropic'
            ? 'Im Browser öffnet sich die Anmeldeseite von Claude. Nach der Anmeldung zeigt die Seite einen Code – diesen hier einfügen.'
            : 'Im Browser öffnet sich die Anmeldeseite von ChatGPT. Nach der Anmeldung geht es hier automatisch weiter.'
      })
    }
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  child.stdin.on('error', () => undefined)
  child.on('error', (e) => emit({ provider, type: 'error', message: `Anmeldung konnte nicht gestartet werden: ${e.message}` }))
  child.on('close', async (code) => {
    if (logins.get(loginSchluessel(provider)) !== child) return // abgebrochen oder ersetzt
    logins.delete(loginSchluessel(provider))
    const ok = await isLoggedIn().catch(() => false)
    if (ok) emit({ provider, type: 'logged-in', message: 'Anmeldung erfolgreich.' })
    else {
      // eslint-disable-next-line no-control-regex
      const clean = sammler
        .text()
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/https:\/\/\S+/g, '')
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-1)
        .join(' ')
      const message = /login failed|status code 400|invalid/i.test(clean)
        ? 'Der Code wurde nicht akzeptiert. Bitte erneut „Anmelden" wählen und den Code von der Anmeldeseite vollständig kopieren.'
        : `Die Anmeldung wurde nicht abgeschlossen${code ? ` (${clean.slice(0, 200)})` : ''}. Bitte erneut versuchen.`
      emit({ provider, type: 'error', message })
    }
    rmSync(cwd, { recursive: true, force: true })
  })
}

/** Antigravity bietet keine eigene Anmeldung ohne Terminal: Das Programm startet sichtbar, die Anmeldung erfolgt im Browser. */
function startAgyLogin(exe: string, cwd: string, emit: Emit, isLoggedIn: () => Promise<boolean>): void {
  const provider = 'google'
  const child = spawn('cmd.exe', ['/d', '/s', '/c', `start "Antigravity – Anmeldung" /wait "${exe}"`], {
    cwd,
    env: cliEnv(),
    windowsVerbatimArguments: true,
    windowsHide: false,
    stdio: 'ignore'
  })
  logins.set(loginSchluessel(provider), child)
  emit({
    provider,
    type: 'login-url',
    needsCode: false,
    message:
      'Ein Fenster von Antigravity hat sich geöffnet und startet die Google-Anmeldung im Browser. Nach der Anmeldung schließt sich das Fenster automatisch.'
  })
  const poll = setInterval(async () => {
    if (logins.get(loginSchluessel(provider)) !== child) return clearInterval(poll)
    if (await isLoggedIn().catch(() => false)) {
      clearInterval(poll)
      logins.delete(loginSchluessel(provider))
      killTree(child)
      emit({ provider, type: 'logged-in', message: 'Anmeldung erfolgreich.' })
    }
  }, 4000)
  child.on('close', async () => {
    clearInterval(poll)
    if (logins.get(loginSchluessel(provider)) !== child) return
    logins.delete(loginSchluessel(provider))
    const ok = await isLoggedIn().catch(() => false)
    emit(
      ok
        ? { provider, type: 'logged-in', message: 'Anmeldung erfolgreich.' }
        : { provider, type: 'error', message: 'Das Anmeldefenster wurde ohne Anmeldung geschlossen.' }
    )
  })
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return
  if (process.platform !== 'win32') {
    child.kill('SIGKILL')
    return
  }
  spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
}

export function submitLoginCode(provider: AiProviderId, code: string): void {
  const child = logins.get(loginSchluessel(provider))
  if (!child?.stdin?.writable) throw new Error('Es läuft keine Anmeldung. Bitte „Anmelden" erneut wählen.')
  child.stdin.write(`${code.trim()}\n`)
}

export function cancelLogin(provider: AiProviderId): void {
  const child = logins.get(loginSchluessel(provider))
  if (!child) return
  logins.delete(loginSchluessel(provider))
  killTree(child)
}

export function reopenLoginPage(url: string): void {
  if (/^https:\/\/(auth\.openai\.com|claude\.com|claude\.ai|platform\.claude\.com|accounts\.google\.com)\//.test(url)) void shell.openExternal(url)
}
