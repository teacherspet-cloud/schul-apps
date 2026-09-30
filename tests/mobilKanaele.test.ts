import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it, vi } from 'vitest'

/*
 * Dieselben Aufrufe am PC und auf dem iPad (29.09.2026).
 *
 * Die Oberfläche baut window.api aus src/shared/apiShape.ts – am PC über die Electron-Brücke, in
 * der iPad-App direkt (src/mobil/start.ts). Registriert werden die Aufrufe in beiden Fällen von
 * main/kanaele.ts, mit der Umgebung des Geräts. Fehlt einem Gerät ein Aufruf, scheitert dort
 * still eine Funktion der Oberfläche. Deshalb: Jeder Kanal aus apiShape.ts muss mit BEIDEN
 * Umgebungen registriert sein – und es darf keinen registrierten Kanal geben, den die
 * Oberfläche gar nicht kennt.
 */
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/nie-benutzt', isPackaged: false, getAppPath: () => '/', getVersion: () => '0.0.0-test' },
  dialog: {},
  shell: {},
  safeStorage: {},
  BrowserWindow: class {}
}))

const { registriereKanaele } = await import('../src/main/kanaele')
const { electronUmgebung } = await import('../src/main/umgebung')
const { mobilUmgebung } = await import('../src/mobil/umgebung')

/** Alle Kanäle, die die Oberfläche aufruft – aus dem Quelltext von apiShape.ts */
function kanaeleDerOberflaeche(): string[] {
  const text = readFileSync(resolve(__dirname, '../src/shared/apiShape.ts'), 'utf8')
  const kanaele = new Set<string>()
  // call<…>('kanal', …) – auch mit mehrzeiligem Typ zwischen den spitzen Klammern
  for (const m of text.matchAll(/\bcall(?:<[\s\S]*?>)?\(\s*'([a-zA-Z]+:[a-zA-Z-]+)'/g)) kanaele.add(m[1])
  // Gemeinsame Ablagen: dokumentAblage('rueckmeldungen') → rueckmeldungen:list/get/save/delete
  const vorlage = /const dokumentAblage[\s\S]*?\}\)\n/.exec(text)?.[0] ?? ''
  const aktionen = [...vorlage.matchAll(/`\$\{kanal\}:([a-z]+)`/g)].map((m) => m[1])
  for (const m of text.matchAll(/dokumentAblage\('([a-z]+)'\)/g)) for (const a of aktionen) kanaele.add(`${m[1]}:${a}`)
  return [...kanaele].sort()
}

function registrierte(u: Parameters<typeof registriereKanaele>[1]): string[] {
  const namen: string[] = []
  registriereKanaele((kanal) => void namen.push(kanal), u)
  return namen
}

const umgebungen = {
  pc: electronUmgebung({
    fenster: () => null,
    schliessen: { gesichert: () => undefined, rueckfrage: () => undefined, bleiben: () => undefined },
    aufruf: async () => undefined,
    oberflaeche: '/nie'
  }),
  ios: mobilUmgebung()
}

describe('Kanäle am PC und auf dem iPad', () => {
  const soll = kanaeleDerOberflaeche()

  it('findet die Kanäle der Oberfläche', () => {
    // Stichproben – fällt das Einlesen still aus, prüfte der Test nichts
    expect(soll.length).toBeGreaterThan(100)
    for (const k of ['settings:get', 'verbrauch:get', 'rueckmeldungen:save', 'nachteilsausgleiche:delete', 'export:pdf', 'lan:start']) expect(soll).toContain(k)
  })

  for (const [name, u] of Object.entries(umgebungen)) {
    it(`registriert mit der Umgebung „${name}" jeden Kanal genau einmal`, () => {
      const ist = registrierte(u)
      const fehlt = soll.filter((k) => !ist.includes(k))
      expect(fehlt, `${name}: nicht registriert`).toEqual([])
      const doppelt = ist.filter((k, i) => ist.indexOf(k) !== i)
      expect(doppelt, `${name}: doppelt registriert`).toEqual([])
      const unbekannt = ist.filter((k) => !soll.includes(k))
      expect(unbekannt, `${name}: registriert, aber von der Oberfläche nie aufgerufen`).toEqual([])
    })
  }

  it('beide Umgebungen bringen alles mit, was die Kanäle brauchen', () => {
    const schluessel = (o: object): string[] => Object.keys(o).sort()
    expect(schluessel(umgebungen.ios)).toEqual(schluessel(umgebungen.pc))
    expect(schluessel(umgebungen.ios.druck)).toEqual(schluessel(umgebungen.pc.druck))
    expect(schluessel(umgebungen.ios.sicherungen)).toEqual(schluessel(umgebungen.pc.sicherungen))
    // Den Netzzugang gibt es nur am PC
    expect(umgebungen.pc.lan).not.toBeNull()
    expect(umgebungen.ios.lan).toBeNull()
    // Die Windows-Firewall-Freigabe ebenso (30.09.2026)
    expect(umgebungen.pc.windowsFreigabe).not.toBeNull()
    expect(umgebungen.ios.windowsFreigabe).toBeNull()
  })

  it('meldet auf dem iPad klar, was es nur am PC gibt', async () => {
    const aufrufe = new Map<string, (...a: unknown[]) => unknown>()
    registriereKanaele((k, fn) => void aufrufe.set(k, fn as (...a: unknown[]) => unknown), umgebungen.ios)
    await expect(Promise.resolve().then(() => aufrufe.get('lan:start')!())).rejects.toThrow(/nur in der App am PC/)
    expect(await aufrufe.get('lan:status')!()).toMatchObject({ laeuft: false })
    expect(await aufrufe.get('export:printers')!()).toEqual([])
    expect(await aufrufe.get('files:launch-file')!()).toBeNull()
    await expect(Promise.resolve().then(() => aufrufe.get('lan:freigabe-einrichten')!())).rejects.toThrow(/nur in der App am Windows-PC/)
    expect(await aufrufe.get('lan:freigabe-status')!()).toMatchObject({ zustand: 'nichtWindows' })
  })
})
