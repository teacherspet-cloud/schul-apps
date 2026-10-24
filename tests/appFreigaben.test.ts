import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ALLE_GRUPPE, appsAus, kanalErlaubt, pruefeGruppen, routeErlaubt, STAND_APPS } from '../src/shared/appFreigaben'

/*
 * App-Freigaben (23.10.2026, abgestimmt): eigene Gruppen von Lehrkräften, Grundgruppe „Alle Lehrkräfte" mit allen Apps
 * von heute, neue Apps zunächst nur für Admins, ohne Freigabe gesperrt (Lesen bleibt), nur Admins verwalten.
 */
const ordner = mkdtempSync(join(tmpdir(), 'appfreigaben-'))
vi.mock('electron', () => ({ app: { getPath: () => join(ordner, 'nutzer') } }))

const { setzeSchluesselFuerTests } = await import('../src/server/geheim')
const { datenbank, datenbankFuerTests, nutzerAnlegen } = await import('../src/server/datenbank')
const { appGruppen, appsFuer, setzeAppGruppen } = await import('../src/server/appFreigaben')
const { SENSIBEL } = await import('../src/server/feldschutz')

beforeAll(() => {
  setzeSchluesselFuerTests(randomBytes(32))
  datenbankFuerTests()
})
afterAll(() => rmSync(ordner, { recursive: true, force: true }))

describe('Regeln', () => {
  it('Grundgruppe immer vorn, ungültige Einträge fallen weg', () => {
    const g = pruefeGruppen([
      { id: 'erprobung', name: ' Erprobung ', apps: ['tafelbild', 'tafelbild', 'BÖSE!'], mitglieder: ['u1'] },
      { id: 'erprobung', name: 'doppelt', apps: [], mitglieder: [] },
      { id: 'kaputt id', name: 'x' }
    ])
    expect(g.map((x) => x.id)).toEqual([ALLE_GRUPPE, 'erprobung'])
    expect(g[0].apps).toEqual([...STAND_APPS])
    expect(g[1]).toEqual({ id: 'erprobung', name: 'Erprobung', apps: ['tafelbild'], mitglieder: ['u1'] })
  })

  it('Apps einer Lehrkraft: Grundgruppe plus eigene Gruppen; neue App nur in einer Gruppe', () => {
    const g = pruefeGruppen([
      { id: ALLE_GRUPPE, name: 'Alle', apps: ['arbeitsblatt'], mitglieder: ['soll-weg'] },
      { id: 'erprobung', name: 'Erprobung', apps: ['neue-app'], mitglieder: ['u1'] }
    ])
    expect(g[0].mitglieder).toEqual([])
    expect(appsAus(g, 'u1')).toEqual(['arbeitsblatt', 'neue-app'])
    expect(appsAus(g, 'u2')).toEqual(['arbeitsblatt'])
  })

  it('Server sperrt nur Änderungen an Ablagen ohne passende App – auch über andere Apps, die dort speichern', () => {
    expect(kanalErlaubt('tafelbilder:save', ['arbeitsblatt'])).toBe(false)
    expect(kanalErlaubt('tafelbilder:get', ['arbeitsblatt'])).toBe(true)
    expect(kanalErlaubt('tafelbilder:list', [])).toBe(true)
    expect(kanalErlaubt('exams:delete', ['arbeitsblatt'])).toBe(false)
    // „Meine Klassen" legt Arbeitsblätter an, auch ohne die App „Arbeitsblatt"
    expect(kanalErlaubt('sheets:save', ['meineklassen'])).toBe(true)
    expect(kanalErlaubt('ai:structured', [])).toBe(true)
    expect(kanalErlaubt('tafelbilder:save', null)).toBe(true)
    expect(routeErlaubt('/server/onlinetest/starten', 'POST', ['arbeitsblatt'])).toBe(false)
    expect(routeErlaubt('/server/onlinetest', 'GET', ['arbeitsblatt'])).toBe(true)
    expect(routeErlaubt('/server/onlinetests-andere', 'POST', ['arbeitsblatt'])).toBe(true)
    expect(routeErlaubt('/server/reihen/x', 'POST', ['laufendereihen'])).toBe(true)
    // Partnerarbeit (24.10.2026): aus Meine Klassen oder Sprachenlernen, nicht aus der Pool-App allein
    expect(routeErlaubt('/server/partnerarbeit/anlegen', 'POST', ['sprachenlernen'])).toBe(true)
    expect(routeErlaubt('/server/partnerarbeit/anlegen', 'POST', ['sprechpruefungen'])).toBe(false)
  })
})

describe('Ablage auf dem Server', () => {
  it('ohne Eintrag alle Apps von heute; Admin immer alles; gespeichert nur verschlüsselt', () => {
    expect(SENSIBEL.app_freigaben).toContain('daten')
    const lk = nutzerAnlegen({ benutzer: 'l.lehrer', name: 'Lena Lehrer', rolle: 'lehrkraft', quelle: 'test' })
    const lk2 = nutzerAnlegen({ benutzer: 'k.kollege', name: 'Kai Kollege', rolle: 'lehrkraft', quelle: 'test' })
    const sus = nutzerAnlegen({ benutzer: 's.schueler', name: 'Sam Schüler', rolle: 'schueler', quelle: 'test' })
    expect(appsFuer(lk)).toEqual([...STAND_APPS].sort())
    expect(appsFuer({ id: 'a', rolle: 'admin' })).toBeNull()

    const ohneTafel = STAND_APPS.filter((a) => a !== 'tafelbild')
    setzeAppGruppen([
      { id: ALLE_GRUPPE, name: 'Alle Lehrkräfte', apps: ohneTafel, mitglieder: [] },
      { id: 'erprobung', name: 'Erprobung', apps: ['tafelbild'], mitglieder: [lk.id, sus.id, 'gibt-es-nicht'] }
    ])
    // Lernende und Unbekannte fallen aus den Gruppen
    expect(appGruppen()[1].mitglieder).toEqual([lk.id])
    expect(appsFuer(lk)).toContain('tafelbild')
    expect(appsFuer(lk2)).not.toContain('tafelbild')

    const roh = datenbank().prepare("SELECT daten AS x FROM app_freigaben WHERE id = 'gruppen'").get() as { x: string }
    expect(roh.x).toMatch(/^v1:/)
    expect(roh.x).not.toContain(lk.id)
    expect(roh.x).not.toContain('Erprobung')
  })
})
