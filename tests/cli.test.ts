import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
vi.mock('../src/main/services/storage/settings', () => ({
  getSettings: () => ({ ai: { cliPaths: { openai: '', anthropic: '', google: '' } } })
}))

const { chatgptTarif, parseJsonText, resolveShim } = await import('../src/main/services/ai/cli')

/*
 * Angelegte Ordner werden am Ende entfernt. Bis 25.09.2026 blieb bei jedem Lauf einer liegen –
 * über zweitausend hatten sich im Temp-Ordner angesammelt.
 */
const angelegt: string[] = []
afterAll(() => {
  for (const dir of angelegt) rmSync(dir, { recursive: true, force: true })
})

/** Nachbau einer globalen npm-Installation mit .cmd-Startdatei */
function npmDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'schulapps-npm-'))
  angelegt.push(dir)
  return dir
}

function touch(file: string): void {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, '')
}

describe('Abo-Zugang: Programme finden', () => {
  it('löst die npm-Startdatei von Claude Code auf die claude.exe auf', () => {
    const dir = npmDir()
    const exe = join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    touch(exe)
    writeFileSync(join(dir, 'claude.cmd'), '@ECHO off\r\nCALL :find_dp0\r\n"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*\r\n')
    expect(resolveShim(join(dir, 'claude.cmd'), 'anthropic')).toBe(exe)
  })

  it('findet hinter der Codex-Startdatei die mitgelieferte codex.exe', () => {
    const dir = npmDir()
    const pkg = join(dir, 'node_modules', '@openai', 'codex')
    const exe = join(pkg, 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe')
    touch(join(pkg, 'bin', 'codex.js'))
    touch(exe)
    writeFileSync(join(dir, 'codex.cmd'), '"%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n')
    expect(resolveShim(join(dir, 'codex.cmd'), 'openai')).toBe(exe)
  })

  it('startet nie node.exe aus einer Startdatei', () => {
    const dir = npmDir()
    touch(join(dir, 'node.exe'))
    writeFileSync(join(dir, 'tool.cmd'), '"%dp0%\\node.exe" "%dp0%\\tool.js"')
    expect(resolveShim(join(dir, 'tool.cmd'), 'anthropic')).toBeNull()
  })
})

describe('Abo-Zugang: Antworten lesen', () => {
  it('liest JSON auch mit Codeblock oder Begleittext', () => {
    expect(parseJsonText('```json\n{"ok":true}\n```')).toEqual({ ok: true })
    expect(parseJsonText('Hier ist das Ergebnis: {"a":[1,2]} Fertig.')).toEqual({ a: [1, 2] })
    expect(() => parseJsonText('keine Daten')).toThrow(/kein gültiges JSON/)
  })
})

describe('Abo-Zugang: schlanke Codex-Aufrufe', () => {
  it('lässt für Bilder die Bildgenerierung und den Code-Modus eingeschaltet', async () => {
    const { codexLeanArgs } = await import('../src/main/services/ai/cli')
    const text = codexLeanArgs().join(' ')
    const image = codexLeanArgs({ keepImageGeneration: true }).join(' ')
    expect(text).toContain('--disable image_generation')
    expect(text).toContain('--disable code_mode_host')
    expect(image).not.toContain('image_generation')
    expect(image).not.toContain('code_mode_host')
  })
})

describe('Werkzeuge von Codex', () => {
  const args = async (opts?: { webSearch?: boolean; keepImageGeneration?: boolean }): Promise<string> =>
    (await import('../src/main/services/ai/cli')).codexLeanArgs(opts).join(' ')

  /*
   * Nachgemessen am 24.09.2026 mit einem echten Aufruf: Die Websuche von Codex laeuft ueber
   * den „code mode host". Mit abgeschaltetem Host meldete Codex „Code Mode is unavailable …
   * Code mode will fail closed", suchte NICHT – und nannte trotzdem eine Adresse. Die war
   * erfunden und lieferte 404.
   *
   * Genau die Sorte Fehler, die man sonst nicht bemerkt: Es kam ja eine Antwort.
   */
  it('laesst den Werkzeug-Host fuer die Websuche an', async () => {
    const a = await args({ webSearch: true })
    expect(a, 'ohne Host sucht Codex nicht, antwortet aber trotzdem').not.toContain('--disable code_mode_host')
    expect(a).toContain('-c tools.web_search=true')
  })

  it('schaltet ihn ohne Websuche ab', async () => {
    // Er kostet Tokens und wird sonst nicht gebraucht
    expect(await args()).toContain('--disable code_mode_host')
  })

  it('laesst ihn auch fuer die Bilderzeugung an', async () => {
    expect(await args({ keepImageGeneration: true })).not.toContain('--disable code_mode_host')
  })

  it('erzeugt bei der Websuche keine Bilder', async () => {
    // Das kostet Kontingent und war nicht bestellt
    expect(await args({ webSearch: true })).toContain('--disable image_generation')
  })

  it('benutzt keinen als instabil gekennzeichneten Schalter', async () => {
    /*
     * `--enable standalone_web_search` war im Versuch dabei; Codex meldet ihn als
     * „under development … may behave unpredictably" – und er war nicht noetig.
     */
    expect(await args({ webSearch: true })).not.toContain('standalone_web_search')
  })
})

describe('Tarif des ChatGPT-Kontos (03.10.2026)', () => {
  const jwt = (inhalt: unknown): string => `kopf.${Buffer.from(JSON.stringify(inhalt)).toString('base64url')}.signatur`
  it('liest den Tarif aus der Anmeldung von Codex – ohne Tokens weiterzugeben', () => {
    const dir = mkdtempSync(join(tmpdir(), 'schulapps-codex-'))
    angelegt.push(dir)
    const datei = join(dir, 'auth.json')
    writeFileSync(
      datei,
      JSON.stringify({
        auth_mode: 'chatgpt',
        tokens: { id_token: jwt({ 'https://api.openai.com/auth': { chatgpt_plan_type: 'Free' } }), access_token: 'geheim' }
      })
    )
    expect(chatgptTarif(datei)).toBe('free')
    writeFileSync(datei, JSON.stringify({ tokens: { id_token: jwt({ 'https://api.openai.com/auth': { chatgpt_plan_type: 'plus' } }) } }))
    expect(chatgptTarif(datei)).toBe('plus')
    writeFileSync(datei, '{kaputt')
    expect(chatgptTarif(datei)).toBeUndefined()
    expect(chatgptTarif(join(dir, 'fehlt.json'))).toBeUndefined()
  })
})
