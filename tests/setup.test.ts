import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { gzipSync } from 'zlib'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, shell: { openExternal: vi.fn() } }))
vi.mock('../src/main/services/storage/settings', () => ({
  getSettings: () => ({ ai: { cliPaths: { openai: '', anthropic: '', google: '' } } })
}))

const { extractTgz, findLoginUrl } = await import('../src/main/services/ai/setup')

/** Minimaler tar-Eintrag (ustar) */
function tarEntry(name: string, content: Buffer, type = '0'): Buffer {
  const header = Buffer.alloc(512)
  header.write(name.slice(0, 100), 0)
  header.write('0000644\0', 100)
  header.write(content.length.toString(8).padStart(11, '0') + '\0', 124)
  header.write(type, 156)
  header.write('ustar\0', 257)
  header.fill(' ', 148, 156)
  const sum = header.reduce((a, b) => a + b, 0)
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
  const padding = Buffer.alloc((512 - (content.length % 512)) % 512)
  return Buffer.concat([header, content, padding])
}

describe('Einrichtung: npm-Paket entpacken', () => {
  it('entpackt nur den Programmordner, auch mit langen Namen (PAX) und großen Dateien', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'schulapps-tgz-'))
    const big = Buffer.alloc(3 * 1024 * 1024 + 123, 7)
    const longPath = `package/vendor/x86_64-pc-windows-msvc/codex-resources/${'sehr-langer-name-'.repeat(8)}.exe`
    const pax = Buffer.from(`${(`path=${longPath}\n`.length + 4).toString()} path=${longPath}\n`)
    const archive = gzipSync(
      Buffer.concat([
        tarEntry('package/package.json', Buffer.from('{}')),
        tarEntry('package/vendor/x86_64-pc-windows-msvc/bin/codex.exe', big),
        tarEntry('PaxHeader', pax, 'x'),
        tarEntry('package/vendor/x86_64-pc-windows-msvc/codex-resources/kurz.exe', Buffer.from('lang')),
        Buffer.alloc(1024)
      ])
    )
    const file = join(dir, 'codex.tgz')
    writeFileSync(file, archive)
    const dest = join(dir, 'ziel')
    const count = await extractTgz(file, 'package/vendor/x86_64-pc-windows-msvc/', dest)
    expect(count).toBe(2)
    expect(readFileSync(join(dest, 'bin', 'codex.exe')).equals(big)).toBe(true)
    expect(existsSync(join(dest, 'codex-resources', `${'sehr-langer-name-'.repeat(8)}.exe`))).toBe(true)
    expect(existsSync(join(dest, 'package.json'))).toBe(false)
  })

  it('verweigert Pfade außerhalb des Zielordners', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'schulapps-tgz-'))
    const file = join(dir, 'boese.tgz')
    writeFileSync(file, gzipSync(Buffer.concat([tarEntry('package/vendor/x/../../../../boese.exe', Buffer.from('x')), Buffer.alloc(1024)])))
    await expect(extractTgz(file, 'package/vendor/x/', join(dir, 'ziel'))).rejects.toThrow(/Ungültiger Pfad/)
  })
})

describe('Einrichtung: Anmeldeseite erkennen', () => {
  it('findet die Anmeldeseite in der Ausgabe von Codex und Claude Code', () => {
    const codex =
      'Starting local login server on http://localhost:1455.\nIf your browser did not open, navigate to this URL to authenticate:\n\nhttps://auth.openai.com/oauth/authorize?response_type=code&client_id=app_x&state=abc\n'
    expect(findLoginUrl(codex)).toBe('https://auth.openai.com/oauth/authorize?response_type=code&client_id=app_x&state=abc')
    const claude =
      "Opening browser to sign in…\nIf the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c&state=X\nPaste code here if prompted > "
    expect(findLoginUrl(claude)).toBe('https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c&state=X')
    expect(findLoginUrl('\x1b[94mhttps://auth.openai.com/codex/device\x1b[0m')).toBeUndefined()
  })
})
