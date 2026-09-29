import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from '../src/mobil/shims/fs'
import * as fsp from '../src/mobil/shims/fs-promises'
import { normiere, Vfs, vfs, type Traeger } from '../src/mobil/vfs/speicher'

/*
 * Das Speicher-Dateisystem der iPad-App (29.09.2026).
 *
 * Der Hauptprozess-Code verlässt sich auf die Eigenheiten von Node: „Datei fehlt" ist ein Fehler
 * mit code 'ENOENT' (dann gilt die Vorgabe), `mkdirSync` mit `recursive` wirft nicht, wenn es den
 * Ordner schon gibt, `rmSync` mit `force` schweigt. Weicht die Nachbildung ab, verhält sich die
 * App auf dem iPad anders als am PC – ohne dass es jemand merkt. Deshalb hier dieselben Fälle.
 */
function einrichten(): void {
  vfs.zuruecksetzen()
  vfs.einhaengen({ wurzel: '/userData' })
  vfs.einhaengen({ wurzel: '/tmp' })
  vfs.einhaengen({ wurzel: '/resources', nurLesen: true })
}

const code = (fn: () => unknown): string | undefined => {
  try {
    fn()
    return undefined
  } catch (e) {
    return (e as NodeJS.ErrnoException).code
  }
}

describe('fs-Nachbildung (Node-Verhalten)', () => {
  beforeEach(einrichten)

  it('liest, was geschrieben wurde – als Text und als Buffer', () => {
    fs.writeFileSync('/userData/a.json', '{"x":"ä"}')
    expect(fs.readFileSync('/userData/a.json', 'utf8')).toBe('{"x":"ä"}')
    expect(fs.readFileSync('/userData/a.json', { encoding: 'utf-8' })).toBe('{"x":"ä"}')
    const buf = fs.readFileSync('/userData/a.json')
    expect(buf).toBeInstanceOf(Uint8Array)
    expect(buf.toString('base64')).toBe(Buffer.from('{"x":"ä"}').toString('base64'))
    fs.writeFileSync('/userData/b.bin', new Uint8Array([1, 2, 3]))
    expect([...fs.readFileSync('/userData/b.bin')]).toEqual([1, 2, 3])
  })

  it('meldet fehlende Dateien und Ordner mit ENOENT', () => {
    expect(fs.existsSync('/userData/fehlt.json')).toBe(false)
    expect(code(() => fs.readFileSync('/userData/fehlt.json'))).toBe('ENOENT')
    expect(code(() => fs.statSync('/userData/fehlt.json'))).toBe('ENOENT')
    expect(code(() => fs.readdirSync('/userData/fehlt'))).toBe('ENOENT')
    // Schreiben in einen fehlenden Ordner geht wie in Node nicht
    expect(code(() => fs.writeFileSync('/userData/fehlt/x.json', '1'))).toBe('ENOENT')
    expect(code(() => fs.renameSync('/userData/fehlt.json', '/userData/b.json'))).toBe('ENOENT')
  })

  it('legt Ordner an wie Node (recursive, EEXIST)', () => {
    expect(fs.mkdirSync('/userData/a/b/c', { recursive: true })).toBe('/userData/a')
    expect(fs.mkdirSync('/userData/a/b/c', { recursive: true })).toBeUndefined()
    expect(code(() => fs.mkdirSync('/userData/a'))).toBe('EEXIST')
    expect(code(() => fs.mkdirSync('/userData/x/y'))).toBe('ENOENT')
    expect(fs.statSync('/userData/a/b').isDirectory()).toBe(true)
    expect(fs.existsSync('/userData')).toBe(true)
  })

  it('listet Ordner sortiert, auch mit Dateitypen', () => {
    fs.mkdirSync('/userData/m/unter', { recursive: true })
    fs.writeFileSync('/userData/m/b.json', '1')
    fs.writeFileSync('/userData/m/a.png', '2')
    fs.writeFileSync('/userData/m/unter/tief.json', '3')
    expect(fs.readdirSync('/userData/m')).toEqual(['a.png', 'b.json', 'unter'])
    const typen = fs.readdirSync('/userData/m', { withFileTypes: true })
    expect(typen.map((d) => [d.name, d.isDirectory(), d.isFile()])).toEqual([
      ['a.png', false, true],
      ['b.json', false, true],
      ['unter', true, false]
    ])
    expect(code(() => fs.readdirSync('/userData/m/b.json'))).toBe('ENOTDIR')
  })

  it('kennt Größe und Änderungszeit', () => {
    const vorher = Date.now()
    fs.writeFileSync('/userData/s.txt', 'hallo')
    const st = fs.statSync('/userData/s.txt')
    expect(st.size).toBe(5)
    expect(st.isFile()).toBe(true)
    expect(st.mtimeMs).toBeGreaterThanOrEqual(vorher)
    expect(st.mtime).toBeInstanceOf(Date)
    expect(st.mtime.toISOString()).toBe(new Date(st.mtimeMs).toISOString())
  })

  it('benennt um (auch über eine vorhandene Datei) und hängt an', () => {
    fs.writeFileSync('/userData/alt.json', 'neu')
    fs.writeFileSync('/userData/ziel.json', 'alt')
    fs.renameSync('/userData/alt.json', '/userData/ziel.json')
    expect(fs.readFileSync('/userData/ziel.json', 'utf8')).toBe('neu')
    expect(fs.existsSync('/userData/alt.json')).toBe(false)
    fs.appendFileSync('/userData/log.txt', 'a\n')
    fs.appendFileSync('/userData/log.txt', 'b\n')
    expect(fs.readFileSync('/userData/log.txt', 'utf8')).toBe('a\nb\n')
    fs.mkdirSync('/userData/o1/x', { recursive: true })
    fs.writeFileSync('/userData/o1/x/d.json', '1')
    fs.renameSync('/userData/o1', '/userData/o2')
    expect(fs.readFileSync('/userData/o2/x/d.json', 'utf8')).toBe('1')
    expect(fs.existsSync('/userData/o1')).toBe(false)
  })

  it('löscht wie Node: force schweigt, recursive räumt Ordner, ohne recursive kein Ordner', () => {
    expect(code(() => fs.rmSync('/userData/fehlt.json'))).toBe('ENOENT')
    expect(code(() => fs.rmSync('/userData/fehlt.json', { force: true }))).toBeUndefined()
    fs.mkdirSync('/userData/weg/unter', { recursive: true })
    fs.writeFileSync('/userData/weg/unter/a.json', '1')
    expect(code(() => fs.rmSync('/userData/weg'))).toBe('EISDIR')
    fs.rmSync('/userData/weg', { recursive: true, force: true })
    expect(fs.existsSync('/userData/weg')).toBe(false)
    expect(fs.existsSync('/userData/weg/unter/a.json')).toBe(false)
    fs.writeFileSync('/userData/u.json', '1')
    fs.unlinkSync('/userData/u.json')
    expect(fs.existsSync('/userData/u.json')).toBe(false)
  })

  it('legt Arbeitsordner an und kopiert', () => {
    const dir = fs.mkdtempSync('/tmp/schulapps-')
    expect(dir).toMatch(/^\/tmp\/schulapps-[A-Za-z0-9]{6}$/)
    expect(fs.statSync(dir).isDirectory()).toBe(true)
    fs.writeFileSync(`${dir}/a.txt`, 'x')
    fs.copyFileSync(`${dir}/a.txt`, `${dir}/b.txt`)
    expect(fs.readFileSync(`${dir}/b.txt`, 'utf8')).toBe('x')
  })

  it('schützt die mitgelieferten Ressourcen vor dem Schreiben', () => {
    vfs.uebernehmen('/resources/cefr/levels.json', new TextEncoder().encode('{}'))
    expect(fs.readFileSync('/resources/cefr/levels.json', 'utf8')).toBe('{}')
    expect(code(() => fs.writeFileSync('/resources/cefr/levels.json', 'x'))).toBe('EROFS')
    expect(code(() => fs.rmSync('/resources/cefr/levels.json'))).toBe('EROFS')
  })

  it('vereinheitlicht Windows-Pfade (Tests unter Windows) und „..“', () => {
    expect(normiere('\\userData\\a\\..\\b.json')).toBe('/userData/b.json')
    expect(normiere('D:\\userData\\x')).toBe('/userData/x')
    expect(normiere('/userData//a/./b/')).toBe('/userData/a/b')
  })

  it('bietet dieselben Aufrufe als Promise', async () => {
    await fsp.mkdir('/userData/p', { recursive: true })
    await fsp.writeFile('/userData/p/a.txt', 'eins')
    expect(await fsp.readFile('/userData/p/a.txt', 'utf8')).toBe('eins')
    expect(await fsp.readdir('/userData/p')).toEqual(['a.txt'])
    await expect(fsp.readFile('/userData/p/fehlt.txt')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('Schreibwarteschlange', () => {
  function mitTraeger(): { v: Vfs; ops: string[]; ablage: Map<string, string> } {
    const ops: string[] = []
    const ablage = new Map<string, string>()
    const traeger: Traeger = {
      schreiben: async (p, d) => {
        ops.push(`schreiben ${p}`)
        ablage.set(p, new TextDecoder().decode(d))
      },
      loeschen: async (p) => {
        ops.push(`loeschen ${p}`)
        ablage.delete(p)
      },
      ordnerLoeschen: async (p) => {
        ops.push(`ordner ${p}`)
        for (const k of [...ablage.keys()]) if (k === p || k.startsWith(p + '/')) ablage.delete(k)
      }
    }
    const v = new Vfs(300)
    v.einhaengen({ wurzel: '/userData', traeger })
    v.einhaengen({ wurzel: '/tmp' })
    return { v, ops, ablage }
  }
  const text = (s: string): Uint8Array => new TextEncoder().encode(s)

  it('schreibt erst 300 ms nach der letzten Änderung – und nur den letzten Stand', async () => {
    vi.useFakeTimers()
    try {
      const { v, ops, ablage } = mitTraeger()
      v.schreibe('/userData/settings.json', text('1'))
      await vi.advanceTimersByTimeAsync(200)
      v.schreibe('/userData/settings.json', text('2'))
      await vi.advanceTimersByTimeAsync(200)
      expect(ops).toEqual([])
      await vi.advanceTimersByTimeAsync(200)
      expect(ops).toEqual(['schreiben settings.json'])
      expect(ablage.get('settings.json')).toBe('2')
    } finally {
      vi.useRealTimers()
    }
  })

  it('schreibt beim atomaren Schreiben (Hilfsdatei + Umbenennen) nur die Zieldatei', async () => {
    const { v, ops, ablage } = mitTraeger()
    v.schreibe('/userData/a.json.1234.tmp', text('x'))
    v.benenneUm('/userData/a.json.1234.tmp', '/userData/a.json')
    await v.sichereAlles()
    expect(ablage.get('a.json')).toBe('x')
    expect(ablage.has('a.json.1234.tmp')).toBe(false)
    expect(ops).toContain('schreiben a.json')
    expect(ops).not.toContain('schreiben a.json.1234.tmp')
  })

  it('löscht Ordner vor dem Schreiben neuer Dateien darin', async () => {
    const { v, ablage } = mitTraeger()
    v.ordnerAnlegen('/userData/m', true)
    v.schreibe('/userData/m/a.json', text('alt'))
    await v.sichereAlles()
    v.entferne('/userData/m', { recursive: true })
    v.ordnerAnlegen('/userData/m', true)
    v.schreibe('/userData/m/b.json', text('neu'))
    await v.sichereAlles()
    expect([...ablage.keys()]).toEqual(['m/b.json'])
  })

  it('schreibt Flüchtiges (/tmp) nie', async () => {
    const { v, ops } = mitTraeger()
    v.schreibe('/tmp/x', text('1'))
    await v.sichereAlles()
    expect(ops).toEqual([])
  })

  it('meldet Schreibfehler, statt still zu scheitern', async () => {
    const v = new Vfs(0)
    const fehler: string[] = []
    v.onSchreibfehler = (p) => fehler.push(p)
    v.einhaengen({
      wurzel: '/userData',
      traeger: {
        schreiben: async () => {
          throw new Error('voll')
        },
        loeschen: async () => undefined,
        ordnerLoeschen: async () => undefined
      }
    })
    v.schreibe('/userData/a.json', text('1'))
    await v.sichereAlles()
    expect(fehler).toEqual(['/userData/a.json'])
  })

  it('lädt bekannte Ressourcen erst bei Bedarf', async () => {
    const v = new Vfs()
    const geladen: string[] = []
    v.einhaengen({
      wurzel: '/resources',
      nurLesen: true,
      laden: async (p) => {
        geladen.push(p)
        return text(`inhalt ${p}`)
      }
    })
    v.uebernehmen('/resources/lehrplaene/NI.json', null, 0, 10)
    expect(v.existiert('/resources/lehrplaene/NI.json')).toBe(true)
    expect(v.liste('/resources/lehrplaene').map((e) => e.name)).toEqual(['NI.json'])
    expect(() => v.lies('/resources/lehrplaene/NI.json')).toThrow(/nicht geladen/)
    await v.sicherstellen(['/resources/lehrplaene/NI.json', '/resources/unbekannt.json'])
    expect(new TextDecoder().decode(v.lies('/resources/lehrplaene/NI.json'))).toBe('inhalt lehrplaene/NI.json')
    expect(geladen).toEqual(['lehrplaene/NI.json'])
  })
})
