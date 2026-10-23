import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

/*
 * Bestandsaufnahme der lokalen Ablagen (23.10.2026, Nachprüfung des Schulträgers): Jede Datei, die
 * lokal schreibt – localStorage, sessionStorage, IndexedDB oder eine Ablage unter userData –, muss in
 * src/shared/lokaleDaten.ts stehen, samt Personenbezug und Schutz. Eine neue Ablage ohne Eintrag fällt
 * hier auf, bevor sie Schülerdaten im Klartext ablegt.
 */
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/nie-benutzt' } }))
const { ALLE_LOKALEN_SPEICHER, BROWSER_SPEICHER, DATEI_ABLAGEN, PERSONENBEZOGENE_ORDNER, istPersonenbezogenerPfad } = await import('../src/shared/lokaleDaten')
const { SICHERUNG_DATEIEN, SICHERUNG_ORDNER } = await import('../src/main/services/storage/wartung')

function dateien(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? dateien(p) : /\.tsx?$/.test(p) ? [p.replace(/\\/g, '/')] : []
  })
}

describe('Bestandsaufnahme lokaler Ablagen', () => {
  it('jede Datei, die in den Web-Speicher schreibt, steht in der Bestandsaufnahme', () => {
    const quellen = new Set(ALLE_LOKALEN_SPEICHER.flatMap((s) => s.quellen))
    const fehlt: string[] = []
    for (const f of ['src/renderer', 'src/mobil', 'src/client', 'src/shared'].flatMap(dateien)) {
      if (f === 'src/shared/lokaleDaten.ts') continue
      const text = readFileSync(f, 'utf8')
      if (/\b(localStorage|sessionStorage)\.setItem\(|indexedDB\.open\(/.test(text) && !quellen.has(f)) fehlt.push(f)
    }
    expect(fehlt, `Nicht in src/shared/lokaleDaten.ts: ${fehlt.join(', ')}`).toEqual([])
  })

  it('jede Ablage unter userData (PC, iPad, Online-Exe) steht in der Bestandsaufnahme', () => {
    const gefunden = new Set<string>()
    for (const f of ['src/main', 'src/client'].flatMap(dateien)) {
      const text = readFileSync(f, 'utf8')
      for (const m of text.matchAll(/getPath\('userData'\),\s*'([^']+)'/g)) gefunden.add(m[1])
      for (const m of text.matchAll(/(?:readJson|writeJson)(?:<[^>]*>)?\('([^']+)'/g)) gefunden.add(m[1])
      for (const m of text.matchAll(/const [A-Z_]*FILE[A-Z_]* = '([^']+\.json)'/g)) gefunden.add(m[1])
      for (const m of text.matchAll(/erzeugeAblage\('([^']+)'/g)) gefunden.add(m[1])
    }
    for (const n of [...SICHERUNG_ORDNER(), ...SICHERUNG_DATEIEN()]) gefunden.add(n)
    expect(gefunden.size).toBeGreaterThan(20)
    const bekannt = new Set(DATEI_ABLAGEN.map((a) => a.id))
    const fehlt = [...gefunden].filter((n) => !bekannt.has(n))
    expect(fehlt, `Nicht in src/shared/lokaleDaten.ts: ${fehlt.join(', ')}`).toEqual([])
  })

  it('die Quellen der Einträge gibt es wirklich', () => {
    const weg = ALLE_LOKALEN_SPEICHER.flatMap((s) => s.quellen).filter((q) => !existsSync(q))
    expect(weg).toEqual([])
  })

  it('Schülerdaten liegen nie ungeschützt – außer als ausdrückliche Ausgabe', () => {
    const offen = ALLE_LOKALEN_SPEICHER.filter((s) => s.personenbezug === 'schueler' && /^Klartext/.test(s.schutz))
    expect(offen).toEqual([])
    expect([...PERSONENBEZOGENE_ORDNER].sort()).toEqual(['elternbriefe', 'nachteilsausgleiche', 'rueckmeldungen'])
  })

  it('erkennt Pfade in personenbezogenen Ordnern', () => {
    expect(istPersonenbezogenerPfad('rueckmeldungen/abc.json')).toBe(true)
    expect(istPersonenbezogenerPfad('/nachteilsausgleiche/index.json')).toBe(true)
    expect(istPersonenbezogenerPfad('elternbriefe\\x.json')).toBe(true)
    expect(istPersonenbezogenerPfad('arbeitsblaetter/abc.json')).toBe(false)
    expect(istPersonenbezogenerPfad('settings.json')).toBe(false)
  })

  it('der Schlüssel der unterbrochenen Aufträge steht in der Liste', () => {
    const text = readFileSync('src/renderer/src/shared/auftraege.ts', 'utf8')
    const schluessel = /const UNTERBROCHEN_KEY = '([^']+)'/.exec(text)?.[1]
    expect(BROWSER_SPEICHER.some((s) => s.id === schluessel)).toBe(true)
  })
})
